const { app } = require("@azure/functions");
const { jsonResponse, requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { recordArbDecision } = require("../shared/arb-review-store");

async function handleArbRecordDecision(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) {
    return auth.response;
  }

  try {
    const reviewId = request.params?.reviewId || "demo-review";
    const body = await request.json().catch(() => ({}));

    return jsonResponse(200, {
      reviewId,
      decision: await recordArbDecision(auth.principal, reviewId, body)
    });
  } catch (error) {
    return safeErrorResponse(error, "Unable to record the ARB decision.", context);
  }
}

app.http("arbRecordDecision", {
  route: "arb/reviews/{reviewId}/decision",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: handleArbRecordDecision
});

module.exports = {
  handleArbRecordDecision
};
