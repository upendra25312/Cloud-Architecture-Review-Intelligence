import { describe, it, expect } from "vitest";
import {
  computeEvidenceMetrics,
  groupEvidenceByDomain,
  groupEvidenceBySourceFile,
  filterEvidence,
  buildLinkageMap,
  getDistinctDomains,
  truncateAtWordBoundary,
} from "@/components/arb/evidence/evidence-utils";
import type { ArbEvidenceFact, ArbFinding } from "@/arb/types";

// ── Fixtures ──────────────────────────────────────────────────────────────

function makeEvidence(overrides: Partial<ArbEvidenceFact> = {}): ArbEvidenceFact {
  return {
    evidenceId: "e-001",
    reviewId: "r-001",
    sourceFileId: null,
    sourceFileName: "design.pdf",
    factType: "security",
    summary: "Test summary",
    sourceExcerpt: "",
    confidence: "High",
    ...overrides,
  };
}

function makeFinding(overrides: Partial<ArbFinding> = {}): ArbFinding {
  return {
    findingId: "f-001",
    reviewId: "r-001",
    severity: "High",
    domain: "Security",
    findingType: "Gap",
    title: "Test finding",
    findingStatement: "",
    whyItMatters: "",
    evidenceBasis: "",
    evidenceFound: [],
    missingEvidence: [],
    recommendation: "",
    learnMoreUrl: "",
    references: [],
    confidence: "High",
    criticalBlocker: false,
    suggestedOwner: null,
    suggestedDueDate: null,
    owner: null,
    dueDate: null,
    reviewerNote: null,
    status: "Open",
    source: "agent",
    ...overrides,
  };
}

// ── computeEvidenceMetrics ────────────────────────────────────────────────

describe("computeEvidenceMetrics", () => {
  it("returns zeroes for empty evidence", () => {
    const m = computeEvidenceMetrics([]);
    expect(m.total).toBe(0);
    expect(m.highCount).toBe(0);
    expect(m.mediumCount).toBe(0);
    expect(m.lowCount).toBe(0);
    expect(m.domainCoverage).toBe(0);
    expect(m.highConfidenceCoverage).toBe(0);
    expect(m.qualityLabel).toBe("Weak");
  });

  it("counts by confidence level", () => {
    const evidence = [
      makeEvidence({ evidenceId: "e1", confidence: "High" }),
      makeEvidence({ evidenceId: "e2", confidence: "High" }),
      makeEvidence({ evidenceId: "e3", confidence: "Medium" }),
      makeEvidence({ evidenceId: "e4", confidence: "Low" }),
    ];
    const m = computeEvidenceMetrics(evidence);
    expect(m.total).toBe(4);
    expect(m.highCount).toBe(2);
    expect(m.mediumCount).toBe(1);
    expect(m.lowCount).toBe(1);
  });

  it("domainCoverage is 100 when any evidence exists", () => {
    const m = computeEvidenceMetrics([makeEvidence()]);
    expect(m.domainCoverage).toBe(100);
  });

  it("deduplicates domains case-insensitively for highConfidenceCoverage", () => {
    // 2 distinct domains, 1 high-confidence → 50%
    const evidence = [
      makeEvidence({ evidenceId: "e1", factType: "Security", confidence: "High" }),
      makeEvidence({ evidenceId: "e2", factType: "reliability", confidence: "Low" }),
    ];
    const m = computeEvidenceMetrics(evidence);
    expect(m.highConfidenceCoverage).toBe(50);
  });

  it("qualityLabel is Strong when highConfidenceCoverage >= 80", () => {
    // 1 domain, 1 high-confidence → 100%
    const m = computeEvidenceMetrics([makeEvidence({ confidence: "High" })]);
    expect(m.qualityLabel).toBe("Strong");
  });

  it("qualityLabel is Moderate when highConfidenceCoverage in [50, 79]", () => {
    // 2 domains, 1 high → 50%
    const evidence = [
      makeEvidence({ evidenceId: "e1", factType: "security", confidence: "High" }),
      makeEvidence({ evidenceId: "e2", factType: "reliability", confidence: "Low" }),
    ];
    const m = computeEvidenceMetrics(evidence);
    expect(m.qualityLabel).toBe("Moderate");
  });

  it("qualityLabel is Weak when highConfidenceCoverage < 50", () => {
    // 3 domains, 1 high → 33%
    const evidence = [
      makeEvidence({ evidenceId: "e1", factType: "security", confidence: "High" }),
      makeEvidence({ evidenceId: "e2", factType: "reliability", confidence: "Low" }),
      makeEvidence({ evidenceId: "e3", factType: "cost", confidence: "Low" }),
    ];
    const m = computeEvidenceMetrics(evidence);
    expect(m.qualityLabel).toBe("Weak");
  });

  it("ignores evidence with empty factType for domain counts", () => {
    const evidence = [makeEvidence({ factType: "" })];
    const m = computeEvidenceMetrics(evidence);
    expect(m.total).toBe(1);
    expect(m.domainCoverage).toBe(0);
  });
});

