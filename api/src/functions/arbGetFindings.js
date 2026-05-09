const { app } = require("@azure/functions");
const { jsonResponse, requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { getArbFindings } = require("../shared/arb-review-store");

async function handleArbGetFindings(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) {
    return auth.response;
  }

  try {
    const reviewId = request.params?.reviewId || "demo-review";
    return jsonResponse(200, {
      reviewId,
      findings: await getArbFindings(auth.principal, reviewId)
    });
  } catch (error) {
    return safeErrorResponse(error, "Unable to load ARB findings.", context);
  }
}

app.http("arbGetFindings", {
  route: "arb/reviews/{reviewId}/findings",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: handleArbGetFindings
});

module.exports = {
  handleArbGetFindings
};
