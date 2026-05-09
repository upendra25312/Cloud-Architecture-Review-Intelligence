import {
  getEstimateInputMode,
  getServiceEstimateProfile,
  resolveEstimateInputs,
  type ServiceEstimateProfileDefinition
} from "@/lib/monthly-estimate-profiles";
import { matchesPricingTargetRegion } from "@/lib/service-pricing";
import type {
  ReviewServiceAssumption,
  ReviewServiceEstimateInputValue,
  ServiceMonthlyEstimate,
  ServiceMonthlyEstimateComponent,
  ServiceMonthlySkuEstimate,
  ServicePricing,
  ServicePricingRow
} from "@/types";

const HOURS_PER_MONTH = 730;
const DAYS_PER_MONTH = 30;

function normalizeText(value: string | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function buildSkuLabel(row: ServicePricingRow) {
  return row.skuName || row.armSkuName || "Default SKU";
}

function resolveScopedRows(
  pricing: ServicePricing,
  assumption: ReviewServiceAssumption,
  targetRegions: string[]
) {
  const effectiveTargetRegions = assumption.plannedRegion.trim()
    ? [assumption.plannedRegion.trim()]
    : targetRegions;

  if (effectiveTargetRegions.length === 0) {
    return {
      rows: pricing.rows,
      targetScopeApplied: false
    };
  }

  const targetRows = pricing.rows.filter((row) =>
    matchesPricingTargetRegion(
      row.armRegionName,
      row.location,
      effectiveTargetRegions,
      pricing.targetPricingLocations,
      row.locationKind
    )
  );

  if (targetRows.length > 0) {
    return {
      rows: targetRows,
      targetScopeApplied: true
    };
  }

  return {
    rows: pricing.rows,
    targetScopeApplied: false
  };
}

function buildRuntimeFallbackProfile(serviceSlug: string): ServiceEstimateProfileDefinition {
  return {
    serviceSlug,
    label: "Baseline recurring estimate",
    description:
      "Fallback recurring estimate using the lowest valid recurring meter when a service profile has not been explicitly mapped yet.",
    version: "runtime-fallback",
    coverage: "base-only",
    mode: "recurring-base-only",
    inputDefinitions: [
      {
        key: "unitCount",
        label: "Unit count",
        description: "How many recurring units should be estimated.",
        kind: "number",
        unit: "units",
        min: 0,
        step: 1,
        defaultValue: 1
      }
    ],
    strategy: "recurring-base",
    defaultNotes: [
      "No explicit service profile exists yet, so the estimate falls back to the lowest recurring retail meter."
    ]
  };
}

function getNumericInput(
  inputs: Record<string, ReviewServiceEstimateInputValue>,
  key: string,
  fallback = 0
) {
  const value = inputs[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function getStringInput(
  inputs: Record<string, ReviewServiceEstimateInputValue>,
  key: string,
  fallback = ""
) {
  const value = inputs[key];

  if (typeof value === "string" && value.trim()) {
    return value;
  }

  return fallback;
}

function isUsageMeter(row: ServicePricingRow) {
  const meterName = normalizeText(row.meterName);
  const unit = normalizeText(row.unitOfMeasure);

  return (
    meterName.includes("data transfer") ||
    meterName.includes("request") ||
    meterName.includes("ruleset") ||
    meterName.includes("routing rules") ||
    meterName.includes("bot protection") ||
    meterName.includes("transaction") ||
    meterName.includes("ingestion") ||
    meterName.includes("query") ||
    meterName.includes("queries") ||
    meterName.includes("message") ||
    meterName.includes("event") ||
    meterName.includes("bandwidth") ||
    meterName.includes("throughput") ||
    meterName.includes("storage") ||
    meterName.includes("capacity") ||
    unit.includes("gb") ||
    unit.includes("tb") ||
    unit.includes("10k") ||
    unit.includes("100k") ||
    unit.includes("1m") ||
    unit.includes("million") ||
    unit.includes("second")
  );
}

function toMonthlyCost(row: ServicePricingRow, quantity: number) {
  const unit = normalizeText(row.unitOfMeasure);

  if (unit.includes("hour")) {
    return row.retailPrice * quantity * HOURS_PER_MONTH;
  }

  if (unit.includes("day")) {
    return row.retailPrice * quantity * DAYS_PER_MONTH;
  }

  if (unit.includes("year")) {
    return (row.retailPrice * quantity) / 12;
  }

  return row.retailPrice * quantity;
}

function toHourlyCost(row: ServicePricingRow, quantity: number) {
  const unit = normalizeText(row.unitOfMeasure);

  if (unit.includes("hour")) {
    return row.retailPrice * quantity;
  }

  return toMonthlyCost(row, quantity) / HOURS_PER_MONTH;
}

function buildComponent(
  label: string,
  row: ServicePricingRow,
  quantity: number,
  formulaKey: string
): ServiceMonthlyEstimateComponent {
  return {
    label,
    meterId: row.meterId,
    meterName: row.meterName,
    skuName: buildSkuLabel(row),
    location: row.location || row.armRegionName || "Global",
    unitOfMeasure: row.unitOfMeasure,
    quantity,
    hourlyCost: toHourlyCost(row, quantity),
    monthlyCost: toMonthlyCost(row, quantity),
    formulaKey
  };
}

function sortRowsByRecurringCost(left: ServicePricingRow, right: ServicePricingRow) {
  const leftCost = toMonthlyCost(left, 1);
  const rightCost = toMonthlyCost(right, 1);

  if (leftCost !== rightCost) {
    return leftCost - rightCost;
  }

  return left.meterName.localeCompare(right.meterName);
}

function findRecurringBaseRow(rows: ServicePricingRow[]) {
  return rows
    .filter((row) => row.retailPrice > 0)
    .filter((row) => {
      const unit = normalizeText(row.unitOfMeasure);
      return unit.includes("month") || unit.includes("hour") || unit.includes("day");
    })
    .filter((row) => !isUsageMeter(row))
    .sort(sortRowsByRecurringCost)[0];
}

function sortRowsByUnitPrice(left: ServicePricingRow, right: ServicePricingRow) {
  if (left.retailPrice !== right.retailPrice) {
    return left.retailPrice - right.retailPrice;
  }

  return left.meterName.localeCompare(right.meterName);
}

function findMatchingRow(
  rows: ServicePricingRow[],
  meterPatterns: RegExp[],
  unitHints: string[] = []
) {
  return rows
    .filter((row) => row.retailPrice > 0)
    .filter((row) => meterPatterns.some((pattern) => pattern.test(row.meterName)))
    .filter((row) =>
      unitHints.length === 0
        ? true
        : unitHints.some((hint) => normalizeText(row.unitOfMeasure).includes(hint))
    )
    .sort(sortRowsByUnitPrice)[0];
}

function convertCountToPricingQuantity(count: number, unitOfMeasure: string) {
  const unit = normalizeText(unitOfMeasure);

  if (unit.includes("10k")) {
    return count / 10000;
  }

  if (unit.includes("100k")) {
    return count / 100000;
  }

  if (unit.includes("1m") || unit.includes("million")) {
    return count / 1000000;
  }

  if (unit.includes("1k") || unit.includes("1000")) {
    return count / 1000;
  }

  return count;
}

function convertDataToPricingQuantity(gb: number, unitOfMeasure: string) {
  const unit = normalizeText(unitOfMeasure);

  if (unit.includes("tb")) {
    return gb / 1024;
  }

  if (unit.includes("mb")) {
    return gb * 1024;
  }

  return gb;
}

function convertSecondsToPricingQuantity(seconds: number, unitOfMeasure: string) {
  const unit = normalizeText(unitOfMeasure);
  const normalized = unit.replaceAll(",", "");
  const match = normalized.match(/(\d+)\s*seconds?/i);

  if (match) {
    return seconds / Number(match[1]);
  }

  if (unit.includes("hour")) {
    return seconds / 3600;
  }

  return seconds;
}

function groupRowsBySku(rows: ServicePricingRow[]) {
  const grouped = new Map<string, ServicePricingRow[]>();

  rows.forEach((row) => {
    const key = buildSkuLabel(row);
    const current = grouped.get(key) ?? [];

    current.push(row);
    grouped.set(key, current);
  });

  return grouped;
}

function groupRowsByKey(rows: ServicePricingRow[], getKey: (row: ServicePricingRow) => string) {
  const grouped = new Map<string, ServicePricingRow[]>();

  rows.forEach((row) => {
    const key = getKey(row);

    if (!key) {
      return;
    }

    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  });

  return grouped;
}

function sumComponents(components: ServiceMonthlyEstimateComponent[]) {
  return components.reduce(
    (accumulator, component) => ({
      hourlyCost: accumulator.hourlyCost + component.hourlyCost,
      monthlyCost: accumulator.monthlyCost + component.monthlyCost
    }),
    {
      hourlyCost: 0,
      monthlyCost: 0
    }
  );
}

function buildInputAssumptions(
  profile: ServiceEstimateProfileDefinition,
  inputs: Record<string, ReviewServiceEstimateInputValue>
) {
  return profile.inputDefinitions.map((definition) => {
    const value = inputs[definition.key] ?? definition.defaultValue;
    return `${definition.label}: ${value}${definition.unit ? ` ${definition.unit}` : ""}`;
  });
}

function buildRecurringBaseEstimate(
  skuName: string,
  rows: ServicePricingRow[],
  profile: ServiceEstimateProfileDefinition,
  inputs: Record<string, ReviewServiceEstimateInputValue>,
  preferredSku: string
) {
  const baseRow = findRecurringBaseRow(rows);

  if (!baseRow) {
    return null;
  }

  const unitCount = Math.max(0, getNumericInput(inputs, "unitCount", 1));
  const components = [buildComponent("Recurring base", baseRow, unitCount, "recurring-base")];
  const totals = sumComponents(components);

  return {
    skuName,
    hourlyCost: totals.hourlyCost,
    monthlyCost: totals.monthlyCost,
    assumptions: buildInputAssumptions(profile, inputs),
    notes: profile.defaultNotes,
    components,
    isPreferred:
      preferredSku.length > 0 && normalizeText(skuName).includes(normalizeText(preferredSku))
  } satisfies ServiceMonthlySkuEstimate;
}

function buildTrafficEstimate(
  skuName: string,
  rows: ServicePricingRow[],
  profile: ServiceEstimateProfileDefinition,
  inputs: Record<string, ReviewServiceEstimateInputValue>,
  preferredSku: string
) {
  const unitCount = Math.max(0, getNumericInput(inputs, "unitCount", 1));
  const clientEgressGb = Math.max(0, getNumericInput(inputs, "clientEgressGb", 5));
  const originEgressGb = Math.max(0, getNumericInput(inputs, "originEgressGb", 5));
  const monthlyOperations = Math.max(0, getNumericInput(inputs, "monthlyOperations", 0));
  const baseRow = findRecurringBaseRow(rows);
  const transferOutRow = findMatchingRow(rows, [/data transfer out/i, /outbound/i, /bandwidth out/i, /data processed/i], ["gb", "tb"]);
  const transferInRow = findMatchingRow(rows, [/data transfer in/i, /origin/i, /bandwidth in/i, /inbound/i], ["gb", "tb"]);
  const requestRow = findMatchingRow(rows, [/request/i, /transaction/i, /operation/i, /ruleset/i, /routing/i], ["10k", "100k", "1m", "million"]);

  if (!baseRow && !transferOutRow && !transferInRow && !requestRow) {
    return null;
  }

  const components: ServiceMonthlyEstimateComponent[] = [];

  if (baseRow) {
    components.push(buildComponent("Recurring edge or gateway base", baseRow, unitCount, "base"));
  }

  if (transferOutRow) {
    components.push(
      buildComponent(
        "Client egress",
        transferOutRow,
        convertDataToPricingQuantity(clientEgressGb, transferOutRow.unitOfMeasure),
        "data-transfer-out"
      )
    );
  }

  if (transferInRow) {
    components.push(
      buildComponent(
        "Origin egress",
        transferInRow,
        convertDataToPricingQuantity(originEgressGb, transferInRow.unitOfMeasure),
        "data-transfer-in"
      )
    );
  }

  if (requestRow && monthlyOperations > 0) {
    components.push(
      buildComponent(
        "Requests or operations",
        requestRow,
        convertCountToPricingQuantity(monthlyOperations, requestRow.unitOfMeasure),
        "operations"
      )
    );
  }

  const totals = sumComponents(components);

  return {
    skuName,
    hourlyCost: totals.hourlyCost,
    monthlyCost: totals.monthlyCost,
    assumptions: buildInputAssumptions(profile, inputs),
    notes: profile.defaultNotes,
    components,
    isPreferred:
      preferredSku.length > 0 && normalizeText(skuName).includes(normalizeText(preferredSku))
  } satisfies ServiceMonthlySkuEstimate;
}

function buildStorageEstimate(
  skuName: string,
  rows: ServicePricingRow[],
  profile: ServiceEstimateProfileDefinition,
  inputs: Record<string, ReviewServiceEstimateInputValue>,
  preferredSku: string
) {
  const capacityGb = Math.max(0, getNumericInput(inputs, "capacityGb", 100));
  const monthlyOperations = Math.max(0, getNumericInput(inputs, "monthlyOperations", 0));
  const baseRow = findRecurringBaseRow(rows);
  const capacityRow = findMatchingRow(rows, [/storage/i, /capacity/i, /data stored/i], ["gb", "tb", "month"]);
  const operationRow = findMatchingRow(rows, [/transaction/i, /operation/i, /read/i, /write/i, /list/i], ["10k", "100k", "1m", "million"]);

  if (!capacityRow && !baseRow) {
    return null;
  }

  const components: ServiceMonthlyEstimateComponent[] = [];

  if (baseRow) {
    components.push(buildComponent("Recurring storage base", baseRow, 1, "base"));
  }

  if (capacityRow) {
    components.push(
      buildComponent(
        "Stored capacity",
        capacityRow,
        convertDataToPricingQuantity(capacityGb, capacityRow.unitOfMeasure),
        "capacity"
      )
    );
  }

  if (operationRow && monthlyOperations > 0) {
    components.push(
      buildComponent(
        "Transactions or operations",
        operationRow,
        convertCountToPricingQuantity(monthlyOperations, operationRow.unitOfMeasure),
        "operations"
      )
    );
  }

  const totals = sumComponents(components);

  return {
    skuName,
    hourlyCost: totals.hourlyCost,
    monthlyCost: totals.monthlyCost,
    assumptions: buildInputAssumptions(profile, inputs),
    notes: profile.defaultNotes,
    components,
    isPreferred:
      preferredSku.length > 0 && normalizeText(skuName).includes(normalizeText(preferredSku))
  } satisfies ServiceMonthlySkuEstimate;
}

function buildIngestionEstimate(
  skuName: string,
  rows: ServicePricingRow[],
  profile: ServiceEstimateProfileDefinition,
  inputs: Record<string, ReviewServiceEstimateInputValue>,
  preferredSku: string
) {
  const monthlyDataGb = Math.max(0, getNumericInput(inputs, "monthlyDataGb", 5));
  const baseRow = findRecurringBaseRow(rows);
  const ingestionRow = findMatchingRow(rows, [/ingestion/i, /telemetry/i, /data volume/i, /analyzed/i, /logs ingested/i], ["gb", "tb"]);

  if (!baseRow && !ingestionRow) {
    return null;
  }

  const components: ServiceMonthlyEstimateComponent[] = [];

  if (baseRow) {
    components.push(buildComponent("Recurring platform base", baseRow, 1, "base"));
  }

  if (ingestionRow) {
    components.push(
      buildComponent(
        "Data ingestion",
        ingestionRow,
        convertDataToPricingQuantity(monthlyDataGb, ingestionRow.unitOfMeasure),
        "ingestion"
      )
    );
  }

  const totals = sumComponents(components);

  return {
    skuName,
    hourlyCost: totals.hourlyCost,
    monthlyCost: totals.monthlyCost,
    assumptions: buildInputAssumptions(profile, inputs),
    notes: profile.defaultNotes,
    components,
    isPreferred:
      preferredSku.length > 0 && normalizeText(skuName).includes(normalizeText(preferredSku))
  } satisfies ServiceMonthlySkuEstimate;
}

function buildRequestEstimate(
  skuName: string,
  rows: ServicePricingRow[],
  profile: ServiceEstimateProfileDefinition,
  inputs: Record<string, ReviewServiceEstimateInputValue>,
  preferredSku: string
) {
  const unitCount = Math.max(0, getNumericInput(inputs, "unitCount", 1));
  const monthlyOperations = Math.max(0, getNumericInput(inputs, "monthlyOperations", 100000));
  const baseRow = findRecurringBaseRow(rows);
  const operationRow = findMatchingRow(rows, [/request/i, /transaction/i, /operation/i, /message/i, /event/i, /api call/i], ["10k", "100k", "1m", "million"]);

  if (!baseRow && !operationRow) {
    return null;
  }

  const components: ServiceMonthlyEstimateComponent[] = [];

  if (baseRow) {
    components.push(buildComponent("Recurring unit base", baseRow, unitCount, "base"));
  }

  if (operationRow) {
    components.push(
      buildComponent(
        "Requests or operations",
        operationRow,
        convertCountToPricingQuantity(monthlyOperations, operationRow.unitOfMeasure),
        "operations"
      )
    );
  }

  const totals = sumComponents(components);

  return {
    skuName,
    hourlyCost: totals.hourlyCost,
    monthlyCost: totals.monthlyCost,
    assumptions: buildInputAssumptions(profile, inputs),
    notes: profile.defaultNotes,
    components,
    isPreferred:
      preferredSku.length > 0 && normalizeText(skuName).includes(normalizeText(preferredSku))
  } satisfies ServiceMonthlySkuEstimate;
}

function buildServerlessEstimate(
  skuName: string,
  rows: ServicePricingRow[],
  profile: ServiceEstimateProfileDefinition,
  inputs: Record<string, ReviewServiceEstimateInputValue>,
  preferredSku: string
) {
  const monthlyExecutions = Math.max(0, getNumericInput(inputs, "monthlyExecutions", 100000));
  const executionGbSeconds = Math.max(0, getNumericInput(inputs, "executionGbSeconds", 100000));
  const executionRow = findMatchingRow(rows, [/execution/i, /request/i, /run/i], ["10k", "100k", "1m", "million"]);
  const durationRow = findMatchingRow(rows, [/gb.?s/i, /gb-second/i, /duration/i, /execution time/i], ["second", "100 seconds", "hour"]);
  const baseRow = findRecurringBaseRow(rows);

  if (!executionRow && !durationRow && !baseRow) {
    return null;
  }

  const components: ServiceMonthlyEstimateComponent[] = [];

  if (baseRow) {
    components.push(buildComponent("Recurring platform base", baseRow, 1, "base"));
  }

  if (executionRow) {
    components.push(
      buildComponent(
        "Executions",
        executionRow,
        convertCountToPricingQuantity(monthlyExecutions, executionRow.unitOfMeasure),
        "executions"
      )
    );
  }

  if (durationRow) {
    components.push(
      buildComponent(
        "Execution GB-seconds",
        durationRow,
        convertSecondsToPricingQuantity(executionGbSeconds, durationRow.unitOfMeasure),
        "execution-duration"
      )
    );
  }

  const totals = sumComponents(components);

  return {
    skuName,
    hourlyCost: totals.hourlyCost,
    monthlyCost: totals.monthlyCost,
    assumptions: buildInputAssumptions(profile, inputs),
    notes: profile.defaultNotes,
    components,
    isPreferred:
      preferredSku.length > 0 && normalizeText(skuName).includes(normalizeText(preferredSku))
  } satisfies ServiceMonthlySkuEstimate;
}

function buildContainerAppsEstimate(
  skuName: string,
  rows: ServicePricingRow[],
  profile: ServiceEstimateProfileDefinition,
  inputs: Record<string, ReviewServiceEstimateInputValue>,
  preferredSku: string
) {
  const vCpuPerReplica = Math.max(0, getNumericInput(inputs, "vCpuPerReplica", 0.5));
  const memoryGiBPerReplica = Math.max(0, getNumericInput(inputs, "memoryGiBPerReplica", 1));
  const averageReplicas = Math.max(0, getNumericInput(inputs, "averageReplicas", 1));
  const activeHoursPerMonth = Math.max(0, getNumericInput(inputs, "activeHoursPerMonth", HOURS_PER_MONTH));
  const monthlyOperations = Math.max(0, getNumericInput(inputs, "monthlyOperations", 100000));
  const vCpuRow = findMatchingRow(rows, [/vcpu/i, /cpu/i], ["second", "hour"]);
  const memoryRow = findMatchingRow(rows, [/memory/i, /gib/i], ["second", "hour"]);
  const requestRow = findMatchingRow(rows, [/request/i], ["10k", "100k", "1m", "million"]);
  const baseRow = findRecurringBaseRow(rows);

  if (!vCpuRow && !memoryRow && !baseRow) {
    return null;
  }

  const replicaSeconds = averageReplicas * activeHoursPerMonth * 3600;
  const components: ServiceMonthlyEstimateComponent[] = [];

  if (baseRow) {
    components.push(buildComponent("Recurring environment base", baseRow, 1, "base"));
  }

  if (vCpuRow) {
    components.push(
      buildComponent(
        "vCPU duration",
        vCpuRow,
        convertSecondsToPricingQuantity(vCpuPerReplica * replicaSeconds, vCpuRow.unitOfMeasure),
        "vcpu-duration"
      )
    );
  }

  if (memoryRow) {
    components.push(
      buildComponent(
        "Memory duration",
        memoryRow,
        convertSecondsToPricingQuantity(memoryGiBPerReplica * replicaSeconds, memoryRow.unitOfMeasure),
        "memory-duration"
      )
    );
  }

  if (requestRow) {
    components.push(
      buildComponent(
        "Requests",
        requestRow,
        convertCountToPricingQuantity(monthlyOperations, requestRow.unitOfMeasure),
        "requests"
      )
    );
  }

  const totals = sumComponents(components);

  return {
    skuName,
    hourlyCost: totals.hourlyCost,
    monthlyCost: totals.monthlyCost,
    assumptions: buildInputAssumptions(profile, inputs),
    notes: profile.defaultNotes,
    components,
    isPreferred:
      preferredSku.length > 0 && normalizeText(skuName).includes(normalizeText(preferredSku))
  } satisfies ServiceMonthlySkuEstimate;
}

function buildAzureOpenAiEstimates(
  rows: ServicePricingRow[],
  profile: ServiceEstimateProfileDefinition,
  assumption: ReviewServiceAssumption
) {
  const inputs = resolveEstimateInputs(profile, assumption);
  const inputTokens = Math.max(0, getNumericInput(inputs, "inputTokensMillions", 1) * 1000000);
  const cachedInputTokens = Math.max(
    0,
    getNumericInput(inputs, "cachedInputTokensMillions", 0) * 1000000
  );
  const outputTokens = Math.max(0, getNumericInput(inputs, "outputTokensMillions", 0.25) * 1000000);
  const grouped = groupRowsByKey(rows, (row) => row.productName || buildSkuLabel(row));
  const preferredSku = assumption.preferredSku.trim();

  const skuEstimates = [...grouped.entries()]
    .map(([skuName, skuRows]) => {
      const inputRow = findMatchingRow(skuRows, [/\binp\b/i], ["1m", "million", "1k"]);
      const cachedInputRow = findMatchingRow(skuRows, [/cd inp/i, /cached/i], ["1m", "million", "1k"]);
      const outputRow = findMatchingRow(skuRows, [/\bopt\b/i, /output/i], ["1m", "million", "1k"]);

      if (!inputRow && !cachedInputRow && !outputRow) {
        return null;
      }

      const components: ServiceMonthlyEstimateComponent[] = [];

      if (inputRow && inputTokens > 0) {
        components.push(
          buildComponent(
            "Input tokens",
            inputRow,
            convertCountToPricingQuantity(inputTokens, inputRow.unitOfMeasure),
            "input-tokens"
          )
        );
      }

      if (cachedInputRow && cachedInputTokens > 0) {
        components.push(
          buildComponent(
            "Cached input tokens",
            cachedInputRow,
            convertCountToPricingQuantity(cachedInputTokens, cachedInputRow.unitOfMeasure),
            "cached-input-tokens"
          )
        );
      }

      if (outputRow && outputTokens > 0) {
        components.push(
          buildComponent(
            "Output tokens",
            outputRow,
            convertCountToPricingQuantity(outputTokens, outputRow.unitOfMeasure),
            "output-tokens"
          )
        );
      }

      if (components.length === 0) {
        return null;
      }

      const totals = sumComponents(components);

      return {
        skuName,
        hourlyCost: totals.hourlyCost,
        monthlyCost: totals.monthlyCost,
        assumptions: buildInputAssumptions(profile, inputs),
        notes: profile.defaultNotes,
        components,
        isPreferred:
          preferredSku.length > 0 && normalizeText(skuName).includes(normalizeText(preferredSku))
      } satisfies ServiceMonthlySkuEstimate;
    })
    .filter(Boolean)
    .sort((left, right) => left!.monthlyCost - right!.monthlyCost) as ServiceMonthlySkuEstimate[];

  return {
    mode: profile.mode,
    coverage: profile.coverage,
    notes: profile.defaultNotes,
    inputs,
    skuEstimates
  };
}

function buildAksEstimates(
  rows: ServicePricingRow[],
  profile: ServiceEstimateProfileDefinition,
  assumption: ReviewServiceAssumption
) {
  const inputs = resolveEstimateInputs(profile, assumption);
  const clusterCount = Math.max(0, getNumericInput(inputs, "clusterCount", 1));
  const workerNodeCount = Math.max(0, getNumericInput(inputs, "workerNodeCount", 3));
  const nodeHoursPerMonth = Math.max(0, getNumericInput(inputs, "nodeHoursPerMonth", HOURS_PER_MONTH));
  const workerProfile = getStringInput(inputs, "workerProfile", "general-purpose");
  const controlPlaneRow = findMatchingRow(rows, [/hosted control plane/i], ["hour"]);
  const workerProfiles = [
    { skuName: "Automatic - General Purpose", match: /general purpose/i, value: "general-purpose" },
    { skuName: "Automatic - Compute Optimized", match: /compute optimized/i, value: "compute-optimized" },
    { skuName: "Automatic - Memory Optimized", match: /memory optimized/i, value: "memory-optimized" },
    { skuName: "Automatic - Storage Optimized", match: /storage optimized/i, value: "storage-optimized" },
    { skuName: "Automatic - Confidential Compute", match: /confidential compute/i, value: "confidential-compute" },
    { skuName: "Automatic - GPU Accelerated", match: /gpu accelerated/i, value: "gpu-accelerated" },
    { skuName: "Automatic - High Performance Compute", match: /high performance compute/i, value: "high-performance-compute" }
  ];
  const preferredSku = assumption.preferredSku.trim();
  const skuEstimates = workerProfiles
    .map((profileOption) => {
      const workerRow = findMatchingRow(rows, [profileOption.match], ["hour"]);

      if (!controlPlaneRow && !workerRow) {
        return null;
      }

      const components: ServiceMonthlyEstimateComponent[] = [];

      if (controlPlaneRow && clusterCount > 0) {
        components.push(buildComponent("Hosted control plane", controlPlaneRow, clusterCount, "control-plane"));
      }

      if (workerRow && workerNodeCount > 0 && nodeHoursPerMonth > 0) {
        components.push(
          buildComponent(
            "Worker profile",
            workerRow,
            clusterCount * workerNodeCount * (nodeHoursPerMonth / HOURS_PER_MONTH),
            "worker-profile"
          )
        );
      }

      if (components.length === 0) {
        return null;
      }

      const totals = sumComponents(components);

      return {
        skuName: profileOption.skuName,
        hourlyCost: totals.hourlyCost,
        monthlyCost: totals.monthlyCost,
        assumptions: buildInputAssumptions(profile, inputs),
        notes: profile.defaultNotes,
        components,
        isPreferred:
          (preferredSku.length > 0 && normalizeText(profileOption.skuName).includes(normalizeText(preferredSku))) ||
          workerProfile === profileOption.value
      } satisfies ServiceMonthlySkuEstimate;
    })
    .filter(Boolean) as ServiceMonthlySkuEstimate[];

  return {
    mode: profile.mode,
    coverage: profile.coverage,
    notes: profile.defaultNotes,
    inputs,
    skuEstimates
  };
}

function buildSqlDatabaseEstimates(
  rows: ServicePricingRow[],
  profile: ServiceEstimateProfileDefinition,
  assumption: ReviewServiceAssumption
) {
  const inputs = resolveEstimateInputs(profile, assumption);
  const computeUnits = Math.max(0, getNumericInput(inputs, "computeUnits", 2));
  const activeHoursPerMonth = Math.max(0, getNumericInput(inputs, "activeHoursPerMonth", HOURS_PER_MONTH));
  const storageGb = Math.max(0, getNumericInput(inputs, "storageGb", 128));
  const backupStorageGb = Math.max(0, getNumericInput(inputs, "backupStorageGb", 0));
  const grouped = groupRowsByKey(rows, (row) => `${row.productName || buildSkuLabel(row)}|${buildSkuLabel(row)}`);
  const preferredSku = assumption.preferredSku.trim();

  const skuEstimates = [...grouped.entries()]
    .map(([groupKey, skuRows]) => {
      const [productName, skuName] = groupKey.split("|");
      const computeRow = findMatchingRow(skuRows, [/vcore/i, /edtu/i, /dtu/i], ["hour", "day"]);
      const storageRow = findMatchingRow(skuRows, [/storage/i, /data stored/i], ["gb", "tb"]);
      const backupRow = findMatchingRow(skuRows, [/backup/i], ["gb", "tb"]);

      if (!computeRow) {
        return null;
      }

      const components: ServiceMonthlyEstimateComponent[] = [
        buildComponent(
          "SQL compute",
          computeRow,
          computeRow.unitOfMeasure.toLowerCase().includes("day")
            ? computeUnits * (activeHoursPerMonth / HOURS_PER_MONTH)
            : computeUnits * (activeHoursPerMonth / HOURS_PER_MONTH),
          "sql-compute"
        )
      ];

      if (storageRow && storageGb > 0) {
        components.push(
          buildComponent(
            "Data storage",
            storageRow,
            convertDataToPricingQuantity(storageGb, storageRow.unitOfMeasure),
            "sql-storage"
          )
        );
      }

      if (backupRow && backupStorageGb > 0) {
        components.push(
          buildComponent(
            "Backup storage",
            backupRow,
            convertDataToPricingQuantity(backupStorageGb, backupRow.unitOfMeasure),
            "sql-backup"
          )
        );
      }

      const totals = sumComponents(components);

      return {
        skuName: `${productName} · ${skuName}`,
        hourlyCost: totals.hourlyCost,
        monthlyCost: totals.monthlyCost,
        assumptions: buildInputAssumptions(profile, inputs),
        notes: profile.defaultNotes,
        components,
        isPreferred:
          preferredSku.length > 0 && normalizeText(`${productName} ${skuName}`).includes(normalizeText(preferredSku))
      } satisfies ServiceMonthlySkuEstimate;
    })
    .filter(Boolean)
    .sort((left, right) => left!.monthlyCost - right!.monthlyCost) as ServiceMonthlySkuEstimate[];

  return {
    mode: profile.mode,
    coverage: profile.coverage,
    notes: profile.defaultNotes,
    inputs,
    skuEstimates
  };
}

function buildCosmosDbEstimates(
  rows: ServicePricingRow[],
  profile: ServiceEstimateProfileDefinition,
  assumption: ReviewServiceAssumption
) {
  const inputs = resolveEstimateInputs(profile, assumption);
  const autoscaleRu100Units = Math.max(0, getNumericInput(inputs, "autoscaleRu100Units", 10));
  const vCoreCount = Math.max(0, getNumericInput(inputs, "vCoreCount", 2));
  const attachedStorageUnits = Math.max(0, getNumericInput(inputs, "attachedStorageUnits", 1));
  const backupStorageGb = Math.max(0, getNumericInput(inputs, "backupStorageGb", 0));
  const preferredSku = assumption.preferredSku.trim();
  const autoscaleRows = rows.filter((row) => /autoscale/i.test(row.productName));
  const vCoreRows = rows.filter((row) => /documentdb/i.test(row.productName) || /vcore/i.test(buildSkuLabel(row)));
  const diskRow = findMatchingRow(rows, [/disk/i, /ssd/i], ["hour"]);
  const backupRow = findMatchingRow(rows, [/backup/i], ["gb", "tb"]);
  const skuEstimates: ServiceMonthlySkuEstimate[] = [];

  const ruRow = findMatchingRow(autoscaleRows, [/100 rus/i, /100 ru/i], ["hour"]);
  const entryRow = findMatchingRow(autoscaleRows, [/entry price/i], ["hour"]);

  if (ruRow || entryRow) {
    const components: ServiceMonthlyEstimateComponent[] = [];

    if (entryRow) {
      components.push(buildComponent("Autoscale base entry", entryRow, 1, "cosmos-entry"));
    }

    if (ruRow && autoscaleRu100Units > 0) {
      components.push(buildComponent("Autoscale RU capacity", ruRow, autoscaleRu100Units, "cosmos-autoscale-ru"));
    }

    if (backupRow && backupStorageGb > 0) {
      components.push(
        buildComponent(
          "Continuous backup",
          backupRow,
          convertDataToPricingQuantity(backupStorageGb, backupRow.unitOfMeasure),
          "cosmos-backup"
        )
      );
    }

    const totals = sumComponents(components);
    skuEstimates.push({
      skuName: "Cosmos DB autoscale RU",
      hourlyCost: totals.hourlyCost,
      monthlyCost: totals.monthlyCost,
      assumptions: buildInputAssumptions(profile, inputs),
      notes: profile.defaultNotes,
      components,
      isPreferred:
        preferredSku.length > 0 && normalizeText("Cosmos DB autoscale RU").includes(normalizeText(preferredSku))
    });
  }

  const vCoreRow = findMatchingRow(vCoreRows, [/vcore/i], ["hour"]);

  if (vCoreRow) {
    const components: ServiceMonthlyEstimateComponent[] = [
      buildComponent("vCore compute", vCoreRow, vCoreCount, "cosmos-vcore")
    ];

    if (diskRow && attachedStorageUnits > 0) {
      components.push(buildComponent("Attached SSD storage", diskRow, attachedStorageUnits, "cosmos-ssd"));
    }

    if (backupRow && backupStorageGb > 0) {
      components.push(
        buildComponent(
          "Continuous backup",
          backupRow,
          convertDataToPricingQuantity(backupStorageGb, backupRow.unitOfMeasure),
          "cosmos-backup"
        )
      );
    }

    const totals = sumComponents(components);
    skuEstimates.push({
      skuName: `Cosmos DB vCore · ${buildSkuLabel(vCoreRow)}`,
      hourlyCost: totals.hourlyCost,
      monthlyCost: totals.monthlyCost,
      assumptions: buildInputAssumptions(profile, inputs),
      notes: profile.defaultNotes,
      components,
      isPreferred:
        preferredSku.length > 0 && normalizeText(buildSkuLabel(vCoreRow)).includes(normalizeText(preferredSku))
    });
  }

  return {
    mode: profile.mode,
    coverage: profile.coverage,
    notes: profile.defaultNotes,
    inputs,
    skuEstimates
  };
}

function buildDatabricksEstimates(
  rows: ServicePricingRow[],
  profile: ServiceEstimateProfileDefinition,
  assumption: ReviewServiceAssumption
) {
  const inputs = resolveEstimateInputs(profile, assumption);
  const dbuCount = Math.max(0, getNumericInput(inputs, "dbuCount", 1));
  const dbuHoursPerMonth = Math.max(0, getNumericInput(inputs, "dbuHoursPerMonth", HOURS_PER_MONTH));
  const storageUnits = Math.max(0, getNumericInput(inputs, "storageUnits", 1));
  const launchEvents = Math.max(0, getNumericInput(inputs, "launchEvents", 0));
  const storageRow = findMatchingRow(rows, [/storage unit/i, /\bdsu\b/i], []);
  const preferredSku = assumption.preferredSku.trim();
  const workloadRows = rows.filter(
    (row) =>
      /dbu/i.test(row.meterName) &&
      !/non-billable|free trial|reservation/i.test(`${row.productName} ${row.skuName} ${row.meterName}`) &&
      row.retailPrice > 0
  );
  const grouped = groupRowsByKey(workloadRows, (row) => row.skuName || row.meterName);

  const skuEstimates = [...grouped.entries()]
    .map(([skuName, skuRows]) => {
      const computeRow = findMatchingRow(skuRows, [/dbu/i], ["hour"]);
      const launchRow = findMatchingRow(skuRows, [/launch charge/i], []);

      if (!computeRow) {
        return null;
      }

      const components: ServiceMonthlyEstimateComponent[] = [
        buildComponent(
          "DBU workload",
          computeRow,
          dbuCount * (dbuHoursPerMonth / HOURS_PER_MONTH),
          "databricks-dbu"
        )
      ];

      if (storageRow && storageUnits > 0) {
        components.push(buildComponent("Databricks storage", storageRow, storageUnits, "databricks-dsu"));
      }

      if (launchRow && launchEvents > 0) {
        components.push(buildComponent("Launch charges", launchRow, launchEvents, "databricks-launch"));
      }

      const totals = sumComponents(components);

      return {
        skuName,
        hourlyCost: totals.hourlyCost,
        monthlyCost: totals.monthlyCost,
        assumptions: buildInputAssumptions(profile, inputs),
        notes: profile.defaultNotes,
        components,
        isPreferred:
          preferredSku.length > 0 && normalizeText(skuName).includes(normalizeText(preferredSku))
      } satisfies ServiceMonthlySkuEstimate;
    })
    .filter(Boolean)
    .sort((left, right) => left!.monthlyCost - right!.monthlyCost) as ServiceMonthlySkuEstimate[];

  return {
    mode: profile.mode,
    coverage: profile.coverage,
    notes: profile.defaultNotes,
    inputs,
    skuEstimates
  };
}

function buildAiSearchEstimates(
  rows: ServicePricingRow[],
  profile: ServiceEstimateProfileDefinition,
  assumption: ReviewServiceAssumption
) {
  const inputs = resolveEstimateInputs(profile, assumption);
  const searchUnits = Math.max(0, getNumericInput(inputs, "searchUnits", 1));
  const semanticQueries1000 = Math.max(0, getNumericInput(inputs, "semanticQueries1000", 0));
  const imageExtractions1000 = Math.max(0, getNumericInput(inputs, "imageExtractions1000", 0));
  const preferredSku = assumption.preferredSku.trim();
  const semanticRow = findMatchingRow(rows, [/semantic ranker/i], ["1k"]);
  const crackingRow = findMatchingRow(rows, [/image extraction/i], ["1k"]);
  const capacityRows = rows.filter(
    (row) =>
      /unit/i.test(row.meterName) &&
      /hour/i.test(row.unitOfMeasure) &&
      !/free|agentic retrieval|semantic ranker|document cracking/i.test(`${row.productName} ${row.skuName} ${row.meterName}`) &&
      row.retailPrice > 0
  );
  const grouped = groupRowsByKey(capacityRows, (row) => row.skuName || buildSkuLabel(row));

  const skuEstimates = [...grouped.entries()]
    .map(([skuName, skuRows]) => {
      const capacityRow = findMatchingRow(skuRows, [/unit/i], ["hour"]);

      if (!capacityRow) {
        return null;
      }

      const components: ServiceMonthlyEstimateComponent[] = [
        buildComponent("Search capacity", capacityRow, searchUnits, "search-capacity")
      ];

      if (semanticRow && semanticQueries1000 > 0) {
        components.push(buildComponent("Semantic ranker", semanticRow, semanticQueries1000, "search-semantic"));
      }

      if (crackingRow && imageExtractions1000 > 0) {
        components.push(buildComponent("Document cracking", crackingRow, imageExtractions1000, "search-cracking"));
      }

      const totals = sumComponents(components);

      return {
        skuName,
        hourlyCost: totals.hourlyCost,
        monthlyCost: totals.monthlyCost,
        assumptions: buildInputAssumptions(profile, inputs),
        notes: profile.defaultNotes,
        components,
        isPreferred:
          preferredSku.length > 0 && normalizeText(skuName).includes(normalizeText(preferredSku))
      } satisfies ServiceMonthlySkuEstimate;
    })
    .filter(Boolean)
    .sort((left, right) => left!.monthlyCost - right!.monthlyCost) as ServiceMonthlySkuEstimate[];

  return {
    mode: profile.mode,
    coverage: profile.coverage,
    notes: profile.defaultNotes,
    inputs,
    skuEstimates
  };
}

function buildSkuEstimates(
  rows: ServicePricingRow[],
  profile: ServiceEstimateProfileDefinition,
  assumption: ReviewServiceAssumption
) {
  switch (profile.strategy) {
    case "azure-openai":
      return buildAzureOpenAiEstimates(rows, profile, assumption);
    case "aks":
      return buildAksEstimates(rows, profile, assumption);
    case "sql-database":
      return buildSqlDatabaseEstimates(rows, profile, assumption);
    case "cosmos-db":
      return buildCosmosDbEstimates(rows, profile, assumption);
    case "databricks":
      return buildDatabricksEstimates(rows, profile, assumption);
    case "ai-search":
      return buildAiSearchEstimates(rows, profile, assumption);
    default:
      break;
  }

  const grouped = groupRowsBySku(rows);
  const inputs = resolveEstimateInputs(profile, assumption);
  const preferredSku = assumption.preferredSku.trim();
  const skuEstimates = [...grouped.entries()]
    .map(([skuName, skuRows]) => {
      switch (profile.strategy) {
        case "not-modeled":
          return null;
        case "traffic":
          return buildTrafficEstimate(skuName, skuRows, profile, inputs, preferredSku);
        case "storage":
          return buildStorageEstimate(skuName, skuRows, profile, inputs, preferredSku);
        case "ingestion":
          return buildIngestionEstimate(skuName, skuRows, profile, inputs, preferredSku);
        case "request-consumption":
          return buildRequestEstimate(skuName, skuRows, profile, inputs, preferredSku);
        case "serverless":
          return buildServerlessEstimate(skuName, skuRows, profile, inputs, preferredSku);
        case "container-apps":
          return buildContainerAppsEstimate(skuName, skuRows, profile, inputs, preferredSku);
        case "recurring-base":
        default:
          return buildRecurringBaseEstimate(skuName, skuRows, profile, inputs, preferredSku);
      }
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left!.monthlyCost !== right!.monthlyCost) {
        return left!.monthlyCost - right!.monthlyCost;
      }

      return left!.skuName.localeCompare(right!.skuName);
    }) as ServiceMonthlySkuEstimate[];

  return {
    mode: profile.mode,
    coverage: profile.coverage,
    notes: profile.defaultNotes,
    inputs,
    skuEstimates
  };
}

function selectPreferredEstimate(
  skuEstimates: ServiceMonthlySkuEstimate[],
  preferredSku: string,
  defaultSkuContains: string | undefined
) {
  if (skuEstimates.length === 0) {
    return null;
  }

  const normalizedPreferredSku = normalizeText(preferredSku);

  if (normalizedPreferredSku) {
    const explicit = skuEstimates.find((estimate) =>
      normalizeText(estimate.skuName).includes(normalizedPreferredSku)
    );

    if (explicit) {
      return explicit;
    }
  }

  const normalizedDefaultSku = normalizeText(defaultSkuContains);

  if (normalizedDefaultSku) {
    const defaultChoice = skuEstimates.find((estimate) =>
      normalizeText(estimate.skuName).includes(normalizedDefaultSku)
    );

    if (defaultChoice) {
      return defaultChoice;
    }
  }

  return skuEstimates[0];
}

export function buildServiceMonthlyEstimate(
  pricing: ServicePricing | undefined,
  assumption: ReviewServiceAssumption,
  targetRegions: string[]
): ServiceMonthlyEstimate | null {
  if (!pricing) {
    return null;
  }

  const profile = getServiceEstimateProfile(pricing.serviceSlug) ?? buildRuntimeFallbackProfile(pricing.serviceSlug);
  const resolvedInputs = resolveEstimateInputs(profile, assumption);

  if (!pricing.mapped || pricing.rows.length === 0 || profile.strategy === "not-modeled") {
    return {
      serviceSlug: pricing.serviceSlug,
      serviceName: pricing.serviceName,
      supported: false,
      mode: profile.strategy === "not-modeled" ? profile.mode : "not-modeled",
      currencyCode: pricing.currencyCode,
      profileVersion: profile.version,
      coverage: profile.strategy === "not-modeled" ? profile.coverage : "not-modeled",
      notes:
        pricing.notes.length > 0
          ? [...profile.defaultNotes, ...pricing.notes]
          : profile.defaultNotes.length > 0
            ? profile.defaultNotes
            : ["No published retail pricing rows are available for this service."],
      assumptions: buildInputAssumptions(profile, resolvedInputs),
      targetScopeApplied: false,
      selectedInputMode: getEstimateInputMode(assumption),
      selectedInputs: resolvedInputs,
      skuEstimates: []
    };
  }

  const scoped = resolveScopedRows(pricing, assumption, targetRegions);
  const built = buildSkuEstimates(scoped.rows, profile, assumption);
  const selectedEstimate = selectPreferredEstimate(
    built.skuEstimates,
    assumption.preferredSku,
    profile.defaultSkuContains
  );

  if (!selectedEstimate) {
    return {
      serviceSlug: pricing.serviceSlug,
      serviceName: pricing.serviceName,
      supported: false,
      mode: "not-modeled",
      currencyCode: pricing.currencyCode,
      profileVersion: profile.version,
      coverage: "not-modeled",
      notes: [
        ...profile.defaultNotes,
        "A credible hourly or monthly estimate could not be modeled from the published retail rows for this service."
      ],
      assumptions: buildInputAssumptions(profile, built.inputs),
      targetScopeApplied: scoped.targetScopeApplied,
      selectedInputMode: getEstimateInputMode(assumption),
      selectedInputs: built.inputs,
      skuEstimates: []
    };
  }

  return {
    serviceSlug: pricing.serviceSlug,
    serviceName: pricing.serviceName,
    supported: true,
    mode: built.mode,
    currencyCode: pricing.currencyCode,
    profileVersion: profile.version,
    coverage: built.coverage,
    notes: [
      ...built.notes,
      scoped.targetScopeApplied
        ? "The estimate uses retail rows that match the selected deployment region or its Microsoft billing zone."
        : "No direct target-region retail row was available, so the estimate falls back to the broader published retail scope.",
      "Retail pricing comes from the Microsoft Azure Retail Prices API, not from an Azure Pricing Calculator API.",
      assumption.sizingNote.trim()
        ? "A sizing note exists for this service, but the estimate uses the structured inputs shown here."
        : "No additional sizing note is applied beyond the structured estimate inputs shown here."
    ],
    assumptions: selectedEstimate.assumptions,
    targetScopeApplied: scoped.targetScopeApplied,
    selectedInputMode: getEstimateInputMode(assumption),
    selectedInputs: built.inputs,
    skuEstimates: built.skuEstimates,
    selectedSkuName: selectedEstimate.skuName,
    selectedHourlyCost: selectedEstimate.hourlyCost,
    selectedMonthlyCost: selectedEstimate.monthlyCost
  };
}
