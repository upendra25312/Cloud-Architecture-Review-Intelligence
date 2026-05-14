import { describe, it, expect } from "vitest";
import {
  SERVICE_ESTIMATE_PROFILES,
  getServiceEstimateProfile,
  getEstimateInputMode,
  getDefaultEstimateInputs,
  resolveEstimateInputs,
  hasMeaningfulEstimateInputs,
} from "@/lib/monthly-estimate-profiles";
import type { ReviewServiceAssumption } from "@/types";

// ── Fixtures ──────────────────────────────────────────────────────────────

function makeAssumption(overrides: Partial<ReviewServiceAssumption> = {}): ReviewServiceAssumption {
  return {
    plannedRegion: "",
    preferredSku: "",
    sizingNote: "",
    ...overrides,
  };
}

// ── SERVICE_ESTIMATE_PROFILES coverage ───────────────────────────────────

describe("SERVICE_ESTIMATE_PROFILES", () => {
  it("contains a profile for azure-virtual-machines with recurring-base strategy", () => {
    const profile = SERVICE_ESTIMATE_PROFILES["azure-virtual-machines"];
    expect(profile).toBeDefined();
    expect(profile.strategy).toBe("recurring-base");
  });

  it("contains a profile for azure-functions with serverless strategy", () => {
    const profile = SERVICE_ESTIMATE_PROFILES["azure-functions"];
    expect(profile).toBeDefined();
    expect(profile.strategy).toBe("serverless");
  });

  it("contains a profile for azure-openai with azure-openai strategy", () => {
    const profile = SERVICE_ESTIMATE_PROFILES["azure-openai"];
    expect(profile).toBeDefined();
    expect(profile.strategy).toBe("azure-openai");
  });

  it("contains a profile for azure-kubernetes-service-aks with aks strategy", () => {
    expect(SERVICE_ESTIMATE_PROFILES["azure-kubernetes-service-aks"]?.strategy).toBe("aks");
  });

  it("contains a profile for azure-sql-database with sql-database strategy", () => {
    expect(SERVICE_ESTIMATE_PROFILES["azure-sql-database"]?.strategy).toBe("sql-database");
  });

  it("contains a profile for azure-cosmos-db with cosmos-db strategy", () => {
    expect(SERVICE_ESTIMATE_PROFILES["azure-cosmos-db"]?.strategy).toBe("cosmos-db");
  });

  it("contains a profile for azure-databricks with databricks strategy", () => {
    expect(SERVICE_ESTIMATE_PROFILES["azure-databricks"]?.strategy).toBe("databricks");
  });

  it("contains a profile for azure-ai-search with ai-search strategy", () => {
    expect(SERVICE_ESTIMATE_PROFILES["azure-ai-search"]?.strategy).toBe("ai-search");
  });

  it("contains a profile for microsoft-entra-id with not-modeled strategy", () => {
    expect(SERVICE_ESTIMATE_PROFILES["microsoft-entra-id"]?.strategy).toBe("not-modeled");
  });

  it("contains a profile for azure-front-door with traffic strategy", () => {
    expect(SERVICE_ESTIMATE_PROFILES["azure-front-door"]?.strategy).toBe("traffic");
  });

  it("contains a profile for azure-storage-account with storage strategy", () => {
    expect(SERVICE_ESTIMATE_PROFILES["azure-storage-account"]?.strategy).toBe("storage");
  });

  it("contains a profile for log-analytics with ingestion strategy", () => {
    expect(SERVICE_ESTIMATE_PROFILES["log-analytics"]?.strategy).toBe("ingestion");
  });

  it("all profiles have a non-empty serviceSlug that matches their key", () => {
    const entries = Object.entries(SERVICE_ESTIMATE_PROFILES);
    expect(entries.length).toBeGreaterThan(50);
    for (const [slug, profile] of entries) {
      expect(profile.serviceSlug).toBe(slug);
    }
  });

  it("not-modeled profiles have no inputDefinitions", () => {
    const profile = SERVICE_ESTIMATE_PROFILES["microsoft-entra-id"];
    expect(profile.inputDefinitions).toHaveLength(0);
  });
});

// ── getServiceEstimateProfile ─────────────────────────────────────────────

describe("getServiceEstimateProfile", () => {
  it("returns the profile for a known slug", () => {
    const profile = getServiceEstimateProfile("azure-virtual-machines");
    expect(profile).toBeDefined();
    expect(profile?.serviceSlug).toBe("azure-virtual-machines");
  });

  it("returns undefined for an unknown slug", () => {
    expect(getServiceEstimateProfile("not-a-real-service")).toBeUndefined();
  });
});

