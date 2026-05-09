
const {
  PRICE_DISCLAIMER,
  PRICING_CALCULATOR_URL,
  RETAIL_PRICES_API_URL,
  normalizeKey
} = require("./azure-live-data");
const {
  PRICING_CACHE_TTL_HOURS,
  calculateExpiresAt,
  isSnapshotFresh,
  readPricingSnapshot,
  recordPricingRefreshStatus,
  writePricingSnapshot
} = require("./commercial-cache");
const { getAvailabilityDataset } = require("./availability-service");
const { enrichPricingRows } = require("./pricing-posture");

const MAX_PAGES_PER_QUERY = 25;
const MAX_ITEMS_PER_QUERY = 4000;
const TARGET_PRICING_ZONE_RULES = [
  {
    zone: "Zone 1",
    aliases: ["North America"],
    match: /(north america|united states|canada|mexico|puerto rico)/
  },
  {
    zone: "Zone 2",
    aliases: ["Asia Pacific"],
    match: /(asia pacific|asia|pacific|east asia|southeast asia|japan|hong kong|taiwan|new zealand)/
  },
  {
    zone: "Zone 3",
    aliases: ["South America"],
    match: /(south america|brazil|chile)/
  },
  {
    zone: "Zone 4",
    aliases: ["Australia"],
    match: /(australia)/
  },
  {
    zone: "Zone 5",
    aliases: ["India"],
    match: /(india)/
  },
  {
    zone: "Zone 6",
    aliases: ["Europe"],
    match: /(europe|united kingdom|uk|ireland|france|germany|sweden|norway|switzerland|netherlands|italy|spain|poland|finland|denmark|belgium|austria)/
  },
  {
    zone: "Zone 7",
    aliases: ["Middle East and Africa"],
    match: /(middle east|africa|united arab emirates|uae|qatar|saudi|saudi arabia|israel|kuwait|oman|bahrain|egypt|south africa)/
  },
  {
    zone: "Zone 8",
    aliases: ["Korea"],
    match: /(korea)/
  }
];

