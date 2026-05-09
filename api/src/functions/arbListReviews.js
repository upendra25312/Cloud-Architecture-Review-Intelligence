const { app } = require("@azure/functions");
const { jsonResponse, requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { listArbReviews } = require("../shared/arb-review-store");

async function handleArbListReviews(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) {
    return auth.response;
  }

  try {
    const url = new URL(request.url);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
    const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));
    return jsonResponse(200, await listArbReviews(auth.principal, { limit, offset }), {
      "Cache-Control": "no-store"
    });
  } catch (error) {
    return safeErrorResponse(error, "Unable to list ARB reviews.", context);
  }
}

app.http("arbListReviews", {
  route: "arb/reviews",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: handleArbListReviews
});

module.exports = {
  handleArbListReviews
};