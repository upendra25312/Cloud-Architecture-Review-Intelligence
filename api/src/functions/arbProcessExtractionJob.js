const { app } = require("@azure/functions");
const {
  markArbExtractionRunning,
  markArbExtractionFailed,
  startArbExtraction
} = require("../shared/arb-review-store");

function parseQueueMessage(message) {
  if (typeof message === "string") {
    return JSON.parse(message);
  }

  return message;
}

async function handleArbProcessExtractionJob(message, context) {
  const payload = parseQueueMessage(message);
  const reviewId = payload?.reviewId;
  const principal = payload?.principal;

  if (!reviewId || !principal?.userId) {
    context.warn("Skipping invalid ARB extraction queue message.");
    return;
  }

  try {
    context.log(`Starting queued ARB extraction for review ${reviewId}.`);
    await markArbExtractionRunning(principal, reviewId);
    await startArbExtraction(principal, reviewId);
    context.log(`Completed queued ARB extraction for review ${reviewId}.`);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    context.error(`Queued ARB extraction failed for review ${reviewId}: ${messageText}`);
    await markArbExtractionFailed(principal, reviewId, messageText);
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
