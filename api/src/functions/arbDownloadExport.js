const { app } = require("@azure/functions");
const { jsonResponse, requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { downloadArbExport } = require("../shared/arb-review-store");

async function handleArbDownloadExport(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) {
    return auth.response;
  }

  try {
    const reviewId = request.params?.reviewId || "demo-review";
    const exportId = request.params?.exportId;

    if (!exportId) {
      return jsonResponse(400, {
        error: "An exportId is required before downloading an ARB reviewed output."
      });
    }

    const artifact = await downloadArbExport(auth.principal, reviewId, exportId);
    return {
      status: 200,
      body: artifact.body,
      headers: {
        "Content-Type": artifact.contentType,
        "Content-Disposition": `attachment; filename="${artifact.fileName}"`,
        "Cache-Control": "no-store"
      }
    };
  } catch (error) {
    return safeErrorResponse(error, "Unable to download the ARB reviewed output.", context);
  }
}

app.http("arbDownloadExport", {
  route: "arb/reviews/{reviewId}/exports/{exportId}/download",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: handleArbDownloadExport
});

module.exports = {
  handleArbDownloadExport
};