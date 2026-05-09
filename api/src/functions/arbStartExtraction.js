const { app } = require("@azure/functions");
const { jsonResponse, requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { startArbExtraction, getArbFiles } = require("../shared/arb-review-store");
const { rateLimitResponse, EXTRACTION_LIMIT } = require("../shared/rate-limiter");

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

    // Return 202 immediately — the heavy extraction pipeline runs in the background.
    // startArbExtraction updates each file's extractionStatus in Table Storage as it
    // progresses, so arbGetExtractionStatus can report real-time progress.
    setImmediate(() => {
      startArbExtraction(auth.principal, reviewId).catch((err) => {
        context.log(`[arbStartExtraction] Background extraction error for ${reviewId}:`, err?.message ?? err);
      });
    });

    return jsonResponse(202, {
      reviewId,
      status: "queued",
      fileCount: files.length,
      message: "Extraction started. Poll /api/arb/reviews/{reviewId}/extraction-status for progress."
    });
  } catch (error) {
    return safeErrorResponse(error, "Unable to start ARB extraction.", context);
  }
}

app.http("arbStartExtraction", {
  route: "arb/reviews/{reviewId}/extract",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: handleArbStartExtraction
});

module.exports = {
  handleArbStartExtraction
};