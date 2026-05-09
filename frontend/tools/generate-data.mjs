import { promises as fs } from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceRepo = process.env.REVIEW_CHECKLISTS_SOURCE_DIR
  ? path.resolve(root, process.env.REVIEW_CHECKLISTS_SOURCE_DIR)
  : path.join(root, "source-repo");
const outputDir = path.join(root, "public", "data");
const technologyDir = path.join(outputDir, "technologies");
const serviceDir = path.join(outputDir, "services");
const generatedAt = new Date().toISOString();
const sourceBlobBase = "https://github.com/Azure/review-checklists/blob/main";
const excludedFiles = new Set([
  "checklist.en.master.json",
  "template.json",
  "waf_checklist.en.json",
  "fullwaf_checklist.en.json"
]);

const ignoredServiceLabels = new Set([
  "n/a",
  "na",
  "nva",
  "microsoft cloud security benchmark",
  "microsoft threat modeling tool"
]);

const serviceAliasMap = new Map(
  Object.entries({
    "aad b2c": "Azure AD B2C",
    acr: "Azure Container Registry",
    aks: "Azure Kubernetes Service (AKS)",
    apim: "API Management",
    "api management": "API Management",
    "azure api management": "API Management",
    "app gateway": "Azure Application Gateway",
    "app service web apps": "Azure App Service",
    "app services": "Azure App Service",
    ars: "Azure Route Server",
    avs: "Azure VMware Solution",
    bastion: "Azure Bastion",
    backup: "Azure Backup",
    "bot service": "Azure Bot Service",
    "cognitive search": "Azure AI Search",
    "cognitive services": "Azure AI Services",
    "container apps": "Azure Container Apps",
    cosmosdb: "Azure Cosmos DB",
    "data factory": "Azure Data Factory",
    databricks: "Azure Databricks",
    defender: "Microsoft Defender for Cloud",
    dns: "Azure DNS",
    entra: "Microsoft Entra ID",
    "event hubs": "Azure Event Hubs",
    expressroute: "Azure ExpressRoute",
    firewall: "Azure Firewall",
    "front door": "Azure Front Door",
    functions: "Azure Functions",
    iot: "Azure IoT Hub",
    "key vault": "Azure Key Vault",
    "load balancer": "Azure Load Balancer",
    monitor: "Azure Monitor",
    policy: "Azure Policy",
    postgresql: "Azure Database for PostgreSQL",
    purview: "Microsoft Purview",
    redis: "Azure Cache for Redis",
    sap: "SAP on Azure",
    "service bus": "Azure Service Bus",
    "site recovery": "Azure Site Recovery",
    sql: "Azure SQL Database",
    "azure sql database": "Azure SQL Database",
    storage: "Azure Storage Account",
    "azure storage account": "Azure Storage Account",
    synapse: "Azure Synapse Analytics",
    "traffic manager": "Azure Traffic Manager",
    "virtual machines": "Azure Virtual Machines",
    vm: "Azure Virtual Machines",
    vmss: "Azure Virtual Machine Scale Sets",
    "virtual machine scale sets": "Azure Virtual Machine Scale Sets",
    vnet: "Azure Virtual Network",
    vpn: "Azure VPN Gateway",
    "azure vpn gateway": "Azure VPN Gateway",
    vwan: "Azure Virtual WAN",
    waf: "Web Application Firewall",
    "windows ad": "Active Directory Domain Services",
    "azure open ai": "Azure OpenAI",
    "azure openai": "Azure OpenAI",
    "azure kubernetes service": "Azure Kubernetes Service (AKS)",
    "azure expressroute": "Azure ExpressRoute",
    "azure blob storage": "Azure Blob Storage",
    "azure files": "Azure Files",
    "azure mysql": "Azure Database for MySQL",
    "microsoft entra": "Microsoft Entra ID",
    "microsoft purview": "Microsoft Purview",
    "microsoft defender for cloud": "Microsoft Defender for Cloud",
    "network watcher": "Azure Network Watcher",
    "public ip addresses": "Azure Public IP",
    "recovery services vault": "Recovery Services vault",
    "service bus": "Azure Service Bus",
    "spring apps": "Azure Spring Apps"
  })
);

