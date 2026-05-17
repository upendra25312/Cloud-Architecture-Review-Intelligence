const { app } = require("@azure/functions");
const { markArbExtractionFailed } = require("../shared/arb-review-store");
const { shouldUseDurable } = require("../durable/shared/featureFlag");

function parseQueueMessage(message) {
  if (!message) return null;
  if (Buffer.isBuffer(message)) return JSON.parse(message.toString("utf8"));
  if (typeof message === "string") return JSON.parse(message);
  return message;
}

async function handleArbProcessExtractionJobPoison(message, context) {
  // When durable orchestration is active, extractions don't use the legacy queue,
  // so any message here is a residual from the pre-flag era.
  if (shouldUseDurable()) {
    context.log("USE_DURABLE_ORCHESTRATION=ON — skipping legacy poison queue handler.");
    return;
  }

  try {
    const payload = parseQueueMessage(message);
    const reviewId = payload?.reviewId;
    const principal = payload?.principal;

    if (!reviewId || !principal?.userId) {
      context.warn("Skipping invalid ARB extraction poison queue message.");
      return;
    }

    context.log(`Marking ARB extraction as failed (poison queue) for review ${reviewId}.`);
    await markArbExtractionFailed(
      principal,
      reviewId,
      "Extraction exceeded the maximum retry limit. The package may be too large, a file may be corrupted, or the service timed out. Please try again or reduce the number of files."
    );
  } catch (error) {
    context.error(`Poison queue handler failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

app.storageQueue("arbProcessExtractionJobPoison", {
  queueName: "arb-extraction-jobs-poison",
  connection: "AzureWebJobsStorage",
  handler: handleArbProcessExtractionJobPoison
});

module.exports = { handleArbProcessExtractionJobPoison };
