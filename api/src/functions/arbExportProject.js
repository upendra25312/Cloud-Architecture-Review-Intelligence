const { app } = require("@azure/functions");
const { DefaultAzureCredential } = require("@azure/identity");
const { BlobServiceClient, BlobSASPermissions } = require("@azure/storage-blob");
const { jsonResponse, requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { getTableClient, encodeTableKey } = require("../shared/table-storage");

const PROJECTS_TABLE = "arbprojects";

async function handleArbExportProject(request, context) {
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
    const container = blobService.getContainerClient("arb-outputfiles");

    // Collect blob names for this project
    const blobs = [];
    for await (const blob of container.listBlobsFlat({ prefix: `${projectId}/reviews/` })) {
      blobs.push(blob.name);
    }

    if (blobs.length === 0) {
      return jsonResponse(200, { projectId, message: "No review artifacts to export", blobs: [] });
    }

    // Generate a 1-hour read SAS for the project prefix (user-delegation SAS via MI)
    const startsOn = new Date();
    const expiresOn = new Date(Date.now() + 3600 * 1000);

    // Use user-delegation key for SAS (managed identity approach)
    const userDelegationKey = await blobService.getUserDelegationKey(startsOn, expiresOn);
    const { generateBlobSASQueryParameters, ContainerSASPermissions } = require("@azure/storage-blob");

    const sasToken = generateBlobSASQueryParameters({
      containerName: "arb-outputfiles",
      permissions: ContainerSASPermissions.parse("rl"),
      blobName: `${projectId}/`,
      startsOn,
      expiresOn
    }, userDelegationKey, accountName).toString();

    const shareUrl = `https://${accountName}.blob.core.windows.net/arb-outputfiles?${sasToken}`;

    return jsonResponse(200, {
      projectId,
      shareUrl,
      expiresAt: expiresOn.toISOString(),
      blobCount: blobs.length
    });
  } catch (error) {
    return safeErrorResponse(error, "Unable to export project.", context);
  }
}

app.http("arbExportProject", {
  route: "arb/projects/{id}/export",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: handleArbExportProject
});

module.exports = { handleArbExportProject };