const MANUAL_QUERY_MAP = {
  "api-management": {
    queries: [{ field: "serviceName", operator: "eq", value: "API Management", source: "manual" }]
  },
  "azure-ai-content-safety": {
    queries: [
      {
        field: "productName",
        operator: "contains",
        value: "Content Safety",
        source: "manual"
      }
    ],
    notes: ["Retail pricing is published under Content Safety meters in the Foundry toolset."]
  },
  "azure-ai-foundry": {
    queries: [
      {
        field: "productName",
        operator: "contains",
        value: "Azure AI Foundry",
        source: "manual"
      },
      {
        field: "serviceName",
        operator: "contains",
        value: "Foundry",
        source: "manual"
      }
    ],
    notes: ["Retail pricing is published under Foundry-branded products and services."]
  },
  "azure-ai-search": {
    queries: [
      {
        field: "productName",
        operator: "contains",
        value: "Azure AI Search",
        source: "manual"
      }
    ],
    notes: ["Retail pricing is published under Azure AI Search product rows."]
  },
  "azure-app-service-plan": {
    queries: [
      {
        field: "serviceName",
        operator: "eq",
        value: "Azure App Service",
        source: "manual"
      }
    ],
    notes: ["App Service Plan pricing is published under Azure App Service in the retail price feed."]
  },
  "azure-application-insights": {
    queries: [
      {
        field: "productName",
        operator: "contains",
        value: "Application Insights",
        source: "manual"
      }
    ],
    notes: ["Application Insights pricing is published as Azure Monitor product meters."]
  },
  "azure-container-apps-environment": {
    queries: [
      {
        field: "serviceName",
        operator: "eq",
        value: "Azure Container Apps",
        source: "manual"
      }
    ],
    notes: ["Environment-level pricing is published within Azure Container Apps meters."]
  },
  "azure-front-door": {
    queries: [
      {
        field: "serviceName",
        operator: "eq",
        value: "Azure Front Door Service",
        source: "manual"
      }
    ],
    notes: ["Retail pricing is published under Azure Front Door Service in the retail price feed."]
  },
  "azure-front-door-waf": {
    queries: [
      {
        field: "productName",
        operator: "contains",
        value: "Front Door",
        source: "manual"
      },
      {
        field: "serviceName",
        operator: "eq",
        value: "Azure Front Door Service",
        source: "manual"
      }
    ],
    notes: ["Front Door WAF pricing is published within Front Door retail meters rather than as a standalone service."]
  },
  "azure-machine-learning": {
    queries: [
      {
        field: "productName",
        operator: "contains",
        value: "Azure Machine Learning",
        source: "manual"
      }
    ],
    notes: ["Retail pricing is published under Azure Machine Learning product rows."]
  },
  "azure-nat-gateway": {
    queries: [
      {
        field: "productName",
        operator: "eq",
        value: "NAT Gateway",
        source: "manual"
      }
    ]
  },
  "azure-openai": {
    queries: [
      {
        field: "productName",
        operator: "contains",
        value: "Azure OpenAI",
        source: "manual"
      }
    ],
    notes: ["Retail pricing is published under Azure OpenAI product rows in the Foundry model family."]
  },
  "azure-sql-database": {
    queries: [
      {
        field: "serviceName",
        operator: "contains",
        value: "SQL Database",
        source: "manual"
      },
      {
        field: "productName",
        operator: "contains",
        value: "SQL Database",
        source: "manual"
      }
    ],
    notes: ["Retail pricing is published under SQL Database compute and elastic-pool product families in the retail price feed."]
  },
  "azure-private-dns": {
    queries: [
      {
        field: "productName",
        operator: "contains",
        value: "DNS",
        source: "manual"
      }
    ],
    notes: ["Private DNS pricing is published within Azure DNS product meters."]
  },
  "azure-public-ip": {
    queries: [
      {
        field: "productName",
        operator: "contains",
        value: "Public IP",
        source: "manual"
      }
    ],
    notes: ["Public IP pricing is published under IP service product names."]
  },
  "azure-traffic-manager": {
    queries: [
      {
        field: "productName",
        operator: "eq",
        value: "Traffic Manager",
        source: "manual"
      }
    ]
  },
  "azure-vpn-gateway": {
    queries: [
      {
        field: "productName",
        operator: "eq",
        value: "VPN Gateway",
        source: "manual"
      }
    ]
  },
  "azure-virtual-wan": {
    queries: [
      {
        field: "productName",
        operator: "eq",
        value: "Virtual WAN",
        source: "manual"
      }
    ]
  },
  "log-analytics": {
    queries: [
      {
        field: "productName",
        operator: "contains",
        value: "Log Analytics",
        source: "manual"
      }
    ],
    notes: ["Log Analytics pricing is published under Azure Monitor product meters."]
  },
  "microsoft-purview": {
    queries: [
      {
        field: "productName",
        operator: "contains",
        value: "Purview",
        source: "manual"
      }
    ]
  },
  "web-application-firewall": {
    queries: [
      {
        field: "productName",
        operator: "contains",
        value: "WAF",
        source: "manual"
      }
    ],
    notes: ["WAF pricing is published within gateway and Front Door product meters rather than as a universal standalone service."]
  }
};

