const { app } = require("@azure/functions");
const { requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { generateArbPptx } = require("../shared/arb-pptx-export");
const { normalizeReviewForExport } = require("../shared/arb-normalize-review");
const {
  getArbReview,
  getArbFiles,
  getArbRequirements,
  getArbEvidence,
  getArbFindings,
  getArbActions,
  getArbScorecard,
  getArbDecision,
} = require("../shared/arb-review-store");

async function handleArbCreatePptxExport(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) return auth.response;

  const reviewId = request.params?.reviewId;
  if (!reviewId) {
    return { status: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "reviewId is required" }) };
  }

  try {
    const [review, files, requirements, evidence, findingsResult, actionsResult, scorecard, decision] = await Promise.all([
      getArbReview(auth.principal, reviewId).catch(() => ({})),
      getArbFiles(auth.principal, reviewId).catch(() => []),
      getArbRequirements(auth.principal, reviewId).catch(() => []),
      getArbEvidence(auth.principal, reviewId).catch(() => []),
      getArbFindings(auth.principal, reviewId).catch(() => []),
      getArbActions(auth.principal, reviewId).catch(() => []),
      getArbScorecard(auth.principal, reviewId).catch(() => null),
      getArbDecision(auth.principal, reviewId).catch(() => null),
    ]);

    const pack = normalizeReviewForExport(
      review,
      files,
      requirements,
      evidence,
      Array.isArray(findingsResult) ? findingsResult : [],
      Array.isArray(actionsResult)  ? actionsResult  : [],
      scorecard,
      decision,
      "pptx"
    );

    const pptxBuffer = await generateArbPptx(pack);

    const safeName = (pack.project?.name || pack._pptx?.projectName || "architecture-review")
      .replace(/[^a-zA-Z0-9-_ ]/g, "")
      .replace(/\s+/g, "-")
      .toLowerCase()
      .slice(0, 60);

    const filename = `CARI-Review-${safeName}-${reviewId.slice(0, 8)}.pptx`;

    return {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pptxBuffer.length),
        "Cache-Control": "no-store",
      },
      body: pptxBuffer,
    };
  } catch (error) {
    return safeErrorResponse(error, "Unable to generate the PowerPoint export.", context);
  }
}

app.http("arbCreatePptxExport", {
  route: "arb/reviews/{reviewId}/exports/pptx",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: handleArbCreatePptxExport,
});

module.exports = { handleArbCreatePptxExport };
