const { BlobServiceClient } = require("@azure/storage-blob");
const { DefaultAzureCredential } = require("@azure/identity");

const NOTES_CONTAINER_NAME =
  process.env.AZURE_STORAGE_REVIEW_CONTAINER_NAME || "review-notes";
const ARTIFACTS_CONTAINER_NAME =
  process.env.AZURE_STORAGE_REVIEW_ARTIFACT_CONTAINER_NAME || "review-artifacts";
const COMMERCIAL_CACHE_CONTAINER_NAME =
  process.env.AZURE_STORAGE_COMMERCIAL_CACHE_CONTAINER_NAME || "commercial-data-cache";
const ARB_INPUT_CONTAINER_NAME =
  process.env.AZURE_STORAGE_ARB_INPUT_CONTAINER_NAME || "arb-inputfiles";
const ARB_OUTPUT_CONTAINER_NAME =
  process.env.AZURE_STORAGE_ARB_OUTPUT_CONTAINER_NAME || "arb-outputfiles";
const ARB_PROCESSING_CACHE_CONTAINER_NAME =
  process.env.AZURE_STORAGE_ARB_PROCESSING_CACHE_CONTAINER_NAME || "arb-processing-cache";

function getBlobServiceClient() {
  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  if (accountName) {
    return new BlobServiceClient(
      `https://${accountName}.blob.core.windows.net`,
      new DefaultAzureCredential()
    );
  }
  // Local development fallback: Azurite or explicit conn string env var
  const connStr =
    process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage;
  if (!connStr) {
    throw new Error(
      "AZURE_STORAGE_ACCOUNT_NAME or AZURE_STORAGE_CONNECTION_STRING is required for blob storage."
    );
  }
  return BlobServiceClient.fromConnectionString(connStr);
}

function sanitizePathSegment(value) {
  return String(value ?? "unknown")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

async function getContainerClient(name) {
  const client = getBlobServiceClient().getContainerClient(name);

  await client.createIfNotExists();
  return client;
}

async function readJsonBlob(containerClient, blobName) {
  const blobClient = containerClient.getBlobClient(blobName);

  if (!(await blobClient.exists())) {
    return null;
  }

  const download = await blobClient.download();
  const chunks = [];

  for await (const chunk of download.readableStreamBody) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function uploadJsonBlob(containerClient, blobName, payload) {
  const blobClient = containerClient.getBlockBlobClient(blobName);
  const body = JSON.stringify(payload, null, 2);

  await blobClient.upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: {
      blobContentType: "application/json; charset=utf-8"
    }
  });

  return blobClient;
}

async function uploadTextBlob(containerClient, blobName, body, contentType) {
  const blobClient = containerClient.getBlockBlobClient(blobName);

  await blobClient.upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: {
      blobContentType: contentType
    }
  });

  return blobClient;
}

async function uploadBinaryBlob(containerClient, blobName, body, contentType) {
  const blobClient = containerClient.getBlockBlobClient(blobName);
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);

  await blobClient.uploadData(payload, {
    blobHTTPHeaders: {
      blobContentType: contentType || "application/octet-stream"
    }
  });

  return blobClient;
}

async function readBinaryBlob(containerClient, blobName) {
  const blobClient = containerClient.getBlobClient(blobName);

  if (!(await blobClient.exists())) {
    return null;
  }

  const download = await blobClient.download();
  const chunks = [];

  for await (const chunk of download.readableStreamBody) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function readTextBlob(containerClient, blobName) {
  const blobClient = containerClient.getBlobClient(blobName);

  if (!(await blobClient.exists())) {
    return null;
  }

  const download = await blobClient.download();
  const chunks = [];

  for await (const chunk of download.readableStreamBody) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function deleteBlobIfExists(containerClient, blobName) {
  const blobClient = containerClient.getBlobClient(blobName);

  await blobClient.deleteIfExists();
}

function buildNotesBlobName(userId) {
  return `${sanitizePathSegment(userId)}/review-records.json`;
}

function buildProjectReviewStateBlobName(userId) {
  return `${sanitizePathSegment(userId)}/project-review-state.json`;
}

function buildProjectReviewBlobName(userId, reviewId) {
  return `${sanitizePathSegment(userId)}/project-reviews/${sanitizePathSegment(reviewId)}.json`;
}

function buildArtifactBlobName(userId, filename) {
  return `${sanitizePathSegment(userId)}/${filename}`;
}

module.exports = {
  ARB_INPUT_CONTAINER_NAME,
  ARB_OUTPUT_CONTAINER_NAME,
  ARB_PROCESSING_CACHE_CONTAINER_NAME,
  ARTIFACTS_CONTAINER_NAME,
  COMMERCIAL_CACHE_CONTAINER_NAME,
  NOTES_CONTAINER_NAME,
  buildArtifactBlobName,
  buildNotesBlobName,
  buildProjectReviewBlobName,
  buildProjectReviewStateBlobName,
  deleteBlobIfExists,
  getContainerClient,
  readBinaryBlob,
  readTextBlob,
  readJsonBlob,
  sanitizePathSegment,
  uploadBinaryBlob,
  uploadJsonBlob,
  uploadTextBlob
};
