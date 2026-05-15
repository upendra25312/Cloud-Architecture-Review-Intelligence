const { app } = require("@azure/functions");
const { requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { generateArbPptx, shapeReviewDataForPptx } = require("../shared/arb-pptx-export");
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
      getArbFindings(auth.principal, reviewId).catch(() => ({ findings: [] })),
      getArbActions(auth.principal, reviewId).catch(() => ({ actions: [] })),
      getArbScorecard(auth.principal, reviewId).catch(() => null),
      getArbDecision(auth.principal, reviewId).catch(() => null),
    ]);

    const reviewData = shapeReviewDataForPptx(
      review,
      files,
      requirements,
      evidence,
      findingsResult?.findings ?? [],
      actionsResult?.actions ?? [],
      scorecard,
      decision
    );

    const pptxBuffer = await generateArbPptx(reviewData);

    const safeName = (reviewData.projectName || "architecture-review")
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