// ── groupEvidenceByDomain ─────────────────────────────────────────────────

describe("groupEvidenceByDomain", () => {
  it("returns an empty map for empty evidence", () => {
    expect(groupEvidenceByDomain([])).toEqual(new Map());
  });

  it("groups evidence under the same factType together", () => {
    const e1 = makeEvidence({ evidenceId: "e1", factType: "security" });
    const e2 = makeEvidence({ evidenceId: "e2", factType: "security" });
    const groups = groupEvidenceByDomain([e1, e2]);
    expect(groups.get("security")).toHaveLength(2);
  });

  it("groups case-insensitively but preserves display name from first occurrence", () => {
    const e1 = makeEvidence({ evidenceId: "e1", factType: "Security" });
    const e2 = makeEvidence({ evidenceId: "e2", factType: "security" });
    const groups = groupEvidenceByDomain([e1, e2]);
    expect(groups.has("Security")).toBe(true);
    expect(groups.get("Security")).toHaveLength(2);
  });

  it("uses Unknown for null/undefined factType", () => {
    const e = makeEvidence({ factType: undefined as unknown as string });
    const groups = groupEvidenceByDomain([e]);
    expect(groups.has("Unknown")).toBe(true);
  });

  it("returns groups sorted alphabetically by display name", () => {
    const evidence = [
      makeEvidence({ evidenceId: "e1", factType: "reliability" }),
      makeEvidence({ evidenceId: "e2", factType: "cost" }),
      makeEvidence({ evidenceId: "e3", factType: "security" }),
    ];
    const keys = [...groupEvidenceByDomain(evidence).keys()];
    expect(keys).toEqual(["cost", "reliability", "security"]);
  });
});

// ── groupEvidenceBySourceFile ─────────────────────────────────────────────

describe("groupEvidenceBySourceFile", () => {
  it("returns empty map for empty input", () => {
    expect(groupEvidenceBySourceFile([])).toEqual(new Map());
  });

  it("groups by sourceFileName", () => {
    const evidence = [
      makeEvidence({ evidenceId: "e1", sourceFileName: "arch.pdf" }),
      makeEvidence({ evidenceId: "e2", sourceFileName: "arch.pdf" }),
      makeEvidence({ evidenceId: "e3", sourceFileName: "hld.docx" }),
    ];
    const groups = groupEvidenceBySourceFile(evidence);
    expect(groups.get("arch.pdf")).toHaveLength(2);
    expect(groups.get("hld.docx")).toHaveLength(1);
  });

  it("uses Unknown source for null sourceFileName", () => {
    const e = makeEvidence({ sourceFileName: null });
    const groups = groupEvidenceBySourceFile([e]);
    expect(groups.has("Unknown source")).toBe(true);
  });

  it("returns groups sorted alphabetically by file name", () => {
    const evidence = [
      makeEvidence({ evidenceId: "e1", sourceFileName: "z.pdf" }),
      makeEvidence({ evidenceId: "e2", sourceFileName: "a.pdf" }),
    ];
    const keys = [...groupEvidenceBySourceFile(evidence).keys()];
    expect(keys[0]).toBe("a.pdf");
  });
});

// ── filterEvidence ────────────────────────────────────────────────────────

describe("filterEvidence", () => {
  const emptyFilter = { confidences: new Set<string>(), domains: new Set<string>() };

  it("returns all evidence when filters are empty", () => {
    const evidence = [makeEvidence({ evidenceId: "e1" }), makeEvidence({ evidenceId: "e2" })];
    expect(filterEvidence(evidence, emptyFilter)).toHaveLength(2);
  });

  it("filters by confidence", () => {
    const evidence = [
      makeEvidence({ evidenceId: "e1", confidence: "High" }),
      makeEvidence({ evidenceId: "e2", confidence: "Low" }),
    ];
    const result = filterEvidence(evidence, { ...emptyFilter, confidences: new Set(["High"]) });
    expect(result).toHaveLength(1);
    expect(result[0].evidenceId).toBe("e1");
  });

  it("filters by domain (case-insensitive)", () => {
    const evidence = [
      makeEvidence({ evidenceId: "e1", factType: "Security" }),
      makeEvidence({ evidenceId: "e2", factType: "reliability" }),
    ];
    const result = filterEvidence(evidence, { ...emptyFilter, domains: new Set(["security"]) });
    expect(result).toHaveLength(1);
    expect(result[0].evidenceId).toBe("e1");
  });

  it("applies AND logic across confidence and domain filters", () => {
    const evidence = [
      makeEvidence({ evidenceId: "match", confidence: "High", factType: "security" }),
      makeEvidence({ evidenceId: "wrong-conf", confidence: "Low", factType: "security" }),
      makeEvidence({ evidenceId: "wrong-domain", confidence: "High", factType: "cost" }),
    ];
    const result = filterEvidence(evidence, {
      confidences: new Set(["High"]),
      domains: new Set(["security"]),
    });
    expect(result.map((e) => e.evidenceId)).toEqual(["match"]);
  });
});

