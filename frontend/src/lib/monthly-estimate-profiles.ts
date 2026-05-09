import type {
  EstimateInputMode,
  ReviewServiceAssumption,
  ReviewServiceEstimateInputs,
  ServiceEstimateInputDefinition,
  ServiceEstimateProfile
} from "@/types";

export type ServiceEstimateProfileStrategy =
  | "not-modeled"
  | "recurring-base"
  | "traffic"
  | "storage"
  | "ingestion"
  | "request-consumption"
  | "serverless"
  | "container-apps"
  | "azure-openai"
  | "aks"
  | "sql-database"
  | "cosmos-db"
  | "databricks"
  | "ai-search";

export type ServiceEstimateProfileDefinition = ServiceEstimateProfile & {
  strategy: ServiceEstimateProfileStrategy;
  defaultSkuContains?: string;
  defaultNotes: string[];
};

const PROFILE_VERSION = "2026-04-05";

function numberInput(
  key: string,
  label: string,
  description: string,
  defaultValue: number,
  unit?: string,
  min = 0,
  step = 1
): ServiceEstimateInputDefinition {
  return {
    key,
    label,
    description,
    kind: "number",
    unit,
    min,
    step,
    defaultValue
  };
}

function selectInput(
  key: string,
  label: string,
  description: string,
  defaultValue: string,
  options: Array<{ label: string; value: string }>
): ServiceEstimateInputDefinition {
  return {
    key,
    label,
    description,
    kind: "select",
    defaultValue,
    options
  };
}

const RECURRING_INPUTS = [
  numberInput("unitCount", "Unit count", "How many recurring service units should be estimated.", 1, "units")
];

const TRAFFIC_INPUTS = [
  numberInput("unitCount", "Base profiles", "How many recurring service profiles or endpoints to estimate.", 1, "profiles"),
  numberInput("clientEgressGb", "Client egress", "Default outbound traffic to clients per month.", 5, "GB/month"),
  numberInput("originEgressGb", "Origin egress", "Default traffic from edge to origin per month.", 5, "GB/month"),
  numberInput("monthlyOperations", "Requests or operations", "Monthly requests, rule evaluations, or billable operations where Microsoft publishes them.", 0, "operations/month", 0, 1000)
];

const STORAGE_INPUTS = [
  numberInput("capacityGb", "Stored capacity", "Average stored data for the month.", 100, "GB-month"),
  numberInput("monthlyOperations", "Transactions or operations", "Monthly operations when published as a separate retail meter.", 0, "operations/month", 0, 1000)
];

const INGESTION_INPUTS = [
  numberInput("monthlyDataGb", "Monthly data", "Estimated monthly data ingestion or analyzed data volume.", 5, "GB/month")
];

const REQUEST_INPUTS = [
  numberInput("unitCount", "Units", "Recurring service units where published by Microsoft.", 1, "units"),
  numberInput("monthlyOperations", "Monthly operations", "Estimated monthly requests, operations, messages, or API calls.", 100000, "operations/month", 0, 1000)
];

const SERVERLESS_INPUTS = [
  numberInput("monthlyExecutions", "Monthly executions", "Estimated executions or workflow runs per month.", 100000, "executions/month", 0, 1000),
  numberInput("executionGbSeconds", "Execution GB-seconds", "Estimated execution GB-seconds per month for consumption-based runtimes.", 100000, "GB-s/month", 0, 1000)
];

const CONTAINER_APPS_INPUTS = [
  numberInput("vCpuPerReplica", "vCPU per replica", "Average vCPU allocated to a running replica.", 0.5, "vCPU", 0, 0.1),
  numberInput("memoryGiBPerReplica", "Memory per replica", "Average memory allocated to a running replica.", 1, "GiB", 0, 0.1),
  numberInput("averageReplicas", "Average replicas", "Average active replicas during the month.", 1, "replicas", 0, 0.1),
  numberInput("activeHoursPerMonth", "Active hours", "Hours per month that replicas are active and billable.", 730, "hours/month", 0, 1),
  numberInput("monthlyOperations", "Monthly requests", "Estimated monthly requests when Microsoft publishes a request meter.", 100000, "requests/month", 0, 1000)
];

