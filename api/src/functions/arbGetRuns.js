const { app } = require("@azure/functions");
const { jsonResponse, requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { getRunsList, getRunSnapshot } = require("../shared/arb-review-store");

async function handleArbGetRuns(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) return auth.response;

  try {
    const reviewId = request.params?.reviewId;
    if (!reviewId) return jsonResponse(400, { error: "reviewId is required." });
    return jsonResponse(200, {
      reviewId,
      runs: await getRunsList(auth.principal, reviewId)
    });
  } catch (error) {
    return safeErrorResponse(error, "Unable to load assessment runs.", context);
  }
}

async function handleArbGetRunSnapshot(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) return auth.response;

  try {
    const reviewId = request.params?.reviewId;
    const runNumberStr = request.params?.runNumber;
    if (!reviewId) return jsonResponse(400, { error: "reviewId is required." });
    const runNumber = parseInt(runNumberStr, 10);
    if (isNaN(runNumber) || runNumber < 1) return jsonResponse(400, { error: "runNumber must be a positive integer." });

    const snapshot = await getRunSnapshot(auth.principal, reviewId, runNumber);
    if (!snapshot) return jsonResponse(404, { error: `Run ${runNumber} not found for review ${reviewId}.` });
    return jsonResponse(200, snapshot);
  } catch (error) {
    return safeErrorResponse(error, "Unable to load run snapshot.", context);
  }
}

app.http("arbGetRuns", {
  route: "arb/reviews/{reviewId}/runs",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: handleArbGetRuns
});

app.http("arbGetRunSnapshot", {
  route: "arb/reviews/{reviewId}/runs/{runNumber}",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: handleArbGetRunSnapshot
});

module.exports = { handleArbGetRuns, handleArbGetRunSnapshot };
