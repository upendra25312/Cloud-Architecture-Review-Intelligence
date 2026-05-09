const { app } = require("@azure/functions");
const { jsonResponse, requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { getTableClient, encodeTableKey } = require("../shared/table-storage");

const PROJECTS_TABLE = "arbprojects";
const UPDATABLE = ["name", "customerName", "description", "reviewFramework", "targetRegions", "tags", "status"];

async function handleArbUpdateProject(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) return auth.response;

  try {
    const projectId = context.extraInputs?.get?.("id") || request.params?.id;
    if (!projectId) return jsonResponse(400, { error: "projectId is required" });

    const body = await request.json().catch(() => ({}));
    const client = await getTableClient(PROJECTS_TABLE);

    const pk = encodeTableKey(auth.principal.userId);
    const rk = encodeTableKey(projectId);

    // Read existing entity to verify ownership
    let existing;
    try {
      existing = await client.getEntity(pk, rk);
    } catch (e) {
      if (e?.statusCode === 404) return jsonResponse(404, { error: "Project not found" });
      throw e;
    }

    const updates = { partitionKey: pk, rowKey: rk, updatedAt: new Date().toISOString() };
    for (const field of UPDATABLE) {
      if (body[field] !== undefined) {
        updates[field] = Array.isArray(body[field]) ? JSON.stringify(body[field]) : body[field];
      }
    }

    await client.updateEntity(updates, "Merge");
    return jsonResponse(200, { projectId, updatedAt: updates.updatedAt });
  } catch (error) {
    return safeErrorResponse(error, "Unable to update project.", context);
  }
}

app.http("arbUpdateProject", {
  route: "arb/projects/{id}",
  methods: ["PATCH"],
  authLevel: "anonymous",
  handler: handleArbUpdateProject
});

module.exports = { handleArbUpdateProject };
