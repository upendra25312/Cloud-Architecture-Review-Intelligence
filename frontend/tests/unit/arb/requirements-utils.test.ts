import { describe, it, expect } from "vitest";
import {
  computeRequirementsMetrics,
  groupRequirementsByCategory,
  groupRequirementsBySourceFile,
  filterRequirements,
  getDistinctCategories,
  truncateAtWordBoundary,
} from "@/components/arb/requirements/requirements-utils";
import type { ArbRequirement } from "@/arb/types";

// ── Fixtures ──────────────────────────────────────────────────────────────

function makeReq(overrides: Partial<ArbRequirement> = {}): ArbRequirement {
  return {
    requirementId: "req-001",
    reviewId: "r-001",
    sourceFileId: null,
    sourceFileName: "brief.pdf",
    normalizedText: "Must have HA",
    category: "Reliability",
    criticality: "High",
    reviewerStatus: "Open",
    ...overrides,
  };
}

// ── computeRequirementsMetrics ────────────────────────────────────────────

describe("computeRequirementsMetrics", () => {
  it("returns zeroes for empty requirements", () => {
    const m = computeRequirementsMetrics([]);
    expect(m.total).toBe(0);
    expect(m.highCount).toBe(0);
    expect(m.mediumCount).toBe(0);
    expect(m.pendingCount).toBe(0);
    expect(m.acceptedCount).toBe(0);
    expect(m.rejectedCount).toBe(0);
    expect(m.categoryCount).toBe(0);
    expect(m.acceptanceRate).toBe(0);
  });

  it("counts by criticality", () => {
    const reqs = [
      makeReq({ requirementId: "r1", criticality: "High" }),
      makeReq({ requirementId: "r2", criticality: "High" }),
      makeReq({ requirementId: "r3", criticality: "Medium" }),
    ];
    const m = computeRequirementsMetrics(reqs);
    expect(m.total).toBe(3);
    expect(m.highCount).toBe(2);
    expect(m.mediumCount).toBe(1);
  });

  it("counts by reviewerStatus", () => {
    const reqs = [
      makeReq({ requirementId: "r1", reviewerStatus: "Accepted" }),
      makeReq({ requirementId: "r2", reviewerStatus: "Rejected" }),
      makeReq({ requirementId: "r3", reviewerStatus: "Pending" }),
    ];
    const m = computeRequirementsMetrics(reqs);
    expect(m.acceptedCount).toBe(1);
    expect(m.rejectedCount).toBe(1);
    expect(m.pendingCount).toBe(1);
  });

  it("computes acceptanceRate as accepted / (accepted + rejected)", () => {
    const reqs = [
      makeReq({ requirementId: "r1", reviewerStatus: "Accepted" }),
      makeReq({ requirementId: "r2", reviewerStatus: "Accepted" }),
      makeReq({ requirementId: "r3", reviewerStatus: "Rejected" }),
    ];
    const m = computeRequirementsMetrics(reqs);
    expect(m.acceptanceRate).toBe(67);
  });

  it("acceptanceRate is 0 when none are reviewed", () => {
    const reqs = [makeReq({ reviewerStatus: "Open" })];
    expect(computeRequirementsMetrics(reqs).acceptanceRate).toBe(0);
  });

  it("counts distinct categories case-insensitively", () => {
    const reqs = [
      makeReq({ requirementId: "r1", category: "Reliability" }),
      makeReq({ requirementId: "r2", category: "reliability" }),
      makeReq({ requirementId: "r3", category: "Security" }),
    ];
    expect(computeRequirementsMetrics(reqs).categoryCount).toBe(2);
  });
});

// ── groupRequirementsByCategory ───────────────────────────────────────────

describe("groupRequirementsByCategory", () => {
  it("returns empty map for empty input", () => {
    expect(groupRequirementsByCategory([])).toEqual(new Map());
  });

  it("groups requirements under their category", () => {
    const reqs = [
      makeReq({ requirementId: "r1", category: "Reliability" }),
      makeReq({ requirementId: "r2", category: "Reliability" }),
      makeReq({ requirementId: "r3", category: "Security" }),
    ];
    const groups = groupRequirementsByCategory(reqs);
    expect(groups.get("Reliability")).toHaveLength(2);
    expect(groups.get("Security")).toHaveLength(1);
  });

  it("uses Uncategorized for null category", () => {
    const req = makeReq({ category: undefined as unknown as string });
    const groups = groupRequirementsByCategory([req]);
    expect(groups.has("Uncategorized")).toBe(true);
  });

  it("returns groups sorted alphabetically by display name", () => {
    const reqs = [
      makeReq({ requirementId: "r1", category: "Security" }),
      makeReq({ requirementId: "r2", category: "Cost" }),
      makeReq({ requirementId: "r3", category: "Reliability" }),
    ];
    const keys = [...groupRequirementsByCategory(reqs).keys()];
    expect(keys).toEqual(["Cost", "Reliability", "Security"]);
  });

  it("groups case-insensitively, preserving first-seen display name", () => {
    const reqs = [
      makeReq({ requirementId: "r1", category: "Reliability" }),
      makeReq({ requirementId: "r2", category: "reliability" }),
    ];
    const groups = groupRequirementsByCategory(reqs);
    expect(groups.has("Reliability")).toBe(true);
    expect(groups.get("Reliability")).toHaveLength(2);
  });
});

// ── groupRequirementsBySourceFile ─────────────────────────────────────────

