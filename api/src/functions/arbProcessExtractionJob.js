const { app } = require("@azure/functions");
const {
  markArbExtractionRunning,
  markArbExtractionFailed,
  startArbExtraction
} = require("../shared/arb-review-store");
const { shouldUseDurable } = require("../durable/shared/featureFlag");

function parseQueueMessage(message) {
  if (!message) {
    return null;
  }

  if (Buffer.isBuffer(message)) {
    return JSON.parse(message.toString("utf8"));
  }

  if (typeof message === "string") {
    return JSON.parse(message);
  }

  return message;
}

async function handleArbProcessExtractionJob(message, context) {
  // ─── Feature flag short-circuit ───
  // When USE_DURABLE_ORCHESTRATION=ON, the HTTP handler (arbStartExtraction)
  // starts the durable orchestration directly and does NOT enqueue a queue
  // message. Any queue messages arriving here while the flag is ON are
  // residual drops from the legacy pre-flag-flip period. Skip them to avoid
  // double-processing the same extraction.
  if (shouldUseDurable()) {
    context.log(
      "USE_DURABLE_ORCHESTRATION=ON — skipping legacy queue-driven extraction."
    );
    return;
  }

  try {
    const payload = parseQueueMessage(message);
    const reviewId = payload?.reviewId;
    const principal = payload?.principal;

    if (!reviewId || !principal?.userId) {
      context.warn("Skipping invalid ARB extraction queue message.");
      return;
    }

    context.log(`Starting queued ARB extraction for review ${reviewId}.`);
    await markArbExtractionRunning(principal, reviewId);
    await startArbExtraction(principal, reviewId);
    context.log(`Completed queued ARB extraction for review ${reviewId}.`);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    context.error(`Queued ARB extraction failed: ${messageText}`);
    try {
      const payload = parseQueueMessage(message);
      if (payload?.reviewId && payload?.principal?.userId) {
        await markArbExtractionFailed(payload.principal, payload.reviewId, messageText);
      }
    } catch {
      // If the message itself cannot be parsed, log and let the queue runtime handle retries/poisoning.
    }
  }
}

app.storageQueue("arbProcessExtractionJob", {
  queueName: "arb-extraction-jobs",
  connection: "AzureWebJobsStorage",
  handler: handleArbProcessExtractionJob
});

module.exports = {
  handleArbProcessExtractionJob
};
