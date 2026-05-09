const test = require("node:test");
const assert = require("node:assert/strict");

function createMockTableModule() {
  const USER_PROFILE_TABLE_NAME = "reviewusers";
  const PROJECT_REVIEW_TABLE_NAME = "projectreviews";
  const tables = new Map();

  function encodeTableKey(value) {
    return Buffer.from(String(value ?? ""), "utf8").toString("base64url");
  }

  function getTable(name) {
    if (!tables.has(name)) {
      tables.set(name, new Map());
    }

    return tables.get(name);
  }

  async function getTableClient(name) {
    const table = getTable(name);

    return {
      async getEntity(partitionKey, rowKey) {
        const entity = table.get(`${partitionKey}|${rowKey}`);

        if (!entity) {
          const error = new Error("Not found");
          error.statusCode = 404;
          throw error;
        }

        return structuredClone(entity);
      },
      async upsertEntity(entity, mode) {
        const key = `${entity.partitionKey}|${entity.rowKey}`;
        const existing = table.get(key) ?? {};
        const nextEntity = mode === "Merge" ? { ...existing, ...entity } : entity;

        table.set(key, structuredClone(nextEntity));
      },
      async deleteEntity(partitionKey, rowKey) {
        table.delete(`${partitionKey}|${rowKey}`);
      },
      async *listEntities({ queryOptions } = {}) {
        const filter = queryOptions?.filter ?? "";
        const match = /PartitionKey eq '([^']+)'/.exec(filter);
        const partitionKey = match?.[1];

        for (const entity of table.values()) {
          if (!partitionKey || entity.partitionKey === partitionKey) {
            yield structuredClone(entity);
          }
        }
      }
    };
  }

  return {
    USER_PROFILE_TABLE_NAME,
    PROJECT_REVIEW_TABLE_NAME,
    encodeTableKey,
    getTableClient
  };
}

function createMockStorageModule() {
  const NOTES_CONTAINER_NAME = "review-notes";
  const ARTIFACTS_CONTAINER_NAME = "review-artifacts";
  const COMMERCIAL_CACHE_CONTAINER_NAME = "commercial-data-cache";
  const containers = new Map();

  function sanitizePathSegment(value) {
    return String(value ?? "unknown")
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120);
  }

  function ensureContainer(name) {
    if (!containers.has(name)) {
      containers.set(name, new Map());
    }

    return containers.get(name);
  }

  async function getContainerClient(name) {
    ensureContainer(name);
    return {
      name,
      async *listBlobsFlat({ prefix } = {}) {
        const container = ensureContainer(name);

        for (const blobName of container.keys()) {
          if (!prefix || blobName.startsWith(prefix)) {
            yield { name: blobName };
          }
        }
      }
    };
  }

  async function readJsonBlob(containerClient, blobName) {
    const container = ensureContainer(containerClient.name);
    const payload = container.get(blobName);
    return payload ? structuredClone(payload) : null;
  }

  async function uploadJsonBlob(containerClient, blobName, payload) {
    const container = ensureContainer(containerClient.name);
    container.set(blobName, structuredClone(payload));
  }

  async function uploadTextBlob(containerClient, blobName, payload) {
    const container = ensureContainer(containerClient.name);
    container.set(blobName, payload);
  }

  async function deleteBlobIfExists(containerClient, blobName) {
    const container = ensureContainer(containerClient.name);
    container.delete(blobName);
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

  return {
    NOTES_CONTAINER_NAME,
    ARTIFACTS_CONTAINER_NAME,
    COMMERCIAL_CACHE_CONTAINER_NAME,
    sanitizePathSegment,
    getContainerClient,
    readJsonBlob,
    uploadJsonBlob,
    uploadTextBlob,
    deleteBlobIfExists,
    buildNotesBlobName,
    buildProjectReviewStateBlobName,
    buildProjectReviewBlobName,
    buildArtifactBlobName
  };
}

function loadProjectReviewStore() {
  const storagePath = require.resolve("./storage");
  const tableStoragePath = require.resolve("./table-storage");
  const projectReviewStorePath = require.resolve("./project-review-store");

  delete require.cache[storagePath];
  delete require.cache[tableStoragePath];
  delete require.cache[projectReviewStorePath];

  const mockStorage = createMockStorageModule();
  const mockTableStorage = createMockTableModule();

  require.cache[storagePath] = {
    id: storagePath,
    filename: storagePath,
    loaded: true,
    exports: mockStorage
  };
  require.cache[tableStoragePath] = {
    id: tableStoragePath,
    filename: tableStoragePath,
    loaded: true,
    exports: mockTableStorage
  };

  const store = require("./project-review-store");

  return {
    store,
    storage: mockStorage,
    tableStorage: mockTableStorage,
    cleanup() {
      delete require.cache[storagePath];
      delete require.cache[tableStoragePath];
      delete require.cache[projectReviewStorePath];
    }
  };
}

