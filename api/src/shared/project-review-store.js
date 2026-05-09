const {
  NOTES_CONTAINER_NAME,
  buildNotesBlobName,
  buildProjectReviewBlobName,
  buildProjectReviewStateBlobName,
  deleteBlobIfExists,
  getContainerClient,
  readJsonBlob,
  sanitizePathSegment,
  uploadJsonBlob
} = require("./storage");
const {
  PROJECT_REVIEW_TABLE_NAME,
  USER_PROFILE_TABLE_NAME,
  encodeTableKey,
  getTableClient
} = require("./table-storage");
const { toReviewDocument } = require("./review-records");
const { normalizeCopilotContext, normalizeReviewPackage } = require("./project-review-state");

function createEmptyProjectReviewPayload() {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    activePackage: null,
    copilotContext: null,
    reviewRecordDocument: toReviewDocument([])
  };
}

function createEmptyProjectReviewStateDocument() {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    activePackage: null,
    copilotContext: null
  };
}

function createEmptyUserProfile(principal) {
  const now = new Date().toISOString();

  return {
    userId: principal.userId,
    email: principal.userDetails || principal.userId,
    displayName: principal.userDetails || principal.userId,
    provider: principal.identityProvider || "unknown",
    activeReviewId: null,
    createdAt: now,
    updatedAt: now,
    lastSignedInAt: now
  };
}

function normalizeUserProfileEntity(entity, principal) {
  const fallback = createEmptyUserProfile(principal);

  return {
    userId: entity?.userId || fallback.userId,
    email: entity?.email || fallback.email,
    displayName: entity?.displayName || fallback.displayName,
    provider: entity?.provider || fallback.provider,
    activeReviewId: entity?.activeReviewId || null,
    createdAt: entity?.createdAt || fallback.createdAt,
    updatedAt: entity?.updatedAt || fallback.updatedAt,
    lastSignedInAt: entity?.lastSignedInAt || fallback.lastSignedInAt
  };
}

function summarizeProjectReview(activePackage, copilotContext, reviewRecordDocument, userId) {
  const normalizedPackage = normalizeReviewPackage(activePackage);
  const normalizedContext = normalizeCopilotContext(copilotContext);
  const recordDocument = reviewRecordDocument?.records ? reviewRecordDocument : toReviewDocument([]);
  const now = new Date().toISOString();

  if (!normalizedPackage) {
    return null;
  }

  const serviceCount =
    normalizedPackage.selectedServiceSlugs.length || normalizedContext?.services?.length || 0;

  const includedCount = recordDocument.records.filter(
    (record) => record.review?.packageDecision === "Include"
  ).length;
  const notApplicableCount = recordDocument.records.filter(
    (record) => record.review?.packageDecision === "Not Applicable"
  ).length;
  const excludedCount = recordDocument.records.filter(
    (record) => record.review?.packageDecision === "Exclude"
  ).length;
  const pendingCount = recordDocument.records.filter(
    (record) => (record.review?.packageDecision ?? "Needs Review") === "Needs Review"
  ).length;

  return {
    partitionKey: encodeTableKey(userId),
    rowKey: encodeTableKey(normalizedPackage.id),
    userId,
    reviewId: normalizedPackage.id,
    name: normalizedPackage.name,
    audience: normalizedPackage.audience,
    businessScope: normalizedPackage.businessScope,
    targetRegionsJson: JSON.stringify(normalizedPackage.targetRegions),
    selectedServiceSlugsJson: JSON.stringify(normalizedPackage.selectedServiceSlugs),
    serviceCount,
    recordCount: recordDocument.recordCount ?? recordDocument.records.length,
    includedCount,
    notApplicableCount,
    excludedCount,
    pendingCount,
    createdAt: normalizedPackage.createdAt || now,
    updatedAt: normalizedPackage.updatedAt || now,
    lastSavedAt: now,
    blobName: buildProjectReviewBlobName(userId, normalizedPackage.id)
  };
}

