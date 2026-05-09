const { app } = require("@azure/functions");
const { jsonResponse, requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { getTableClient, encodeTableKey } = require("../shared/table-storage");

const PROJECTS_TABLE = "arbprojects";

async function handleArbDeleteProject(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) return auth.response;

  try {
    const projectId = context.extraInputs?.get?.("id") || request.params?.id;
    if (!projectId) return jsonResponse(400, { error: "projectId is required" });

    const client = await getTableClient(PROJECTS_TABLE);
    const pk = encodeTableKey(auth.principal.userId);
    const rk = encodeTableKey(projectId);

    // Soft delete: set status to "archived" rather than deleting the row
    try {
      await client.updateEntity({ partitionKey: pk, rowKey: rk, status: "archived", updatedAt: new Date().toISOString() }, "Merge");
    } catch (e) {
      if (e?.statusCode === 404) return jsonResponse(404, { error: "Project not found" });
      throw e;
    }

    return jsonResponse(200, { projectId, status: "archived" });
  } catch (error) {
    return safeErrorResponse(error, "Unable to delete project.", context);
  }
}

app.http("arbDeleteProject", {
  route: "arb/projects/{id}",
  methods: ["DELETE"],
  authLevel: "anonymous",
  handler: handleArbDeleteProject
});

module.exports = { handleArbDeleteProject };
