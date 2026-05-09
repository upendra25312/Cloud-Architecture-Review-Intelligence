const { app } = require("@azure/functions");
const { jsonResponse, requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { getArbExtractionStatus, getArbFiles } = require("../shared/arb-review-store");

async function handleArbGetUploads(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) {
    return auth.response;
  }

  try {
    const reviewId = request.params?.reviewId || "demo-review";
    return jsonResponse(200, {
      reviewId,
      files: await getArbFiles(auth.principal, reviewId),
      extraction: await getArbExtractionStatus(auth.principal, reviewId)
    });
  } catch (error) {
    return safeErrorResponse(error, "Unable to load the ARB upload inventory.", context);
  }
}

app.http("arbGetUploads", {
  route: "arb/reviews/{reviewId}/uploads",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: handleArbGetUploads
});

module.exports = {
  handleArbGetUploads
};