function cleanDisplayText(value) {
  if (typeof value !== "string") {
    return value;
  }

  return value
    // ── Category name normalisation (raw source-repo enum values → display labels) ──
    .replace(/\bBc_Dr\b/g, "BC and DR")
    .replace(/\bCluster_Multi\b/g, "Multi-Cluster")
    .replace(/\bCluster_Security\b/g, "Cluster Security")
    .replace(/\bResource_Management\b/g, "Resource Management")
    .replace(/\bPerformant\b/g, "Performance")
    .replace(/\baccidential\b/gi, "accidental")
    // ─────────────────────────────────────────────────────────────────────────────
    .replace(/\bAzure Open AI\b/gi, "Azure OpenAI")
    .replace(/\bAzure Openai\b/g, "Azure OpenAI")
    .replace(/\bOpen AI\b/gi, "OpenAI")
    .replace(/\bOpenai\b/g, "OpenAI")
    .replace(/\bAzure AI search\b/gi, "Azure AI Search")
    .replace(/\bAPI Managements\b/g, "API Management")
    .replace(/\bchoosen\b/gi, "chosen")
    .replace(/\blrarning\b/gi, "learning")
    .replace(/\bth data stores\b/gi, "the data stores")
    .replace(/\bpay as you pricing\b/gi, "pay-as-you-go pricing")
    .replace(/\bSecure DevOps Govenance\b/g, "Secure DevOps Governance")
    .replace(/\bCloud Adaption Framework\b/g, "Cloud Adoption Framework")
    .replace(/\blearning & experimentation\b/gi, "learning and experimentation")
    .replace(/\bnumber of completions to generation\b/gi, "number of completions generated")
    .replace(/Verify PTU cost savings vs\b/gi, "Verify PTU cost savings versus")
    .replace(
      /Adhere to Azure OpenAI or other LLMs terms of use/gi,
      "Adhere to Azure OpenAI and other LLM terms of use"
    )
    .replace(
      /Azure AI Search service tiers should be chosen to have a SLA/gi,
      "Azure AI Search service tiers should be chosen to meet an SLA"
    )
    .replace(
      /Verify PTU cost savings vs pay[- ]as[- ]you pricing/gi,
      "Verify PTU cost savings versus pay-as-you-go pricing"
    )
    .replace(/supporting lrarning & experimentation/gi, "supporting learning and experimentation")
    .replace(/number of completions to generation \('n'\)/gi, "number of completions generated ('n')")
    .replace(
      /\bterms of use, policies and guidance and allowed use cases\b/gi,
      "terms of use, policies, guidance, and allowed use cases"
    )
    .replace(/production supporting learning and experimentation/gi, "production, supporting learning and experimentation")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function titleCase(value) {
  if (!value || typeof value !== "string") {
    return undefined;
  }

  return cleanDisplayText(
    value
    .trim()
    .replaceAll(/[_-]+/g, " ")
    .replaceAll(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => {
      if (part.toUpperCase() === part && part.length <= 5) {
        return part;
      }

      return `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`;
    })
    .join(" ")
  );
}

function slugify(value) {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

function normalizeArmServiceName(resourceType) {
  const key = String(resourceType ?? "").trim().toLowerCase();
  const armMap = {
    "microsoft.aad/domainservices": "Microsoft Entra Domain Services",
    "microsoft.apimanagement/service": "API Management",
    "microsoft.app/containerapps": "Azure Container Apps",
    "microsoft.app/managedenvironments": "Azure Container Apps Environment",
    "microsoft.appconfiguration/configurationstores": "Azure App Configuration",
    "microsoft.automation/automationaccounts": "Azure Automation",
    "microsoft.avs/privateclouds": "Azure VMware Solution",
    "microsoft.batch/batchaccounts": "Azure Batch",
    "microsoft.cache/redis": "Azure Cache for Redis",
    "microsoft.cdn/profiles": "Azure CDN",
    "microsoft.compute/galleries": "Azure Compute Gallery",
    "microsoft.compute/virtualmachines": "Azure Virtual Machines",
    "microsoft.compute/virtualmachinescalesets": "Azure Virtual Machine Scale Sets",
    "microsoft.containerregistry/registries": "Azure Container Registry",
    "microsoft.containerservice/managedclusters": "Azure Kubernetes Service (AKS)",
    "microsoft.databricks/workspaces": "Azure Databricks",
    "microsoft.dbformysql/flexibleservers": "Azure Database for MySQL",
    "microsoft.dbforpostgresql/flexibleservers": "Azure Database for PostgreSQL",
    "microsoft.desktopvirtualization/hostpools": "Azure Virtual Desktop",
    "microsoft.desktopvirtualization/scalingplans": "Azure Virtual Desktop",
    "microsoft.devices/iothubs": "Azure IoT Hub",
    "microsoft.documentdb/databaseaccounts": "Azure Cosmos DB",
    "microsoft.eventgrid/topics": "Azure Event Grid",
    "microsoft.eventhub/namespaces": "Azure Event Hubs",
    "microsoft.insights/activitylogalerts": "Azure Monitor Alerts",
    "microsoft.insights/components": "Azure Application Insights",
    "microsoft.keyvault/vaults": "Azure Key Vault",
    "microsoft.netapp/netappaccounts": "Azure NetApp Files",
    "microsoft.network/applicationgateways": "Azure Application Gateway",
    "microsoft.network/azurefirewalls": "Azure Firewall",
    "microsoft.network/connections": "VPN and ExpressRoute connections",
    "microsoft.network/ddosprotectionplans": "Azure DDoS Protection",
    "microsoft.network/expressroutecircuits": "Azure ExpressRoute",
    "microsoft.network/expressrouteports": "ExpressRoute Direct",
    "microsoft.network/frontdoorwebapplicationfirewallpolicies": "Azure Front Door WAF",
    "microsoft.network/loadbalancers": "Azure Load Balancer",
    "microsoft.network/natgateways": "Azure NAT Gateway",
    "microsoft.network/networksecuritygroups": "Network Security Groups",
    "microsoft.network/networkwatchers": "Azure Network Watcher",
    "microsoft.network/privatednszones": "Azure Private DNS",
    "microsoft.network/privateendpoints": "Azure Private Link",
    "microsoft.network/publicipaddresses": "Azure Public IP",
    "microsoft.network/routetables": "Route tables",
    "microsoft.network/trafficmanagerprofiles": "Azure Traffic Manager",
    "microsoft.network/virtualnetworkgateways": "Azure VPN Gateway",
    "microsoft.network/virtualnetworks": "Azure Virtual Network",
    "microsoft.networkfunction/azuretrafficcollectors": "Azure Traffic Collector",
    "microsoft.operationalinsights/workspaces": "Log Analytics",
    "microsoft.recoveryservices/vaults": "Recovery Services vault",
    "microsoft.resources/resourcegroups": "Resource Groups",
    "microsoft.servicebus/namespaces": "Azure Service Bus",
    "microsoft.signalrservice/signalr": "Azure SignalR Service",
    "microsoft.sql/servers": "Azure SQL Database",
    "microsoft.storage/storageaccounts": "Azure Storage Account",
    "microsoft.subscription/subscriptions": "Azure Subscriptions",
    "microsoft.virtualmachineimages/imagetemplates": "Azure Image Builder",
    "microsoft.web/serverfarms": "Azure App Service Plan",
    "microsoft.web/sites": "Azure App Service"
  };

  return armMap[key];
}

function normalizeServiceName(rawService) {
  const trimmed = String(rawService ?? "").trim();

  if (!trimmed) {
    return undefined;
  }

  const normalizedKey = trimmed.toLowerCase();

  if (ignoredServiceLabels.has(normalizedKey)) {
    return undefined;
  }

  if (serviceAliasMap.has(normalizedKey)) {
    return cleanDisplayText(serviceAliasMap.get(normalizedKey));
  }

  if (trimmed.startsWith("Microsoft.")) {
    return cleanDisplayText(normalizeArmServiceName(trimmed) ?? trimmed);
  }

  return cleanDisplayText(titleCase(trimmed) ?? trimmed);
}

function normalizeStatus(raw) {
  const normalized = String(raw ?? "").trim().toLowerCase();

  if (normalized === "ga") return "GA";
  if (normalized === "preview") return "Preview";
  if (normalized === "deprecated") return "Deprecated";

  return "Unknown";
}

function normalizeSeverity(raw) {
  const normalized = String(raw ?? "").trim().toLowerCase();

  if (normalized === "high") return "High";
  if (normalized === "medium") return "Medium";
  if (normalized === "low") return "Low";

  return undefined;
}

function normalizeCategory(raw) {
  if (!raw) return raw;
  const normalized = raw.trim();
  const categoryMap = {
    // Cost Optimization Checklist uses "Cleanup" for orphaned-resource checks — remap to the WAF pillar
    Cleanup: "Cost Optimization",
    // Consolidate semantically equivalent resiliency labels into a single chip
    "BC and DR": "Business Continuity and Disaster Recovery",
    BCDR: "Business Continuity and Disaster Recovery",
    "Business Continuity": "Business Continuity and Disaster Recovery",
    "Business Continuity and Disaster Recovery": "Business Continuity and Disaster Recovery"
  };
  return categoryMap[normalized] ?? normalized;
}

function normalizeWaf(raw) {
  const normalized = titleCase(raw);

  if (!normalized) {
    return undefined;
  }

  const canonical = {
    Reliability: "Reliability",
    Security: "Security",
    Cost: "Cost",
    Operations: "Operations",
    Performance: "Performance"
  };

  return canonical[normalized] ?? normalized;
}

function deriveTechnologyName(fileName, metadataName, sampleChecklist) {
  if (metadataName) {
    return cleanDisplayText(metadataName.trim());
  }

  if (sampleChecklist) {
    return cleanDisplayText(sampleChecklist.trim());
  }

  const withoutSuffix = fileName
    .replace(/\.en\.json$/i, "")
    .replace(/_checklist$/i, "")
    .replace(/_sg$/i, " service guide");

  return cleanDisplayText(titleCase(withoutSuffix) ?? fileName);
}

const availabilitySourceUrl =
  "https://azure.microsoft.com/en-us/explore/global-infrastructure/products-by-region/table";
const regionsSourceUrl = "https://learn.microsoft.com/en-us/azure/reliability/regions-list";
const excludedAvailabilityGeographies = new Set(["Azure Government"]);
const availabilityManualMap = new Map(
  Object.entries({
    "active directory domain services": {
      offeringName: "Microsoft Entra Domain Services"
    },
    "ad b2c": {
      offeringName: "Azure Active Directory B2C",
      notes: ["Microsoft's availability feed lists this identity service as a global, non-regional offering."]
    },
    "ai content safety": {
      offeringName: "Microsoft Foundry",
      productSkuHints: ["Content Safety"],
      notes: ["Availability is derived from the Content Safety product line under Microsoft Foundry."]
    },
    "ai foundry": {
      offeringName: "Microsoft Foundry",
      notes: ["Availability is mapped to the umbrella Microsoft Foundry offering because the source feed groups several Foundry capabilities together."]
    },
    "app service plan": {
      offeringName: "App Service",
      notes: ["Availability is mapped through the broader App Service offering because App Service Plan isn't listed as a standalone offering in the Microsoft feed."]
    },
    "application insights": {
      offeringName: "Azure Monitor",
      productSkuHints: ["Application Insights"],
      notes: ["Availability is derived from the Application Insights SKU under Azure Monitor."]
    },
    "blob storage": {
      offeringName: "Storage",
      productSkuHints: ["Blob Storage", "Premium Block Blobs"],
      notes: ["Availability is derived from Blob-related Storage SKUs in the Microsoft availability feed."]
    },
    "cache for redis": {
      offeringName: "Redis Cache"
    },
    cdn: {
      offeringName: "Content Delivery Network",
      notes: ["Microsoft lists CDN as a global, non-regional service in the availability feed."]
    },
    "container apps environment": {
      offeringName: "Azure Container Apps",
      notes: ["Availability is mapped through Azure Container Apps because the managed environment resource isn't listed separately in the Microsoft feed."]
    },
    "front door waf": {
      offeringName: "Azure Web Application Firewall",
      productSkuHints: ["WAF on Azure Front Door"],
      notes: ["Availability is derived from the Front Door-specific WAF SKU under Azure Web Application Firewall."]
    },
    "image builder": {
      offeringName: "Azure VM Image Builder"
    },
    "machine learning": {
      offeringName: "Microsoft Foundry",
      productSkuHints: ["Azure Machine Learning"],
      notes: ["Availability is derived from the Azure Machine Learning SKU family under Microsoft Foundry."]
    },
    "monitor alerts": {
      offeringName: "Azure Monitor",
      notes: ["Availability is mapped through the broader Azure Monitor offering because alerts aren't listed as a standalone offering in the Microsoft feed."]
    },
    "nat gateway": {
      offeringName: "Virtual Network NAT"
    },
    "private dns": {
      offeringName: "Azure DNS",
      productSkuHints: ["Private Zones"],
      notes: ["Availability is derived from the Azure DNS Private Zones SKU in the Microsoft feed."]
    },
    "public ip": {
      offeringName: "IP Services",
      productSkuHints: ["Azure Public IP"],
      notes: ["Availability is derived from public IP SKUs within the IP Services offering."]
    },
    "traffic collector": {
      offeringName: "",
      notes: ["The Microsoft availability feed does not currently expose a distinct offering for Azure Traffic Collector."]
    },
    "log analytics": {
      offeringName: "Azure Monitor",
      productSkuHints: ["Log Analytics"],
      notes: ["Availability is derived from the Log Analytics SKU under Azure Monitor."]
    },
    purview: {
      offeringName: "Security Platform (Purview)"
    }
  })
);

function normalizeAvailabilityKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/^azure\s+/i, "")
    .replace(/^microsoft\s+/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRegionLabel(regionName) {
  const raw = cleanDisplayText(regionName) ?? "";

  if (raw.endsWith("**")) {
    return {
      regionName: raw.slice(0, -2).trim(),
      accessState: "EarlyAccess"
    };
  }

  if (raw.endsWith("*")) {
    return {
      regionName: raw.slice(0, -1).trim(),
      accessState: "ReservedAccess"
    };
  }

  return {
    regionName: raw.trim(),
    accessState: "Open"
  };
}

function accessStateRank(accessState) {
  if (accessState === "EarlyAccess") {
    return 2;
  }

  if (accessState === "ReservedAccess") {
    return 1;
  }

  return 0;
}

function normalizeAvailabilityState(raw) {
  const normalized = String(raw ?? "").trim().toLowerCase();

  if (normalized === "ga") {
    return "GA";
  }

  if (normalized === "preview") {
    return "Preview";
  }

  if (normalized === "closing down" || normalized === "retiring") {
    return "Retiring";
  }

  return undefined;
}

function isCommercialPublicAvailabilityRow(row) {
  const geographyName = cleanDisplayText(row.GeographyName) ?? "";
  const { regionName } = parseRegionLabel(row.RegionName);

  if (!geographyName || regionName === "Non Regional") {
    return false;
  }

  if (excludedAvailabilityGeographies.has(geographyName)) {
    return false;
  }

  return !geographyName.includes("21Vianet");
}

async function readAvailabilityRows() {
  const response = await fetch(availabilitySourceUrl, {
    headers: {
      Accept: "text/html"
    }
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch Azure Product Availability by Region: ${response.status}`);
  }

  const html = await response.text();
  const scriptAnchor = html.indexOf("const data =");

  if (scriptAnchor === -1) {
    throw new Error("Azure Product Availability by Region feed did not contain the embedded data payload.");
  }

  const dataStart = html.indexOf("[", scriptAnchor);
  const dataEnd = html.indexOf("];", dataStart);

  if (dataStart === -1 || dataEnd === -1) {
    throw new Error("Azure Product Availability by Region feed did not contain a parseable data array.");
  }

  return JSON.parse(html.slice(dataStart, dataEnd + 1));
}

function buildPublicRegionCatalog(rows) {
  const regionMap = new Map();

  for (const row of rows) {
    if (!isCommercialPublicAvailabilityRow(row)) {
      continue;
    }

    const geographyName = cleanDisplayText(row.GeographyName) ?? "Unknown";
    const { regionName, accessState } = parseRegionLabel(row.RegionName);
    const existing = regionMap.get(regionName);

    if (!existing) {
      regionMap.set(regionName, {
        regionName,
        geographyName,
        accessState
      });
      continue;
    }

    if (accessStateRank(accessState) > accessStateRank(existing.accessState)) {
      existing.accessState = accessState;
    }
  }

  return [...regionMap.values()].sort((left, right) => left.regionName.localeCompare(right.regionName));
}

function buildAvailabilityOfferingLookup(rows) {
  const offerings = [...new Set(rows.map((row) => cleanDisplayText(row.OfferingName)).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right)
  );
  const offeringByKey = new Map();

  for (const offeringName of offerings) {
    const key = normalizeAvailabilityKey(offeringName);

    if (!offeringByKey.has(key)) {
      offeringByKey.set(key, offeringName);
    }
  }

  return offeringByKey;
}

function resolveAvailabilityMapping(serviceName, aliases, offeringByKey) {
  const serviceKey = normalizeAvailabilityKey(serviceName);
  const manual = availabilityManualMap.get(serviceKey);

  if (manual) {
    if (!manual.offeringName) {
      return {
        mapped: false,
        notes: manual.notes ?? [
          "The Microsoft availability feed does not currently expose a directly mappable offering for this service."
        ]
      };
    }

    return {
      mapped: true,
      offeringName: manual.offeringName,
      matchType: "manual",
      matchedServiceLabel: serviceName,
      matchedSkuHints: manual.productSkuHints ?? [],
      notes: manual.notes ?? []
    };
  }

  const candidates = [serviceName, ...aliases].filter(Boolean);

  for (const candidate of candidates) {
    const offeringName = offeringByKey.get(normalizeAvailabilityKey(candidate));

    if (!offeringName) {
      continue;
    }

    return {
      mapped: true,
      offeringName,
      matchType: candidate === serviceName ? "exact" : "alias",
      matchedServiceLabel: candidate,
      matchedSkuHints: [],
      notes: []
    };
  }

  return {
    mapped: false,
    notes: [
      "An official Azure Product Availability by Region offering could not be matched automatically for this service."
    ]
  };
}

function buildServiceRegionalFit(service, availabilityRows, publicRegions, offeringByKey) {
  if (availabilityRows.length === 0) {
    return {
      mapped: false,
      notes: ["Official Azure regional availability data was unavailable during this build."],
      publicRegionCount: 0,
      availableRegionCount: 0,
      unavailableRegionCount: 0,
      restrictedRegionCount: 0,
      earlyAccessRegionCount: 0,
      previewRegionCount: 0,
      retiringRegionCount: 0,
      isGlobalService: false,
      generatedAt,
      availabilitySourceUrl,
      regionsSourceUrl,
      regions: [],
      unavailableRegions: [],
      globalSkuStates: []
    };
  }

  const mapping = resolveAvailabilityMapping(service.service, service.aliases, offeringByKey);
  const baseSummary = {
    mapped: false,
    notes: mapping.notes,
    publicRegionCount: publicRegions.length,
    availableRegionCount: 0,
    unavailableRegionCount: 0,
    restrictedRegionCount: 0,
    earlyAccessRegionCount: 0,
    previewRegionCount: 0,
    retiringRegionCount: 0,
    isGlobalService: false,
    generatedAt,
    availabilitySourceUrl,
    regionsSourceUrl
  };

  if (!mapping.mapped) {
    return {
      ...baseSummary,
      regions: [],
      unavailableRegions: [],
      globalSkuStates: []
    };
  }

  const matchedRows = availabilityRows.filter((row) => {
    if (cleanDisplayText(row.OfferingName) !== mapping.offeringName) {
      return false;
    }

    if (mapping.matchedSkuHints.length === 0) {
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
    const existing = regionMap.get(regionName) ?? {
      regionName,
      geographyName,
      accessState,
      availabilityState: state,
      skuStates: []
    };

    if (accessStateRank(accessState) > accessStateRank(existing.accessState)) {
      existing.accessState = accessState;
    }

    if (!existing.skuStates.some((entry) => entry.skuName === skuName && entry.state === state)) {
      existing.skuStates.push({
        skuName,
        state
      });
    }

    if (existing.skuStates.some((entry) => entry.state === "GA")) {
      existing.availabilityState = "GA";
    } else if (existing.skuStates.some((entry) => entry.state === "Preview")) {
      existing.availabilityState = "Preview";
    } else {
      existing.availabilityState = "Retiring";
    }

    regionMap.set(regionName, existing);
  }

  const regions = [...regionMap.values()]
    .map((region) => ({
      ...region,
      skuStates: [...region.skuStates].sort((left, right) => left.skuName.localeCompare(right.skuName))
    }))
    .sort((left, right) => left.regionName.localeCompare(right.regionName));
  const globalSkuStates = [...globalSkuMap.values()].sort((left, right) =>
    left.skuName.localeCompare(right.skuName)
  );
  const availableRegionNames = new Set(regions.map((region) => region.regionName));
  const isGlobalService = globalSkuStates.length > 0;
  const unavailableRegions =
    isGlobalService && regions.length === 0
      ? []
      : publicRegions
          .filter((region) => !availableRegionNames.has(region.regionName))
          .map((region) => ({
            regionName: region.regionName,
            geographyName: region.geographyName,
            accessState: region.accessState
          }));
  const notes = [...mapping.notes];

  if (isGlobalService && regions.length === 0) {
    notes.push(
      "Microsoft lists this as a global or non-regional service, so region-by-region availability is not applicable in the same way as regional services."
    );
  }

  return {
    ...baseSummary,
    mapped: true,
    matchType: mapping.matchType,
    matchedOfferingName: mapping.offeringName,
    matchedServiceLabel: mapping.matchedServiceLabel,
    matchedSkuHints: mapping.matchedSkuHints,
    notes,
    availableRegionCount: regions.length,
    unavailableRegionCount: unavailableRegions.length,
    restrictedRegionCount: regions.filter((region) => region.accessState === "ReservedAccess").length,
    earlyAccessRegionCount: regions.filter((region) => region.accessState === "EarlyAccess").length,
    previewRegionCount: regions.filter((region) =>
      region.skuStates.some((entry) => entry.state === "Preview")
    ).length,
    retiringRegionCount: regions.filter((region) =>
      region.skuStates.some((entry) => entry.state === "Retiring")
    ).length,
    isGlobalService,
    regions,
    unavailableRegions,
    globalSkuStates
  };
}

function summarizeRegionalFit(regionalFit) {
  return {
    mapped: regionalFit.mapped,
    matchType: regionalFit.matchType,
    matchedOfferingName: regionalFit.matchedOfferingName,
    matchedServiceLabel: regionalFit.matchedServiceLabel,
    matchedSkuHints: regionalFit.matchedSkuHints ?? [],
    notes: regionalFit.notes,
    publicRegionCount: regionalFit.publicRegionCount,
    availableRegionCount: regionalFit.availableRegionCount,
    unavailableRegionCount: regionalFit.unavailableRegionCount,
    restrictedRegionCount: regionalFit.restrictedRegionCount,
    earlyAccessRegionCount: regionalFit.earlyAccessRegionCount,
    previewRegionCount: regionalFit.previewRegionCount,
    retiringRegionCount: regionalFit.retiringRegionCount,
    isGlobalService: regionalFit.isGlobalService,
    generatedAt: regionalFit.generatedAt,
    availabilitySourceUrl: regionalFit.availabilitySourceUrl,
    regionsSourceUrl: regionalFit.regionsSourceUrl
  };
}

function collectUnique(items, selector) {
  return [...new Set(items.map(selector).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right)
  );
}

function summarizeCounts(values) {
  const counts = new Map();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function presence(value) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return value !== null && value !== undefined;
}

function toPercent(hits, total) {
  return total === 0 ? 0 : Math.round((hits / total) * 100);
}

function firstLearnMoreUrl(learnMoreLink) {
  if (!Array.isArray(learnMoreLink)) {
    return undefined;
  }

  const entry = learnMoreLink.find((candidate) => typeof candidate?.url === "string");
  return entry?.url;
}

function inferArmService(rawItem) {
  return (
    rawItem["arm-service"] ??
    rawItem.armService ??
    rawItem.recommendationResourceType ??
    (typeof rawItem.service === "string" &&
    rawItem.service.includes("/") &&
    rawItem.service.startsWith("Microsoft.")
      ? rawItem.service
      : undefined)
  );
}

function summarizeDescription(items, technology, quality) {
  const categories = collectUnique(items, (item) => item.category).slice(0, 3);
  const services = collectUnique(items, (item) => item.serviceCanonical ?? item.service).slice(0, 4);
  const highSeverityCount = items.filter((item) => item.severity === "High").length;
  const categorySummary =
    categories.length > 0 ? `covers ${categories.join(", ")}` : "contains sparse category metadata";
  const serviceSummary =
    services.length > 0 ? `touches services like ${services.join(", ")}` : "uses generalized guidance";

  return cleanDisplayText(
    `${technology} is a ${quality.maturityBucket} family with ${items.length} normalized items, ${highSeverityCount} high-severity findings, ${categorySummary}, and ${serviceSummary}.`
  );
}

function getStatusConfidence(status) {
  if (status === "GA") return 100;
  if (status === "Preview") return 70;
  if (status === "Deprecated") return 25;

  return 45;
}

function getRecommendedUsageConfidence(status, qualityScore) {
  if (status === "Deprecated") {
    return "Retire";
  }

  if (status === "GA" && qualityScore >= 82) {
    return "High";
  }

  if (qualityScore >= 67) {
    return "Medium";
  }

  return "Limited";
}

function getMaturityBucket(status, qualityScore, metadataCompleteness, severityConfidence) {
  if (status === "Deprecated") {
    return "Deprecated";
  }

  if (status === "Preview") {
    return "Preview";
  }

  if (
    status === "GA" &&
    qualityScore >= 80 &&
    metadataCompleteness >= 58 &&
    severityConfidence >= 60
  ) {
    return "GA";
  }

  return "Mixed";
}

function getQualitySummary(maturityBucket, qualityScore, metadataCompleteness, severityConfidence) {
  if (maturityBucket === "GA") {
    return `Strong review accelerator. Quality score ${qualityScore} with ${metadataCompleteness}% metadata completeness and ${severityConfidence}% severity coverage.`;
  }

  if (maturityBucket === "Preview") {
    return `Use with architectural judgment. Preview content is valuable, but it should not be treated as equivalent to mature review baselines.`;
  }

  if (maturityBucket === "Deprecated") {
    return "Reference only for historical context or migration planning. Do not use as the primary baseline for new reviews.";
  }

  return `Mixed confidence. Reviewers should verify source intent and severity interpretation before using this family in executive decision packs.`;
}

function getQualityLabel(maturityBucket, recommendedUsageConfidence) {
  return `${maturityBucket} · ${recommendedUsageConfidence} confidence`;
}

function getWhatThisMeans(maturityBucket) {
  if (maturityBucket === "GA") {
    return "Suitable for executive and architecture review packs by default.";
  }

  if (maturityBucket === "Preview") {
    return "Use to enrich design reviews, but validate recommendations before treating them as baseline controls.";
  }

  if (maturityBucket === "Deprecated") {
    return "Keep visible for traceability, but steer current reviews toward newer guidance.";
  }

  return "Useful for specialist analysis, but not strong enough to lead with in director-level summaries.";
}

function computeQuality(items, status) {
  let metadataChecks = 0;
  let metadataHits = 0;
  let severityHits = 0;
  let traceChecks = 0;
  let traceHits = 0;

  for (const item of items) {
    const metadataValues = [
      item.category,
      item.subcategory,
      item.severity,
      item.waf,
      item.service,
      item.description
    ];
    const traceValues = [
      item.sourcePath,
      item.sourceUrl,
      item.guid,
      item.link ?? item.training ?? item.query ?? item.graph
    ];

    metadataChecks += metadataValues.length;
    metadataHits += metadataValues.filter(presence).length;
    traceChecks += traceValues.length;
    traceHits += traceValues.filter(presence).length;

    if (presence(item.severity)) {
      severityHits += 1;
    }
  }

  const metadataCompleteness = toPercent(metadataHits, metadataChecks);
  const severityConfidence = toPercent(severityHits, items.length);
  const sourceCoverageQuality = toPercent(traceHits, traceChecks);
  const statusConfidence = getStatusConfidence(status);
  const qualityScore = Math.round(
    metadataCompleteness * 0.4 +
      severityConfidence * 0.25 +
      sourceCoverageQuality * 0.2 +
      statusConfidence * 0.15
  );
  const recommendedUsageConfidence = getRecommendedUsageConfidence(status, qualityScore);
  const maturityBucket = getMaturityBucket(
    status,
    qualityScore,
    metadataCompleteness,
    severityConfidence
  );

  return {
    label: getQualityLabel(maturityBucket, recommendedUsageConfidence),
    qualityScore,
    metadataCompleteness,
    severityConfidence,
    sourceCoverageQuality,
    recommendedUsageConfidence,
    generatedDate: generatedAt,
    maturityBucket,
    summary: getQualitySummary(
      maturityBucket,
      qualityScore,
      metadataCompleteness,
      severityConfidence
    )
  };
}

function normalizeItem(rawItem, technologySlug, family, sourceMeta) {
  const category = normalizeCategory(cleanDisplayText(
    rawItem.category ?? rawItem.recommendationControl ?? rawItem.checklist
  ));
  const subcategory = cleanDisplayText(
    rawItem.subcategory ?? rawItem.recommendationResourceType ?? rawItem.type
  );
  const description = cleanDisplayText(
    rawItem.description ?? rawItem.longDescription ?? rawItem.potentialBenefits
  );
  const rawService =
    typeof rawItem.service === "string" ? cleanDisplayText(rawItem.service) : undefined;
  const rawServiceNormalizedKey = typeof rawService === "string" ? rawService.trim().toLowerCase() : undefined;
  const rawServiceAllowed =
    Boolean(rawService) &&
    Boolean(rawServiceNormalizedKey) &&
    !ignoredServiceLabels.has(rawServiceNormalizedKey);
  const armService = inferArmService(rawItem);
  const serviceSource = rawService ?? armService;
  const serviceCanonical = normalizeServiceName(serviceSource);
  const serviceDisplay = serviceCanonical ?? (rawServiceAllowed ? rawService : undefined) ?? armService;
  const severity = normalizeSeverity(rawItem.severity ?? rawItem.recommendationImpact);
  const waf = normalizeWaf(rawItem.waf);
  const link = rawItem.link ?? firstLearnMoreUrl(rawItem.learnMoreLink);

  return {
    guid: String(rawItem.guid),
    technology: family,
    technologySlug,
    technologyStatus: "Unknown",
    technologyMaturityBucket: "Mixed",
    usageConfidence: "Limited",
    technologyQualityScore: 0,
    family,
    sourceKind: sourceMeta.kind,
    checklist: cleanDisplayText(rawItem.checklist ?? family),
    category,
    subcategory,
    id: rawItem.id ?? rawItem.recommendationTypeId ?? rawItem.aprlGuid,
    text: cleanDisplayText(String(rawItem.text ?? rawItem.description ?? rawItem.guid)),
    description,
    severity,
    waf,
    service: serviceDisplay,
    serviceCanonical,
    serviceSlug: serviceCanonical ? slugify(serviceCanonical) : undefined,
    armService,
    link,
    training: rawItem.training,
    query: rawItem.query,
    graph: rawItem.graph ?? rawItem.graph_failure ?? rawItem.graph_success,
    sourcePath: sourceMeta.relativePath,
    sourceUrl: sourceMeta.sourceUrl,
    normalizedAt: generatedAt,
    provenance: {
      technology: "normalized",
      technologyStatus: "normalized",
      category: category
        ? rawItem.category || rawItem.recommendationControl
          ? "source"
          : "inferred"
        : "unavailable",
      subcategory: subcategory ? (rawItem.subcategory ? "source" : "inferred") : "unavailable",
      severity: severity
        ? rawItem.severity || rawItem.recommendationImpact
          ? "normalized"
          : "inferred"
        : "unavailable",
      waf: waf ? (rawItem.waf ? "normalized" : "unavailable") : "unavailable",
      service: serviceCanonical || rawService ? (rawItem.service ? "normalized" : "inferred") : "unavailable",
      description: description
        ? rawItem.description || rawItem.longDescription
          ? "source"
          : "inferred"
        : "unavailable"
    }
  };
}

async function ensureDirectory(directoryPath) {
  await fs.mkdir(directoryPath, { recursive: true });
}

async function cleanDirectory(directoryPath) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });

  await Promise.all(
    entries.map((entry) =>
      fs.rm(path.join(directoryPath, entry.name), {
        recursive: true,
        force: true
      })
    )
  );
}

async function writeJson(filePath, payload) {
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2));
}

async function getEnglishChecklistFiles(subdirectory) {
  const directoryPath = path.join(sourceRepo, subdirectory);
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });

  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".en.json") &&
        !excludedFiles.has(entry.name)
    )
    .map((entry) => ({
      absolutePath: path.join(directoryPath, entry.name),
      relativePath: `${subdirectory}/${entry.name}`.replaceAll("\\", "/"),
      kind: subdirectory
    }));
}

async function generate() {
  const sourceExists = await fs
    .stat(sourceRepo)
    .then(() => true)
    .catch(() => false);

  if (!sourceExists) {
    throw new Error(
      `Source repository not found at ${sourceRepo}. Clone https://github.com/Azure/review-checklists or set REVIEW_CHECKLISTS_SOURCE_DIR.`
    );
  }

  await ensureDirectory(outputDir);
  await ensureDirectory(technologyDir);
  await ensureDirectory(serviceDir);
  await cleanDirectory(technologyDir);
  await cleanDirectory(serviceDir);

  let availabilityRows = [];

  try {
    availabilityRows = await readAvailabilityRows();
  } catch (error) {
    console.warn(`Unable to refresh official Azure regional availability data: ${error.message}`);
  }

  const publicRegions = buildPublicRegionCatalog(availabilityRows);
  const availabilityOfferingLookup = buildAvailabilityOfferingLookup(availabilityRows);

  const files = [
    ...(await getEnglishChecklistFiles("checklists")),
    ...(await getEnglishChecklistFiles("checklists-ext"))
  ];

  const records = [];

  for (const file of files) {
    const raw = JSON.parse(await fs.readFile(file.absolutePath, "utf8"));
    const fileName = path.basename(file.relativePath);
    const fileStem = fileName.replace(/\.en\.json$/i, "");
    const baseTechnology = deriveTechnologyName(
      fileName,
      raw.metadata?.name,
      raw.items?.[0]?.checklist
    );
    const family = cleanDisplayText(raw.metadata?.name ?? baseTechnology);
    const technologySlug = slugify(`${baseTechnology}-${fileStem}`);
    const technologyStatus = normalizeStatus(raw.metadata?.state);
    const sourceMeta = {
      relativePath: file.relativePath,
      sourceUrl: `${sourceBlobBase}/${file.relativePath}`,
      kind: file.kind
    };
    const items = (raw.items ?? [])
      .filter((item) => item?.guid && (item?.text || item?.description))
      .map((item) => normalizeItem(item, technologySlug, family, sourceMeta));

    records.push({
      fileStem,
      baseTechnology,
      family,
      technologySlug,
      technologyStatus,
      items,
      sourceMeta,
      timestamp: raw.metadata?.timestamp,
      sourceKind: file.kind
    });
  }

  const baseNameCounts = new Map();

  for (const record of records) {
    baseNameCounts.set(
      record.baseTechnology,
      (baseNameCounts.get(record.baseTechnology) ?? 0) + 1
    );
  }

  const allItems = [];
  const technologies = [];

  for (const record of records) {
    const displayTechnology = cleanDisplayText(
      (baseNameCounts.get(record.baseTechnology) ?? 0) > 1
        ? `${record.baseTechnology} (${titleCase(record.fileStem)})`
        : record.baseTechnology
    );
    const quality = computeQuality(record.items, record.technologyStatus);
    const enrichedItems = record.items.map((item) => ({
      ...item,
      technology: displayTechnology,
      technologyStatus: record.technologyStatus,
      technologyMaturityBucket: quality.maturityBucket,
      usageConfidence: quality.recommendedUsageConfidence,
      technologyQualityScore: quality.qualityScore
    }));

    const technologySummary = {
      slug: record.technologySlug,
      technology: displayTechnology,
      status: record.technologyStatus,
      maturityBucket: quality.maturityBucket,
      itemCount: enrichedItems.length,
      highSeverityCount: enrichedItems.filter((item) => item.severity === "High").length,
      categories: collectUnique(enrichedItems, (item) => item.category),
      services: collectUnique(enrichedItems, (item) => item.serviceCanonical ?? item.service),
      wafPillars: collectUnique(enrichedItems, (item) => item.waf),
      sourcePath: record.sourceMeta.relativePath,
      sourceUrl: record.sourceMeta.sourceUrl,
      timestamp: record.timestamp,
      sourceKind: record.sourceKind,
      description: summarizeDescription(enrichedItems, displayTechnology, quality),
      whatThisMeans: getWhatThisMeans(quality.maturityBucket),
      quality
    };

    allItems.push(...enrichedItems);
    technologies.push(technologySummary);

    await writeJson(path.join(technologyDir, `${record.technologySlug}.json`), {
      generatedAt,
      technology: technologySummary,
      items: enrichedItems
    });
  }

  const gaTechnologies = technologies.filter((technology) => technology.maturityBucket === "GA");
  const previewTechnologies = technologies.filter(
    (technology) => technology.maturityBucket === "Preview"
  );
  const mixedTechnologies = technologies.filter((technology) => technology.maturityBucket === "Mixed");
  const deprecatedTechnologies = technologies.filter(
    (technology) => technology.maturityBucket === "Deprecated"
  );
  const technologyMap = new Map(technologies.map((technology) => [technology.slug, technology]));
  const serviceGroups = new Map();

  for (const item of allItems) {
    const serviceName = item.serviceCanonical ?? item.service;

    if (!serviceName) {
      continue;
    }

    const existing = serviceGroups.get(serviceName) ?? {
      items: [],
      aliases: new Set(),
      familySlugs: new Set()
    };

    existing.items.push(item);
    existing.familySlugs.add(item.technologySlug);

    if (item.service && item.service !== serviceName) {
      existing.aliases.add(item.service);
    }

    if (item.armService && item.armService !== serviceName) {
      existing.aliases.add(item.armService);
    }

    serviceGroups.set(serviceName, existing);
  }

  const services = [...serviceGroups.entries()]
    .map(([service, group]) => {
      const familySummaries = [...group.familySlugs]
        .map((slug) => technologyMap.get(slug))
        .filter(Boolean)
        .sort((left, right) => {
          const maturityRank = { GA: 0, Mixed: 1, Preview: 2, Deprecated: 3 };

          return (
            maturityRank[left.maturityBucket] - maturityRank[right.maturityBucket] ||
            right.highSeverityCount - left.highSeverityCount ||
            left.technology.localeCompare(right.technology)
          );
        });
      const gaFamilyCount = familySummaries.filter((family) => family.maturityBucket === "GA").length;
      const previewFamilyCount = familySummaries.filter(
        (family) => family.maturityBucket === "Preview"
      ).length;
      const mixedFamilyCount = familySummaries.filter((family) => family.maturityBucket === "Mixed").length;
      const deprecatedFamilyCount = familySummaries.filter(
        (family) => family.maturityBucket === "Deprecated"
      ).length;
      const highSeverityCount = group.items.filter((item) => item.severity === "High").length;
      const descriptionParts = [];

      if (gaFamilyCount > 0) {
        descriptionParts.push(`${gaFamilyCount} GA-ready families can anchor the baseline`);
      }

      if (previewFamilyCount > 0 || mixedFamilyCount > 0) {
        descriptionParts.push(
          `${previewFamilyCount + mixedFamilyCount} lower-confidence families broaden design coverage`
        );
      }

      if (deprecatedFamilyCount > 0) {
        descriptionParts.push(`${deprecatedFamilyCount} deprecated family remains for context`);
      }

      let whatThisMeans = "Use the related checklist families in maturity order and keep source traceability visible.";

      if (gaFamilyCount > 0 && previewFamilyCount > 0) {
        whatThisMeans =
          "Start with the GA-ready families for this service, then widen into preview guidance only when the review question requires more depth.";
      } else if (gaFamilyCount > 0) {
        whatThisMeans =
          "This service has a usable GA-ready baseline. Start there before branching into broader cross-service guidance.";
      } else if (previewFamilyCount > 0 || mixedFamilyCount > 0) {
        whatThisMeans =
          "This service is covered mainly by preview or mixed-confidence guidance. Use it for specialist review with explicit validation.";
      } else if (deprecatedFamilyCount > 0) {
        whatThisMeans =
          "This service is represented only by deprecated guidance and should be treated as historical context, not a current baseline.";
      }

      const descriptionSuffix =
        descriptionParts.length > 0 ? ` ${descriptionParts.join(". ")}.` : "";
      const regionalFit = buildServiceRegionalFit(
        {
          service,
          aliases: [...group.aliases]
        },
        availabilityRows,
        publicRegions,
        availabilityOfferingLookup
      );

      return {
        slug: slugify(service),
        service,
        aliases: [...group.aliases].sort((left, right) => left.localeCompare(right)).slice(0, 8),
        itemCount: group.items.length,
        highSeverityCount,
        familyCount: familySummaries.length,
        gaFamilyCount,
        previewFamilyCount,
        mixedFamilyCount,
        deprecatedFamilyCount,
        categories: collectUnique(group.items, (item) => item.category),
        wafPillars: collectUnique(group.items, (item) => item.waf),
        description: cleanDisplayText(
          `${service} appears across ${group.items.length} normalized findings in ${familySummaries.length} checklist families.${descriptionSuffix}`
        ),
        whatThisMeans,
        regionalFitSummary: summarizeRegionalFit(regionalFit),
        families: familySummaries.map((family) => ({
          slug: family.slug,
          technology: family.technology,
          status: family.status,
          maturityBucket: family.maturityBucket,
          itemCount: family.itemCount,
          highSeverityCount: family.highSeverityCount,
          quality: family.quality
        }))
      };
    })
    .sort((left, right) =>
      right.gaFamilyCount - left.gaFamilyCount ||
      right.itemCount - left.itemCount ||
      left.service.localeCompare(right.service)
    );

  for (const service of services) {
    const regionalFit = buildServiceRegionalFit(
      {
        service: service.service,
        aliases: service.aliases
      },
      availabilityRows,
      publicRegions,
      availabilityOfferingLookup
    );
    const serviceItems = allItems
      .filter((item) => (item.serviceCanonical ?? item.service) === service.service)
      .sort((left, right) => {
        const severityRank = { High: 0, Medium: 1, Low: 2 };

        return (
          (severityRank[left.severity] ?? 3) - (severityRank[right.severity] ?? 3) ||
          left.technology.localeCompare(right.technology) ||
          left.text.localeCompare(right.text)
        );
      });

    await writeJson(path.join(serviceDir, `${service.slug}.json`), {
      generatedAt,
      service,
      items: serviceItems,
      regionalFit
    });
  }

  const summary = {
    generatedAt,
    itemCount: allItems.length,
    technologyCount: technologies.length,
    gaDefaultTechnologyCount: gaTechnologies.length,
    gaReadyItemCount: gaTechnologies.reduce((total, technology) => total + technology.itemCount, 0),
    previewTechnologyCount: previewTechnologies.length,
    mixedTechnologyCount: mixedTechnologies.length,
    deprecatedTechnologyCount: deprecatedTechnologies.length,
    metrics: [
      {
        label: "GA-ready families",
        value: gaTechnologies.length,
        detail: "Default executive view should start here before widening into lower-confidence content."
      },
      {
        label: "GA-ready items",
        value: gaTechnologies.reduce((total, technology) => total + technology.itemCount, 0),
        detail: "Mature guidance that can anchor architecture reviews and leadership briefings."
      },
      {
        label: "High-severity findings",
        value: allItems.filter((item) => item.severity === "High").length,
        detail: "Risk signal across the full catalog, including preview and mixed-confidence families."
      },
      {
        label: "Executive watchlist families",
        value: previewTechnologies.length + mixedTechnologies.length + deprecatedTechnologies.length,
        detail: "Families that need extra judgment, validation, or retirement planning before heavy reliance."
      }
    ],
    severityDistribution: summarizeCounts(allItems.map((item) => item.severity ?? "Unspecified")),
    statusDistribution: summarizeCounts(technologies.map((technology) => technology.status)),
    maturityDistribution: summarizeCounts(
      technologies.map((technology) => technology.maturityBucket)
    ),
    sourceDistribution: summarizeCounts(technologies.map((technology) => technology.sourceKind)),
    wafDistribution: summarizeCounts(allItems.map((item) => item.waf ?? "Unspecified")),
    topTechnologies: summarizeCounts(allItems.map((item) => item.technology)).slice(0, 10),
    technologies: technologies.sort((left, right) =>
      left.technology.localeCompare(right.technology)
    )
  };

  await writeJson(path.join(outputDir, "catalog.json"), {
    generatedAt,
    items: allItems
  });
  await writeJson(path.join(outputDir, "summary.json"), summary);
  await writeJson(path.join(outputDir, "technology-index.json"), {
    generatedAt,
    technologies: summary.technologies
  });
  await writeJson(path.join(outputDir, "service-index.json"), {
    generatedAt,
    services
  });
  await writeJson(path.join(outputDir, "regions.json"), {
    generatedAt,
    regionsSourceUrl,
    availabilitySourceUrl,
    regions: publicRegions
  });
}

generate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
