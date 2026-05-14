import { describe, it, expect } from "vitest";
import {
  getScoreBandLabel,
  getDomainScorePercent,
  sortDomainScores,
  getRecommendationTone,
} from "@/components/arb/scorecard/scorecard-utils";
import type { ArbDomainScore } from "@/arb/types";

function makeDomain(overrides: Partial<ArbDomainScore> = {}): ArbDomainScore {
  return {
    domain: "Security",
    weight: 10,
    score: 8,
    reason: "Good",
    linkedFindings: [],
    ...overrides,
  };
}

// ── getScoreBandLabel ─────────────────────────────────────────────────────

describe("getScoreBandLabel", () => {
  it("returns Pending for null", () => {
    expect(getScoreBandLabel(null)).toBe("Pending");
  });

  it("returns Meets threshold for score >= 80", () => {
    expect(getScoreBandLabel(80)).toBe("Meets threshold");
    expect(getScoreBandLabel(100)).toBe("Meets threshold");
  });

  it("returns Moderate for score in [70, 79]", () => {
    expect(getScoreBandLabel(70)).toBe("Moderate");
    expect(getScoreBandLabel(79)).toBe("Moderate");
  });

  it("returns At Risk for score < 70", () => {
    expect(getScoreBandLabel(69)).toBe("At Risk");
    expect(getScoreBandLabel(0)).toBe("At Risk");
  });
});

// ── getDomainScorePercent ─────────────────────────────────────────────────

describe("getDomainScorePercent", () => {
  it("calculates percentage correctly", () => {
    expect(getDomainScorePercent(makeDomain({ score: 8, weight: 10 }))).toBe(80);
  });

  it("clamps to 100", () => {
    expect(getDomainScorePercent(makeDomain({ score: 12, weight: 10 }))).toBe(100);
  });

  it("clamps to 0 for negative score", () => {
    expect(getDomainScorePercent(makeDomain({ score: -5, weight: 10 }))).toBe(0);
  });

  it("returns 0 when weight is 0", () => {
    expect(getDomainScorePercent(makeDomain({ score: 5, weight: 0 }))).toBe(0);
  });

  it("returns 0 when weight is negative", () => {
    expect(getDomainScorePercent(makeDomain({ score: 5, weight: -1 }))).toBe(0);
  });

  it("returns 0 when weight is non-finite", () => {
    expect(getDomainScorePercent(makeDomain({ score: 5, weight: Infinity }))).toBe(0);
    expect(getDomainScorePercent(makeDomain({ score: 5, weight: NaN }))).toBe(0);
  });

  it("rounds to nearest integer", () => {
    expect(getDomainScorePercent(makeDomain({ score: 1, weight: 3 }))).toBe(33);
  });
});

// ── sortDomainScores ──────────────────────────────────────────────────────

describe("sortDomainScores", () => {
  it("sorts by weight descending", () => {
    const domains = [
      makeDomain({ domain: "A", weight: 5, score: 5 }),
      makeDomain({ domain: "B", weight: 10, score: 5 }),
    ];
    const sorted = sortDomainScores(domains);
    expect(sorted[0].domain).toBe("B");
  });

  it("uses score ascending as tiebreaker (worst first)", () => {
    const domains = [
      makeDomain({ domain: "better", weight: 10, score: 9 }),
      makeDomain({ domain: "worse", weight: 10, score: 3 }),
    ];
    const sorted = sortDomainScores(domains);
    expect(sorted[0].domain).toBe("worse");
  });

  it("does not mutate the original array", () => {
    const domains = [
      makeDomain({ domain: "A", weight: 5 }),
      makeDomain({ domain: "B", weight: 10 }),
    ];
    const copy = [...domains];
    sortDomainScores(domains);
    expect(domains).toEqual(copy);
  });

  it("returns empty array for empty input", () => {
    expect(sortDomainScores([])).toEqual([]);
  });
});

// ── getRecommendationTone ─────────────────────────────────────────────────

describe("getRecommendationTone", () => {
  it("returns approved for Recommended for Approval", () => {
    expect(getRecommendationTone("Recommended for Approval")).toBe("approved");
  });

  it("is case-insensitive", () => {
    expect(getRecommendationTone("RECOMMENDED FOR APPROVAL")).toBe("approved");
  });

  it("returns attention for rejection", () => {
    expect(getRecommendationTone("Rejected")).toBe("attention");
  });

  it("returns attention for revision", () => {
    expect(getRecommendationTone("Needs Revision")).toBe("attention");
  });

  it("returns attention for remediation", () => {
    expect(getRecommendationTone("Requires Remediation")).toBe("attention");
  });

  it("returns attention for improvement", () => {
    expect(getRecommendationTone("Needs Improvement")).toBe("attention");
  });

  it("returns neutral for unknown text", () => {
    expect(getRecommendationTone("Pending Review")).toBe("neutral");
  });

  it("trims whitespace before classification", () => {
    expect(getRecommendationTone("  Recommended for Approval  ")).toBe("approved");
  });
});