const AZURE_OPENAI_INPUTS = [
  numberInput("inputTokensMillions", "Input tokens", "Estimated uncached input tokens per month.", 1, "million tokens/month", 0, 0.1),
  numberInput("cachedInputTokensMillions", "Cached input tokens", "Estimated cached or discounted input tokens per month when the selected model family publishes them.", 0, "million tokens/month", 0, 0.1),
  numberInput("outputTokensMillions", "Output tokens", "Estimated output tokens per month.", 0.25, "million tokens/month", 0, 0.1)
];

const AKS_INPUTS = [
  numberInput("clusterCount", "Cluster count", "How many AKS clusters should be estimated.", 1, "clusters"),
  numberInput("workerNodeCount", "Average worker nodes", "Average concurrent worker nodes per cluster.", 3, "nodes", 0, 1),
  numberInput("nodeHoursPerMonth", "Worker node hours", "Total monthly hours each worker node is expected to run.", 730, "hours/node/month", 0, 1),
  selectInput(
    "workerProfile",
    "Worker profile",
    "Default worker family to pair with the hosted control plane charge.",
    "general-purpose",
    [
      { label: "General Purpose", value: "general-purpose" },
      { label: "Compute Optimized", value: "compute-optimized" },
      { label: "Memory Optimized", value: "memory-optimized" },
      { label: "Storage Optimized", value: "storage-optimized" },
      { label: "Confidential Compute", value: "confidential-compute" },
      { label: "GPU Accelerated", value: "gpu-accelerated" },
      { label: "High Performance Compute", value: "high-performance-compute" }
    ]
  )
];

const SQL_DATABASE_INPUTS = [
  numberInput("computeUnits", "Compute units", "vCores or DTU packs to estimate for the selected SQL pricing family.", 2, "units", 0, 1),
  numberInput("activeHoursPerMonth", "Active hours", "Monthly hours the selected compute tier is expected to run.", 730, "hours/month", 0, 1),
  numberInput("storageGb", "Data storage", "Average SQL data storage if a storage meter is published for the selected family.", 128, "GB-month", 0, 1),
  numberInput("backupStorageGb", "Backup storage", "Average backup storage if the selected family publishes backup storage separately.", 0, "GB-month", 0, 1)
];

const COSMOS_DB_INPUTS = [
  numberInput("autoscaleRu100Units", "Autoscale RU units", "How many 100 RU autoscale units to estimate for RU-based Cosmos offerings.", 10, "100 RU units", 0, 1),
  numberInput("vCoreCount", "vCore count", "vCores to estimate for vCore-based Cosmos DB offerings.", 2, "vCores", 0, 1),
  numberInput("attachedStorageUnits", "Attached SSD units", "256 GiB attached SSD units for vCore-based Cosmos DB clusters.", 1, "256 GiB units", 0, 1),
  numberInput("backupStorageGb", "Backup storage", "Backup storage if a continuous backup meter applies.", 0, "GB-month", 0, 1)
];

const DATABRICKS_INPUTS = [
  numberInput("dbuCount", "DBU capacity", "Average concurrent DBU units for the selected Databricks workload family.", 1, "DBUs", 0, 0.1),
  numberInput("dbuHoursPerMonth", "DBU hours", "Monthly hours the selected DBU workload runs.", 730, "hours/month", 0, 1),
  numberInput("storageUnits", "Databricks storage units", "Average Databricks storage units when the retail feed publishes DSU charges.", 1, "DSUs", 0, 1),
  numberInput("launchEvents", "Launch charges", "Monthly launch-charge events for serverless inferencing or similar start-up fees.", 0, "events/month", 0, 1)
];