test("purging an archived review clears the legacy fallback state blob", async () => {
  const { store, storage, cleanup } = loadProjectReviewStore();
  const principal = {
    userId: "user-1",
    userDetails: "upendra@example.com",
    identityProvider: "aad"
  };
  const activePackage = {
    id: "review-1",
    name: "Review One",
    audience: "Cloud Architect",
    businessScope: "Scope",
    targetRegions: ["UAE North"],
    selectedServiceSlugs: ["azure-front-door"],
    serviceAssumptions: {},
    createdAt: "2026-04-06T10:00:00.000Z",
    updatedAt: "2026-04-06T10:00:00.000Z"
  };

  try {
    await store.saveProjectReviewState(principal, {
      activePackage,
      copilotContext: null
    });

    const containerClient = await storage.getContainerClient(storage.NOTES_CONTAINER_NAME);
    await storage.uploadJsonBlob(
      containerClient,
      storage.buildProjectReviewStateBlobName(principal.userId),
      {
        schemaVersion: 1,
        updatedAt: "2026-04-06T10:05:00.000Z",
        activePackage,
        copilotContext: null
      }
    );

    await store.archiveProjectReview(principal, activePackage.id, true);
    await store.deleteProjectReview(principal, activePackage.id);
    await store.purgeProjectReview(principal, activePackage.id);

    const loadedState = await store.loadProjectReviewState(principal);
    const legacyStateBlob = await storage.readJsonBlob(
      containerClient,
      storage.buildProjectReviewStateBlobName(principal.userId)
    );

    assert.equal(legacyStateBlob, null);
    assert.equal(loadedState.activePackage, null);
    assert.equal(loadedState.copilotContext, null);
  } finally {
    cleanup();
  }
});

test("saved review lifecycle keeps profile and listing state consistent", async () => {
  const { store, storage, cleanup } = loadProjectReviewStore();
  const principal = {
    userId: "user-2",
    userDetails: "architect@example.com",
    identityProvider: "aad"
  };
  const activePackage = {
    id: "review-2",
    name: "Lifecycle Review",
    audience: "Cloud Architect",
    businessScope: "Lifecycle coverage",
    targetRegions: ["East US"],
    selectedServiceSlugs: ["azure-front-door"],
    serviceAssumptions: {},
    createdAt: "2026-04-06T11:00:00.000Z",
    updatedAt: "2026-04-06T11:00:00.000Z"
  };

  try {
    await store.saveProjectReviewState(principal, {
      activePackage,
      copilotContext: null
    });

    let library = await store.listProjectReviews(principal);
    assert.equal(library.user.activeReviewId, activePackage.id);
    assert.equal(library.reviews.length, 1);
    assert.equal(library.reviews[0].isActive, true);
    assert.equal(library.reviews[0].isArchived, false);
    assert.equal(library.reviews[0].isDeleted, false);

    const archived = await store.archiveProjectReview(principal, activePackage.id, true);
    assert.equal(archived.user.activeReviewId, null);

    library = await store.listProjectReviews(principal);
    assert.equal(library.user.activeReviewId, null);
    assert.equal(library.reviews[0].isActive, false);
    assert.equal(library.reviews[0].isArchived, true);

    await store.archiveProjectReview(principal, activePackage.id, false);
    const activated = await store.activateProjectReview(principal, activePackage.id);
    assert.equal(activated.user.activeReviewId, activePackage.id);
    assert.equal(activated.review.isActive, true);

    const deleted = await store.deleteProjectReview(principal, activePackage.id);
    assert.equal(deleted.user.activeReviewId, null);

    library = await store.listProjectReviews(principal);
    assert.equal(library.reviews[0].isDeleted, true);
    assert.equal(library.reviews[0].isArchived, false);

    await store.restoreDeletedProjectReview(principal, activePackage.id);
    library = await store.listProjectReviews(principal);
    assert.equal(library.reviews[0].isDeleted, false);

    await store.deleteProjectReview(principal, activePackage.id);
    await store.purgeProjectReview(principal, activePackage.id);

    library = await store.listProjectReviews(principal);
    const containerClient = await storage.getContainerClient(storage.NOTES_CONTAINER_NAME);
    const reviewBlob = await storage.readJsonBlob(
      containerClient,
      storage.buildProjectReviewBlobName(principal.userId, activePackage.id)
    );

    assert.equal(library.reviews.length, 0);
    assert.equal(library.user.activeReviewId, null);
    assert.equal(reviewBlob, null);
  } finally {
    cleanup();
  }
});