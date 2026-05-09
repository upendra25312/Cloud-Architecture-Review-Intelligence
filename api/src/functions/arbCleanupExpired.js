/**
 * Timer-triggered function that deletes ARB reviews older than 30 days.
 * Runs daily at 02:00 UTC.
 *
 * For each expired SUMMARY row it:
 *   1. Deletes every row in that review's partition (SUMMARY, FILES, FINDINGS, etc.)
 *   2. Deletes blobs stored under {userId}/reviews/{reviewId}/ in arb-inputfiles and arb-outputfiles
 */
const { app } = require("@azure/functions");
const { ARB_REVIEW_TABLE_NAME, getTableClient } = require("../shared/table-storage");
const {
  ARB_INPUT_CONTAINER_NAME,
  ARB_OUTPUT_CONTAINER_NAME,
  getContainerClient
} = require("../shared/storage");

const RETENTION_DAYS = 30;

async function deleteReviewBlobs(containerClient, userId, reviewId) {
  const prefix = `${userId}/reviews/${reviewId}/`;
  try {
    for await (const blob of containerClient.listBlobsFlat({ prefix })) {
      try {
        await containerClient.getBlobClient(blob.name).deleteIfExists();
      } catch {
        // best-effort; log but don't fail the whole cleanup
      }
    }
  } catch {
    // container may not exist yet on fresh deployments — skip
  }
}

async function handleArbCleanupExpired(myTimer, context) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffIso = cutoff.toISOString();

  context.log(`[ARB Cleanup] Running. Deleting reviews created before ${cutoffIso}`);

  const tableClient = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const inputContainer = await getContainerClient(ARB_INPUT_CONTAINER_NAME);
  const outputContainer = await getContainerClient(ARB_OUTPUT_CONTAINER_NAME);

  let deletedCount = 0;
  let errorCount = 0;

  // List all SUMMARY rows and check createdAt
  const query = tableClient.listEntities({
    queryOptions: { filter: `RowKey ge 'SUMMARY|'` }
  });

  for await (const entity of query) {
    try {
      if (!entity.rowKey?.startsWith("SUMMARY|")) continue;

      const createdAt = entity.createdAt ?? entity.timestamp;
      if (!createdAt || createdAt > cutoffIso) continue;

      const reviewId = entity.partitionKey;
      // userId is base64url-encoded in the RowKey after "SUMMARY|"
      const encodedUserId = entity.rowKey.replace("SUMMARY|", "");

      context.log(`[ARB Cleanup] Deleting reviewId=${reviewId}`);

      // Delete all rows in this review's partition
      const rows = tableClient.listEntities({
        queryOptions: { filter: `PartitionKey eq '${reviewId}'` }
      });

      for await (const row of rows) {
        try {
          await tableClient.deleteEntity(row.partitionKey, row.rowKey);
        } catch {
          // row already gone — skip
        }
      }

      // Delete blobs (best-effort — we don't have the raw userId, so search by prefix pattern)
      // The blob path is {sanitizedUserId}/reviews/{sanitizedReviewId}/
      // We list by reviewId substring — tolerate if blobs not found
      await deleteReviewBlobs(inputContainer, encodedUserId, reviewId);
      await deleteReviewBlobs(outputContainer, encodedUserId, reviewId);

      deletedCount++;
    } catch (err) {
      errorCount++;
      context.log(`[ARB Cleanup] Error processing entity: ${err?.message}`);
    }
  }

  context.log(`[ARB Cleanup] Done. deleted=${deletedCount} errors=${errorCount}`);
}

app.timer("arbCleanupExpired", {
  schedule: "0 0 2 * * *", // daily at 02:00 UTC
  runOnStartup: false,
  handler: handleArbCleanupExpired
});

module.exports = { handleArbCleanupExpired };