function sanitizeServiceName(value) {
  return String(value ?? "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildODataFilter(query) {
  const escapedValue = String(query.value).replace(/'/g, "''");

  if (query.operator === "contains") {
    return `contains(${query.field}, '${escapedValue}')`;
  }

  return `${query.field} eq '${escapedValue}'`;
}

function buildQueryCandidates(service) {
  const manual = MANUAL_QUERY_MAP[service.slug];

  if (manual) {
    return {
      queries: manual.queries,
      notes: manual.notes ?? []
    };
  }

  const candidates = [];
  const seen = new Set();
  const namedCandidates = [
    { value: service.service, source: "serviceName" },
    { value: sanitizeServiceName(service.service), source: "serviceName" },
    { value: service.matchedServiceLabel, source: "matchedLabel" },
    { value: service.matchedOfferingName, source: "matchedOffering" },
    ...(service.aliases ?? []).map((alias) => ({
      value: sanitizeServiceName(alias),
      source: "alias"
    }))
  ];

  for (const candidate of namedCandidates) {
    const value = sanitizeServiceName(candidate.value);

    if (!value) {
      continue;
    }

    for (const field of ["serviceName", "productName"]) {
      const key = `${field}.eq.${value}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      candidates.push({
        field,
        operator: "eq",
        value,
        source: candidate.source
      });
    }
  }

  return {
    queries: candidates,
    notes: []
  };
}

async function fetchRetailPricingRows(query) {
  const rows = [];
  let nextPageUrl = `${RETAIL_PRICES_API_URL}?$filter=${encodeURIComponent(buildODataFilter(query))}`;
  let pageCount = 0;

  while (nextPageUrl && pageCount < MAX_PAGES_PER_QUERY && rows.length < MAX_ITEMS_PER_QUERY) {
    const response = await fetch(nextPageUrl, {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Retail price query failed with status ${response.status}.`);
    }

    const payload = await response.json();

    rows.push(...(payload.Items ?? []));
    nextPageUrl = payload.NextPageLink ?? null;
    pageCount += 1;
  }

  return rows;
}

function classifyLocationKind(item, publicRegionMap) {
  const armRegionKey = normalizeKey(item.armRegionName);

  if (armRegionKey && publicRegionMap.has(armRegionKey)) {
    return "Region";
  }

  if (/zone/i.test(item.location ?? "")) {
    return "BillingZone";
  }

  if (!item.armRegionName || /global|worldwide|no region/i.test(item.location ?? "")) {
    return "Global";
  }

  return "Unknown";
}

function normalizePricingRows(items, publicRegionMap, service, query) {
  const deduplicated = new Map();

  for (const item of items) {
    if (item?.type && item.type !== "Consumption") {
      continue;
    }

    if (item?.isPrimaryMeterRegion === false) {
      continue;
    }

    const row = {
      meterId: item.meterId ?? "",
      meterName: item.meterName ?? "",
      productName: item.productName ?? "",
      skuName: item.skuName ?? "",
      armSkuName: item.armSkuName ?? "",
      armRegionName: item.armRegionName ?? "",
      location: item.location ?? "",
      locationKind: classifyLocationKind(item, publicRegionMap),
      effectiveStartDate: item.effectiveStartDate ?? "",
      effectiveEndDate: item.effectiveEndDate ?? undefined,
      unitOfMeasure: item.unitOfMeasure ?? "",
      retailPrice: Number(item.retailPrice ?? 0),
      unitPrice: Number(item.unitPrice ?? 0),
      tierMinimumUnits: Number(item.tierMinimumUnits ?? 0),
      currencyCode: item.currencyCode ?? "USD",
      type: item.type ?? "",
      isPrimaryMeterRegion: item.isPrimaryMeterRegion !== false
    };
    const dedupeKey = [
      row.meterId,
      row.meterName,
      row.productName,
      row.skuName,
      row.armRegionName,
      row.location,
      row.tierMinimumUnits,
      row.retailPrice,
      row.unitOfMeasure,
      row.currencyCode
    ].join("|");

    if (!deduplicated.has(dedupeKey)) {
      deduplicated.set(dedupeKey, row);
    }
  }

  const normalizedRows = [...deduplicated.values()].sort((left, right) => {
    const locationCompare = left.location.localeCompare(right.location);

    if (locationCompare !== 0) {
      return locationCompare;
    }

    const skuCompare = left.skuName.localeCompare(right.skuName);

    if (skuCompare !== 0) {
      return skuCompare;
    }

    const meterCompare = left.meterName.localeCompare(right.meterName);

    if (meterCompare !== 0) {
      return meterCompare;
    }

    return left.tierMinimumUnits - right.tierMinimumUnits;
  });

  return enrichPricingRows(normalizedRows, service, query, publicRegionMap);
}

function matchesTargetRegion(row, targetRegions) {
  if (!targetRegions || targetRegions.length === 0) {
    return false;
  }

  const armRegionKey = normalizeKey(row.armRegionName);
  const locationKey = normalizeKey(row.location);

  return targetRegions.some((targetRegion) => {
    const targetKey = normalizeKey(targetRegion);

    return targetKey === armRegionKey || targetKey === locationKey;
  });
}

function resolveTargetPricingLocations(targetRegions, publicRegionMap) {
  const locations = new Set();

  for (const targetRegion of targetRegions ?? []) {
    const normalizedTarget = normalizeKey(targetRegion);
    const region = publicRegionMap.get(normalizedTarget);
    const geographyKey = normalizeKey(region?.geographyName ?? targetRegion);

    locations.add(targetRegion);

    for (const rule of TARGET_PRICING_ZONE_RULES) {
      if (!rule.match.test(geographyKey)) {
        continue;
      }

      locations.add(rule.zone);
      rule.aliases.forEach((alias) => locations.add(alias));
    }
  }

  return [...locations];
}

function matchesTargetPricingLocation(row, targetPricingLocations) {
  if (!targetPricingLocations || targetPricingLocations.length === 0) {
    return false;
  }

  const armRegionKey = normalizeKey(row.armRegionName);
  const locationKey = normalizeKey(row.location);

  return targetPricingLocations.some((targetLocation) => {
    const targetKey = normalizeKey(targetLocation);

    return targetKey === armRegionKey || targetKey === locationKey;
  });
}

function matchesTargetPricingScope(row, targetRegions, targetPricingLocations) {
  if (matchesTargetRegion(row, targetRegions)) {
    return true;
  }

  if (matchesTargetPricingLocation(row, targetPricingLocations)) {
    return true;
  }

  return row.locationKind === "Global" && (targetRegions.length > 0 || targetPricingLocations.length > 0);
}

function buildPricingBase(service, rows, query, notes) {
  const meterCount = new Set(rows.map((row) => row.meterId || `${row.meterName}|${row.skuName}`)).size;
  const skuCount = new Set(rows.map((row) => row.skuName || row.armSkuName).filter(Boolean)).size;
  const regionCount = new Set(
    rows
      .filter((row) => row.locationKind === "Region")
      .map((row) => normalizeKey(row.armRegionName))
      .filter(Boolean)
  ).size;
  const billingLocationCount = new Set(rows.map((row) => row.location).filter(Boolean)).size;
  const retailPrices = rows.map((row) => row.retailPrice).filter((price) => price > 0);

  return {
    serviceSlug: service.slug,
    serviceName: service.service,
    mapped: rows.length > 0,
    notes: uniqueValues(
      rows.length > 0
        ? notes ?? []
        : [
            ...(notes ?? []),
            "No Azure Retail Prices API query returned public retail pricing rows for this service yet."
          ]
    ),
    generatedAt: new Date().toISOString(),
    sourceUrl: RETAIL_PRICES_API_URL,
    calculatorUrl: PRICING_CALCULATOR_URL,
    priceDisclaimer: PRICE_DISCLAIMER,
    currencyCode: rows[0]?.currencyCode ?? "USD",
    rowCount: rows.length,
    meterCount,
    skuCount,
    regionCount,
    billingLocationCount,
    targetRegionMatchCount: 0,
    targetPricingLocations: [],
    startsAtRetailPrice: retailPrices.length > 0 ? Math.min(...retailPrices) : undefined,
    query,
    rows
  };
}

function applyTargetRegionsToPricing(basePricing, targetRegions = [], publicRegionMap) {
  const targetPricingLocations = resolveTargetPricingLocations(targetRegions, publicRegionMap);
  const targetScopedRows = basePricing.rows.filter((row) =>
    matchesTargetPricingScope(row, targetRegions, targetPricingLocations)
  );
  const targetRegionMatchCount = new Set(
    targetScopedRows
      .map((row) => normalizeKey(row.armRegionName || row.location || row.locationKind))
      .filter(Boolean)
  ).size;
  const targetRetailPrices = targetScopedRows
    .map((row) => row.retailPrice)
    .filter((price) => price > 0);

  return {
    ...basePricing,
    targetRegionMatchCount,
    targetPricingLocations,
    startsAtTargetRetailPrice:
      targetRetailPrices.length > 0 ? Math.min(...targetRetailPrices) : undefined
  };
}

function withPricingDataSource(basePricing, mode, cachedAt, lastError) {
  return {
    ...basePricing,
    dataSource: {
      mode,
      refreshedAt: cachedAt,
      cacheTtlHours: PRICING_CACHE_TTL_HOURS,
      expiresAt: cachedAt ? calculateExpiresAt(cachedAt, PRICING_CACHE_TTL_HOURS) : undefined,
      lastError
    }
  };
}

async function fetchLiveServicePricingBase(service) {
  const candidateSet = buildQueryCandidates(service);
  const { dataset: availabilityDataset } = await getAvailabilityDataset({
    refreshedBy: "pricing"
  });

  for (const query of candidateSet.queries) {
    const items = await fetchRetailPricingRows(query);
    const rows = normalizePricingRows(items, availabilityDataset.publicRegionMap, service, query);

    if (rows.length === 0) {
      continue;
    }

    return buildPricingBase(service, rows, query, candidateSet.notes);
  }

  return buildPricingBase(service, [], undefined, candidateSet.notes);
}

async function getServicePricing(service, options = {}) {
  const { forceRefresh = false, refreshedBy = "request", targetRegions = [] } = options;
  let cachedSnapshot = null;
  const { dataset: availabilityDataset } = await getAvailabilityDataset({
    refreshedBy: "pricing"
  });

  try {
    cachedSnapshot = await readPricingSnapshot(service);
  } catch {
    cachedSnapshot = null;
  }

  if (!forceRefresh && cachedSnapshot && isSnapshotFresh(cachedSnapshot, PRICING_CACHE_TTL_HOURS)) {
    return withPricingDataSource(
      applyTargetRegionsToPricing(cachedSnapshot.payload, targetRegions, availabilityDataset.publicRegionMap),
      "cache",
      cachedSnapshot.cachedAt
    );
  }

  try {
    const pricingBase = await fetchLiveServicePricingBase(service);
    const snapshot = await writePricingSnapshot(service, pricingBase, {
      sourceUrl: RETAIL_PRICES_API_URL,
      refreshedBy
    });

    await recordPricingRefreshStatus({
      ok: true,
      lastSuccessfulRefreshAt: snapshot.cachedAt,
      lastRefreshMode: refreshedBy,
      lastServiceSlug: service.slug,
      sourceUrl: RETAIL_PRICES_API_URL,
      lastError: null
    });

    return withPricingDataSource(
      applyTargetRegionsToPricing(pricingBase, targetRegions, availabilityDataset.publicRegionMap),
      "live",
      snapshot.cachedAt
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load Azure Retail Prices API data.";

    try {
      await recordPricingRefreshStatus({
        ok: false,
        lastRefreshMode: refreshedBy,
        lastServiceSlug: service.slug,
        sourceUrl: RETAIL_PRICES_API_URL,
        lastError: message
      });
    } catch {
      // Preserve the original fetch failure when the refresh-state write also fails.
    }

    if (cachedSnapshot) {
      return withPricingDataSource(
        applyTargetRegionsToPricing(cachedSnapshot.payload, targetRegions, availabilityDataset.publicRegionMap),
        "stale-cache",
        cachedSnapshot.cachedAt,
        message
      );
    }

    throw error;
  }
}

async function warmServicePricing(service, refreshedBy = "timer") {
  return getServicePricing(service, {
    forceRefresh: true,
    refreshedBy,
    targetRegions: service.targetRegions ?? []
  });
}

module.exports = {
  buildQueryCandidates,
  getServicePricing,
  matchesTargetRegion,
  warmServicePricing
};
