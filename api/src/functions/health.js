const { app } = require("@azure/functions");
const { jsonResponse } = require("../shared/auth");
const {
  COMMERCIAL_REFRESH_SCHEDULE,
  readRefreshState
} = require("../shared/commercial-cache");
const { getCopilotConfiguration, toVisibleEndpoint } = require("../shared/copilot");

async function handleHealth() {
  const checkedAt = new Date().toISOString();
  const copilot = getCopilotConfiguration();

  try {
    const refreshState = await readRefreshState();

    return jsonResponse(
      200,
      {
        status: "Healthy",
        checkedAt,
        backendMode: "Dedicated Azure Function App",
        functionAppName: process.env.WEBSITE_SITE_NAME ?? "local",
        applicationInsightsConfigured: Boolean(
          process.env.APPLICATIONINSIGHTS_CONNECTION_STRING ||
            process.env.APPINSIGHTS_INSTRUMENTATIONKEY
        ),
        copilotConfigured: copilot.configured,
        copilotModelName: copilot.modelName,
        copilotDeployment: copilot.deployment ?? null,
        copilotEndpoint: toVisibleEndpoint(copilot.endpoint),
        storageConfigured: Boolean(
          process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage
        ),
        tableStorageConfigured: Boolean(
          process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage
        ),
        refreshSchedule: COMMERCIAL_REFRESH_SCHEDULE,
        manualRefreshEnabled: refreshState.manualRefreshEnabled,
        warmServiceIndexUrl: refreshState.warmServiceIndexUrl,
        warmServiceLimit: refreshState.warmServiceLimit,
        availability: refreshState.availability,
        pricing: refreshState.pricing
      },
      {
        "Cache-Control": "no-store"
      }
    );
  } catch (error) {
    return jsonResponse(
      503,
      {
        status: "Degraded",
        checkedAt,
        backendMode: "Dedicated Azure Function App",
        functionAppName: process.env.WEBSITE_SITE_NAME ?? "local",
        applicationInsightsConfigured: Boolean(
          process.env.APPLICATIONINSIGHTS_CONNECTION_STRING ||
            process.env.APPINSIGHTS_INSTRUMENTATIONKEY
        ),
        copilotConfigured: copilot.configured,
        copilotModelName: copilot.modelName,
        copilotDeployment: copilot.deployment ?? null,
        copilotEndpoint: toVisibleEndpoint(copilot.endpoint),
        storageConfigured: Boolean(
          process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage
        ),
        tableStorageConfigured: Boolean(
          process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage
        ),
        refreshSchedule: COMMERCIAL_REFRESH_SCHEDULE,
        error:
          error instanceof Error
            ? error.message
            : "Unable to verify cached backend health."
      },
      {
        "Cache-Control": "no-store"
      }
    );
  }
}

app.http("health", {
  route: "health",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: handleHealth
});

module.exports = {
  handleHealth
};
