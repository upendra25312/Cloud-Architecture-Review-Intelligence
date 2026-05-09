const { app } = require("@azure/functions");
const { jsonResponse } = require("../shared/auth");
const { requireAdmin } = require("../shared/admin-auth");
const {
  AVAILABILITY_CACHE_TTL_HOURS,
  COMMERCIAL_WARM_SERVICE_INDEX_URL,
  COMMERCIAL_WARM_SERVICE_LIMIT,
  COMMERCIAL_REFRESH_SCHEDULE,
  PRICING_CACHE_TTL_HOURS,
  readRefreshState
} = require("../shared/commercial-cache");
const { getCopilotConfiguration, toVisibleEndpoint } = require("../shared/copilot");
const {
  ARTIFACTS_CONTAINER_NAME,
  COMMERCIAL_CACHE_CONTAINER_NAME,
  NOTES_CONTAINER_NAME
} = require("../shared/storage");
const {
  PROJECT_REVIEW_TABLE_NAME,
  USER_PROFILE_TABLE_NAME
} = require("../shared/table-storage");

function buildAdminScope(copilotConfiguration) {
  return {
    resourceGroup: process.env.ADMIN_ALLOWED_RESOURCE_GROUP || "Azure-Review-Checklists-RG",
    staticWebAppName: process.env.ADMIN_STATIC_WEB_APP_NAME || "azure-review-checklists",
    functionAppName:
      process.env.ADMIN_FUNCTION_APP_NAME || process.env.WEBSITE_SITE_NAME || "azure-review-checklists-api",
    openAiResourceName: process.env.ADMIN_OPENAI_RESOURCE_NAME || "azreviewchecklistsopenaicu01",
    openAiDeployment:
      process.env.ADMIN_OPENAI_DEPLOYMENT ||
      copilotConfiguration.deployment ||
      process.env.AZURE_OPENAI_DEPLOYMENT ||
      null,
    region: process.env.ADMIN_SCOPE_REGION || "Central US"
  };
}

function createFinding(id, severity, label, detail) {
  return { id, severity, label, detail };
}

function createConfigEntry(label, value, status, detail) {
  return {
    label,
    value,
    status,
    detail
  };
}

function createEvidenceEntry(label, status, summary, detail) {
  return {
    label,
    status,
    summary,
    detail
  };
}

function createFallbackRefreshState() {
  return {
    updatedAt: null,
    warmServiceIndexUrl: null,
    warmServiceLimit: 0,
    manualRefreshEnabled: false
    ,availability: {
      ok: false,
      ttlHours: AVAILABILITY_CACHE_TTL_HOURS,
      lastSuccessfulRefreshAt: null,
      lastRefreshMode: null,
      sourceUrl: null,
      expiresAt: null,
      lastError: null,
      publicRegionCount: 0
    },
    pricing: {
      ok: false,
      ttlHours: PRICING_CACHE_TTL_HOURS,
      lastSuccessfulRefreshAt: null,
      lastRefreshMode: null,
      sourceUrl: null,
      expiresAt: null,
      lastError: null,
      lastServiceSlug: null,
      lastWarmCount: 0
    }
  };
}

function isExpired(expiresAt, checkedAt) {
  if (!expiresAt) {
    return false;
  }

  const expires = Date.parse(expiresAt);
  const checked = Date.parse(checkedAt);

  if (Number.isNaN(expires) || Number.isNaN(checked)) {
    return false;
  }

  return expires < checked;
}