// ── buildLinkageMap ───────────────────────────────────────────────────────

describe("buildLinkageMap", () => {
  it("returns empty map for empty findings", () => {
    expect(buildLinkageMap([])).toEqual(new Map());
  });

  it("links evidence to a finding by evidenceId", () => {
    const finding = makeFinding({
      findingId: "f-001",
      evidenceFound: [
        { evidenceId: "e-001", summary: "", sourceFileName: null, sourceFileId: null, factType: null },
      ],
    });
    const map = buildLinkageMap([finding]);
    expect(map.has("e-001")).toBe(true);
    expect(map.get("e-001")![0].findingId).toBe("f-001");
  });

  it("prefers visualEvidenceId over evidenceId as the map key", () => {
    const finding = makeFinding({
      evidenceFound: [
        {
          evidenceId: "e-001",
          visualEvidenceId: "ve-999",
          summary: "",
          sourceFileName: null,
          sourceFileId: null,
          factType: null,
        },
      ],
    });
    const map = buildLinkageMap([finding]);
    expect(map.has("ve-999")).toBe(true);
    expect(map.has("e-001")).toBe(false);
  });

  it("accumulates multiple findings linked to the same evidence", () => {
    const f1 = makeFinding({ findingId: "f1", evidenceFound: [{ evidenceId: "e-001", summary: "", sourceFileName: null, sourceFileId: null, factType: null }] });
    const f2 = makeFinding({ findingId: "f2", evidenceFound: [{ evidenceId: "e-001", summary: "", sourceFileName: null, sourceFileId: null, factType: null }] });
    const map = buildLinkageMap([f1, f2]);
    expect(map.get("e-001")).toHaveLength(2);
  });
});

// ── getDistinctDomains ────────────────────────────────────────────────────

describe("getDistinctDomains", () => {
  it("returns empty array for empty evidence", () => {
    expect(getDistinctDomains([])).toEqual([]);
  });

  it("returns sorted distinct factType values", () => {
    const evidence = [
      makeEvidence({ evidenceId: "e1", factType: "reliability" }),
      makeEvidence({ evidenceId: "e2", factType: "security" }),
      makeEvidence({ evidenceId: "e3", factType: "reliability" }),
    ];
    expect(getDistinctDomains(evidence)).toEqual(["reliability", "security"]);
  });

  it("excludes evidence with empty factType", () => {
    const evidence = [
      makeEvidence({ evidenceId: "e1", factType: "" }),
      makeEvidence({ evidenceId: "e2", factType: "cost" }),
    ];
    expect(getDistinctDomains(evidence)).toEqual(["cost"]);
  });

  it("deduplicates case-insensitively preserving first display value", () => {
    const evidence = [
      makeEvidence({ evidenceId: "e1", factType: "Security" }),
      makeEvidence({ evidenceId: "e2", factType: "security" }),
    ];
    const domains = getDistinctDomains(evidence);
    expect(domains).toHaveLength(1);
    expect(domains[0]).toBe("Security");
  });
});

// ── truncateAtWordBoundary ────────────────────────────────────────────────

describe("truncateAtWordBoundary", () => {
  it("returns text unchanged when within maxLength", () => {
    expect(truncateAtWordBoundary("short text", 20)).toBe("short text");
  });

  it("returns text unchanged when exactly maxLength", () => {
    expect(truncateAtWordBoundary("hello", 5)).toBe("hello");
  });

  it("truncates at word boundary when a space exists in the first half", () => {
    const text = "The quick brown fox jumps over the lazy dog";
    const result = truncateAtWordBoundary(text, 20);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThan(text.length);
    expect(result).not.toContain(" …");
  });

  it("truncates mid-word with ellipsis when no suitable word boundary exists", () => {
    const result = truncateAtWordBoundary("abcdefghij", 5);
    expect(result).toBe("abcde…");
  });
});