function toProjectReviewSummary(entity, activeReviewId) {
  return {
    id: entity.reviewId,
    name: entity.name,
    audience: entity.audience,
    businessScope: entity.businessScope || "",
    targetRegions: entity.targetRegionsJson ? JSON.parse(entity.targetRegionsJson) : [],
    selectedServiceSlugs: entity.selectedServiceSlugsJson
      ? JSON.parse(entity.selectedServiceSlugsJson)
      : [],
    serviceCount: Number(entity.serviceCount ?? 0),
    recordCount: Number(entity.recordCount ?? 0),
    includedCount: Number(entity.includedCount ?? 0),
    notApplicableCount: Number(entity.notApplicableCount ?? 0),
    excludedCount: Number(entity.excludedCount ?? 0),
    pendingCount: Number(entity.pendingCount ?? 0),
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    lastSavedAt: entity.lastSavedAt,
    isActive: entity.reviewId === activeReviewId,
    isArchived: Boolean(entity.archivedAt),
    archivedAt: entity.archivedAt ?? null,
    isDeleted: Boolean(entity.deletedAt),
    deletedAt: entity.deletedAt ?? null
  };
}

async function getUserProfileEntity(client, userId) {
  try {
    return await client.getEntity("USER", encodeTableKey(userId));
  } catch (error) {
    if (error?.statusCode === 404) {
      return null;
    }

    throw error;
  }
}

async function getProjectReviewEntity(client, userId, reviewId) {
  try {
    return await client.getEntity(encodeTableKey(userId), encodeTableKey(reviewId));
  } catch (error) {
    if (error?.statusCode === 404) {
      return null;
    }

    throw error;
  }
}

async function upsertUserProfile(principal, patch = {}) {
  const client = await getTableClient(USER_PROFILE_TABLE_NAME);
  const existing = await getUserProfileEntity(client, principal.userId);
  const normalized = normalizeUserProfileEntity(existing, principal);
  const now = new Date().toISOString();
  const entity = {
    partitionKey: "USER",
    rowKey: encodeTableKey(principal.userId),
    ...normalized,
    email: principal.userDetails || normalized.email,
    displayName: principal.userDetails || normalized.displayName,
    provider: principal.identityProvider || normalized.provider,
    updatedAt: now,
    lastSignedInAt: now,
    ...patch
  };

  await client.upsertEntity(entity, "Merge");

  return {
    userId: entity.userId,
    email: entity.email,
    displayName: entity.displayName,
    provider: entity.provider,
    activeReviewId: entity.activeReviewId ?? null,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    lastSignedInAt: entity.lastSignedInAt
  };
}

async function readProjectReviewPayload(userId, reviewId) {
  const containerClient = await getContainerClient(NOTES_CONTAINER_NAME);
  return readJsonBlob(containerClient, buildProjectReviewBlobName(userId, reviewId));
}

async function writeProjectReviewPayload(userId, reviewId, payload) {
  const containerClient = await getContainerClient(NOTES_CONTAINER_NAME);
  await uploadJsonBlob(containerClient, buildProjectReviewBlobName(userId, reviewId), payload);
}

async function rebuildProjectReviewSummariesFromBlobStorage(principal, activeReviewId, client) {
  const containerClient = await getContainerClient(NOTES_CONTAINER_NAME);
  const prefix = `${sanitizePathSegment(principal.userId)}/project-reviews/`;
  const recoveredEntities = [];

  for await (const blob of containerClient.listBlobsFlat({ prefix })) {
    if (!blob.name.endsWith(".json")) {
      continue;
    }

    const payload = await readJsonBlob(containerClient, blob.name);

    if (!payload?.activePackage?.id) {
      continue;
    }

    const summary = summarizeProjectReview(
      payload.activePackage,
      payload.copilotContext,
      payload.reviewRecordDocument,
      principal.userId
    );

    if (!summary) {
      continue;
    }

    await client.upsertEntity(summary, "Merge");
    recoveredEntities.push(summary);
  }

  recoveredEntities.sort((left, right) =>
    String(right.lastSavedAt || "").localeCompare(String(left.lastSavedAt || ""))
  );

  return recoveredEntities.map((entity) => toProjectReviewSummary(entity, activeReviewId));
}

