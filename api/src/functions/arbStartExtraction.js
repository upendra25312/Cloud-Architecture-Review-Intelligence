const { app, output } = require("@azure/functions");
const { jsonResponse, requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { markArbExtractionQueued, getArbFiles } = require("../shared/arb-review-store");
const { rateLimitResponse, EXTRACTION_LIMIT } = require("../shared/rate-limiter");

const extractionQueueOutput = output.storageQueue({
  queueName: "arb-extraction-jobs",
  connection: "AzureWebJobsStorage"
});

async function handleArbStartExtraction(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) {
    return auth.response;
  }

  const limited = rateLimitResponse(request, auth.principal, EXTRACTION_LIMIT);
  if (limited) return limited;

  try {
    const reviewId = request.params?.reviewId || "demo-review";

    // Fast validation: confirm files exist before accepting the request
    const files = await getArbFiles(auth.principal, reviewId);
    if (!files || files.length === 0) {
      return jsonResponse(400, { error: "Upload files before starting extraction." });
    }

    const extraction = await markArbExtractionQueued(auth.principal, reviewId);
    context.extraOutputs.set(extractionQueueOutput, JSON.stringify({
      reviewId,
      principal: auth.principal,
      requestedAt: new Date().toISOString()
    }));

    return jsonResponse(202, {
      reviewId,
      status: "queued",
      fileCount: files.length,
      extraction
    });
  } catch (error) {
    return safeErrorResponse(error, "Unable to start ARB extraction.", context);
  }
}

app.http("arbStartExtraction", {
  route: "arb/reviews/{reviewId}/extract",
  methods: ["POST"],
  authLevel: "anonymous",
  extraOutputs: [extractionQueueOutput],
  handler: handleArbStartExtraction
});

module.exports = {
  handleArbStartExtraction
};
