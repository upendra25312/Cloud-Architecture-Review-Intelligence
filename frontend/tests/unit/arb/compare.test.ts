import { describe, it, expect } from "vitest";
import { computeArbComparison } from "@/arb/compare";
import type { ArbReviewSummary, ArbScorecard, ArbFinding } from "@/arb/types";

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeReview(overrides: Partial<ArbReviewSummary> = {}): ArbReviewSummary {
  return {
    reviewId: "r1",
    projectName: "Contoso LZ",
    customerName: "Contoso",
    workflowState: "Review Complete",
    evidenceReadinessState: "Ready",
    overallScore: 75,
    recommendation: "Conditional",
    assignedReviewer: null,
    ...overrides,
  };
}

function makeScorecard(overrides: Partial<ArbScorecard> = {}): ArbScorecard {
  return {
    reviewId: "r1",
    overallScore: 75,
    maxScore: 100,
    percentage: 75,
    criticalBlockers: 2,
    recommendation: "Conditional",
    reviewSummary: null,
    scoreBand: "Moderate",
    domainScores: [
      { domain: "Security", weight: 25, score: 18, reason: "Good", linkedFindings: [] },
      { domain: "Reliability", weight: 20, score: 15, reason: "OK", linkedFindings: [] },
    ],
    ...overrides,
  };
}

function makeFinding(overrides: Partial<ArbFinding> = {}): ArbFinding {
  return {
    findingId: "f1",
    reviewId: "r1",
    domain: "Security",
    title: "No WAF policy attached",
    severity: "High",
    status: "Open",
    description: "Missing policy",
    recommendation: "Attach WAF policy",
    owner: null,
    dueDate: null,
    ...overrides,
  };
}

// ─── overallDelta ─────────────────────────────────────────────────────────────

describe("overallDelta", () => {
  it("computes positive delta when head score is higher", () => {
    const result = computeArbComparison(
      makeReview(), makeReview({ reviewId: "r2" }),
      makeScorecard({ overallScore: 60 }),
      makeScorecard({ overallScore: 75 }),
      [], [],
    );
    expect(result.overallDelta).toBe(15);
  });

  it("computes negative delta when head score is lower", () => {
    const result = computeArbComparison(
      makeReview(), makeReview({ reviewId: "r2" }),
      makeScorecard({ overallScore: 80 }),
      makeScorecard({ overallScore: 65 }),
      [], [],
    );
    expect(result.overallDelta).toBe(-15);
  });

  it("is null when base scorecard is null", () => {
    const result = computeArbComparison(
      makeReview(), makeReview(), null, makeScorecard(), [], [],
    );
    expect(result.overallDelta).toBeNull();
  });

  it("is null when head scorecard is null", () => {
    const result = computeArbComparison(
      makeReview(), makeReview(), makeScorecard(), null, [], [],
    );
    expect(result.overallDelta).toBeNull();
  });
});

// ─── criticalBlockersDelta ────────────────────────────────────────────────────

describe("criticalBlockersDelta", () => {
  it("is negative when head has fewer blockers", () => {
    const result = computeArbComparison(
      makeReview(), makeReview(),
      makeScorecard({ criticalBlockers: 4 }),
      makeScorecard({ criticalBlockers: 1 }),
      [], [],
    );
    expect(result.criticalBlockersDelta).toBe(-3);
  });

  it("is null when both scorecards are null", () => {
    const result = computeArbComparison(
      makeReview(), makeReview(), null, null, [], [],
    );
    expect(result.criticalBlockersDelta).toBeNull();
  });
});

// ─── domainDeltas ─────────────────────────────────────────────────────────────

