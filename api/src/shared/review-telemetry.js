const { randomUUID } = require("node:crypto");
const { hasRole } = require("./admin-auth");
const { getTableClient } = require("./table-storage");

const REVIEW_TELEMETRY_TABLE_NAME =
  process.env.AZURE_STORAGE_TELEMETRY_TABLE_NAME || "reviewtelemetry";

const VALID_EVENT_NAMES = new Set([
  "homepage_initialize_review",
  "review_create",
  "review_save_details",
  "review_scope_change",
  "review_export_download",
  "review_cloud_action",
  "admin_prompt_submit"
]);

const VALID_EVENT_CATEGORIES = new Set([
  "homepage",
  "review-workspace",
  "continuity",
  "admin"
]);

function isStorageConfigured() {
  return Boolean(process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage);
}

function normalizeString(value, maxLength = 160) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function normalizeRoute(value) {
  const route = normalizeString(value, 240);

  if (!route) {
    return "/";
  }

  return route.startsWith("/") ? route : `/${route}`;
}

function normalizePropertyValue(value) {
  if (typeof value === "string") {
    return value.trim().slice(0, 240);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value === null) {
    return "null";
  }

  return "";
}

function normalizeProperties(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  return Object.entries(input).reduce((accumulator, [rawKey, rawValue]) => {
    const key = normalizeString(rawKey, 64)
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 64);
    const value = normalizePropertyValue(rawValue);

    if (!key || !value) {
      return accumulator;
    }

    accumulator[key] = value;
    return accumulator;
  }, {});
}

function normalizeTelemetryEvent(payload) {
  const name = normalizeString(payload?.name, 80);
  const category = normalizeString(payload?.category, 40);

  if (!VALID_EVENT_NAMES.has(name)) {
    throw new Error("Telemetry event name is invalid.");
  }

  if (!VALID_EVENT_CATEGORIES.has(category)) {
    throw new Error("Telemetry event category is invalid.");
  }

  return {
    name,
    category,
    route: normalizeRoute(payload?.route),
    sessionId: normalizeString(payload?.sessionId, 120) || null,
    reviewId: normalizeString(payload?.reviewId, 160) || null,
    properties: normalizeProperties(payload?.properties)
  };
}

function resolveActor(principal) {
  if (!principal?.userId) {
    return "anonymous";
  }

  if (hasRole(principal, "admin")) {
    return "admin";
  }

  return "authenticated";
}

function buildTelemetryEntity(event, principal) {
  const occurredAt = new Date().toISOString();
  const partitionKey = occurredAt.slice(0, 10);

  return {
    partitionKey,
    rowKey: `${occurredAt}-${randomUUID()}`,
    occurredAt,
    name: event.name,
    category: event.category,
    route: event.route,
    sessionId: event.sessionId ?? "",
    reviewId: event.reviewId ?? "",
    actor: resolveActor(principal),
    userId: normalizeString(principal?.userId, 120),
    userDetails: normalizeString(principal?.userDetails, 200),
    propertiesJson: JSON.stringify(event.properties)
  };
}

function parseProperties(propertiesJson) {
  if (!propertiesJson) {
    return {};
  }

  try {
    const parsed = JSON.parse(propertiesJson);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce((accumulator, [key, value]) => {
      accumulator[String(key)] = typeof value === "string" ? value : String(value);
      return accumulator;
    }, {});
  } catch {
    return {};
  }
}

function parseNumericProperty(properties, key) {
  const rawValue = properties[key];

  if (rawValue === undefined) {
    return 0;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createDailyRollup(date) {
  return {
    date,
    totalEvents: 0,
    reviewStarts: 0,
    reviewCreates: 0,
    servicesAdded: 0,
    exports: 0,
    cloudLoads: 0,
    cloudSaves: 0,
    adminPrompts: 0
  };
}

function incrementMapCount(map, key, fallbackLabel = "Unknown") {
  const normalizedKey = normalizeString(key || "", 120) || "unknown";
  const entry = map.get(normalizedKey) ?? {
    key: normalizedKey,
    label: normalizeString(key || "", 120) || fallbackLabel,
    count: 0
  };

  entry.count += 1;
  map.set(normalizedKey, entry);
}

function toSortedBreakdown(map) {
  return Array.from(map.values()).sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return left.label.localeCompare(right.label);
  });
}

function toRecentEvent(entity) {
  const properties = parseProperties(entity.propertiesJson);

  return {
    occurredAt: entity.occurredAt,
    name: entity.name,
    category: entity.category,
    actor: entity.actor,
    route: entity.route,
    reviewId: entity.reviewId || null,
    properties
  };
}

