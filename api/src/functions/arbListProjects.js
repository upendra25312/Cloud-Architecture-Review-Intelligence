const { app } = require("@azure/functions");
const { jsonResponse, requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { getTableClient, encodeTableKey } = require("../shared/table-storage");

const PROJECTS_TABLE = "arbprojects";

async function handleArbListProjects(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) return auth.response;

  try {
    const client = await getTableClient(PROJECTS_TABLE);
    const pk = encodeTableKey(auth.principal.userId);
    const projects = [];

    for await (const entity of client.listEntities({
      queryOptions: { filter: `PartitionKey eq '${pk}' and status ne 'archived'` }
    })) {
      projects.push({
        projectId: Buffer.from(entity.rowKey, "base64url").toString("utf8"),
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
      });
    }

    // Sort newest-first (rowKey encodes timestamp in base36, so lexicographic desc)
    projects.sort((a, b) => b.rowKey > a.rowKey ? 1 : -1);

    return jsonResponse(200, { projects });
  } catch (error) {
    return safeErrorResponse(error, "Unable to list projects.", context);
  }
}

app.http("arbListProjects", {
  route: "arb/projects",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: handleArbListProjects
});

module.exports = { handleArbListProjects };
