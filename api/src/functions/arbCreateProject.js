const { app } = require("@azure/functions");
const { jsonResponse, requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { getTableClient, encodeTableKey } = require("../shared/table-storage");

const PROJECTS_TABLE = "arbprojects";

async function handleArbCreateProject(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const { name, customerName, description = "", reviewFramework = "azure",
            targetRegions = [], tags = [] } = body;

    if (!name || !customerName) {
      return jsonResponse(400, { error: "name and customerName are required" });
    }

    const now = new Date().toISOString();
    // Use timestamp + random suffix as project ID (ULID-like, lexicographic order)
    const projectId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();

    const client = await getTableClient(PROJECTS_TABLE);
    await client.createEntity({
      partitionKey: encodeTableKey(auth.principal.userId),
      rowKey: encodeTableKey(projectId),
      name,
      customerName,
      description,
      reviewFramework,
      targetRegions: JSON.stringify(targetRegions),
      tags: JSON.stringify(tags),
      status: "active",
      reviewCount: 0,
      blobPrefix: projectId,
      createdAt: now,
      updatedAt: now
    });

    return jsonResponse(201, { projectId, blobPrefix: projectId, createdAt: now });
  } catch (error) {
    return safeErrorResponse(error, "Unable to create project.", context);
  }
}

app.http("arbCreateProject", {
  route: "arb/projects",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: handleArbCreateProject
});

module.exports = { handleArbCreateProject };
