import { describe, it, expect } from "vitest";
import {
  getWorkflowProgress,
  getSeverityDistribution,
  getEvidenceCoveragePercent,
} from "@/components/arb/overview/overview-utils";
import type {
  ArbReviewSummary,
  ArbFinding,
  ArbScorecard,
  ArbEvidenceFact,
  ArbRequirement,
} from "@/arb/types";

function makeReview(overrides: Partial<ArbReviewSummary> = {}): ArbReviewSummary {
  return {
    reviewId: "r-001",
    projectName: "Test Project",
    customerName: "Test Customer",
    workflowState: "Draft",
    evidenceReadinessState: "Insufficient Evidence",
    overallScore: null,
    recommendation: "",
    assignedReviewer: null,
    documentCount: 0,
    finalDecision: null,
    ...overrides,
  };
}

function makeFinding(overrides: Partial<ArbFinding> = {}): ArbFinding {
  return {
    findingId: "f-001",
    reviewId: "r-001",
    severity: "Medium",
    domain: "Security",
    findingType: "Gap",
    title: "Test",
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

function makeEvidence(factType: string): ArbEvidenceFact {
  return {
    evidenceId: `e-${factType}`,
    reviewId: "r-001",
    sourceFileId: null,
    sourceFileName: null,
    factType,
    summary: "",
    sourceExcerpt: "",
    confidence: "High",
  };
}

function makeRequirement(): ArbRequirement {
  return {
    requirementId: "req-001",
    reviewId: "r-001",
    sourceFileId: null,
    sourceFileName: null,
    normalizedText: "Must have HA",
    category: "Reliability",
    criticality: "High",
    reviewerStatus: "Open",
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

// ── getWorkflowProgress ───────────────────────────────────────────────────

describe("getWorkflowProgress", () => {
  it("all steps pending when review has nothing", () => {
    const steps = getWorkflowProgress(makeReview(), [], null, [], []);
    expect(steps.find((s) => s.step === "upload")?.status).toBe("active");
    expect(steps.find((s) => s.step === "requirements")?.status).toBe("pending");
    expect(steps.find((s) => s.step === "evidence")?.status).toBe("pending");
  });

  it("upload is complete when documentCount > 0", () => {
    const steps = getWorkflowProgress(makeReview({ documentCount: 3 }), [], null, [], []);
    expect(steps.find((s) => s.step === "upload")?.status).toBe("complete");
  });

  it("requirements active when documents present but no requirements yet", () => {
    const steps = getWorkflowProgress(makeReview({ documentCount: 1 }), [], null, [], []);
    expect(steps.find((s) => s.step === "requirements")?.status).toBe("active");
  });

  it("requirements complete when requirements exist", () => {
    const steps = getWorkflowProgress(makeReview({ documentCount: 1 }), [], null, [], [makeRequirement()]);
    expect(steps.find((s) => s.step === "requirements")?.status).toBe("complete");
  });

  it("evidence complete when evidence exists", () => {
    const steps = getWorkflowProgress(
      makeReview({ documentCount: 1 }),
      [],
      null,
      [makeEvidence("architecture")],
      [makeRequirement()],
    );
    expect(steps.find((s) => s.step === "evidence")?.status).toBe("complete");
  });

  it("findings complete when findings exist", () => {
    const steps = getWorkflowProgress(
      makeReview({ documentCount: 1 }),
      [makeFinding()],
      null,
      [makeEvidence("architecture")],
      [makeRequirement()],
    );
    expect(steps.find((s) => s.step === "findings")?.status).toBe("complete");
  });

  it("scorecard complete when scorecard has overallScore", () => {
    const steps = getWorkflowProgress(
      makeReview({ documentCount: 1 }),
      [makeFinding()],
      makeScorecard({ overallScore: 85 }),
      [makeEvidence("architecture")],
      [makeRequirement()],
    );
    expect(steps.find((s) => s.step === "scorecard")?.status).toBe("complete");
  });

  it("scorecard not complete when overallScore is null", () => {
    const steps = getWorkflowProgress(
      makeReview({ documentCount: 1 }),
      [makeFinding()],
      makeScorecard({ overallScore: null }),
      [makeEvidence("architecture")],
      [makeRequirement()],
    );
    expect(steps.find((s) => s.step === "scorecard")?.status).not.toBe("complete");
  });

  it("decision complete when finalDecision is set", () => {
    const steps = getWorkflowProgress(
      makeReview({ documentCount: 1, finalDecision: "Approved" }),
      [makeFinding()],
      makeScorecard({ overallScore: 85 }),
      [makeEvidence("architecture")],
      [makeRequirement()],
    );
    expect(steps.find((s) => s.step === "decision")?.status).toBe("complete");
  });

  it("returns exactly 6 steps", () => {
    const steps = getWorkflowProgress(makeReview(), [], null, [], []);
    expect(steps).toHaveLength(6);
  });
});

// ── getSeverityDistribution ───────────────────────────────────────────────

describe("getSeverityDistribution", () => {
  it("returns zeroes for empty findings", () => {
    expect(getSeverityDistribution([])).toEqual({ high: 0, medium: 0, low: 0 });
  });

  it("counts each severity correctly", () => {
    const findings = [
      makeFinding({ severity: "High" }),
      makeFinding({ severity: "High" }),
      makeFinding({ severity: "Medium" }),
      makeFinding({ severity: "Low" }),
    ];
    expect(getSeverityDistribution(findings)).toEqual({ high: 2, medium: 1, low: 1 });
  });

  it("treats unknown severity as low", () => {
    const findings = [makeFinding({ severity: "Unknown" as string })];
    const dist = getSeverityDistribution(findings);
    expect(dist.low).toBe(1);
    expect(dist.high).toBe(0);
    expect(dist.medium).toBe(0);
  });
});

// ── getEvidenceCoveragePercent ────────────────────────────────────────────

describe("getEvidenceCoveragePercent", () => {
  it("returns 0 for empty evidence", () => {
    expect(getEvidenceCoveragePercent([])).toBe(0);
  });

  it("counts distinct factType domains", () => {
    const evidence = [
      makeEvidence("security"),
      makeEvidence("reliability"),
      makeEvidence("security"), // duplicate — should not count twice
    ];
    const pct = getEvidenceCoveragePercent(evidence);
    expect(pct).toBe(Math.round((2 / 7) * 100));
  });

  it("returns 100 when all 7 expected domains are covered", () => {
    const domains = ["a", "b", "c", "d", "e", "f", "g"];
    const evidence = domains.map(makeEvidence);
    expect(getEvidenceCoveragePercent(evidence)).toBe(100);
  });

  it("caps at 100 when more than 7 domains present", () => {
    const domains = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
    const evidence = domains.map(makeEvidence);
    expect(getEvidenceCoveragePercent(evidence)).toBe(100);
  });

  it("ignores evidence with empty factType", () => {
    const evidence = [makeEvidence(""), makeEvidence("security")];
    const pct = getEvidenceCoveragePercent(evidence);
    expect(pct).toBe(Math.round((1 / 7) * 100));
  });
});
