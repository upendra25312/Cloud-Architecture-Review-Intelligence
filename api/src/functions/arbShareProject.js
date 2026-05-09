const { app } = require("@azure/functions");
const { DefaultAzureCredential } = require("@azure/identity");
const { BlobServiceClient, ContainerSASPermissions, generateBlobSASQueryParameters } = require("@azure/storage-blob");
const { jsonResponse, requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { getTableClient, encodeTableKey } = require("../shared/table-storage");

const PROJECTS_TABLE = "arbprojects";

async function handleArbShareProject(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) return auth.response;

  try {
    const projectId = context.extraInputs?.get?.("id") || request.params?.id;
    if (!projectId) return jsonResponse(400, { error: "projectId is required" });

    // Verify project ownership
    const client = await getTableClient(PROJECTS_TABLE);
    try {
      await client.getEntity(encodeTableKey(auth.principal.userId), encodeTableKey(projectId));
    } catch (e) {
      if (e?.statusCode === 404) return jsonResponse(404, { error: "Project not found" });
      throw e;
    }

    const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    if (!accountName) return jsonResponse(500, { error: "Storage account not configured" });

    const cred = new DefaultAzureCredential();
    const blobService = new BlobServiceClient(`https://${accountName}.blob.core.windows.net`, cred);

    // 7-day read-only SAS scoped to projectId prefix using user-delegation key
    const startsOn = new Date();
    const expiresOn = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const userDelegationKey = await blobService.getUserDelegationKey(startsOn, expiresOn);

    const sasToken = generateBlobSASQueryParameters({
      containerName: "arb-outputfiles",
      permissions: ContainerSASPermissions.parse("rl"),
      blobName: `${projectId}/`,
      startsOn,
      expiresOn
    }, userDelegationKey, accountName).toString();

    const shareUrl = `https://${accountName}.blob.core.windows.net/arb-outputfiles?${sasToken}`;

    return jsonResponse(200, {
      shareUrl,
      expiresAt: expiresOn.toISOString(),
      expiresInDays: 7
    });
  } catch (error) {
    return safeErrorResponse(error, "Unable to generate share link.", context);
  }
}

app.http("arbShareProject", {
  route: "arb/projects/{id}/share",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: handleArbShareProject
});

module.exports = { handleArbShareProject };
