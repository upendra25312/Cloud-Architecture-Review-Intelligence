const { app } = require("@azure/functions");
const { jsonResponse, requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { getArbExtractionStatus } = require("../shared/arb-review-store");

async function handleArbGetExtractionStatus(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) {
    return auth.response;
  }

  try {
    const reviewId = request.params?.reviewId || "demo-review";
    return jsonResponse(200, {
      reviewId,
      extraction: await getArbExtractionStatus(auth.principal, reviewId)
    });
  } catch (error) {
    return safeErrorResponse(error, "Unable to load ARB extraction status.", context);
  }
}

app.http("arbGetExtractionStatus", {
  route: "arb/reviews/{reviewId}/extract/status",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: handleArbGetExtractionStatus
});

module.exports = {
  handleArbGetExtractionStatus
};