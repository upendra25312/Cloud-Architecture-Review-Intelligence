const { app } = require("@azure/functions");
const { jsonResponse, requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { createArbExport } = require("../shared/arb-review-store");

async function handleArbCreateExport(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) {
    return auth.response;
  }

  try {
    const reviewId = request.params?.reviewId || "demo-review";
    const body = await request.json().catch(() => ({}));
    return jsonResponse(201, {
      reviewId,
      exportArtifact: await createArbExport(auth.principal, reviewId, body)
    });
  } catch (error) {
    return safeErrorResponse(error, "Unable to generate the ARB export.", context);
  }
}

app.http("arbCreateExport", {
  route: "arb/reviews/{reviewId}/exports",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: handleArbCreateExport
});

module.exports = {
  handleArbCreateExport
};