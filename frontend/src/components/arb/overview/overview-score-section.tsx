"use client";

import type { ArbReviewSummary, ArbScorecard } from "@/arb/types";
import { getScoreTone } from "@/components/arb/findings/findings-utils";
import { getScoreBandLabel } from "@/components/arb/scorecard/scorecard-utils";
import styles from "./arb-overview-page.module.css";

export interface OverviewScoreSectionProps {
  scorecard: ArbScorecard | null;
  review: ArbReviewSummary;
}

function getGaugeClass(score: number | null): string {
  if (score === null) return styles.scoreGaugeNeutral;
  if (score >= 85) return styles.scoreGaugeGreen;
  if (score >= 70) return styles.scoreGaugeAmber;
  return styles.scoreGaugeRed;
}

function getRecommendationBadgeClass(recommendation: string): string {
  const normalized = recommendation.trim().toLowerCase();
  if (normalized.includes("approved")) return styles.recommendationBadgeGreen;
  if (normalized.includes("rejected")) return styles.recommendationBadgeRed;
  if (normalized.includes("revision") || normalized.includes("improvement"))
    return styles.recommendationBadgeAmber;
  return styles.recommendationBadgeNeutral;
}

export function OverviewScoreSection({
  scorecard,
  review,
}: OverviewScoreSectionProps) {
  const score = scorecard?.overallScore ?? review.overallScore;
  const recommendation =
    review.finalDecision ?? scorecard?.recommendation ?? review.recommendation ?? "Pending";
  const confidence = scorecard?.confidence ?? null;
  const bandLabel = getScoreBandLabel(score ?? null);

  return (
    <div className={styles.scoreGauge}>
      <div className={`${styles.scoreGaugeNumber} ${getGaugeClass(score ?? null)}`}>
        {score ?? "—"}
      </div>
      <span className={styles.scoreBandLabel}>{bandLabel}</span>
      <span className={`${styles.recommendationBadge} ${getRecommendationBadgeClass(recommendation)}`}>
        {recommendation}
      </span>
      {confidence && (
        <span className={styles.confidenceLabel}>
          Confidence: {confidence}
        </span>
      )}
    </div>
  );
}
