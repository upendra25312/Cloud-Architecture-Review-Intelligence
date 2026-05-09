import type {
  ServicePricing,
  ServicePricingRequest,
  ServicePricingResponse,
  ServiceRegionalFitSummary,
  ServiceSummary
} from "@/types";
import { normalizeBackendThrownMessage, readBackendErrorMessage } from "@/lib/backend-error";

const SERVICE_PRICING_CACHE_PREFIX = "azure-review-dashboard.service-pricing.v3";
const SERVICE_PRICING_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const SERVICE_PRICING_BATCH_SIZE = 20;
const SERVICE_PRICING_SOURCE_URL = "https://prices.azure.com/api/retail/prices";
const SERVICE_PRICING_CALCULATOR_URL = "https://azure.microsoft.com/en-us/pricing/calculator/";
const SERVICE_PRICING_PRICE_DISCLAIMER =
  "Public retail list pricing from Microsoft. Use the Azure Pricing Calculator after sign-in to layer negotiated rates and monthly usage assumptions.";

type CachedServicePricing = {
  savedAt: string;
  payload: ServicePricing;
};

const servicePricingMemoryCache = new Map<string, CachedServicePricing>();

function normalizeRegionName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function buildCacheKey(request: ServicePricingRequest) {
  const targetRegionKey = (request.targetRegions ?? [])
    .map((region) => normalizeRegionName(region))
    .sort()
    .join(".");

  return `${SERVICE_PRICING_CACHE_PREFIX}.${request.slug}.${targetRegionKey || "all"}`;
}

function isExpired(savedAt: string, ttlMs: number) {
  return Date.now() - Date.parse(savedAt) > ttlMs;
}

function clearCachedServicePricingByKey(cacheKey: string) {
  servicePricingMemoryCache.delete(cacheKey);

  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(cacheKey);
}

function isQuotaExceededError(error: unknown) {
  if (error instanceof DOMException) {
    return (
      error.name === "QuotaExceededError" ||
      error.name === "NS_ERROR_DOM_QUOTA_REACHED"
    );
  }

  return error instanceof Error && /quota/i.test(error.message);
}

function purgePersistedServicePricingCache() {
  if (typeof window === "undefined") {
    return;
  }

  const keysToRemove: string[] = [];

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);

    if (key?.startsWith(SERVICE_PRICING_CACHE_PREFIX)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => window.localStorage.removeItem(key));
}

function hasInvalidCachedPricingPayload(payload: ServicePricing) {
  return payload.notes.some((note) => /quota|exceeded the quota|localstorage/i.test(note));
}

function readCachedServicePricing(request: ServicePricingRequest) {
  const cacheKey = buildCacheKey(request);
  const inMemory = servicePricingMemoryCache.get(cacheKey);

  if (inMemory) {
    if (hasInvalidCachedPricingPayload(inMemory.payload)) {
      clearCachedServicePricingByKey(cacheKey);
      return null;
    }

    if (isExpired(inMemory.savedAt, SERVICE_PRICING_CACHE_TTL_MS)) {
      clearCachedServicePricingByKey(cacheKey);
      return null;
    }

    return inMemory.payload;
  }

  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(cacheKey);

  if (!raw) {
    return null;
  }

  try {
    const cached = JSON.parse(raw) as CachedServicePricing;

    if (hasInvalidCachedPricingPayload(cached.payload)) {
      clearCachedServicePricingByKey(cacheKey);
      return null;
    }

    if (isExpired(cached.savedAt, SERVICE_PRICING_CACHE_TTL_MS)) {
      clearCachedServicePricingByKey(cacheKey);
      return null;
    }

    servicePricingMemoryCache.set(cacheKey, cached);
    return cached.payload;
  } catch {
    clearCachedServicePricingByKey(cacheKey);
    return null;
  }
}

function writeCachedServicePricing(request: ServicePricingRequest, payload: ServicePricing) {
  const cacheKey = buildCacheKey(request);
  const cached: CachedServicePricing = {
    savedAt: new Date().toISOString(),
    payload
  };

  servicePricingMemoryCache.set(cacheKey, cached);

  if (typeof window === "undefined") {
    return;
  }

  const serialized = JSON.stringify(cached);

  try {
    window.localStorage.setItem(cacheKey, serialized);
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      return;
    }

    purgePersistedServicePricingCache();

    try {
      window.localStorage.setItem(cacheKey, serialized);
    } catch {
      // Keep the in-memory cache and allow the live pricing payload to render.
    }
  }
}