const AI_SEARCH_INPUTS = [
  numberInput("searchUnits", "Search units", "Average concurrent search units for the selected search tier.", 1, "units", 0, 1),
  numberInput("semanticQueries1000", "Semantic queries", "Semantic ranker overage queries per month.", 0, "1K queries/month", 0, 1),
  numberInput("imageExtractions1000", "Image extractions", "Document cracking image extraction operations per month.", 0, "1K operations/month", 0, 1)
];

function createProfile(
  serviceSlug: string,
  strategy: ServiceEstimateProfileStrategy,
  description: string,
  inputDefinitions: ServiceEstimateInputDefinition[],
  defaultNotes: string[],
  options: {
    coverage?: ServiceEstimateProfile["coverage"];
    mode?: ServiceEstimateProfile["mode"];
    label?: string;
    defaultSkuContains?: string;
  } = {}
): ServiceEstimateProfileDefinition {
  return {
    serviceSlug,
    label: options.label ?? description,
    description,
    version: PROFILE_VERSION,
    coverage:
      options.coverage ??
      (strategy === "not-modeled"
        ? "not-modeled"
        : strategy === "recurring-base"
          ? "base-only"
          : "profiled"),
    mode:
      options.mode ??
      (strategy === "not-modeled"
        ? "not-modeled"
        : strategy === "recurring-base"
          ? "recurring-base-only"
          : "calculator-defaults"),
    inputDefinitions,
    strategy,
    defaultSkuContains: options.defaultSkuContains,
    defaultNotes
  };
}

function buildProfiles(
  serviceSlugs: string[],
  strategy: ServiceEstimateProfileStrategy,
  description: string,
  inputDefinitions: ServiceEstimateInputDefinition[],
  defaultNotes: string[],
  optionsBySlug: Record<string, Partial<ServiceEstimateProfileDefinition>> = {}
) {
  return Object.fromEntries(
    serviceSlugs.map((serviceSlug) => {
      const overrides = optionsBySlug[serviceSlug] ?? {};

      return [
        serviceSlug,
        createProfile(
          serviceSlug,
          strategy,
          overrides.description ?? description,
          overrides.inputDefinitions ?? inputDefinitions,
          overrides.defaultNotes ?? defaultNotes,
          {
            coverage: overrides.coverage,
            mode: overrides.mode,
            label: overrides.label,
            defaultSkuContains: overrides.defaultSkuContains
          }
        )
      ];
    })
  ) as Record<string, ServiceEstimateProfileDefinition>;
}

const NOT_MODELED_SERVICES = [
  "microsoft-entra-id",
  "azure-policy",
  "azure-virtual-network",
  "nsg",
  "nva",
  "n-a",
  "na",
  "network-security-groups",
  "azure-network-watcher",
  "azure-subscriptions",
  "azure-cost-management",
  "azure-rbac",
  "azure-resource-manager",
  "azure-service-health",
  "microsoft-cloud-security-benchmark",
  "microsoft-threat-modeling-tool",
  "resource-groups",
  "route-tables",
  "vpn-and-expressroute-connections"
];

const RECURRING_BASE_SERVICES = [
  "azure-virtual-machines",
  "sap-on-azure",
  "azure-expressroute",
  "azure-firewall",
  "azure-public-ip",
  "azure-traffic-manager",
  "azure-bastion",
  "azure-route-server",
  "azure-app-service",
  "azure-vmware-solution",
  "azure-machine-learning",
  "microsoft-fabric",
  "azure-service-fabric",
  "azure-ai-foundry",
  "synapse-analytics",
  "azure-ai-services",
  "azure-iot-hub",
  "azure-virtual-machine-scale-sets",
  "azure-database-for-mysql",
  "azure-database-for-postgresql",
  "azure-spring-apps",
  "azure-cache-for-redis",
  "azure-synapse-analytics",
  "azure-ad-b2c",
  "azure-ai-content-safety",
  "azure-compute-gallery",
  "azure-monitor-alerts",
  "microsoft-entra-domain-services",
  "active-directory-domain-services",
  "azure-automation",
  "azure-site-recovery",
  "azure-private-link",
  "azure-ddos-protection",
  "microsoft-defender-for-cloud",
  "microsoft-purview",
  "azure-devops",
  "azure-image-builder",
  "azure-batch",
  "azure-data-factory",
  "azure-monitor",
  "azure-application-gateway",
  "azure-vpn-gateway",
  "azure-virtual-wan",
  "azure-app-service-plan"
];