describe("domainDeltas", () => {
  it("includes domains present in both scorecards", () => {
    const base = makeScorecard({
      domainScores: [{ domain: "Security", weight: 25, score: 15, reason: "", linkedFindings: [] }],
    });
    const head = makeScorecard({
      domainScores: [{ domain: "Security", weight: 25, score: 20, reason: "", linkedFindings: [] }],
    });
    const result = computeArbComparison(makeReview(), makeReview(), base, head, [], []);
    const sec = result.domainDeltas.find((d) => d.domain === "Security");
    expect(sec?.delta).toBe(5);
    expect(sec?.baseScore).toBe(15);
    expect(sec?.headScore).toBe(20);
  });

  it("treats missing base domain score as 0", () => {
    const base = makeScorecard({ domainScores: [] });
    const head = makeScorecard({
      domainScores: [{ domain: "Networking", weight: 15, score: 12, reason: "", linkedFindings: [] }],
    });
    const result = computeArbComparison(makeReview(), makeReview(), base, head, [], []);
    const net = result.domainDeltas.find((d) => d.domain === "Networking");
    expect(net?.baseScore).toBe(0);
    expect(net?.headScore).toBe(12);
    expect(net?.delta).toBe(12);
  });

  it("treats missing head domain score as 0", () => {
    const base = makeScorecard({
      domainScores: [{ domain: "Cost", weight: 10, score: 8, reason: "", linkedFindings: [] }],
    });
    const head = makeScorecard({ domainScores: [] });
    const result = computeArbComparison(makeReview(), makeReview(), base, head, [], []);
    const cost = result.domainDeltas.find((d) => d.domain === "Cost");
    expect(cost?.headScore).toBe(0);
    expect(cost?.delta).toBe(-8);
  });

  it("sorts by weight descending", () => {
    const domainScores = [
      { domain: "Cost", weight: 10, score: 8, reason: "", linkedFindings: [] },
      { domain: "Security", weight: 25, score: 20, reason: "", linkedFindings: [] },
      { domain: "Reliability", weight: 20, score: 15, reason: "", linkedFindings: [] },
    ];
    const sc = makeScorecard({ domainScores });
    const result = computeArbComparison(makeReview(), makeReview(), sc, sc, [], []);
    expect(result.domainDeltas[0].domain).toBe("Security");
    expect(result.domainDeltas[1].domain).toBe("Reliability");
    expect(result.domainDeltas[2].domain).toBe("Cost");
  });
});

// ─── Finding classification ───────────────────────────────────────────────────

describe("finding classification — new", () => {
  it("classifies a finding in head but not base as new", () => {
    const headFinding = makeFinding({ findingId: "f-new", title: "Unencrypted data at rest" });
    const result = computeArbComparison(
      makeReview(), makeReview(), null, null, [], [headFinding],
    );
    const diff = result.findingDiffs.find((d) => d.title === "Unencrypted data at rest");
    expect(diff?.change).toBe("new");
  });

  it("counts new findings correctly", () => {
    const result = computeArbComparison(
      makeReview(), makeReview(), null, null,
      [],
      [makeFinding({ findingId: "a", title: "A" }), makeFinding({ findingId: "b", title: "B" })],
    );
    expect(result.newFindingsCount).toBe(2);
  });
});

describe("finding classification — resolved", () => {
  it("classifies a finding in base but not head as resolved", () => {
    const baseFinding = makeFinding({ title: "No MFA enforced" });
    const result = computeArbComparison(
      makeReview(), makeReview(), null, null, [baseFinding], [],
    );
    const diff = result.findingDiffs.find((d) => d.title === "No MFA enforced");
    expect(diff?.change).toBe("resolved");
  });

  it("counts resolved findings correctly", () => {
    const result = computeArbComparison(
      makeReview(), makeReview(), null, null,
      [makeFinding({ findingId: "a", title: "A" }), makeFinding({ findingId: "b", title: "B" })],
      [],
    );
    expect(result.resolvedFindingsCount).toBe(2);
  });
});

