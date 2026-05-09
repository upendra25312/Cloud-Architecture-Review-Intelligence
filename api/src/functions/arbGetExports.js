const { app } = require("@azure/functions");
const { jsonResponse, requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { listArbExports } = require("../shared/arb-review-store");

async function handleArbGetExports(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) {
    return auth.response;
  }

  try {
    const reviewId = request.params?.reviewId || "demo-review";
    return jsonResponse(200, {
      reviewId,
      exports: await listArbExports(auth.principal, reviewId)
    });
  } catch (error) {
    return safeErrorResponse(error, "Unable to load ARB reviewed outputs.", context);
  }
}

app.http("arbGetExports", {
  route: "arb/reviews/{reviewId}/exports",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: handleArbGetExports
});

module.exports = {
  handleArbGetExports
};