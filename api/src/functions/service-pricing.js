const { app } = require("@azure/functions");
const { jsonResponse } = require("../shared/auth");
const {
  PRICE_DISCLAIMER,
  PRICING_CALCULATOR_URL,
  RETAIL_PRICES_API_URL
} = require("../shared/azure-live-data");
const { getServicePricing } = require("../shared/service-pricing");

const MAX_SERVICES_PER_REQUEST = 20;

function buildPricingFallback(service, message) {
  return {
    serviceSlug: service.slug,
    serviceName: service.service,
    mapped: false,
    notes: [message],
    generatedAt: new Date().toISOString(),
    sourceUrl: RETAIL_PRICES_API_URL,
    calculatorUrl: PRICING_CALCULATOR_URL,
    priceDisclaimer: PRICE_DISCLAIMER,
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

async function handlePricing(request) {
  try {
    const body = await request.json();
    const services = Array.isArray(body?.services) ? body.services : [];

    if (services.length === 0) {
      return jsonResponse(400, {
        error: "At least one service is required to load pricing."
      });
    }

    if (services.length > MAX_SERVICES_PER_REQUEST) {
      return jsonResponse(400, {
        error: `A maximum of ${MAX_SERVICES_PER_REQUEST.toLocaleString()} services can be priced in one request.`
      });
    }

    const requestedServices = services.slice(0, MAX_SERVICES_PER_REQUEST);
    const pricing = [];

    for (const service of requestedServices) {
      try {
        pricing.push(
          await getServicePricing(service, {
            refreshedBy: "request",
            targetRegions: service.targetRegions ?? []
          })
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to load Azure Retail Prices API data for this service.";

        pricing.push(
          buildPricingFallback(
            service,
            `Pricing could not be loaded right now for this selected service. ${message}`
          )
        );
      }
    }

    return jsonResponse(
      200,
      {
        generatedAt: new Date().toISOString(),
        sourceUrl: RETAIL_PRICES_API_URL,
        services: pricing
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
          : "Unable to load Azure Retail Prices API data."
    });
  }
}

app.http("pricing", {
  route: "pricing",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: handlePricing
});

app.http("service-pricing", {
  route: "service-pricing",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: handlePricing
});

module.exports = {
  handlePricing
};