describe("finding classification — improved", () => {
  it("classifies a finding whose severity dropped as improved", () => {
    const base = makeFinding({ domain: "Security", title: "No WAF policy attached", severity: "High" });
    const head = makeFinding({ domain: "Security", title: "No WAF policy attached", severity: "Low" });
    const result = computeArbComparison(
      makeReview(), makeReview(), null, null, [base], [head],
    );
    const diff = result.findingDiffs.find((d) => d.title === "No WAF policy attached");
    expect(diff?.change).toBe("improved");
  });

  it("classifies a finding status-closed as improved even if severity unchanged", () => {
    const base = makeFinding({ domain: "Security", title: "Audit logs disabled", severity: "Medium", status: "Open" });
    const head = makeFinding({ domain: "Security", title: "Audit logs disabled", severity: "Medium", status: "Closed" });
    const result = computeArbComparison(
      makeReview(), makeReview(), null, null, [base], [head],
    );
    const diff = result.findingDiffs.find((d) => d.title === "Audit logs disabled");
    expect(diff?.change).toBe("improved");
  });
});

describe("finding classification — degraded", () => {
  it("classifies a finding whose severity increased as degraded", () => {
    const base = makeFinding({ domain: "Security", title: "Missing NSG rules", severity: "Low" });
    const head = makeFinding({ domain: "Security", title: "Missing NSG rules", severity: "Critical" });
    const result = computeArbComparison(
      makeReview(), makeReview(), null, null, [base], [head],
    );
    const diff = result.findingDiffs.find((d) => d.title === "Missing NSG rules");
    expect(diff?.change).toBe("degraded");
  });
});

describe("finding classification — unchanged", () => {
  it("classifies an identical finding as unchanged", () => {
    const finding = makeFinding({ domain: "Security", title: "No backup policy", severity: "Medium", status: "Open" });
    const result = computeArbComparison(
      makeReview(), makeReview(), null, null, [finding], [{ ...finding }],
    );
    const diff = result.findingDiffs.find((d) => d.title === "No backup policy");
    expect(diff?.change).toBe("unchanged");
  });
});

// ─── Title normalisation ──────────────────────────────────────────────────────

describe("title normalisation", () => {
  it("matches titles that differ only by case", () => {
    const base = makeFinding({ domain: "Security", title: "Missing WAF Policy", severity: "High" });
    const head = makeFinding({ domain: "Security", title: "missing waf policy", severity: "Low" });
    const result = computeArbComparison(
      makeReview(), makeReview(), null, null, [base], [head],
    );
    expect(result.resolvedFindingsCount).toBe(0);
    expect(result.newFindingsCount).toBe(0);
    const diff = result.findingDiffs[0];
    expect(diff.change).toBe("improved");
  });

  it("matches titles that differ only by punctuation and extra spaces", () => {
    const base = makeFinding({ domain: "Security", title: "Use HTTPS (port 443) only", severity: "High" });
    const head = makeFinding({ domain: "Security", title: "Use HTTPS  port 443  only", severity: "High" });
    const result = computeArbComparison(
      makeReview(), makeReview(), null, null, [base], [head],
    );
    expect(result.newFindingsCount).toBe(0);
    expect(result.resolvedFindingsCount).toBe(0);
  });

  it("does NOT match titles across different domains", () => {
    const base = makeFinding({ domain: "Security", title: "No encryption", severity: "High" });
    const head = makeFinding({ domain: "Cost", title: "No encryption", severity: "High" });
    const result = computeArbComparison(
      makeReview(), makeReview(), null, null, [base], [head],
    );
    expect(result.resolvedFindingsCount).toBe(1);
    expect(result.newFindingsCount).toBe(1);
  });
});

// ─── Empty inputs ─────────────────────────────────────────────────────────────

describe("empty inputs", () => {
  it("returns zero counts for all-empty inputs", () => {
    const result = computeArbComparison(
      makeReview(), makeReview(), null, null, [], [],
    );
    expect(result.newFindingsCount).toBe(0);
    expect(result.resolvedFindingsCount).toBe(0);
    expect(result.findingDiffs).toHaveLength(0);
    expect(result.domainDeltas).toHaveLength(0);
  });
});
