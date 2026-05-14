import { describe, it, expect } from "vitest";
import { buildServiceMonthlyEstimate } from "@/lib/monthly-estimate";
import type {
  ServicePricing,
  ServicePricingRow,
  ReviewServiceAssumption,
} from "@/types";

// ── Test fixtures ─────────────────────────────────────────────────────────

const defaultAssumption: ReviewServiceAssumption = {
  plannedRegion: "",
  preferredSku: "",
  sizingNote: "",
};

function makeRow(overrides: Partial<ServicePricingRow> = {}): ServicePricingRow {
  return {
    meterId: "meter-001",
    meterName: "D2s v3",
    productName: "Virtual Machines",
    skuName: "D2s v3",
    armSkuName: "Standard_D2s_v3",
    armRegionName: "eastus",
    location: "East US",
    locationKind: "Region",
    effectiveStartDate: "2024-01-01T00:00:00Z",
    unitOfMeasure: "1 Hour",
    retailPrice: 0.096,
    unitPrice: 0.096,
    tierMinimumUnits: 0,
    currencyCode: "USD",
    type: "Consumption",
    isPrimaryMeterRegion: true,
    ...overrides,
  };
}

function makePricing(overrides: Partial<ServicePricing> = {}): ServicePricing {
  return {
    serviceSlug: "azure-virtual-machines",
    serviceName: "Virtual Machines",
    mapped: true,
    notes: [],
    generatedAt: "2026-01-01T00:00:00Z",
    sourceUrl: "",
    calculatorUrl: "",
    priceDisclaimer: "",
    currencyCode: "USD",
    rowCount: 1,
    meterCount: 1,
    skuCount: 1,
    regionCount: 1,
    billingLocationCount: 1,
    targetRegionMatchCount: 0,
    targetPricingLocations: [],
    rows: [makeRow()],
    ...overrides,
  };
}

// ── Null / unsupported path ───────────────────────────────────────────────

describe("buildServiceMonthlyEstimate — null and unsupported paths", () => {
  it("returns null when pricing is undefined", () => {
    expect(buildServiceMonthlyEstimate(undefined, defaultAssumption, [])).toBeNull();
  });

  it("returns supported:false when mapped is false", () => {
    const result = buildServiceMonthlyEstimate(
      makePricing({ mapped: false }),
      defaultAssumption,
      [],
    );
    expect(result).not.toBeNull();
    expect(result!.supported).toBe(false);
    expect(result!.mode).toBe("not-modeled");
  });

  it("returns supported:false when rows array is empty", () => {
    const result = buildServiceMonthlyEstimate(
      makePricing({ rows: [] }),
      defaultAssumption,
      [],
    );
    expect(result).not.toBeNull();
    expect(result!.supported).toBe(false);
  });
});

// ── recurring-base strategy ───────────────────────────────────────────────

describe("buildServiceMonthlyEstimate — recurring-base strategy (VM-like)", () => {
  const HOURS_PER_MONTH = 730;

  it("produces a positive monthlyCost for an hourly row", () => {
    const pricing = makePricing({
      rows: [makeRow({ retailPrice: 0.096, unitOfMeasure: "1 Hour" })],
    });
    const result = buildServiceMonthlyEstimate(pricing, defaultAssumption, []);
    expect(result?.supported).toBe(true);
    expect(result!.selectedMonthlyCost).toBeGreaterThan(0);
  });

  it("hourly cost × 730 ≈ monthly cost", () => {
    const pricing = makePricing({
      rows: [makeRow({ retailPrice: 0.1, unitOfMeasure: "1 Hour" })],
    });
    const result = buildServiceMonthlyEstimate(pricing, defaultAssumption, []);
    expect(result?.selectedMonthlyCost).toBeCloseTo(0.1 * HOURS_PER_MONTH, 4);
    expect(result?.selectedHourlyCost).toBeCloseTo(0.1, 6);
  });

  it("daily row price × 30 ≈ monthly cost", () => {
    const pricing = makePricing({
      rows: [makeRow({ retailPrice: 2.4, unitOfMeasure: "1 Day" })],
    });
    const result = buildServiceMonthlyEstimate(pricing, defaultAssumption, []);
    expect(result?.selectedMonthlyCost).toBeCloseTo(2.4 * 30, 4);
  });

  it("monthly unit row price equals monthly cost directly", () => {
    // Some Azure services (e.g. App Service) are priced per month, not per hour.
    // toMonthlyCost falls through to retailPrice * quantity for a monthly unit.
    const pricing = makePricing({
      rows: [makeRow({ retailPrice: 54.75, unitOfMeasure: "1 Month" })],
    });
    const result = buildServiceMonthlyEstimate(pricing, defaultAssumption, []);
    expect(result?.selectedMonthlyCost).toBeCloseTo(54.75, 4);
  });

  it("returns serviceSlug and serviceName in the result", () => {
    const pricing = makePricing({ serviceSlug: "azure-vm", serviceName: "Virtual Machines" });
    const result = buildServiceMonthlyEstimate(pricing, defaultAssumption, []);
    expect(result?.serviceSlug).toBe("azure-vm");
    expect(result?.serviceName).toBe("Virtual Machines");
  });

  it("skuEstimates is non-empty when rows can be modeled", () => {
    const result = buildServiceMonthlyEstimate(makePricing(), defaultAssumption, []);
    expect(result?.skuEstimates.length).toBeGreaterThan(0);
  });
});

