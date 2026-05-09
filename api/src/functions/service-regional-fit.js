const { app } = require("@azure/functions");
const { jsonResponse } = require("../shared/auth");
const {
  AVAILABILITY_SOURCE_URL,
  REGIONS_SOURCE_URL,
  accessStateRank,
  availabilityStateRank,
  cleanDisplayText,
  isCommercialPublicAvailabilityRow,
  normalizeKey,
  normalizeAvailabilityState,
  parseRegionLabel,
  resolveAvailabilityMapping
} = require("../shared/azure-live-data");
const { getAvailabilityDataset } = require("../shared/availability-service");

const MAX_SERVICES_PER_REQUEST = 20;

function buildServiceRegionalFit(service, dataset) {
  const mapping = resolveAvailabilityMapping(service, dataset.offeringByKey);
  const baseSummary = {
    serviceSlug: service.slug,
    serviceName: service.service,
    mapped: false,
    notes: mapping.notes,
    publicRegionCount: dataset.publicRegions.length,
    availableRegionCount: 0,
    unavailableRegionCount: 0,
    restrictedRegionCount: 0,
    earlyAccessRegionCount: 0,
    previewRegionCount: 0,
    retiringRegionCount: 0,
    isGlobalService: false,
    generatedAt: dataset.generatedAt,
    availabilitySourceUrl: AVAILABILITY_SOURCE_URL,
    regionsSourceUrl: REGIONS_SOURCE_URL
  };

  if (!mapping.mapped) {
    return {
      ...baseSummary,
      regions: [],
      unavailableRegions: [],
      globalSkuStates: []
    };
  }

  const matchedRows = dataset.availabilityRows.filter((row) => {
    if (normalizeKey(cleanDisplayText(row.OfferingName)) !== normalizeKey(mapping.offeringName)) {
      return false;
    }

    if ((mapping.matchedSkuHints ?? []).length === 0) {
      return true;
    }

    const skuName = cleanDisplayText(row.ProductSkuName) ?? "";

    return mapping.matchedSkuHints.some((hint) => skuName.toLowerCase().includes(hint.toLowerCase()));
  });
  const regionMap = new Map();
  const globalSkuMap = new Map();

  for (const row of matchedRows) {
    const state = normalizeAvailabilityState(row.CurrentState);

    if (!state) {
      continue;
    }

    const skuName = cleanDisplayText(row.ProductSkuName) || "General availability";
    const { regionName, accessState } = parseRegionLabel(row.RegionName);

    if (regionName === "Non Regional") {
      globalSkuMap.set(`${skuName}::${state}`, {
        skuName,
        state
      });
      continue;
    }

    if (!isCommercialPublicAvailabilityRow(row)) {
      continue;
    }

    const geographyName = cleanDisplayText(row.GeographyName) ?? "Unknown";
    const existing = regionMap.get(regionName);

    if (!existing) {
      regionMap.set(regionName, {
        regionName,
        geographyName,
        accessState,
        availabilityState: state,
        skuStates: [{ skuName, state }]
      });
      continue;
    }

    if (accessStateRank(accessState) > accessStateRank(existing.accessState)) {
      existing.accessState = accessState;
    }

    if (availabilityStateRank(state) > availabilityStateRank(existing.availabilityState)) {
      existing.availabilityState = state;
    }

    if (!existing.skuStates.some((entry) => entry.skuName === skuName && entry.state === state)) {
      existing.skuStates.push({ skuName, state });
      existing.skuStates.sort(
        (left, right) =>
          left.skuName.localeCompare(right.skuName) || left.state.localeCompare(right.state)
      );
    }
  }

  const availableRegions = [...regionMap.values()].sort((left, right) =>
    left.regionName.localeCompare(right.regionName)
  );
  const isGlobalService = globalSkuMap.size > 0;
  const unavailableRegions = isGlobalService
    ? []
    : dataset.publicRegions
    .filter((region) => !regionMap.has(region.regionName))
    .map((region) => ({
      regionName: region.regionName,
      geographyName: region.geographyName,
      accessState: region.accessState
    }));
  const restrictedRegionCount = availableRegions.filter(
    (region) => region.accessState === "ReservedAccess"
  ).length;
  const earlyAccessRegionCount = availableRegions.filter(
    (region) => region.accessState === "EarlyAccess"
  ).length;
  const previewRegionCount = availableRegions.filter((region) =>
    region.skuStates.some((entry) => entry.state === "Preview")
  ).length;
  const retiringRegionCount = availableRegions.filter((region) =>
    region.skuStates.some((entry) => entry.state === "Retiring")
  ).length;

  return {
    ...baseSummary,
    mapped: true,
    matchType: mapping.matchType,
    matchedOfferingName: mapping.offeringName,
    matchedServiceLabel: mapping.matchedServiceLabel,
    matchedSkuHints: mapping.matchedSkuHints ?? [],
    notes: mapping.notes,
    availableRegionCount: availableRegions.length,
    unavailableRegionCount: unavailableRegions.length,
    restrictedRegionCount,
    earlyAccessRegionCount,
    previewRegionCount,
    retiringRegionCount,
    isGlobalService,
    regions: availableRegions,
    unavailableRegions,
    globalSkuStates: [...globalSkuMap.values()].sort(
      (left, right) => left.skuName.localeCompare(right.skuName) || left.state.localeCompare(right.state)
    )
  };
}

async function handleAvailability(request) {
  try {
    const body = await request.json();
    const services = Array.isArray(body?.services) ? body.services.slice(0, MAX_SERVICES_PER_REQUEST) : [];

    if (services.length === 0) {
      return jsonResponse(400, {
        error: "At least one service is required to load regional availability."
      });
    }

    const { dataset, dataSource } = await getAvailabilityDataset({
      refreshedBy: "request"
    });
    const payload = services.map((service) => ({
      ...buildServiceRegionalFit(service, dataset),
      dataSource
    }));

    return jsonResponse(
      200,
      {
        generatedAt: dataset.generatedAt,
        sourceUrl: AVAILABILITY_SOURCE_URL,
        services: payload
      },
      {
        "Cache-Control": "public, max-age=1800"
      }
    );
  } catch (error) {
    return jsonResponse(500, {
      error:
        error instanceof Error
          ? error.message
          : "Unable to load Azure Product Availability by Region data."
    });
  }
}

app.http("availability", {
  route: "availability",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: handleAvailability
});

app.http("service-regional-fit", {
  route: "service-regional-fit",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: handleAvailability
});

module.exports = {
  buildServiceRegionalFit,
  handleAvailability
};
