import type { ArbDomainScore } from "@/arb/types";

// Re-export getScoreTone from findings-utils to avoid duplication
export { getScoreTone } from "@/components/arb/findings/findings-utils";

/** Score band label for display in the Summary Hero */
export function getScoreBandLabel(score: number | null): string {
  if (score === null) return "Pending";
  if (score >= 85) return "Strong";
  if (score >= 70) return "Moderate";
  return "At Risk";
}

/** Domain score as a percentage clamped to [0, 100]. Returns 0 when weight ≤ 0 or not finite. */
export function getDomainScorePercent(domainScore: ArbDomainScore): number {
  if (!Number.isFinite(domainScore.weight) || domainScore.weight <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((domainScore.score / domainScore.weight) * 100)));
}

/** Sort domains by weight descending, then score ascending as tiebreaker (worst-performing first). */
export function sortDomainScores(domains: ArbDomainScore[]): ArbDomainScore[] {
  return [...domains].sort((a, b) => {
    if (a.weight !== b.weight) return b.weight - a.weight;
    return a.score - b.score;
  });
}

/** Classify recommendation text for badge color. */
export function getRecommendationTone(recommendation: string): "approved" | "attention" | "neutral" {
  const normalized = recommendation.trim().toLowerCase();
  if (normalized.includes("approved")) return "approved";
  if (normalized.includes("rejected") || normalized.includes("revision") || normalized.includes("improvement")) return "attention";
  return "neutral";
}