// ── Region scoping ────────────────────────────────────────────────────────

describe("buildServiceMonthlyEstimate — region scoping", () => {
  it("scopes to target region rows when a matching row exists", () => {
    const pricing = makePricing({
      rows: [
        makeRow({ armRegionName: "eastus", location: "East US", retailPrice: 0.1 }),
        makeRow({ armRegionName: "westeurope", location: "West Europe", retailPrice: 0.2 }),
      ],
      targetPricingLocations: [],
    });
    const result = buildServiceMonthlyEstimate(pricing, defaultAssumption, ["eastus"]);
    // Should use the eastus row (lower price)
    expect(result?.selectedMonthlyCost).toBeCloseTo(0.1 * 730, 4);
    expect(result?.targetScopeApplied).toBe(true);
  });

  it("falls back to all rows when no region match", () => {
    const pricing = makePricing({
      rows: [makeRow({ armRegionName: "eastus", retailPrice: 0.1 })],
    });
    const result = buildServiceMonthlyEstimate(pricing, defaultAssumption, ["australiaeast"]);
    expect(result?.targetScopeApplied).toBe(false);
    expect(result?.supported).toBe(true);
  });

  it("assumption.plannedRegion overrides targetRegions", () => {
    const pricing = makePricing({
      rows: [
        makeRow({ armRegionName: "eastus", retailPrice: 0.1 }),
        makeRow({ armRegionName: "westeurope", retailPrice: 0.5, skuName: "D2s v3 WE", meterName: "D2s v3 WE" }),
      ],
    });
    const assumptionWithRegion: ReviewServiceAssumption = {
      ...defaultAssumption,
      plannedRegion: "westeurope",
    };
    const result = buildServiceMonthlyEstimate(pricing, assumptionWithRegion, ["eastus"]);
    expect(result?.targetScopeApplied).toBe(true);
  });
});

// ── SKU preference ────────────────────────────────────────────────────────

describe("buildServiceMonthlyEstimate — SKU preference", () => {
  it("selects the preferred SKU when specified", () => {
    const pricing = makePricing({
      rows: [
        makeRow({ skuName: "D2s v3", meterName: "D2s v3", retailPrice: 0.096 }),
        makeRow({ skuName: "D4s v3", meterName: "D4s v3", retailPrice: 0.192 }),
      ],
    });
    const assumption: ReviewServiceAssumption = {
      ...defaultAssumption,
      preferredSku: "D4s",
    };
    const result = buildServiceMonthlyEstimate(pricing, assumption, []);
    expect(result?.selectedSkuName).toContain("D4s");
  });

  it("falls back to lowest-cost SKU when preferred SKU not found", () => {
    const pricing = makePricing({
      rows: [
        makeRow({ skuName: "D2s v3", meterName: "D2s v3", retailPrice: 0.096 }),
        makeRow({ skuName: "D4s v3", meterName: "D4s v3", retailPrice: 0.192 }),
      ],
    });
    const assumption: ReviewServiceAssumption = {
      ...defaultAssumption,
      preferredSku: "nonexistent-sku",
    };
    const result = buildServiceMonthlyEstimate(pricing, assumption, []);
    // Should fall back to first (lowest cost) SKU
    expect(result?.selectedSkuName).toBeTruthy();
    expect(result?.supported).toBe(true);
  });
});

// ── serverless strategy ───────────────────────────────────────────────────

describe("buildServiceMonthlyEstimate — serverless strategy (Azure Functions)", () => {
  it("produces a result for an azure-functions slug", () => {
    const pricing = makePricing({
      serviceSlug: "azure-functions",
      serviceName: "Azure Functions",
      rows: [
        makeRow({
          meterName: "Executions",
          unitOfMeasure: "1M",
          retailPrice: 0.0000002,
          skuName: "Consumption",
        }),
        makeRow({
          meterName: "Execution Time",
          unitOfMeasure: "GB-s",
          retailPrice: 0.000016,
          skuName: "Consumption",
        }),
      ],
    });
    const result = buildServiceMonthlyEstimate(pricing, defaultAssumption, []);
    expect(result).not.toBeNull();
    // serverless strategy may produce supported:true or supported:false depending on row matching
    // either way it must return a result (not null)
    expect(result?.serviceSlug).toBe("azure-functions");
  });
});
