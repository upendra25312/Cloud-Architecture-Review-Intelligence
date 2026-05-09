const { normalizeKey } = require("./azure-live-data");

function uniqueValues(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function formatRegionDisplayName(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveOfficialRegion(row, publicRegionMap) {
  const armRegionKey = normalizeKey(row.armRegionName);
  const locationKey = normalizeKey(row.location);
  const armRegion = armRegionKey ? publicRegionMap.get(armRegionKey) : null;
  const locationRegion = locationKey ? publicRegionMap.get(locationKey) : null;
  const officialRegion = armRegion ?? locationRegion ?? null;

  return {
    officialRegionName: officialRegion?.regionName,
    geographyName: officialRegion?.geographyName,
    displayRegionName:
      officialRegion?.regionName ??
      (row.locationKind === "Region" ? formatRegionDisplayName(row.location || row.armRegionName) : undefined)
  };
}

function getMappingConfidence(query) {
  if (!query) {
    return "low";
  }

  if (query.operator === "eq" && query.source !== "manual") {
    return "high";
  }

  if (query.operator === "eq") {
    return "medium";
  }

  return "low";
}

function getDefaultPriceType(confidence) {
  if (confidence === "high") {
    return "validated-retail-price";
  }

  if (confidence === "medium") {
    return "estimated-selected-retail-meter";
  }

  return "pricing-needs-review";
}

function getMonthlyApproximation(row) {
  if (!/hour/i.test(row.unitOfMeasure ?? "")) {
    return undefined;
  }

  return row.retailPrice * 730;
}

function enrichPricingRow(row, service, query, publicRegionMap) {
  const normalizedService = normalizeKey(service?.service);
  const normalizedSku = normalizeKey(row.skuName || row.armSkuName);
  const confidence = getMappingConfidence(query);
  let priceType = getDefaultPriceType(confidence);
  let productionSuitability = "production-capable";
  const warnings = [];
  const assumptions = [];

  const region = resolveOfficialRegion(row, publicRegionMap);

  if (normalizedService === normalizeKey("Azure App Service") && normalizedSku === "f1") {
    productionSuitability = "free-tier";

    if (row.retailPrice > 0) {
      priceType = "pricing-needs-review";
      warnings.push("Free tier should not normally show a non-zero retail hourly price.");
    }
  }

  if (normalizedService === normalizeKey("API Management") && normalizedSku === normalizeKey("Developer")) {
    productionSuitability = "non-production";
    warnings.push("Developer tier is intended for evaluation and development scenarios.");
    warnings.push("Developer tier does not include an SLA.");
  }

  if (
    normalizedService === normalizeKey("Azure Kubernetes Service (AKS)") ||
    normalizedService === normalizeKey("Azure Kubernetes Service")
  ) {
    if (normalizedSku.includes("automatic")) {
      priceType = "partial-price-component";
      warnings.push("This selected retail meter is not a full AKS cluster monthly cost.");
      assumptions.push("Compute, networking, storage, and workload charges may also apply.");
    }
  }

  if (!region.officialRegionName && row.locationKind === "Region") {
    warnings.push("Region label could not be normalized to an official Azure public region name.");
  }

  if (query?.operator === "contains") {
    assumptions.push("Retail row was matched from a broader contains query rather than an exact name match.");
  }

  if (query?.source === "manual") {
    assumptions.push("Retail row was matched using a manual service-to-meter mapping rule.");
  }

  return {
    ...row,
    officialRegionName: region.officialRegionName,
    displayRegionName: region.displayRegionName,
    geographyName: region.geographyName,
    priceType,
    mappingConfidence: confidence,
    productionSuitability,
    warnings: uniqueValues(warnings),
    assumptions: uniqueValues(assumptions),
    approximateMonthlyPrice: getMonthlyApproximation(row)
  };
}

function enrichPricingRows(rows, service, query, publicRegionMap) {
  return rows.map((row) => enrichPricingRow(row, service, query, publicRegionMap));
}

module.exports = {
  enrichPricingRow,
  enrichPricingRows,
  resolveOfficialRegion
};