// ── getEstimateInputMode ──────────────────────────────────────────────────

describe("getEstimateInputMode", () => {
  it("returns defaults when assumption is undefined", () => {
    expect(getEstimateInputMode(undefined)).toBe("defaults");
  });

  it("returns defaults when assumption has no estimateInputMode", () => {
    expect(getEstimateInputMode(makeAssumption())).toBe("defaults");
  });

  it("returns custom when assumption.estimateInputMode is custom", () => {
    const assumption = makeAssumption({ estimateInputMode: "custom" });
    expect(getEstimateInputMode(assumption)).toBe("custom");
  });
});

// ── getDefaultEstimateInputs ──────────────────────────────────────────────

describe("getDefaultEstimateInputs", () => {
  it("returns empty object for undefined profile", () => {
    expect(getDefaultEstimateInputs(undefined)).toEqual({});
  });

  it("returns unitCount for a recurring-base profile", () => {
    const profile = getServiceEstimateProfile("azure-virtual-machines")!;
    const defaults = getDefaultEstimateInputs(profile);
    expect(defaults).toHaveProperty("unitCount", 1);
  });

  it("returns serverless inputs for azure-functions", () => {
    const profile = getServiceEstimateProfile("azure-functions")!;
    const defaults = getDefaultEstimateInputs(profile);
    expect(defaults).toHaveProperty("monthlyExecutions");
    expect(defaults).toHaveProperty("executionGbSeconds");
  });

  it("returns empty object for not-modeled profiles", () => {
    const profile = getServiceEstimateProfile("microsoft-entra-id")!;
    expect(getDefaultEstimateInputs(profile)).toEqual({});
  });
});

// ── resolveEstimateInputs ─────────────────────────────────────────────────

describe("resolveEstimateInputs", () => {
  it("returns defaults when mode is defaults (even if assumption has custom inputs)", () => {
    const profile = getServiceEstimateProfile("azure-virtual-machines")!;
    const assumption = makeAssumption({
      estimateInputMode: "defaults",
      estimateInputs: { unitCount: 99 },
    });
    const resolved = resolveEstimateInputs(profile, assumption);
    expect(resolved.unitCount).toBe(1);
  });

  it("merges custom inputs when mode is custom", () => {
    const profile = getServiceEstimateProfile("azure-virtual-machines")!;
    const assumption = makeAssumption({
      estimateInputMode: "custom",
      estimateInputs: { unitCount: 5 },
    });
    const resolved = resolveEstimateInputs(profile, assumption);
    expect(resolved.unitCount).toBe(5);
  });

  it("uses defaults for keys not overridden in custom mode", () => {
    const profile = getServiceEstimateProfile("azure-functions")!;
    const assumption = makeAssumption({
      estimateInputMode: "custom",
      estimateInputs: { monthlyExecutions: 500000 },
    });
    const resolved = resolveEstimateInputs(profile, assumption);
    expect(resolved.monthlyExecutions).toBe(500000);
    expect(resolved.executionGbSeconds).toBe(100000);
  });

  it("returns empty object for undefined profile", () => {
    const resolved = resolveEstimateInputs(undefined, makeAssumption());
    expect(resolved).toEqual({});
  });
});

// ── hasMeaningfulEstimateInputs ───────────────────────────────────────────

describe("hasMeaningfulEstimateInputs", () => {
  it("returns false when profile is undefined", () => {
    expect(hasMeaningfulEstimateInputs(undefined, makeAssumption())).toBe(false);
  });

  it("returns false when assumption has no estimateInputs", () => {
    const profile = getServiceEstimateProfile("azure-virtual-machines")!;
    expect(hasMeaningfulEstimateInputs(profile, makeAssumption())).toBe(false);
  });

  it("returns false when custom inputs all match defaults", () => {
    const profile = getServiceEstimateProfile("azure-virtual-machines")!;
    const assumption = makeAssumption({ estimateInputs: { unitCount: 1 } });
    expect(hasMeaningfulEstimateInputs(profile, assumption)).toBe(false);
  });

  it("returns true when at least one input differs from its default", () => {
    const profile = getServiceEstimateProfile("azure-virtual-machines")!;
    const assumption = makeAssumption({ estimateInputs: { unitCount: 3 } });
    expect(hasMeaningfulEstimateInputs(profile, assumption)).toBe(true);
  });

  it("returns false when assumption is undefined", () => {
    const profile = getServiceEstimateProfile("azure-virtual-machines")!;
    expect(hasMeaningfulEstimateInputs(profile, undefined)).toBe(false);
  });
});
