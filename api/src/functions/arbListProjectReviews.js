const { app } = require("@azure/functions");
const { jsonResponse, requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { getTableClient, encodeTableKey, ARB_REVIEW_TABLE_NAME } = require("../shared/table-storage");

const PROJECTS_TABLE = "arbprojects";

async function handleArbListProjectReviews(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) return auth.response;

  try {
    const projectId = context.extraInputs?.get?.("id") || request.params?.id;
    if (!projectId) return jsonResponse(400, { error: "projectId is required" });

    // Verify the project belongs to this user and capture its metadata
    const projectsClient = await getTableClient(PROJECTS_TABLE);
    let projectEntity;
    try {
      projectEntity = await projectsClient.getEntity(
        encodeTableKey(auth.principal.userId),
        encodeTableKey(projectId)
      );
    } catch (e) {
      if (e?.statusCode === 404) return jsonResponse(404, { error: "Project not found" });
      throw e;
    }

    const reviewsClient = await getTableClient(ARB_REVIEW_TABLE_NAME);
    const reviews = [];
    for await (const r of reviewsClient.listEntities({
      queryOptions: { filter: `projectId eq '${projectId}'` }
    })) {
      reviews.push({
        reviewId: r.reviewId,
        projectName: r.projectName,
        customerName: r.customerName,
        workflowState: r.workflowState,
        overallScore: r.overallScore,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt
      });
    }

    reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return jsonResponse(200, {
      projectId,
      name: projectEntity.name || null,
      customerName: projectEntity.customerName || null,
      reviews,
    });
  } catch (error) {
    return safeErrorResponse(error, "Unable to list project reviews.", context);
  }
}

app.http("arbListProjectReviews", {
  route: "arb/projects/{id}/reviews",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: handleArbListProjectReviews
});

module.exports = { handleArbListProjectReviews };