async function saveProjectReviewState(principal, body) {
  const activePackage = normalizeReviewPackage(body?.activePackage);
  const copilotContext = normalizeCopilotContext(body?.copilotContext);

  if (!activePackage) {
    const profile = await upsertUserProfile(principal, {
      activeReviewId: null
    });

    return {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      activePackage: null,
      copilotContext: null,
      profile
    };
  }

  const reviewId = activePackage.id;
  const existingPayload = (await readProjectReviewPayload(principal.userId, reviewId)) ?? createEmptyProjectReviewPayload();
  const nextPayload = {
    ...existingPayload,
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    activePackage,
    copilotContext
  };

  await writeProjectReviewPayload(principal.userId, reviewId, nextPayload);

  const projectReviewClient = await getTableClient(PROJECT_REVIEW_TABLE_NAME);
  const summary = summarizeProjectReview(
    activePackage,
    copilotContext,
    nextPayload.reviewRecordDocument,
    principal.userId
  );

  if (summary) {
    await projectReviewClient.upsertEntity(summary, "Merge");
  }

  await upsertUserProfile(principal, {
    activeReviewId: reviewId
  });

  return {
    schemaVersion: 1,
    updatedAt: nextPayload.updatedAt,
    activePackage: nextPayload.activePackage,
    copilotContext: nextPayload.copilotContext
  };
}

async function loadProjectReviewState(principal) {
  const profileClient = await getTableClient(USER_PROFILE_TABLE_NAME);
  const profileEntity = await getUserProfileEntity(profileClient, principal.userId);

  if (!profileEntity?.activeReviewId) {
    const containerClient = await getContainerClient(NOTES_CONTAINER_NAME);
    const legacyState = await readJsonBlob(
      containerClient,
      buildProjectReviewStateBlobName(principal.userId)
    );

    if (!legacyState) {
      return createEmptyProjectReviewStateDocument();
    }

    return {
      schemaVersion: 1,
      updatedAt: legacyState.updatedAt || new Date().toISOString(),
      activePackage: normalizeReviewPackage(legacyState.activePackage),
      copilotContext: normalizeCopilotContext(legacyState.copilotContext)
    };
  }

  const payload = await readProjectReviewPayload(principal.userId, profileEntity.activeReviewId);

  if (!payload) {
    return createEmptyProjectReviewStateDocument();
  }

  return {
    schemaVersion: 1,
    updatedAt: payload.updatedAt || new Date().toISOString(),
    activePackage: normalizeReviewPackage(payload.activePackage),
    copilotContext: normalizeCopilotContext(payload.copilotContext)
  };
}

async function saveReviewRecords(principal, recordsDocument, reviewId) {
  if (reviewId) {
    const existingPayload =
      (await readProjectReviewPayload(principal.userId, reviewId)) ?? createEmptyProjectReviewPayload();
    const nextPayload = {
      ...existingPayload,
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      reviewRecordDocument: recordsDocument
    };

    await writeProjectReviewPayload(principal.userId, reviewId, nextPayload);

    if (nextPayload.activePackage) {
      const projectReviewClient = await getTableClient(PROJECT_REVIEW_TABLE_NAME);
      const summary = summarizeProjectReview(
        nextPayload.activePackage,
        nextPayload.copilotContext,
        recordsDocument,
        principal.userId
      );

      if (summary) {
        await projectReviewClient.upsertEntity(summary, "Merge");
      }

      await upsertUserProfile(principal, {
        activeReviewId: reviewId
      });
    }

    return recordsDocument;
  }

  const profileClient = await getTableClient(USER_PROFILE_TABLE_NAME);
  const profileEntity = await getUserProfileEntity(profileClient, principal.userId);

  if (profileEntity?.activeReviewId) {
    return saveReviewRecords(principal, recordsDocument, profileEntity.activeReviewId);
  }

  const containerClient = await getContainerClient(NOTES_CONTAINER_NAME);
  await uploadJsonBlob(containerClient, buildNotesBlobName(principal.userId), recordsDocument);

  return recordsDocument;
}

