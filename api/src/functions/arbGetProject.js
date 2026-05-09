const { app } = require("@azure/functions");
const { jsonResponse, requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { getTableClient, encodeTableKey, ARB_REVIEW_TABLE_NAME } = require("../shared/table-storage");

const PROJECTS_TABLE = "arbprojects";

async function handleArbGetProject(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) return auth.response;

  try {
    const projectId = context.extraInputs?.get?.("id") || request.params?.id;
    if (!projectId) {
      return jsonResponse(400, { error: "projectId is required" });
    }

    const client = await getTableClient(PROJECTS_TABLE);
    let project;
    try {
      const entity = await client.getEntity(
        encodeTableKey(auth.principal.userId),
        encodeTableKey(projectId)
      );
      project = {
        projectId,
        name: entity.name,
        customerName: entity.customerName,
        description: entity.description,
        reviewFramework: entity.reviewFramework,
        targetRegions: JSON.parse(entity.targetRegions || "[]"),
        tags: JSON.parse(entity.tags || "[]"),
        status: entity.status,
        reviewCount: entity.reviewCount ?? 0,
        blobPrefix: entity.blobPrefix,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt
      };
    } catch (e) {
      if (e?.statusCode === 404) return jsonResponse(404, { error: "Project not found" });
      throw e;
    }

    // Fetch reviews associated with this project
    const reviewsClient = await getTableClient(ARB_REVIEW_TABLE_NAME);
    const reviews = [];
    for await (const r of reviewsClient.listEntities({
      queryOptions: { filter: `projectId eq '${projectId}'` }
    })) {
      reviews.push({ reviewId: r.reviewId, projectName: r.projectName, status: r.status, createdAt: r.createdAt });
    }

    return jsonResponse(200, { ...project, reviews });
  } catch (error) {
    return safeErrorResponse(error, "Unable to get project.", context);
  }
}

app.http("arbGetProject", {
  route: "arb/projects/{id}",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: handleArbGetProject
});

module.exports = { handleArbGetProject };
