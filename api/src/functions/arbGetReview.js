const { app } = require("@azure/functions");
const { jsonResponse, requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { getArbReview } = require("../shared/arb-review-store");

async function handleArbGetReview(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) {
    return auth.response;
  }

  try {
    const reviewId = request.params?.reviewId || "demo-review";
    return jsonResponse(200, {
      review: await getArbReview(auth.principal, reviewId)
    });
  } catch (error) {
    return safeErrorResponse(error, "Unable to load the ARB review.", context);
  }
}

app.http("arbGetReview", {
  route: "arb/reviews/{reviewId}",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: handleArbGetReview
});

module.exports = {
  handleArbGetReview
};
