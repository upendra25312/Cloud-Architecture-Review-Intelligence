const {
  AVAILABILITY_SOURCE_URL,
  fetchLiveAvailabilityDataset,
  hydrateAvailabilityDataset,
  serializeAvailabilityDataset
} = require("./azure-live-data");
const {
  AVAILABILITY_CACHE_TTL_HOURS,
  calculateExpiresAt,
  isSnapshotFresh,
  readAvailabilitySnapshot,
  recordAvailabilityRefreshStatus,
  writeAvailabilitySnapshot
} = require("./commercial-cache");

function buildAvailabilityDataSource(mode, cachedAt, lastError) {
  return {
    mode,
    refreshedAt: cachedAt,
    cacheTtlHours: AVAILABILITY_CACHE_TTL_HOURS,
    expiresAt: cachedAt ? calculateExpiresAt(cachedAt, AVAILABILITY_CACHE_TTL_HOURS) : undefined,
    lastError
  };
}

async function getAvailabilityDataset(options = {}) {
  const { forceRefresh = false, refreshedBy = "request" } = options;
  let cachedSnapshot = null;

  try {
    cachedSnapshot = await readAvailabilitySnapshot();
  } catch {
    cachedSnapshot = null;
  }

  if (!forceRefresh && cachedSnapshot && isSnapshotFresh(cachedSnapshot, AVAILABILITY_CACHE_TTL_HOURS)) {
    return {
      dataset: hydrateAvailabilityDataset(cachedSnapshot.payload),
      dataSource: buildAvailabilityDataSource("cache", cachedSnapshot.cachedAt)
    };
  }

  try {
    const dataset = await fetchLiveAvailabilityDataset();
    const snapshot = await writeAvailabilitySnapshot(serializeAvailabilityDataset(dataset), {
      sourceUrl: AVAILABILITY_SOURCE_URL,
      refreshedBy
    });

    await recordAvailabilityRefreshStatus({
      ok: true,
      lastSuccessfulRefreshAt: snapshot.cachedAt,
      lastRefreshMode: refreshedBy,
      publicRegionCount: dataset.publicRegions.length,
      sourceUrl: AVAILABILITY_SOURCE_URL,
      lastError: null
    });

    return {
      dataset,
      dataSource: buildAvailabilityDataSource("live", snapshot.cachedAt)
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to load Azure Product Availability by Region data.";

    try {
      await recordAvailabilityRefreshStatus({
        ok: false,
        lastRefreshMode: refreshedBy,
        sourceUrl: AVAILABILITY_SOURCE_URL,
        lastError: message
      });
    } catch {
      // Swallow cache-state write failures and preserve the original fetch error handling below.
    }

    if (cachedSnapshot) {
      return {
        dataset: hydrateAvailabilityDataset(cachedSnapshot.payload),
        dataSource: buildAvailabilityDataSource("stale-cache", cachedSnapshot.cachedAt, message)
      };
    }

    throw error;
  }
}

async function warmAvailabilityDataset(refreshedBy = "timer") {
  return getAvailabilityDataset({
    forceRefresh: true,
    refreshedBy
  });
}

module.exports = {
  getAvailabilityDataset,
  warmAvailabilityDataset
};
