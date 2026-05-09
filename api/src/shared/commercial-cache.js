const crypto = require("node:crypto");
const {
  COMMERCIAL_CACHE_CONTAINER_NAME,
  getContainerClient,
  readJsonBlob,
  sanitizePathSegment,
  uploadJsonBlob
} = require("./storage");

const DEFAULT_CACHE_TTL_HOURS = Math.max(
  1,
  Number(process.env.AZURE_COMMERCIAL_CACHE_TTL_HOURS || 168)
);
const AVAILABILITY_CACHE_TTL_HOURS = Math.max(
  1,
  Number(process.env.AZURE_AVAILABILITY_CACHE_TTL_HOURS || DEFAULT_CACHE_TTL_HOURS)
);
const PRICING_CACHE_TTL_HOURS = Math.max(
  1,
  Number(process.env.AZURE_PRICING_CACHE_TTL_HOURS || DEFAULT_CACHE_TTL_HOURS)
);
const COMMERCIAL_REFRESH_SCHEDULE =
  process.env.AZURE_COMMERCIAL_REFRESH_SCHEDULE || "0 0 7 * * 1";
const COMMERCIAL_WARM_SERVICE_INDEX_URL =
  process.env.AZURE_COMMERCIAL_WARM_SERVICE_INDEX_URL || "";
const COMMERCIAL_WARM_SERVICE_LIMIT = Math.max(
  0,
  Number(process.env.AZURE_COMMERCIAL_WARM_SERVICE_LIMIT || 0)
);
const REFRESH_STATE_BLOB_NAME = "meta/refresh-state.json";
const AVAILABILITY_BLOB_NAME = "availability/public-commercial.json";

function toTtlMs(hours) {
  return hours * 60 * 60 * 1000;
}

function calculateExpiresAt(savedAt, ttlHours) {
  const savedTime = Date.parse(savedAt);

  if (Number.isNaN(savedTime)) {
    return undefined;
  }

  return new Date(savedTime + toTtlMs(ttlHours)).toISOString();
}

function isSnapshotFresh(snapshot, ttlHours) {
  const savedTime = Date.parse(snapshot?.cachedAt ?? "");

  if (Number.isNaN(savedTime)) {
    return false;
  }

  return Date.now() - savedTime < toTtlMs(ttlHours);
}

function buildPricingCacheDescriptor(service) {
  return {
    slug: service.slug,
    service: service.service,
    aliases: [...(service.aliases ?? [])].sort(),
    matchedOfferingName: service.matchedOfferingName ?? "",
    matchedServiceLabel: service.matchedServiceLabel ?? ""
  };
}

function buildPricingCacheBlobName(service) {
  const descriptor = JSON.stringify(buildPricingCacheDescriptor(service));
  const digest = crypto.createHash("sha1").update(descriptor).digest("hex");

  return `pricing/${sanitizePathSegment(service.slug)}-${digest}.json`;
}

async function getCommercialCacheContainerClient() {
  return getContainerClient(COMMERCIAL_CACHE_CONTAINER_NAME);
}

async function readAvailabilitySnapshot() {
  const containerClient = await getCommercialCacheContainerClient();

  return readJsonBlob(containerClient, AVAILABILITY_BLOB_NAME);
}

async function writeAvailabilitySnapshot(payload, metadata = {}) {
  const containerClient = await getCommercialCacheContainerClient();
  const snapshot = {
    kind: "availability",
    cachedAt: new Date().toISOString(),
    ttlHours: AVAILABILITY_CACHE_TTL_HOURS,
    ...metadata,
    payload
  };

  await uploadJsonBlob(containerClient, AVAILABILITY_BLOB_NAME, snapshot);
  return snapshot;
}

async function readPricingSnapshot(service) {
  const containerClient = await getCommercialCacheContainerClient();

  return readJsonBlob(containerClient, buildPricingCacheBlobName(service));
}

async function writePricingSnapshot(service, payload, metadata = {}) {
  const containerClient = await getCommercialCacheContainerClient();
  const snapshot = {
    kind: "pricing",
    cachedAt: new Date().toISOString(),
    ttlHours: PRICING_CACHE_TTL_HOURS,
    descriptor: buildPricingCacheDescriptor(service),
    ...metadata,
    payload
  };

  await uploadJsonBlob(containerClient, buildPricingCacheBlobName(service), snapshot);
  return snapshot;
}

