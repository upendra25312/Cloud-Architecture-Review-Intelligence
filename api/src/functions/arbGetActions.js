const { app } = require("@azure/functions");
const { jsonResponse, requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { getArbActions } = require("../shared/arb-review-store");

async function handleArbGetActions(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) {
    return auth.response;
  }

  try {
    const reviewId = request.params?.reviewId || "demo-review";
    return jsonResponse(200, {
      reviewId,
      actions: await getArbActions(auth.principal, reviewId)
    });
  } catch (error) {
    return safeErrorResponse(error, "Unable to load ARB actions.", context);
  }
}

app.http("arbGetActions", {
  route: "arb/reviews/{reviewId}/actions",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: handleArbGetActions
});

module.exports = {
  handleArbGetActions
};