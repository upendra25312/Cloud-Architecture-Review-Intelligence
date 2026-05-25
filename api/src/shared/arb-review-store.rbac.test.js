'use strict';

/**
 * C10 — RBAC cross-user isolation tests.
 *
 * Verifies that userId A cannot read, modify, or delete data owned by userId B,
 * even when both users reference the same reviewId. All operations go through
 * the same store functions used by the real HTTP handlers — no mocking of
 * business logic, only the Azure SDK dependencies are stubbed.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

// ---------- mock infrastructure (mirrors arb-review-store.test.js) ----------

function createMockTableModule() {
  const ARB_REVIEW_TABLE_NAME = 'arbreviews';
  const tables = new Map();

  function encodeTableKey(value) {
    return Buffer.from(String(value ?? ''), 'utf8').toString('base64url');
  }

  function getTable(name) {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name);
  }

  async function getTableClient(name) {
    const table = getTable(name);
    return {
      async getEntity(partitionKey, rowKey) {
        const entity = table.get(`${partitionKey}|${rowKey}`);
        if (!entity) {
          const err = new Error('Not found');
          err.statusCode = 404;
          throw err;
        }
        return structuredClone(entity);
      },
      async upsertEntity(entity, mode) {
        const key = `${entity.partitionKey}|${entity.rowKey}`;
        const existing = table.get(key) ?? {};
        table.set(key, structuredClone(mode === 'Merge' ? { ...existing, ...entity } : entity));
      },
      async *listEntities(options) {
        const filterStr = options?.queryOptions?.filter ?? '';
        const rowKeyMatch = filterStr.match(/RowKey eq '([^']*)'/);
        const partitionKeyMatch = filterStr.match(/PartitionKey eq '([^']*)'/);
        for (const entity of table.values()) {
          if (rowKeyMatch && entity.rowKey !== rowKeyMatch[1]) continue;
          if (partitionKeyMatch && entity.partitionKey !== partitionKeyMatch[1]) continue;
          yield structuredClone(entity);
        }
      }
    };
  }

  return { ARB_REVIEW_TABLE_NAME, encodeTableKey, getTableClient };
}

function createMockStorageModule() {
  const containers = new Map();

  function sanitizePathSegment(value) {
    return String(value ?? 'unknown').trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
  }

  function ensureContainer(name) {
    if (!containers.has(name)) containers.set(name, new Map());
    return containers.get(name);
  }

  async function getContainerClient(name) {
    ensureContainer(name);
    return { name };
  }

  async function readJsonBlob(cc, blobName) {
    const p = ensureContainer(cc.name).get(blobName);
    return p ? structuredClone(p) : null;
  }
  async function readTextBlob(cc, blobName) {
    const p = ensureContainer(cc.name).get(blobName);
    return p == null ? null : (typeof p === 'string' ? p : JSON.stringify(p));
  }
  async function readBinaryBlob(cc, blobName) {
    const p = ensureContainer(cc.name).get(blobName);
    return p == null ? null : (Buffer.isBuffer(p) ? p : Buffer.from(String(p)));
  }
  async function uploadJsonBlob(cc, blobName, payload) {
    ensureContainer(cc.name).set(blobName, structuredClone(payload));
    return { name: blobName };
  }
  async function uploadTextBlob(cc, blobName, payload) {
    ensureContainer(cc.name).set(blobName, String(payload));
    return { name: blobName };
  }
  async function uploadBinaryBlob(cc, blobName, payload) {
    ensureContainer(cc.name).set(blobName, Buffer.isBuffer(payload) ? payload : Buffer.from(payload));
    return { name: blobName };
  }
  async function deleteBlobIfExists(cc, blobName) {
    ensureContainer(cc.name).delete(blobName);
  }

  return {
    ARB_INPUT_CONTAINER_NAME: 'arb-inputfiles',
    ARB_OUTPUT_CONTAINER_NAME: 'arb-outputfiles',
    ARB_PROCESSING_CACHE_CONTAINER_NAME: 'arb-processing-cache',
    NOTES_CONTAINER_NAME: 'review-notes',
    ARTIFACTS_CONTAINER_NAME: 'review-artifacts',
    COMMERCIAL_CACHE_CONTAINER_NAME: 'commercial-cache',
    buildArtifactBlobName: (u, f) => `${sanitizePathSegment(u)}/${f}`,
    buildNotesBlobName: (u) => `${sanitizePathSegment(u)}/review-records.json`,
    buildProjectReviewBlobName: (u, r) => `${sanitizePathSegment(u)}/project-reviews/${sanitizePathSegment(r)}.json`,
    buildProjectReviewStateBlobName: (u) => `${sanitizePathSegment(u)}/project-review-state.json`,
    deleteBlobIfExists,
    getContainerClient,
    readBinaryBlob,
    readJsonBlob,
    readTextBlob,
    sanitizePathSegment,
    uploadBinaryBlob,
    uploadJsonBlob,
    uploadTextBlob
  };
}

function loadStore() {
  const tableStoragePath = require.resolve('./table-storage');
  const storagePath = require.resolve('./storage');
  const copilotPath = require.resolve('./copilot');
  const storePath = require.resolve('./arb-review-store');

  delete require.cache[tableStoragePath];
  delete require.cache[storagePath];
  delete require.cache[copilotPath];
  delete require.cache[storePath];

  const mockTableStorage = createMockTableModule();
  const mockStorage = createMockStorageModule();

  require.cache[tableStoragePath] = { id: tableStoragePath, filename: tableStoragePath, loaded: true, exports: mockTableStorage };
  require.cache[storagePath] = { id: storagePath, filename: storagePath, loaded: true, exports: mockStorage };
  require.cache[copilotPath] = {
    id: copilotPath, filename: copilotPath, loaded: true,
    exports: { getCopilotConfiguration: () => ({ configured: false }), async runCopilot() { throw new Error('not configured'); } }
  };

  const store = require('./arb-review-store');

  return {
    store,
    cleanup() {
      delete require.cache[tableStoragePath];
      delete require.cache[storagePath];
      delete require.cache[copilotPath];
      delete require.cache[storePath];
    }
  };
}

// ---------- principals ----------

const userA = { userId: 'rbac-user-a', userDetails: 'alice@example.com', identityProvider: 'aad' };
const userB = { userId: 'rbac-user-b', userDetails: 'bob@example.com', identityProvider: 'aad' };

// ---------- tests ----------

test('C10: user B cannot read review created by user A (getArbReview returns 404)', async () => {
  const { store, cleanup } = loadStore();
  try {
    const review = await store.createArbReview(userA, { projectCode: 'rbac-test', projectName: 'RBAC Test', customerName: 'RBAC Corp' });
    const reviewId = review.reviewId;

    // User A can read their own review
    const ownRead = await store.getArbReview(userA, reviewId);
    assert.equal(ownRead.reviewId, reviewId);

    // User B gets 404 for the same reviewId
    await assert.rejects(
      () => store.getArbReview(userB, reviewId),
      (err) => {
        assert.equal(err.statusCode, 404);
        return true;
      }
    );
  } finally {
    cleanup();
  }
});

test('C10: user B cannot read findings owned by user A (getArbFindings returns 404)', async () => {
  const { store, cleanup } = loadStore();
  try {
    const review = await store.createArbReview(userA, { projectCode: 'rbac-findings', projectName: 'RBAC Findings', customerName: 'RBAC Corp' });
    const reviewId = review.reviewId;

    await assert.rejects(
      () => store.getArbFindings(userB, reviewId),
      (err) => {
        assert.equal(err.statusCode, 404);
        return true;
      }
    );
  } finally {
    cleanup();
  }
});

test('C10: user B cannot read scorecard owned by user A (getArbScorecard returns 404)', async () => {
  const { store, cleanup } = loadStore();
  try {
    const review = await store.createArbReview(userA, { projectCode: 'rbac-scorecard', projectName: 'RBAC Scorecard', customerName: 'RBAC Corp' });
    const reviewId = review.reviewId;

    await assert.rejects(
      () => store.getArbScorecard(userB, reviewId),
      (err) => {
        assert.equal(err.statusCode, 404);
        return true;
      }
    );
  } finally {
    cleanup();
  }
});

test('C10: user B cannot read evidence owned by user A (getArbEvidence returns 404)', async () => {
  const { store, cleanup } = loadStore();
  try {
    const review = await store.createArbReview(userA, { projectCode: 'rbac-evidence', projectName: 'RBAC Evidence', customerName: 'RBAC Corp' });
    const reviewId = review.reviewId;

    await assert.rejects(
      () => store.getArbEvidence(userB, reviewId),
      (err) => {
        assert.equal(err.statusCode, 404);
        return true;
      }
    );
  } finally {
    cleanup();
  }
});

test('C10: user B cannot read actions owned by user A (getArbActions returns 404)', async () => {
  const { store, cleanup } = loadStore();
  try {
    const review = await store.createArbReview(userA, { projectCode: 'rbac-actions', projectName: 'RBAC Actions', customerName: 'RBAC Corp' });
    const reviewId = review.reviewId;

    await assert.rejects(
      () => store.getArbActions(userB, reviewId),
      (err) => {
        assert.equal(err.statusCode, 404);
        return true;
      }
    );
  } finally {
    cleanup();
  }
});

test('C10: user B cannot delete review owned by user A (deleteArbReview returns 404)', async () => {
  const { store, cleanup } = loadStore();
  try {
    const review = await store.createArbReview(userA, { projectCode: 'rbac-delete', projectName: 'RBAC Delete', customerName: 'RBAC Corp' });
    const reviewId = review.reviewId;

    await assert.rejects(
      () => store.deleteArbReview(userB, reviewId),
      (err) => {
        assert.equal(err.statusCode, 404);
        return true;
      }
    );

    // User A's review is still intact after the failed delete attempt
    const stillExists = await store.getArbReview(userA, reviewId);
    assert.equal(stillExists.reviewId, reviewId);
  } finally {
    cleanup();
  }
});

test('C10: user B cannot patch finding owned by user A (updateArbFinding returns 404)', async () => {
  const { store, cleanup } = loadStore();
  try {
    const review = await store.createArbReview(userA, { projectCode: 'rbac-patch', projectName: 'RBAC Patch', customerName: 'RBAC Corp' });
    const reviewId = review.reviewId;
    const findings = await store.getArbFindings(userA, reviewId);
    const targetFindingId = findings[0]?.findingId;
    assert.ok(targetFindingId, 'Expected at least one default finding for this test');

    await assert.rejects(
      () => store.updateArbFinding(userB, reviewId, targetFindingId, { status: 'Closed' }),
      (err) => {
        assert.equal(err.statusCode, 404);
        return true;
      }
    );

    // Finding is unchanged from user A's perspective
    const unchanged = await store.getArbFindings(userA, reviewId);
    const target = unchanged.find((f) => f.findingId === targetFindingId);
    assert.notEqual(target?.status, 'Closed');
  } finally {
    cleanup();
  }
});

test('C10: user B cannot record decision on review owned by user A (recordArbDecision returns 404)', async () => {
  const { store, cleanup } = loadStore();
  try {
    const review = await store.createArbReview(userA, { projectCode: 'rbac-decision', projectName: 'RBAC Decision', customerName: 'RBAC Corp' });
    const reviewId = review.reviewId;

    await assert.rejects(
      () => store.recordArbDecision(userB, reviewId, { finalDecision: 'Approved', rationale: 'Injected approval' }),
      (err) => {
        assert.equal(err.statusCode, 404);
        return true;
      }
    );

    // No decision was recorded for user A's review
    const decision = await store.getArbDecision(userA, reviewId);
    assert.equal(decision, null);
  } finally {
    cleanup();
  }
});

test('C10: user B cannot list reviews owned by user A (listArbReviews returns empty for B)', async () => {
  const { store, cleanup } = loadStore();
  try {
    await store.createArbReview(userA, { projectCode: 'rbac-list', projectName: 'RBAC List', customerName: 'RBAC Corp' });

    // User B has no reviews — list should be empty
    const bResult = await store.listArbReviews(userB);
    assert.equal(bResult.total, 0);
    assert.equal(bResult.reviews.length, 0);

    // User A can still see theirs
    const aResult = await store.listArbReviews(userA);
    assert.ok(aResult.total > 0);
  } finally {
    cleanup();
  }
});

test('C10: two users with the same reviewId see independent isolated data', async () => {
  const { store, cleanup } = loadStore();
  try {
    // Both users create a review — store auto-generates IDs from projectCode
    const reviewA = await store.createArbReview(userA, { projectCode: 'shared-code', projectName: 'Project by A', customerName: 'Corp A' });
    const reviewB = await store.createArbReview(userB, { projectCode: 'shared-code', projectName: 'Project by B', customerName: 'Corp B' });

    // Both reviews may share the same reviewId since they use the same projectCode
    assert.equal(reviewA.reviewId, reviewB.reviewId, 'Same reviewId derived from same projectCode');

    const loadedA = await store.getArbReview(userA, reviewA.reviewId);
    const loadedB = await store.getArbReview(userB, reviewB.reviewId);

    // Each user sees their own review data — customer names must not leak across
    assert.equal(loadedA.customerName, 'Corp A');
    assert.equal(loadedB.customerName, 'Corp B');
    assert.equal(loadedA.createdByUserId, userA.userId);
    assert.equal(loadedB.createdByUserId, userB.userId);
  } finally {
    cleanup();
  }
});
