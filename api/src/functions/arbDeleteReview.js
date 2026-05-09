const { app } = require("@azure/functions");
const { jsonResponse, requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { deleteArbReview } = require("../shared/arb-review-store");

async function handleArbDeleteReview(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) {
    return auth.response;
  }

  const reviewId = request.params.reviewId;
  if (!reviewId || reviewId.trim() === "") {
    return jsonResponse(400, { error: "reviewId is required." });
  }

  try {
    const result = await deleteArbReview(auth.principal, reviewId.trim());
    return jsonResponse(200, { deleted: result.deleted, reviewId: result.reviewId });
  } catch (error) {
    return safeErrorResponse(error, "Unable to delete the ARB review.", context);
  }
}

app.http("arbDeleteReview", {
  route: "arb/reviews/{reviewId}",
  methods: ["DELETE"],
  authLevel: "anonymous",
  handler: handleArbDeleteReview
});

module.exports = {
  handleArbDeleteReview
};