function buildRefreshEvidenceEntries(refreshState, checkedAt) {
  const entries = [];

  for (const channelName of ["availability", "pricing"]) {
    const channel = refreshState[channelName];
    const title = channelName === "availability" ? "Availability refresh" : "Pricing refresh";

    if (!channel?.lastSuccessfulRefreshAt) {
      entries.push(
        createEvidenceEntry(
          title,
          "error",
          "No successful refresh recorded yet",
          channel?.lastError || "The refresh-state document does not contain a successful refresh timestamp for this channel."
        )
      );
      continue;
    }

    if (channel.lastError) {
      entries.push(
        createEvidenceEntry(
          title,
          "warning",
          `Last success ${channel.lastSuccessfulRefreshAt}`,
          `Recent error: ${channel.lastError}`
        )
      );
      continue;
    }

    if (isExpired(channel.expiresAt, checkedAt)) {
      entries.push(
        createEvidenceEntry(
          title,
          "warning",
          `Cache expired at ${channel.expiresAt}`,
          `Last successful refresh was ${channel.lastSuccessfulRefreshAt} via ${channel.lastRefreshMode || "unknown mode"}.`
        )
      );
      continue;
    }

    entries.push(
      createEvidenceEntry(
        title,
        channel.ok ? "healthy" : "warning",
        `Fresh through ${channel.expiresAt || "the current TTL window"}`,
        `Last successful refresh was ${channel.lastSuccessfulRefreshAt} via ${channel.lastRefreshMode || "unknown mode"}.`
      )
    );
  }

  return entries;
}

function buildOperationalEvidence(copilotConfiguration, refreshState, checkedAt) {
  const storageConfigured = Boolean(
    process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage
  );
  const appInsightsConfigured = Boolean(
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING || process.env.APPINSIGHTS_INSTRUMENTATIONKEY
  );

  return [
    createEvidenceEntry(
      "Refresh state document",
      refreshState.updatedAt ? "healthy" : "warning",
      refreshState.updatedAt ? `Updated ${refreshState.updatedAt}` : "No refresh-state update timestamp published yet",
      "This is the backend-owned document that tracks pricing and availability refresh outcomes."
    ),
    createEvidenceEntry(
      "Blob and table persistence",
      storageConfigured ? "healthy" : "error",
      storageConfigured ? "Storage connection detected" : "Storage connection missing",
      storageConfigured
        ? "Saved project reviews, review exports, and the low-cost review index can use the configured storage account."
        : "Project review persistence and commercial cache storage will fail until a storage connection is published."
    ),
    createEvidenceEntry(
      "Application Insights diagnostics",
      appInsightsConfigured ? "healthy" : "warning",
      appInsightsConfigured ? "Diagnostics wiring detected" : "Diagnostics wiring missing",
      appInsightsConfigured
        ? "Protected backend traces and refresh failures can be correlated in Application Insights."
        : "Operators will have to rely on platform logs until Application Insights is configured."
    ),
    createEvidenceEntry(
      "Public copilot readiness",
      copilotConfiguration.configured ? "healthy" : "error",
      copilotConfiguration.configured ? "Endpoint, deployment, and key are present" : "Azure OpenAI configuration incomplete",
      copilotConfiguration.configured
        ? "The public project-review copilot backend has the minimum wiring it needs to answer prompts."
        : "The public and future admin copilot flows cannot run until Azure OpenAI configuration is complete."
    ),
    createEvidenceEntry(
      "Manual refresh posture",
      refreshState.manualRefreshEnabled ? "info" : "warning",
      refreshState.manualRefreshEnabled ? "Manual refresh is enabled" : "Manual refresh is disabled",
      refreshState.manualRefreshEnabled
        ? "Internal operators can invoke the protected refresh path when a commercial-data refresh must be forced."
        : "Only the timer-based warm path is currently available."
    ),
    ...buildRefreshEvidenceEntries(refreshState, checkedAt)
  ];
}

function buildRuntimeInventory(scope) {
  return [
    createConfigEntry(
      "Function App site name",
      scope.functionAppName || "Not published",
      process.env.WEBSITE_SITE_NAME ? "configured" : "defaulted",
      "Visible runtime identity for the dedicated backend."
    ),
    createConfigEntry(
      "Functions worker runtime",
      process.env.FUNCTIONS_WORKER_RUNTIME || "Not published",
      process.env.FUNCTIONS_WORKER_RUNTIME ? "configured" : "missing",
      "Should normally be set for the deployed Function App runtime."
    ),
    createConfigEntry(
      "Functions extension version",
      process.env.FUNCTIONS_EXTENSION_VERSION || "Not published",
      process.env.FUNCTIONS_EXTENSION_VERSION ? "configured" : "missing",
      "Useful when diagnosing platform/runtime drift."
    ),
    createConfigEntry(
      "Website host name",
      process.env.WEBSITE_HOSTNAME || "Not published",
      process.env.WEBSITE_HOSTNAME ? "configured" : "missing",
      "Published host name for the bring-your-own Function App."
    )
  ];
}