async function loadReviewRecords(principal) {
  const profileClient = await getTableClient(USER_PROFILE_TABLE_NAME);
  const profileEntity = await getUserProfileEntity(profileClient, principal.userId);

  if (profileEntity?.activeReviewId) {
    const payload = await readProjectReviewPayload(principal.userId, profileEntity.activeReviewId);

    if (payload?.reviewRecordDocument) {
      return payload.reviewRecordDocument;
    }
  }

  const containerClient = await getContainerClient(NOTES_CONTAINER_NAME);
  return (await readJsonBlob(containerClient, buildNotesBlobName(principal.userId))) ?? toReviewDocument([]);
}

async function listProjectReviews(principal) {
  const profile = await upsertUserProfile(principal);
  const client = await getTableClient(PROJECT_REVIEW_TABLE_NAME);
  const partitionKey = encodeTableKey(principal.userId);
  const entities = [];

  for await (const entity of client.listEntities({
    queryOptions: {
      filter: `PartitionKey eq '${partitionKey}'`
    }
  })) {
    entities.push(entity);
  }

  entities.sort((left, right) => String(right.lastSavedAt || "").localeCompare(String(left.lastSavedAt || "")));

  if (entities.length === 0) {
    const recoveredReviews = await rebuildProjectReviewSummariesFromBlobStorage(
      principal,
      profile.activeReviewId,
      client
    );

    return {
      user: {
        userId: profile.userId,
        email: profile.email,
        displayName: profile.displayName,
        provider: profile.provider,
        activeReviewId: profile.activeReviewId
      },
      reviews: recoveredReviews
    };
  }

  return {
    user: {
      userId: profile.userId,
      email: profile.email,
      displayName: profile.displayName,
      provider: profile.provider,
      activeReviewId: profile.activeReviewId
    },
    reviews: entities.map((entity) => toProjectReviewSummary(entity, profile.activeReviewId))
  };
}

async function activateProjectReview(principal, reviewId) {
  const client = await getTableClient(PROJECT_REVIEW_TABLE_NAME);
  const entity = await getProjectReviewEntity(client, principal.userId, reviewId);

  if (!entity) {
    const error = new Error("The selected project review was not found in Azure Table Storage.");
    error.statusCode = 404;
    throw error;
  }

  if (entity.archivedAt) {
    const error = new Error("Restore the archived project review before making it active again.");
    error.statusCode = 409;
    throw error;
  }

  if (entity.deletedAt) {
    const error = new Error("Restore the deleted project review before making it active again.");
    error.statusCode = 409;
    throw error;
  }

  const profile = await upsertUserProfile(principal, {
    activeReviewId: reviewId
  });

  return {
    user: {
      userId: profile.userId,
      email: profile.email,
      displayName: profile.displayName,
      provider: profile.provider,
      activeReviewId: profile.activeReviewId
    },
    review: toProjectReviewSummary(entity, reviewId)
  };
}

async function archiveProjectReview(principal, reviewId, archived) {
  const client = await getTableClient(PROJECT_REVIEW_TABLE_NAME);
  const entity = await getProjectReviewEntity(client, principal.userId, reviewId);

  if (!entity) {
    const error = new Error("The selected project review was not found in Azure Table Storage.");
    error.statusCode = 404;
    throw error;
  }

  if (entity.deletedAt) {
    const error = new Error("Restore the deleted project review before changing its archive state.");
    error.statusCode = 409;
    throw error;
  }

  const nextArchivedAt = archived ? new Date().toISOString() : null;
  await client.upsertEntity(
    {
      partitionKey: entity.partitionKey,
      rowKey: entity.rowKey,
      archivedAt: nextArchivedAt,
      updatedAt: new Date().toISOString()
    },
    "Merge"
  );

  const profileClient = await getTableClient(USER_PROFILE_TABLE_NAME);
  const profileEntity = await getUserProfileEntity(profileClient, principal.userId);
  const shouldClearActiveReview = archived && profileEntity?.activeReviewId === reviewId;
  const profile = await upsertUserProfile(
    principal,
    shouldClearActiveReview ? { activeReviewId: null } : {}
  );

  return {
    user: {
      userId: profile.userId,
      email: profile.email,
      displayName: profile.displayName,
      provider: profile.provider,
      activeReviewId: profile.activeReviewId
    }
  };
}

