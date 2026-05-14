import { describe, it, expect } from "vitest";
import {
  sortFindings,
  filterFindings,
  generateSummary,
  getScoreTone,
  SEVERITY_ORDER,
  DOMAIN_ORDER,
} from "@/components/arb/findings/findings-utils";
import type { ArbFinding, ArbScorecard } from "@/arb/types";

function makeFinding(overrides: Partial<ArbFinding> = {}): ArbFinding {
  return {
    findingId: "f-001",
    reviewId: "r-001",
    severity: "Medium",
    domain: "Security",
    findingType: "Gap",
    title: "Test finding",
    findingStatement: "Statement",
    whyItMatters: "Matters",
    evidenceBasis: "Evidence",
    evidenceFound: [],
    missingEvidence: [],
    recommendation: "Fix it",
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

function makeScorecard(overrides: Partial<ArbScorecard> = {}): ArbScorecard {
  return {
    overallScore: 85,
    recommendation: "Recommended for Approval",
    confidence: "High",
    criticalBlockers: 0,
    evidenceReadinessState: "Ready for Review",
    domainScores: [],
    reviewerOverride: null,
    ...overrides,
  };
}

// ── sortFindings ──────────────────────────────────────────────────────────

describe("sortFindings", () => {
  it("sorts High before Medium before Low", () => {
    const findings = [
      makeFinding({ findingId: "c", severity: "Low" }),
      makeFinding({ findingId: "a", severity: "High" }),
      makeFinding({ findingId: "b", severity: "Medium" }),
    ];
    const sorted = sortFindings(findings);
    expect(sorted.map((f) => f.findingId)).toEqual(["a", "b", "c"]);
  });

  it("puts critical blockers before non-blockers within the same severity", () => {
    const findings = [
      makeFinding({ findingId: "non", severity: "High", criticalBlocker: false }),
      makeFinding({ findingId: "blocker", severity: "High", criticalBlocker: true }),
    ];
    const sorted = sortFindings(findings);
    expect(sorted[0].findingId).toBe("blocker");
  });

  it("sorts by domain order when severity and blocker are equal", () => {
    const findings = [
      makeFinding({ findingId: "cost", severity: "High", domain: "Cost" }),
      makeFinding({ findingId: "sec", severity: "High", domain: "Security" }),
    ];
    const sorted = sortFindings(findings);
    expect(sorted[0].findingId).toBe("sec");
  });

  it("unknown severity sorts last (order 3)", () => {
    const findings = [
      makeFinding({ findingId: "unknown", severity: "Unknown" as string }),
      makeFinding({ findingId: "low", severity: "Low" }),
    ];
    const sorted = sortFindings(findings);
    expect(sorted[0].findingId).toBe("low");
  });

  it("does not mutate the original array", () => {
    const original = [
      makeFinding({ findingId: "b", severity: "Medium" }),
      makeFinding({ findingId: "a", severity: "High" }),
    ];
    const copy = [...original];
    sortFindings(original);
    expect(original).toEqual(copy);
  });

  it("returns empty array for empty input", () => {
    expect(sortFindings([])).toEqual([]);
  });
});

// ── filterFindings ────────────────────────────────────────────────────────

describe("filterFindings", () => {
  const emptyFilter = { severities: new Set<string>(), domains: new Set<string>(), statuses: new Set<string>() };

  it("returns all findings when all filter sets are empty", () => {
    const findings = [makeFinding(), makeFinding({ findingId: "f-002" })];
    expect(filterFindings(findings, emptyFilter)).toHaveLength(2);
  });

  it("filters by severity", () => {
    const findings = [
      makeFinding({ findingId: "h", severity: "High" }),
      makeFinding({ findingId: "m", severity: "Medium" }),
    ];
    const result = filterFindings(findings, { ...emptyFilter, severities: new Set(["High"]) });
    expect(result.map((f) => f.findingId)).toEqual(["h"]);
  });

  it("filters by domain", () => {
    const findings = [
      makeFinding({ findingId: "sec", domain: "Security" }),
      makeFinding({ findingId: "rel", domain: "Reliability" }),
    ];
    const result = filterFindings(findings, { ...emptyFilter, domains: new Set(["Reliability"]) });
    expect(result.map((f) => f.findingId)).toEqual(["rel"]);
  });

  it("normalises Closed status correctly", () => {
    const findings = [
      makeFinding({ findingId: "open", status: "Open" }),
      makeFinding({ findingId: "closed", status: "Closed" }),
    ];
    const result = filterFindings(findings, { ...emptyFilter, statuses: new Set(["Closed"]) });
    expect(result.map((f) => f.findingId)).toEqual(["closed"]);
  });

  it("any non-Closed status counts as Open", () => {
    const findings = [
      makeFinding({ findingId: "open", status: "Open" }),
      makeFinding({ findingId: "inprogress", status: "In Progress" }),
      makeFinding({ findingId: "closed", status: "Closed" }),
    ];
    const result = filterFindings(findings, { ...emptyFilter, statuses: new Set(["Open"]) });
    expect(result.map((f) => f.findingId)).toContain("open");
    expect(result.map((f) => f.findingId)).toContain("inprogress");
    expect(result.map((f) => f.findingId)).not.toContain("closed");
  });

  it("applies AND logic across multiple filters", () => {
    const findings = [
      makeFinding({ findingId: "match", severity: "High", domain: "Security" }),
      makeFinding({ findingId: "wrong-domain", severity: "High", domain: "Reliability" }),
      makeFinding({ findingId: "wrong-sev", severity: "Low", domain: "Security" }),
    ];
    const result = filterFindings(findings, {
      ...emptyFilter,
      severities: new Set(["High"]),
      domains: new Set(["Security"]),
    });
    expect(result.map((f) => f.findingId)).toEqual(["match"]);
  });
});

// ── generateSummary ───────────────────────────────────────────────────────

describe("generateSummary", () => {
  it("returns ready message when no findings and scorecard recommends approval", () => {
    const scorecard = makeScorecard({ recommendation: "Recommended for Approval" });
    expect(generateSummary([], scorecard)).toBe("All findings addressed. Review is ready for sign-off.");
  });

  it("returns default message when no findings and no scorecard", () => {
    expect(generateSummary([], null)).toBe("Review findings below and assign owners to open items.");
  });

  it("mentions critical blocker count", () => {
    const findings = [makeFinding({ criticalBlocker: true }), makeFinding({ criticalBlocker: true })];
    const result = generateSummary(findings, null);
    expect(result).toContain("2 critical blockers");
  });

  it("uses singular for one blocker", () => {
    const findings = [makeFinding({ criticalBlocker: true })];
    expect(generateSummary(findings, null)).toContain("1 critical blocker must");
  });

  it("lists domains with high-severity findings", () => {
    const findings = [
      makeFinding({ severity: "High", domain: "Security" }),
      makeFinding({ severity: "High", domain: "Reliability" }),
    ];
    const result = generateSummary(findings, null);
    expect(result).toContain("Security");
    expect(result).toContain("Reliability");
  });

  it("deduplicates domains", () => {
    const findings = [
      makeFinding({ findingId: "a", severity: "High", domain: "Security" }),
      makeFinding({ findingId: "b", severity: "High", domain: "Security" }),
    ];
    const result = generateSummary(findings, null);
    const matches = result.match(/Security/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});

// ── getScoreTone ──────────────────────────────────────────────────────────

describe("getScoreTone", () => {
  it("returns red for null score", () => {
    expect(getScoreTone(null)).toBe("red");
  });

  it("returns green for score >= 80", () => {
    expect(getScoreTone(80)).toBe("green");
    expect(getScoreTone(100)).toBe("green");
  });

  it("returns amber for score in [70, 79]", () => {
    expect(getScoreTone(70)).toBe("amber");
    expect(getScoreTone(79)).toBe("amber");
  });

  it("returns red for score < 70", () => {
    expect(getScoreTone(69)).toBe("red");
    expect(getScoreTone(0)).toBe("red");
  });
});

// ── constant sanity checks ────────────────────────────────────────────────

describe("SEVERITY_ORDER", () => {
  it("High < Medium < Low", () => {
    expect(SEVERITY_ORDER["High"]).toBeLessThan(SEVERITY_ORDER["Medium"]);
    expect(SEVERITY_ORDER["Medium"]).toBeLessThan(SEVERITY_ORDER["Low"]);
  });
});

describe("DOMAIN_ORDER", () => {
  it("Security is the highest-priority domain (order 0)", () => {
    expect(DOMAIN_ORDER["Security"]).toBe(0);
  });
});