function summarizeTelemetryEntities(
  entities,
  {
    checkedAt = new Date().toISOString(),
    storageConfigured = true,
    windowDays = 14
  } = {}
) {
  const exportBreakdown = new Map();
  const cloudActionBreakdown = new Map();
  const dailyRollupByDate = new Map();
  const sortedEntities = [...entities].sort((left, right) =>
    String(left.occurredAt || "").localeCompare(String(right.occurredAt || ""))
  );

  let reviewStarts = 0;
  let reviewCreates = 0;
  let servicesAdded = 0;
  let exports = 0;
  let cloudLoads = 0;
  let cloudSaves = 0;
  let adminPrompts = 0;

  sortedEntities.forEach((entity) => {
    const date = normalizeString(entity.occurredAt, 32).slice(0, 10) || entity.partitionKey || checkedAt.slice(0, 10);
    const properties = parseProperties(entity.propertiesJson);
    const dailyRollup = dailyRollupByDate.get(date) ?? createDailyRollup(date);

    dailyRollup.totalEvents += 1;

    switch (entity.name) {
      case "homepage_initialize_review":
        reviewStarts += 1;
        dailyRollup.reviewStarts += 1;
        break;
      case "review_create":
        reviewCreates += 1;
        dailyRollup.reviewCreates += 1;
        break;
      case "review_scope_change": {
        const addedCount = Math.max(0, parseNumericProperty(properties, "addedCount"));

        servicesAdded += addedCount;
        dailyRollup.servicesAdded += addedCount;
        break;
      }
      case "review_export_download":
        exports += 1;
        dailyRollup.exports += 1;
        incrementMapCount(exportBreakdown, properties.artifactType, "Unknown artifact");
        break;
      case "review_cloud_action": {
        const action = properties.action || "unknown";
        incrementMapCount(cloudActionBreakdown, action, "Unknown action");

        if (["load", "resume", "restore-session", "restore-link"].includes(action)) {
          cloudLoads += 1;
          dailyRollup.cloudLoads += 1;
        }

        if (["save", "download-csv"].includes(action)) {
          cloudSaves += 1;
          dailyRollup.cloudSaves += 1;
        }

        break;
      }
      case "admin_prompt_submit":
        adminPrompts += 1;
        dailyRollup.adminPrompts += 1;
        break;
      default:
        break;
    }

    dailyRollupByDate.set(date, dailyRollup);
  });

  return {
    checkedAt,
    storageConfigured,
    windowDays,
    totalEvents: sortedEntities.length,
    metrics: [
      { key: "reviewStarts", label: "Homepage starts", count: reviewStarts },
      { key: "reviewCreates", label: "Review shells created", count: reviewCreates },
      { key: "servicesAdded", label: "Services added to scope", count: servicesAdded },
      { key: "exports", label: "Export downloads", count: exports },
      { key: "cloudLoads", label: "Cloud continuity loads", count: cloudLoads },
      { key: "cloudSaves", label: "Cloud saves and CSVs", count: cloudSaves },
      { key: "adminPrompts", label: "Admin prompts", count: adminPrompts }
    ],
    exportBreakdown: toSortedBreakdown(exportBreakdown),
    cloudActionBreakdown: toSortedBreakdown(cloudActionBreakdown),
    recentEvents: sortedEntities
      .slice(-10)
      .reverse()
      .map((entity) => toRecentEvent(entity)),
    dailyRollup: Array.from(dailyRollupByDate.values()).sort((left, right) =>
      left.date.localeCompare(right.date)
    )
  };
}

async function loadTelemetryEntities({ windowDays = 14 } = {}) {
  if (!isStorageConfigured()) {
    return [];
  }

  const checkedAt = new Date();
  const earliest = new Date(Date.UTC(
    checkedAt.getUTCFullYear(),
    checkedAt.getUTCMonth(),
    checkedAt.getUTCDate()
  ));

  earliest.setUTCDate(earliest.getUTCDate() - Math.max(0, windowDays - 1));

  const startPartitionKey = earliest.toISOString().slice(0, 10);
  const endPartitionKey = checkedAt.toISOString().slice(0, 10);
  const client = await getTableClient(REVIEW_TELEMETRY_TABLE_NAME);
  const results = [];

  for await (const entity of client.listEntities({
    queryOptions: {
      filter: `PartitionKey ge '${startPartitionKey}' and PartitionKey le '${endPartitionKey}'`
    }
  })) {
    results.push(entity);
  }

  return results;
}

async function recordTelemetryEvent(payload, principal) {
  const normalized = normalizeTelemetryEvent(payload);

  if (!isStorageConfigured()) {
    return {
      recorded: false,
      storageConfigured: false,
      event: normalized
    };
  }

  const entity = buildTelemetryEntity(normalized, principal);
  const client = await getTableClient(REVIEW_TELEMETRY_TABLE_NAME);

  await client.createEntity({
    partitionKey: entity.partitionKey,
    rowKey: entity.rowKey,
    occurredAt: entity.occurredAt,
    name: entity.name,
    category: entity.category,
    route: entity.route,
    sessionId: entity.sessionId,
    reviewId: entity.reviewId,
    actor: entity.actor,
    userId: entity.userId,
    userDetails: entity.userDetails,
    propertiesJson: entity.propertiesJson
  });

  return {
    recorded: true,
    storageConfigured: true,
    event: normalized
  };
}

async function loadTelemetrySummary({ windowDays = 14 } = {}) {
  const checkedAt = new Date().toISOString();

  if (!isStorageConfigured()) {
    return summarizeTelemetryEntities([], {
      checkedAt,
      storageConfigured: false,
      windowDays
    });
  }

  const entities = await loadTelemetryEntities({ windowDays });

  return summarizeTelemetryEntities(entities, {
    checkedAt,
    storageConfigured: true,
    windowDays
  });
}

module.exports = {
  REVIEW_TELEMETRY_TABLE_NAME,
  isStorageConfigured,
  loadTelemetrySummary,
  normalizeTelemetryEvent,
  recordTelemetryEvent,
  summarizeTelemetryEntities
};
