const { app } = require("@azure/functions");
const { jsonResponse, requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { createArbReview } = require("../shared/arb-review-store");

async function handleArbCreateReview(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) {
    return auth.response;
  }

  try {
    const body = await request.json().catch(() => ({}));

    const projectName = String(body.projectName ?? "").trim();
    if (!projectName || projectName.length < 2) {
      return jsonResponse(400, { error: "projectName is required and must be at least 2 characters." });
    }

    const review = await createArbReview(auth.principal, body);

    return jsonResponse(201, {
      review,
      message: "ARB review persisted to Azure Table Storage."
    });
  } catch (error) {
    return safeErrorResponse(error, "Unable to create the ARB review.", context);
  }
}

app.http("arbCreateReview", {
  route: "arb/reviews",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: handleArbCreateReview
});

module.exports = {
  handleArbCreateReview
};