function chunkRequests<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function buildPricingFallback(
  request: ServicePricingRequest,
  note: string
): ServicePricing {
  return {
    serviceSlug: request.slug,
    serviceName: request.service,
    mapped: false,
    notes: [note],
    generatedAt: new Date().toISOString(),
    sourceUrl: SERVICE_PRICING_SOURCE_URL,
    calculatorUrl: SERVICE_PRICING_CALCULATOR_URL,
    priceDisclaimer: SERVICE_PRICING_PRICE_DISCLAIMER,
    currencyCode: "USD",
    rowCount: 0,
    meterCount: 0,
    skuCount: 0,
    regionCount: 0,
    billingLocationCount: 0,
    targetRegionMatchCount: 0,
    targetPricingLocations: [],
    rows: []
  };
}

export function buildServicePricingRequest(
  service: Pick<ServiceSummary, "slug" | "service" | "aliases" | "regionalFitSummary">,
  regionalFit?: ServiceRegionalFitSummary,
  targetRegions: string[] = []
): ServicePricingRequest {
  const fit = regionalFit ?? service.regionalFitSummary;

  return {
    slug: service.slug,
    service: service.service,
    aliases: service.aliases ?? [],
    matchedOfferingName: fit?.matchedOfferingName,
    matchedServiceLabel: fit?.matchedServiceLabel,
    targetRegions
  };
}

export function matchesPricingTargetRegion(
  armRegionName: string,
  location: string,
  targetRegions: string[],
  targetPricingLocations: string[] = [],
  locationKind?: string
) {
  if (targetRegions.length === 0 && targetPricingLocations.length === 0) {
    return false;
  }

  const normalizedArmRegion = normalizeRegionName(armRegionName);
  const normalizedLocation = normalizeRegionName(location);

  const matchesTargetRegion = targetRegions.some((targetRegion) => {
    const normalizedTarget = normalizeRegionName(targetRegion);

    return normalizedTarget === normalizedArmRegion || normalizedTarget === normalizedLocation;
  });

  if (matchesTargetRegion) {
    return true;
  }

  const matchesBillingLocation = targetPricingLocations.some((targetLocation) => {
    const normalizedTargetLocation = normalizeRegionName(targetLocation);

    return (
      normalizedTargetLocation === normalizedArmRegion ||
      normalizedTargetLocation === normalizedLocation
    );
  });

  if (matchesBillingLocation) {
    return true;
  }

  return (
    locationKind === "Global" &&
    (targetRegions.length > 0 || targetPricingLocations.length > 0)
  );
}

export async function loadServicePricingBatch(requests: ServicePricingRequest[]) {
  const uniqueRequests = requests.filter(
    (request, index) => requests.findIndex((entry) => entry.slug === request.slug) === index
  );
  const cachedPayloads = new Map<string, ServicePricing>();
  const fallbackPayloads = new Map<string, ServicePricing>();
  const uncachedRequests: ServicePricingRequest[] = [];

  uniqueRequests.forEach((request) => {
    const cached = readCachedServicePricing(request);

    if (cached) {
      cachedPayloads.set(request.slug, cached);
      return;
    }

    uncachedRequests.push(request);
  });

  if (uncachedRequests.length > 0) {
    const requestChunks = chunkRequests(uncachedRequests, SERVICE_PRICING_BATCH_SIZE);

    for (const requestChunk of requestChunks) {
      try {
        const response = await fetch("/api/pricing", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          cache: "no-store",
          body: JSON.stringify({
            services: requestChunk
          })
        });

        if (!response.ok) {
          const message = await readBackendErrorMessage(response, "Unable to load service pricing.");

          throw new Error(message || `Unable to load service pricing. (${response.status})`);
        }

        const payload = (await response.json()) as ServicePricingResponse;
        const returnedSlugs = new Set<string>();

        payload.services.forEach((servicePricing) => {
          const request = requestChunk.find((entry) => entry.slug === servicePricing.serviceSlug);

          if (!request) {
            return;
          }

          returnedSlugs.add(servicePricing.serviceSlug);
          writeCachedServicePricing(request, servicePricing);
          cachedPayloads.set(servicePricing.serviceSlug, servicePricing);
        });

        requestChunk.forEach((request) => {
          if (returnedSlugs.has(request.slug) || cachedPayloads.has(request.slug)) {
            return;
          }

          fallbackPayloads.set(
            request.slug,
            buildPricingFallback(
              request,
              "The pricing request completed, but no pricing payload was returned for this selected service."
            )
          );
        });
      } catch (error) {
        const message = normalizeBackendThrownMessage(
          error instanceof Error
            ? error.message
            : "Unable to load service pricing for this selected service right now.",
          "Unable to load service pricing for this selected service right now."
        );

        requestChunk.forEach((request) => {
          fallbackPayloads.set(
            request.slug,
            buildPricingFallback(
              request,
              `Pricing could not be loaded right now for this selected service. ${message}`
            )
          );
        });
      }
    }
  }

  return uniqueRequests.map(
    (request) =>
      cachedPayloads.get(request.slug) ??
      fallbackPayloads.get(request.slug) ??
      buildPricingFallback(
        request,
        "No pricing payload is available for this selected service yet."
      )
  );
}