describe("groupRequirementsBySourceFile", () => {
  it("returns empty map for empty input", () => {
    expect(groupRequirementsBySourceFile([])).toEqual(new Map());
  });

  it("groups by sourceFileName", () => {
    const reqs = [
      makeReq({ requirementId: "r1", sourceFileName: "brief.pdf" }),
      makeReq({ requirementId: "r2", sourceFileName: "brief.pdf" }),
      makeReq({ requirementId: "r3", sourceFileName: "arch.docx" }),
    ];
    const groups = groupRequirementsBySourceFile(reqs);
    expect(groups.get("brief.pdf")).toHaveLength(2);
    expect(groups.get("arch.docx")).toHaveLength(1);
  });

  it("uses Unknown source for null sourceFileName", () => {
    const req = makeReq({ sourceFileName: null });
    const groups = groupRequirementsBySourceFile([req]);
    expect(groups.has("Unknown source")).toBe(true);
  });

  it("returns groups sorted alphabetically", () => {
    const reqs = [
      makeReq({ requirementId: "r1", sourceFileName: "zzz.pdf" }),
      makeReq({ requirementId: "r2", sourceFileName: "aaa.pdf" }),
    ];
    const keys = [...groupRequirementsBySourceFile(reqs).keys()];
    expect(keys[0]).toBe("aaa.pdf");
  });
});

// ── filterRequirements ────────────────────────────────────────────────────

describe("filterRequirements", () => {
  const emptyFilter = {
    criticalities: new Set<string>(),
    categories: new Set<string>(),
    statuses: new Set<string>(),
  };

  it("returns all requirements when all filters are empty", () => {
    const reqs = [makeReq({ requirementId: "r1" }), makeReq({ requirementId: "r2" })];
    expect(filterRequirements(reqs, emptyFilter)).toHaveLength(2);
  });

  it("filters by criticality", () => {
    const reqs = [
      makeReq({ requirementId: "r1", criticality: "High" }),
      makeReq({ requirementId: "r2", criticality: "Medium" }),
    ];
    const result = filterRequirements(reqs, { ...emptyFilter, criticalities: new Set(["High"]) });
    expect(result.map((r) => r.requirementId)).toEqual(["r1"]);
  });

  it("filters by category (case-insensitive)", () => {
    const reqs = [
      makeReq({ requirementId: "r1", category: "Reliability" }),
      makeReq({ requirementId: "r2", category: "Security" }),
    ];
    const result = filterRequirements(reqs, { ...emptyFilter, categories: new Set(["reliability"]) });
    expect(result.map((r) => r.requirementId)).toEqual(["r1"]);
  });

  it("filters by reviewerStatus", () => {
    const reqs = [
      makeReq({ requirementId: "r1", reviewerStatus: "Accepted" }),
      makeReq({ requirementId: "r2", reviewerStatus: "Open" }),
    ];
    const result = filterRequirements(reqs, { ...emptyFilter, statuses: new Set(["Accepted"]) });
    expect(result.map((r) => r.requirementId)).toEqual(["r1"]);
  });

  it("applies AND logic across all three filters", () => {
    const reqs = [
      makeReq({ requirementId: "match", criticality: "High", category: "Security", reviewerStatus: "Open" }),
      makeReq({ requirementId: "wrong-crit", criticality: "Medium", category: "Security", reviewerStatus: "Open" }),
      makeReq({ requirementId: "wrong-cat", criticality: "High", category: "Cost", reviewerStatus: "Open" }),
    ];
    const result = filterRequirements(reqs, {
      criticalities: new Set(["High"]),
      categories: new Set(["Security"]),
      statuses: new Set(["Open"]),
    });
    expect(result.map((r) => r.requirementId)).toEqual(["match"]);
  });
});

// ── getDistinctCategories ─────────────────────────────────────────────────

describe("getDistinctCategories", () => {
  it("returns empty array for empty input", () => {
    expect(getDistinctCategories([])).toEqual([]);
  });

  it("returns sorted distinct category values", () => {
    const reqs = [
      makeReq({ requirementId: "r1", category: "Security" }),
      makeReq({ requirementId: "r2", category: "Reliability" }),
      makeReq({ requirementId: "r3", category: "Security" }),
    ];
    expect(getDistinctCategories(reqs)).toEqual(["Reliability", "Security"]);
  });

  it("excludes requirements with empty category", () => {
    const reqs = [
      makeReq({ requirementId: "r1", category: "" }),
      makeReq({ requirementId: "r2", category: "Cost" }),
    ];
    expect(getDistinctCategories(reqs)).toEqual(["Cost"]);
  });

  it("deduplicates case-insensitively preserving first display value", () => {
    const reqs = [
      makeReq({ requirementId: "r1", category: "Reliability" }),
      makeReq({ requirementId: "r2", category: "reliability" }),
    ];
    const categories = getDistinctCategories(reqs);
    expect(categories).toHaveLength(1);
    expect(categories[0]).toBe("Reliability");
  });
});

// ── truncateAtWordBoundary ────────────────────────────────────────────────

describe("truncateAtWordBoundary (requirements-utils)", () => {
  it("returns text unchanged when within maxLength", () => {
    expect(truncateAtWordBoundary("short text", 50)).toBe("short text");
  });

  it("truncates at a word boundary and appends ellipsis", () => {
    const text = "Must support high availability across all regions";
    const result = truncateAtWordBoundary(text, 20);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThan(text.length);
  });

  it("falls back to hard truncation when no suitable word boundary", () => {
    expect(truncateAtWordBoundary("abcdefghij", 5)).toBe("abcde…");
  });
});