const TRAFFIC_SERVICES = [
  "azure-front-door",
  "azure-cdn",
  "azure-front-door-waf",
  "web-application-firewall",
  "azure-load-balancer",
  "azure-nat-gateway",
  "azure-dns",
  "azure-private-dns",
  "expressroute-direct",
  "azure-traffic-collector"
];

const STORAGE_SERVICES = [
  "azure-storage-account",
  "azure-files",
  "azure-blob-storage",
  "azure-container-registry",
  "azure-backup",
  "recovery-services-vault",
  "azure-netapp-files"
];

const INGESTION_SERVICES = [
  "log-analytics",
  "azure-application-insights",
  "azure-data-explorer"
];

const REQUEST_SERVICES = [
  "api-management",
  "azure-key-vault",
  "azure-event-hubs",
  "azure-event-grid",
  "azure-service-bus",
  "iot-hub-dps",
  "device-update-for-iot-hub",
  "logic-apps",
  "azure-app-configuration",
  "azure-bot-service",
  "azure-signalr-service",
  "data-gateways"
];

const SERVERLESS_SERVICES = ["azure-functions"];

const CONTAINER_APP_SERVICES = [
  "azure-container-apps",
  "azure-container-apps-environment"
];

const AZURE_OPENAI_SERVICES = ["azure-openai"];
const AKS_SERVICES = ["azure-kubernetes-service-aks"];
const SQL_DATABASE_SERVICES = ["azure-sql-database"];
const COSMOS_DB_SERVICES = ["azure-cosmos-db"];
const DATABRICKS_SERVICES = ["azure-databricks"];
const AI_SEARCH_SERVICES = ["azure-ai-search"];

