const { app } = require("@azure/functions");
const { jsonResponse, requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { deleteArbFile } = require("../shared/arb-review-store");

async function handleArbDeleteFile(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) {
    return auth.response;
  }

  try {
    const reviewId = request.params?.reviewId || "demo-review";
    const fileId = request.params?.fileId;

    if (!fileId) {
      return jsonResponse(400, { error: "fileId is required." });
    }

    const result = await deleteArbFile(auth.principal, reviewId, fileId);

    return jsonResponse(200, result);
  } catch (error) {
    return safeErrorResponse(error, "Unable to delete ARB file.", context);
  }
}

app.http("arbDeleteFile", {
  route: "arb/reviews/{reviewId}/uploads/{fileId}",
  methods: ["DELETE"],
  authLevel: "anonymous",
  handler: handleArbDeleteFile
});

module.exports = {
  handleArbDeleteFile
};