function buildStorageInventory() {
  return [
    createConfigEntry(
      "Storage connection",
      process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage
        ? "Configured"
        : "Missing",
      process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage
        ? "configured"
        : "missing",
      "Blob and Table-backed project review persistence depends on this connection."
    ),
    createConfigEntry(
      "Review notes container",
      NOTES_CONTAINER_NAME,
      process.env.AZURE_STORAGE_REVIEW_CONTAINER_NAME ? "configured" : "defaulted",
      "Stores saved project review payloads and structured note state."
    ),
    createConfigEntry(
      "Review artifacts container",
      ARTIFACTS_CONTAINER_NAME,
      process.env.AZURE_STORAGE_REVIEW_ARTIFACT_CONTAINER_NAME ? "configured" : "defaulted",
      "Stores generated review export artifacts."
    ),
    createConfigEntry(
      "Commercial cache container",
      COMMERCIAL_CACHE_CONTAINER_NAME,
      process.env.AZURE_STORAGE_COMMERCIAL_CACHE_CONTAINER_NAME ? "configured" : "defaulted",
      "Stores warmed pricing, availability, and refresh-state documents."
    ),
    createConfigEntry(
      "Review user table",
      USER_PROFILE_TABLE_NAME,
      process.env.AZURE_STORAGE_REVIEW_USER_TABLE_NAME ? "configured" : "defaulted",
      "Maps signed-in users to active review state."
    ),
    createConfigEntry(
      "Project review table",
      PROJECT_REVIEW_TABLE_NAME,
      process.env.AZURE_STORAGE_PROJECT_REVIEW_TABLE_NAME ? "configured" : "defaulted",
      "Stores the low-cost review index used by My Project Reviews."
    )
  ];
}

function buildRefreshInventory(refreshState) {
  return [
    createConfigEntry(
      "Refresh schedule",
      COMMERCIAL_REFRESH_SCHEDULE,
      process.env.AZURE_COMMERCIAL_REFRESH_SCHEDULE ? "configured" : "defaulted",
      "Timer schedule for the commercial-data warm path."
    ),
    createConfigEntry(
      "Availability cache TTL",
      `${AVAILABILITY_CACHE_TTL_HOURS} hours`,
      process.env.AZURE_AVAILABILITY_CACHE_TTL_HOURS ? "configured" : "defaulted",
      "Freshness window for cached regional availability data."
    ),
    createConfigEntry(
      "Pricing cache TTL",
      `${PRICING_CACHE_TTL_HOURS} hours`,
      process.env.AZURE_PRICING_CACHE_TTL_HOURS ? "configured" : "defaulted",
      "Freshness window for cached retail pricing data."
    ),
    createConfigEntry(
      "Warm service index URL",
      refreshState.warmServiceIndexUrl || COMMERCIAL_WARM_SERVICE_INDEX_URL || "Not configured",
      refreshState.warmServiceIndexUrl || COMMERCIAL_WARM_SERVICE_INDEX_URL
        ? "configured"
        : "missing",
      "Source list used by scheduled pricing warm-up."
    ),
    createConfigEntry(
      "Warm service limit",
      String(refreshState.warmServiceLimit ?? COMMERCIAL_WARM_SERVICE_LIMIT ?? 0),
      process.env.AZURE_COMMERCIAL_WARM_SERVICE_LIMIT ? "configured" : "defaulted",
      "Maximum number of services warmed during scheduled pricing refresh."
    ),
    createConfigEntry(
      "Manual refresh key",
      refreshState.manualRefreshEnabled ? "Configured" : "Disabled",
      refreshState.manualRefreshEnabled ? "configured" : "missing",
      "Controls whether internal operators can manually trigger a commercial refresh."
    )
  ];
}