export const SERVICE_ESTIMATE_PROFILES: Record<string, ServiceEstimateProfileDefinition> = {
  ...buildProfiles(
    NOT_MODELED_SERVICES,
    "not-modeled",
    "No supported standalone monthly estimate is modeled for this service.",
    [],
    [
      "This service is a control-plane concept, umbrella capability, or unpriced design primitive in this site.",
      "Use the raw Microsoft retail rows when published, or defer to a manual calculator worksheet for customer-specific costing."
    ]
  ),
  ...buildProfiles(
    RECURRING_BASE_SERVICES,
    "recurring-base",
    "Baseline recurring estimate from the lowest valid recurring retail meter in the selected pricing scope.",
    RECURRING_INPUTS,
    [
      "This is a baseline recurring estimate from Microsoft retail meters.",
      "Variable usage, storage, traffic, or throughput add-ons are excluded unless Microsoft exposes a clear recurring base row plus usage meters in the selected scope."
    ],
    {
      "azure-app-service-plan": {
        defaultSkuContains: "S1",
        description: "Baseline App Service Plan estimate using recurring compute meters."
      },
      "api-management": {
        defaultSkuContains: "Developer"
      },
      "azure-application-gateway": {
        description: "Baseline Application Gateway estimate using recurring gateway meters when Microsoft publishes them."
      },
      "azure-public-ip": {
        defaultSkuContains: "Standard"
      }
    }
  ),
  ...buildProfiles(
    TRAFFIC_SERVICES,
    "traffic",
    "Traffic-oriented estimate that combines recurring edge or gateway meters with traffic and request defaults.",
    TRAFFIC_INPUTS,
    [
      "This estimate uses Microsoft retail traffic meters and product-owned default assumptions.",
      "It is calculator-aligned but not a direct Azure Pricing Calculator API result."
    ],
    {
      "azure-front-door": {
        defaultSkuContains: "Standard",
        description: "Front Door estimate using base profile, transfer, and request defaults."
      },
      "azure-cdn": {
        description: "CDN estimate using recurring profile and transfer defaults."
      },
      "azure-nat-gateway": {
        description: "NAT Gateway estimate using recurring gateway and processed-data defaults."
      }
    }
  ),
  ...buildProfiles(
    STORAGE_SERVICES,
    "storage",
    "Capacity-oriented estimate using Microsoft storage meters plus optional operations.",
    STORAGE_INPUTS,
    [
      "This estimate uses stored-capacity defaults and excludes advanced replication, backup policy, and restore-path assumptions.",
      "Monthly operations stay at 0 until you customize them."
    ]
  ),
  ...buildProfiles(
    INGESTION_SERVICES,
    "ingestion",
    "Ingestion-based estimate using Microsoft data ingestion or telemetry volume meters.",
    INGESTION_INPUTS,
    [
      "This estimate uses monthly data volume defaults from Microsoft retail meters.",
      "Retention, analytics, or premium feature charges are excluded unless a clear meter is resolved."
    ]
  ),
  ...buildProfiles(
    REQUEST_SERVICES,
    "request-consumption",
    "Request-oriented estimate using recurring units plus monthly operations defaults.",
    REQUEST_INPUTS,
    [
      "This estimate uses Microsoft retail request or operation meters when they can be matched safely.",
      "If no request meter is found, the estimate falls back to recurring units only."
    ],
    {
      "api-management": {
        defaultSkuContains: "Developer",
        description: "API Management estimate using gateway units and operation defaults."
      },
      "azure-key-vault": {
        description: "Key Vault estimate using operation defaults when Microsoft publishes them in the retail feed."
      }
    }
  ),
  ...buildProfiles(
    SERVERLESS_SERVICES,
    "serverless",
    "Serverless estimate using execution count and execution-duration defaults from Microsoft retail meters.",
    SERVERLESS_INPUTS,
    [
      "This estimate uses Microsoft retail serverless meters and site defaults for executions and GB-seconds.",
      "It does not model free grant offsets, contract pricing, or reserved capacity."
    ]
  ),
  ...buildProfiles(
    CONTAINER_APP_SERVICES,
    "container-apps",
    "Container Apps estimate using compute, memory, active-hours, and request defaults.",
    CONTAINER_APPS_INPUTS,
    [
      "This estimate uses compute-duration retail meters and product-owned workload defaults.",
      "Ingress, revision, and environment-specific charges are only included when clear retail meters are available."
    ]
  ),
  ...buildProfiles(
    AZURE_OPENAI_SERVICES,
    "azure-openai",
    "Azure OpenAI estimate using token-based meters for the selected model family.",
    AZURE_OPENAI_INPUTS,
    [
      "This estimate uses Microsoft retail token meters for the selected Azure OpenAI model family.",
      "Use Preferred SKU to target a specific model family such as GPT-5 or Codex before refining token assumptions."
    ],
    {
      "azure-openai": {
        defaultSkuContains: "Azure OpenAI GPT5"
      }
    }
  ),
  ...buildProfiles(
    AKS_SERVICES,
    "aks",
    "AKS estimate using hosted control plane and worker-family hourly meters.",
    AKS_INPUTS,
    [
      "This estimate models AKS automatic pricing from hosted control plane plus worker-family hourly meters.",
      "Underlying VM, disk, network, and container registry charges remain separate services in this review model."
    ],
    {
      "azure-kubernetes-service-aks": {
        defaultSkuContains: "General Purpose"
      }
    }
  ),
  ...buildProfiles(
    SQL_DATABASE_SERVICES,
    "sql-database",
    "Azure SQL Database estimate using SQL compute-family retail meters and optional storage rows.",
    SQL_DATABASE_INPUTS,
    [
      "This estimate uses SQL Database compute-family retail rows and optional storage-related meters when they are published.",
      "Use Preferred SKU to target General Purpose, Business Critical, Hyperscale, or DTU-based families."
    ],
    {
      "azure-sql-database": {
        defaultSkuContains: "General Purpose"
      }
    }
  ),
  ...buildProfiles(
    COSMOS_DB_SERVICES,
    "cosmos-db",
    "Azure Cosmos DB estimate using RU-based or vCore-based retail meters with optional backup and attached storage.",
    COSMOS_DB_INPUTS,
    [
      "This estimate combines the selected Cosmos DB throughput family with backup and attached storage meters when they are available.",
      "Use Preferred SKU to choose between RU-based autoscale families and vCore-based cluster families."
    ],
    {
      "azure-cosmos-db": {
        defaultSkuContains: "AP1"
      }
    }
  ),
  ...buildProfiles(
    DATABRICKS_SERVICES,
    "databricks",
    "Azure Databricks estimate using DBU workload meters plus DSU storage and launch-charge meters when applicable.",
    DATABRICKS_INPUTS,
    [
      "This estimate combines Databricks DBU workload pricing with storage and launch meters when Microsoft publishes them for the selected family.",
      "Use Preferred SKU to choose the workload family, such as Premium Interactive Serverless Compute or Database Serverless Compute."
    ],
    {
      "azure-databricks": {
        defaultSkuContains: "Premium Interactive Serverless Compute"
      }
    }
  ),
  ...buildProfiles(
    AI_SEARCH_SERVICES,
    "ai-search",
    "Azure AI Search estimate using search-unit capacity plus semantic ranker and document cracking add-ons.",
    AI_SEARCH_INPUTS,
    [
      "This estimate uses Azure AI Search search-unit capacity rows and optional semantic ranker and cracking meters.",
      "Use Preferred SKU to choose the search tier, such as Basic or Standard S1."
    ],
    {
      "azure-ai-search": {
        defaultSkuContains: "Standard S1"
      }
    }
  )
};