function defaultRefreshState() {
  return {
    updatedAt: null,
    refreshSchedule: COMMERCIAL_REFRESH_SCHEDULE,
    warmServiceIndexUrl: COMMERCIAL_WARM_SERVICE_INDEX_URL || null,
    warmServiceLimit: COMMERCIAL_WARM_SERVICE_LIMIT,
    manualRefreshEnabled: Boolean(process.env.AZURE_COMMERCIAL_REFRESH_KEY),
    availability: {
      ok: false,
      ttlHours: AVAILABILITY_CACHE_TTL_HOURS,
      lastSuccessfulRefreshAt: null,
      lastRefreshMode: null,
      publicRegionCount: 0,
      sourceUrl: null,
      expiresAt: null,
      lastError: null
    },
    pricing: {
      ok: false,
      ttlHours: PRICING_CACHE_TTL_HOURS,
      lastSuccessfulRefreshAt: null,
      lastRefreshMode: null,
      lastServiceSlug: null,
      lastWarmCount: 0,
      sourceUrl: null,
      expiresAt: null,
      lastError: null
    }
  };
}

async function readRefreshState() {
  try {
    const containerClient = await getCommercialCacheContainerClient();
    const state = await readJsonBlob(containerClient, REFRESH_STATE_BLOB_NAME);

    if (!state) {
      return defaultRefreshState();
    }

    return {
      ...defaultRefreshState(),
      ...state,
      availability: {
        ...defaultRefreshState().availability,
        ...(state.availability ?? {})
      },
      pricing: {
        ...defaultRefreshState().pricing,
        ...(state.pricing ?? {})
      }
    };
  } catch {
    return defaultRefreshState();
  }
}

async function patchRefreshState(mutator) {
  const containerClient = await getCommercialCacheContainerClient();
  const current = await readRefreshState();
  const next = mutator({
    ...current,
    availability: { ...current.availability },
    pricing: { ...current.pricing }
  });

  next.updatedAt = new Date().toISOString();
  next.refreshSchedule = COMMERCIAL_REFRESH_SCHEDULE;
  next.warmServiceIndexUrl = COMMERCIAL_WARM_SERVICE_INDEX_URL || null;
  next.warmServiceLimit = COMMERCIAL_WARM_SERVICE_LIMIT;
  next.manualRefreshEnabled = Boolean(process.env.AZURE_COMMERCIAL_REFRESH_KEY);

  await uploadJsonBlob(containerClient, REFRESH_STATE_BLOB_NAME, next);
  return next;
}

async function recordAvailabilityRefreshStatus(status) {
  return patchRefreshState((state) => {
    state.availability = {
      ...state.availability,
      ...status,
      expiresAt: status.lastSuccessfulRefreshAt
        ? calculateExpiresAt(status.lastSuccessfulRefreshAt, AVAILABILITY_CACHE_TTL_HOURS)
        : state.availability.expiresAt
    };

    return state;
  });
}

async function recordPricingRefreshStatus(status) {
  return patchRefreshState((state) => {
    state.pricing = {
      ...state.pricing,
      ...status,
      expiresAt: status.lastSuccessfulRefreshAt
        ? calculateExpiresAt(status.lastSuccessfulRefreshAt, PRICING_CACHE_TTL_HOURS)
        : state.pricing.expiresAt
    };

    return state;
  });
}

module.exports = {
  AVAILABILITY_CACHE_TTL_HOURS,
  COMMERCIAL_CACHE_CONTAINER_NAME,
  COMMERCIAL_REFRESH_SCHEDULE,
  COMMERCIAL_WARM_SERVICE_INDEX_URL,
  COMMERCIAL_WARM_SERVICE_LIMIT,
  PRICING_CACHE_TTL_HOURS,
  buildPricingCacheBlobName,
  calculateExpiresAt,
  getCommercialCacheContainerClient,
  isSnapshotFresh,
  readAvailabilitySnapshot,
  readPricingSnapshot,
  readRefreshState,
  recordAvailabilityRefreshStatus,
  recordPricingRefreshStatus,
  writeAvailabilitySnapshot,
  writePricingSnapshot
};
