const { app } = require("@azure/functions");
const { jsonResponse } = require("../shared/auth");
const {
  COMMERCIAL_REFRESH_SCHEDULE,
  COMMERCIAL_WARM_SERVICE_INDEX_URL,
  COMMERCIAL_WARM_SERVICE_LIMIT
} = require("../shared/commercial-cache");
const { RETAIL_PRICES_API_URL } = require("../shared/azure-live-data");
const { warmAvailabilityDataset } = require("../shared/availability-service");
const { warmServicePricing } = require("../shared/service-pricing");
const { recordPricingRefreshStatus } = require("../shared/commercial-cache");

function toPricingServiceRequest(service) {
  return {
    slug: service.slug,
    service: service.service,
    aliases: Array.isArray(service.aliases) ? service.aliases : [],
    matchedOfferingName:
      service.matchedOfferingName ?? service.regionalFitSummary?.matchedOfferingName,
    matchedServiceLabel:
      service.matchedServiceLabel ?? service.regionalFitSummary?.matchedServiceLabel,
    targetRegions: Array.isArray(service.targetRegions) ? service.targetRegions : []
  };
}

async function loadWarmServicesFromCatalog() {
  if (!COMMERCIAL_WARM_SERVICE_INDEX_URL || COMMERCIAL_WARM_SERVICE_LIMIT <= 0) {
    return [];
  }

  const response = await fetch(COMMERCIAL_WARM_SERVICE_INDEX_URL, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Warm-service catalog request failed with status ${response.status}.`
    );
  }

  const payload = await response.json();
  const services = Array.isArray(payload?.services) ? payload.services : [];

  return services.slice(0, COMMERCIAL_WARM_SERVICE_LIMIT).map(toPricingServiceRequest);
}

async function refreshCommercialData({
  refreshedBy,
  refreshAvailability = true,
  pricingServices = []
}) {
  const refreshedAt = new Date().toISOString();
  let availability = null;

  if (refreshAvailability) {
    const availabilityResult = await warmAvailabilityDataset(refreshedBy);

    availability = {
      ok: true,
      refreshedAt: availabilityResult.dataSource.refreshedAt,
      publicRegionCount: availabilityResult.dataset.publicRegions.length,
      mode: availabilityResult.dataSource.mode
    };
  }

  const pricingResults = [];
  const pricingErrors = [];

  for (const service of pricingServices) {
    try {
      const pricing = await warmServicePricing(toPricingServiceRequest(service), refreshedBy);

      pricingResults.push({
        serviceSlug: pricing.serviceSlug,
        serviceName: pricing.serviceName,
        mapped: pricing.mapped,
        refreshedAt: pricing.dataSource?.refreshedAt ?? refreshedAt,
        mode: pricing.dataSource?.mode ?? "live"
      });
    } catch (error) {
      pricingErrors.push({
        serviceSlug: service.slug,
        serviceName: service.service,
        error:
          error instanceof Error
            ? error.message
            : "Unable to refresh pricing for this service."
      });
    }
  }

  if (pricingServices.length > 0 || pricingResults.length > 0 || pricingErrors.length > 0) {
    await recordPricingRefreshStatus({
      ok: pricingErrors.length === 0,
      lastSuccessfulRefreshAt:
        pricingResults.at(-1)?.refreshedAt ?? undefined,
      lastRefreshMode: refreshedBy,
      lastWarmCount: pricingResults.length,
      lastServiceSlug: pricingResults.at(-1)?.serviceSlug ?? null,
      sourceUrl: RETAIL_PRICES_API_URL,
      lastError:
        pricingErrors.length > 0
          ? `${pricingErrors.length} pricing refresh task(s) failed during ${refreshedBy}.`
          : null
    });
  }

  return {
    refreshedAt,
    refreshedBy,
    schedule: COMMERCIAL_REFRESH_SCHEDULE,
    availability,
    pricing: {
      requestedCount: pricingServices.length,
      refreshedCount: pricingResults.length,
      refreshedServices: pricingResults,
      errors: pricingErrors
    }
  };
}

function readRefreshKey(request) {
  return (
    request.headers.get("x-refresh-key") ||
    request.headers.get("x-admin-key") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  );
}

if (process.env.AZURE_COMMERCIAL_REFRESH_TIMER_ENABLED === "true") {
  app.timer("commercial-refresh-schedule", {
    schedule: COMMERCIAL_REFRESH_SCHEDULE,
    handler: async (_timer, context) => {
      try {
        const warmServices = await loadWarmServicesFromCatalog();
        const summary = await refreshCommercialData({
          refreshedBy: "timer",
          refreshAvailability: true,
          pricingServices: warmServices
        });

        context.log(
          `Commercial refresh completed. Availability refreshed and ${summary.pricing.refreshedCount} pricing cache entries warmed.`
        );
      } catch (error) {
        context.error(
          error instanceof Error
            ? error.message
            : "Commercial refresh timer failed."
        );
        throw error;
      }
    }
  });
}

app.http("commercial-refresh", {
  route: "refresh",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request) => {
    const expectedKey = process.env.AZURE_COMMERCIAL_REFRESH_KEY;

    if (!expectedKey) {
      return jsonResponse(503, {
        error:
          "AZURE_COMMERCIAL_REFRESH_KEY must be configured before manual refresh is enabled."
      });
    }

    if (readRefreshKey(request) !== expectedKey) {
      return jsonResponse(401, {
        error: "A valid refresh key is required to trigger manual commercial-data refresh."
      });
    }

    try {
      const body = await request.json();
      const requestedServices = Array.isArray(body?.services) ? body.services : [];
      const refreshPricing =
        body?.refreshPricing !== false && (requestedServices.length > 0 || body?.refreshPricing === true);
      const pricingServices = refreshPricing
        ? requestedServices.length > 0
          ? requestedServices.map(toPricingServiceRequest)
          : await loadWarmServicesFromCatalog()
        : [];
      const summary = await refreshCommercialData({
        refreshedBy: "manual",
        refreshAvailability: body?.refreshAvailability !== false,
        pricingServices
      });

      return jsonResponse(200, summary, {
        "Cache-Control": "no-store"
      });
    } catch (error) {
      return jsonResponse(500, {
        error:
          error instanceof Error
            ? error.message
            : "Unable to complete the commercial refresh."
      });
    }
  }
});
