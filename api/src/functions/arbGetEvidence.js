const { app } = require("@azure/functions");
const { jsonResponse, requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { getArbEvidence, getArbVisualEvidence } = require("../shared/arb-review-store");

async function handleArbGetEvidence(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) {
    return auth.response;
  }

  try {
    const reviewId = request.params?.reviewId || "demo-review";
    const [evidence, visualEvidence] = await Promise.all([
      getArbEvidence(auth.principal, reviewId),
      getArbVisualEvidence(auth.principal, reviewId)
    ]);
    return jsonResponse(200, {
      reviewId,
      evidence,
      visualEvidence
    });
  } catch (error) {
    return safeErrorResponse(error, "Unable to load ARB evidence.", context);
  }
}

app.http("arbGetEvidence", {
  route: "arb/reviews/{reviewId}/evidence",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: handleArbGetEvidence
});

module.exports = {
  handleArbGetEvidence
};