async function deleteProjectReview(principal, reviewId) {
  const client = await getTableClient(PROJECT_REVIEW_TABLE_NAME);
  const entity = await getProjectReviewEntity(client, principal.userId, reviewId);

  if (!entity) {
    const error = new Error("The selected project review was not found in Azure Table Storage.");
    error.statusCode = 404;
    throw error;
  }

  const profileClient = await getTableClient(USER_PROFILE_TABLE_NAME);
  const profileEntity = await getUserProfileEntity(profileClient, principal.userId);
  const shouldClearActiveReview = profileEntity?.activeReviewId === reviewId;

  await client.upsertEntity(
    {
      partitionKey: entity.partitionKey,
      rowKey: entity.rowKey,
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    "Merge"
  );

  const profile = await upsertUserProfile(
    principal,
    shouldClearActiveReview ? { activeReviewId: null } : {}
  );

  return {
    user: {
      userId: profile.userId,
      email: profile.email,
      displayName: profile.displayName,
      provider: profile.provider,
      activeReviewId: profile.activeReviewId
    }
  };
}

async function restoreDeletedProjectReview(principal, reviewId) {
  const client = await getTableClient(PROJECT_REVIEW_TABLE_NAME);
  const entity = await getProjectReviewEntity(client, principal.userId, reviewId);

  if (!entity) {
    const error = new Error("The selected project review was not found in Azure Table Storage.");
    error.statusCode = 404;
    throw error;
  }

  await client.upsertEntity(
    {
      partitionKey: entity.partitionKey,
      rowKey: entity.rowKey,
      deletedAt: null,
      updatedAt: new Date().toISOString()
    },
    "Merge"
  );

  const profile = await upsertUserProfile(principal);

  return {
    user: {
      userId: profile.userId,
      email: profile.email,
      displayName: profile.displayName,
      provider: profile.provider,
      activeReviewId: profile.activeReviewId
    }
  };
}

async function purgeProjectReview(principal, reviewId) {
  const client = await getTableClient(PROJECT_REVIEW_TABLE_NAME);
  const entity = await getProjectReviewEntity(client, principal.userId, reviewId);

  if (!entity) {
    const error = new Error("The selected project review was not found in Azure Table Storage.");
    error.statusCode = 404;
    throw error;
  }

  if (!entity.deletedAt) {
    const error = new Error("Move the project review to deleted state before permanently removing it.");
    error.statusCode = 409;
    throw error;
  }

  const profileClient = await getTableClient(USER_PROFILE_TABLE_NAME);
  const profileEntity = await getUserProfileEntity(profileClient, principal.userId);
  const wasActiveReview = profileEntity?.activeReviewId === reviewId;

  await client.deleteEntity(entity.partitionKey, entity.rowKey);

  const containerClient = await getContainerClient(NOTES_CONTAINER_NAME);
  await deleteBlobIfExists(containerClient, buildProjectReviewBlobName(principal.userId, reviewId));

  await deleteBlobIfExists(containerClient, buildProjectReviewStateBlobName(principal.userId));

  const profile = await upsertUserProfile(
    principal,
    wasActiveReview ? { activeReviewId: null } : {}
  );

  return {
    user: {
      userId: profile.userId,
      email: profile.email,
      displayName: profile.displayName,
      provider: profile.provider,
      activeReviewId: profile.activeReviewId
    }
  };
}

module.exports = {
  activateProjectReview,
  archiveProjectReview,
  deleteProjectReview,
  purgeProjectReview,
  restoreDeletedProjectReview,
  listProjectReviews,
  loadProjectReviewState,
  loadReviewRecords,
  saveProjectReviewState,
  saveReviewRecords
};
