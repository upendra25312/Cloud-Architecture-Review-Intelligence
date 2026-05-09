const { app } = require("@azure/functions");
const { jsonResponse, requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { updateArbAction } = require("../shared/arb-review-store");

async function handleArbPatchAction(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) {
    return auth.response;
  }

  try {
    const reviewId = request.params?.reviewId || "demo-review";
    const actionId = request.params?.actionId;
    const body = await request.json().catch(() => ({}));

    return jsonResponse(200, {
      reviewId,
      action: await updateArbAction(auth.principal, reviewId, actionId, body)
    });
  } catch (error) {
    return safeErrorResponse(error, "Unable to update the ARB action.", context);
  }
}

app.http("arbPatchAction", {
  route: "arb/reviews/{reviewId}/actions/{actionId}",
  methods: ["PATCH"],
  authLevel: "anonymous",
  handler: handleArbPatchAction
});

module.exports = {
  handleArbPatchAction
};