function buildCopilotInventory(copilotConfiguration, scope) {
  return [
    createConfigEntry(
      "Azure OpenAI endpoint",
      toVisibleEndpoint(copilotConfiguration.endpoint) || "Not published",
      copilotConfiguration.endpoint ? "configured" : "missing",
      "Visible endpoint host used by the public and future admin copilot backends."
    ),
    createConfigEntry(
      "Azure OpenAI deployment",
      scope.openAiDeployment || "Not published",
      copilotConfiguration.deployment ? "configured" : "missing",
      "Deployment currently targeted by the backend chat completion call."
    ),
    createConfigEntry(
      "Azure OpenAI model name",
      copilotConfiguration.modelName || "Not published",
      process.env.AZURE_OPENAI_MODEL_NAME ? "configured" : "defaulted",
      "Model label surfaced in responses and diagnostics."
    ),
    createConfigEntry(
      "Azure OpenAI API version",
      copilotConfiguration.apiVersion || "Not published",
      process.env.AZURE_OPENAI_API_VERSION ? "configured" : "defaulted",
      "API version sent to the Azure OpenAI chat completions endpoint."
    ),
    createConfigEntry(
      "Azure OpenAI auth",
      "Managed Identity (DefaultAzureCredential)",
      copilotConfiguration.configured ? "configured" : "missing endpoint/deployment",
      "Uses DefaultAzureCredential — no API key required."
    )
  ];
}

function buildFindings(copilotConfiguration, refreshState) {
  const findings = [];

  if (!copilotConfiguration.configured) {
    findings.push(
      createFinding(
        "copilot-config",
        "warning",
        "Azure OpenAI configuration incomplete",
        "The public copilot backend is missing endpoint, key, or deployment configuration."
      )
    );
  }

  if (!(process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage)) {
    findings.push(
      createFinding(
        "storage-config",
        "error",
        "Storage configuration missing",
        "Blob and Table-backed review persistence will not work until storage connection settings are published."
      )
    );
  }

  if (!(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING || process.env.APPINSIGHTS_INSTRUMENTATIONKEY)) {
    findings.push(
      createFinding(
        "app-insights",
        "warning",
        "Application Insights not configured",
        "Backend operational traces and refresh failures will be harder to diagnose without Insights wiring."
      )
    );
  }

  if (!refreshState.availability.lastSuccessfulRefreshAt) {
    findings.push(
      createFinding(
        "availability-refresh",
        "warning",
        "Availability refresh has not completed successfully yet",
        "The cache state does not show a successful regional availability refresh timestamp."
      )
    );
  }

  if (!refreshState.pricing.lastSuccessfulRefreshAt) {
    findings.push(
      createFinding(
        "pricing-refresh",
        "warning",
        "Pricing refresh has not completed successfully yet",
        "The cache state does not show a successful retail pricing refresh timestamp."
      )
    );
  }

  if (refreshState.availability.lastError) {
    findings.push(
      createFinding(
        "availability-last-error",
        "warning",
        "Availability refresh reported a recent error",
        refreshState.availability.lastError
      )
    );
  }

  if (refreshState.pricing.lastError) {
    findings.push(
      createFinding(
        "pricing-last-error",
        "warning",
        "Pricing refresh reported a recent error",
        refreshState.pricing.lastError
      )
    );
  }

  if (refreshState.manualRefreshEnabled) {
    findings.push(
      createFinding(
        "manual-refresh",
        "info",
        "Manual refresh is enabled",
        "Internal operators can trigger manual commercial-data refreshes on the dedicated backend."
      )
    );
  }

  return findings;
}