export function getServiceEstimateProfile(serviceSlug: string) {
  return SERVICE_ESTIMATE_PROFILES[serviceSlug];
}

export function getEstimateInputMode(assumption: ReviewServiceAssumption | undefined): EstimateInputMode {
  return assumption?.estimateInputMode ?? "defaults";
}

export function getDefaultEstimateInputs(
  profile: ServiceEstimateProfileDefinition | undefined
): ReviewServiceEstimateInputs {
  if (!profile) {
    return {};
  }

  return Object.fromEntries(
    profile.inputDefinitions.map((definition) => [definition.key, definition.defaultValue])
  );
}

export function resolveEstimateInputs(
  profile: ServiceEstimateProfileDefinition | undefined,
  assumption: ReviewServiceAssumption | undefined
): ReviewServiceEstimateInputs {
  const defaults = getDefaultEstimateInputs(profile);

  if (!profile) {
    return assumption?.estimateInputs ?? defaults;
  }

  if (getEstimateInputMode(assumption) !== "custom") {
    return defaults;
  }

  return {
    ...defaults,
    ...(assumption?.estimateInputs ?? {})
  };
}

export function hasMeaningfulEstimateInputs(
  profile: ServiceEstimateProfileDefinition | undefined,
  assumption: ReviewServiceAssumption | undefined
) {
  if (!profile || !assumption?.estimateInputs) {
    return false;
  }

  const defaults = getDefaultEstimateInputs(profile);

  return Object.entries(assumption.estimateInputs).some(([key, value]) => defaults[key] !== value);
}