app.http("admin-copilot-health", {
  route: "admin/copilot/health",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (request) => {
    const { response } = requireAdmin(request);

    if (response) {
      return response;
    }

    const checkedAt = new Date().toISOString();
    const copilotConfiguration = getCopilotConfiguration();
    const scope = buildAdminScope(copilotConfiguration);

    try {
      const refreshState = await readRefreshState();
      const findings = buildFindings(copilotConfiguration, refreshState);
      const hasErrorFinding = findings.some((finding) => finding.severity === "error");
      const runtimeInventory = buildRuntimeInventory(scope);
      const storageInventory = buildStorageInventory();
      const refreshInventory = buildRefreshInventory(refreshState);
      const copilotInventory = buildCopilotInventory(copilotConfiguration, scope);
      const evidence = buildOperationalEvidence(copilotConfiguration, refreshState, checkedAt);

      return jsonResponse(
        200,
        {
          status: hasErrorFinding ? "Degraded" : "Healthy",
          checkedAt,
          scope,
          capabilities: {
            adminRouteProtected: true,
            adminApiReady: true,
            promptExecutionEnabled: false,
            mcpServerConfigured: Boolean(process.env.AZURE_MCP_SERVER_URL),
            copilotConfigured: copilotConfiguration.configured,
            applicationInsightsConfigured: Boolean(
              process.env.APPLICATIONINSIGHTS_CONNECTION_STRING ||
                process.env.APPINSIGHTS_INSTRUMENTATIONKEY
            ),
            storageConfigured: Boolean(
              process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage
            )
          },
          backend: {
            functionAppName: scope.functionAppName,
            refreshSchedule: COMMERCIAL_REFRESH_SCHEDULE,
            manualRefreshEnabled: refreshState.manualRefreshEnabled,
            warmServiceIndexUrl: refreshState.warmServiceIndexUrl,
            warmServiceLimit: refreshState.warmServiceLimit,
            copilotEndpoint: toVisibleEndpoint(copilotConfiguration.endpoint),
            availability: refreshState.availability,
            pricing: refreshState.pricing,
            runtime: runtimeInventory,
            storage: storageInventory,
            refresh: refreshInventory,
            copilot: copilotInventory,
            evidence
          },
          notes: [
            "This admin shell is protected for internal administrators only.",
            "Prompt execution is intentionally disabled until read-only Azure MCP tooling is connected.",
            refreshState.manualRefreshEnabled
              ? "Manual refresh is enabled on the dedicated backend."
              : "Manual refresh is disabled until a refresh key is configured."
          ],
          findings
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
          scope,
          capabilities: {
            adminRouteProtected: true,
            adminApiReady: false,
            promptExecutionEnabled: false,
            mcpServerConfigured: Boolean(process.env.AZURE_MCP_SERVER_URL),
            copilotConfigured: copilotConfiguration.configured,
            applicationInsightsConfigured: Boolean(
              process.env.APPLICATIONINSIGHTS_CONNECTION_STRING ||
                process.env.APPINSIGHTS_INSTRUMENTATIONKEY
            ),
            storageConfigured: Boolean(
              process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage
            )
          },
          backend: {
            functionAppName: scope.functionAppName,
            refreshSchedule: COMMERCIAL_REFRESH_SCHEDULE,
            manualRefreshEnabled: false,
            warmServiceIndexUrl: null,
            warmServiceLimit: 0,
            copilotEndpoint: toVisibleEndpoint(copilotConfiguration.endpoint),
            runtime: buildRuntimeInventory(scope),
            storage: buildStorageInventory(),
            refresh: buildRefreshInventory(createFallbackRefreshState()),
            copilot: buildCopilotInventory(copilotConfiguration, scope),
            evidence: buildOperationalEvidence(copilotConfiguration, createFallbackRefreshState(), checkedAt)
          },
          notes: [
            error instanceof Error
              ? error.message
              : "Unable to verify the dedicated backend from the admin shell."
          ],
          findings: [
            createFinding(
              "admin-health",
              "error",
              "Protected admin health check failed",
              error instanceof Error
                ? error.message
                : "Unable to verify the dedicated backend from the admin shell."
            )
          ]
        },
        {
          "Cache-Control": "no-store"
        }
      );
    }
  }
});
