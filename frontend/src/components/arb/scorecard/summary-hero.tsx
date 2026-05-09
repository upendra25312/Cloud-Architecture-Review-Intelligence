"use client";

import type { ArbScorecard } from "@/arb/types";
import { getScoreTone, getScoreBandLabel, getRecommendationTone } from "./scorecard-utils";
import styles from "./arb-scorecard-page.module.css";

export interface SummaryHeroProps {
  scorecard: ArbScorecard;
  openActionCount: number;
}

const TONE_CLASS: Record<string, string> = {
  green: styles.scoreNumberGreen,
  amber: styles.scoreNumberAmber,
  red: styles.scoreNumberRed,
};

const BADGE_CLASS: Record<string, string> = {
  approved: styles.recommendationBadgeApproved,
  attention: styles.recommendationBadgeAttention,
  neutral: styles.recommendationBadgeNeutral,
};

export function SummaryHero({ scorecard, openActionCount }: SummaryHeroProps) {
  const tone = getScoreTone(scorecard.overallScore);
  const bandLabel = getScoreBandLabel(scorecard.overallScore);

  // Override decision takes precedence over derived recommendation
  const displayRecommendation =
    scorecard.reviewerOverride?.overrideDecision ?? scorecard.recommendation;
  const recTone = getRecommendationTone(displayRecommendation);

  return (
    <div className={styles.summaryHero}>
      <div className={styles.scoreCluster}>
        <span className={`${styles.scoreNumber} ${TONE_CLASS[tone] ?? styles.scoreNumberNeutral}`}>
          {scorecard.overallScore ?? "—"}
        </span>
        <div>
          <span className={styles.scoreBandLabel}>{bandLabel}</span>
          <span
            className={`${styles.recommendationBadge} ${BADGE_CLASS[recTone] ?? styles.recommendationBadgeNeutral}`}
            style={{ marginLeft: 8 }}
          >
            {displayRecommendation}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {scorecard.reviewSummary && (
          <p style={{ margin: "0 0 8px", color: "var(--t1)", fontSize: "0.95rem", lineHeight: 1.4 }}>
            {scorecard.reviewSummary}
          </p>
        )}

        <div className={styles.metricsRow}>
          <span className={styles.metricBadge}>
            Confidence: <strong>{scorecard.confidence}</strong>
          </span>
          {scorecard.criticalBlockers > 0 ? (
            <span className={styles.blockerBadge}>
              Blockers: <strong>{scorecard.criticalBlockers}</strong>
            </span>
          ) : (
            <span className={styles.metricBadge}>
              Blockers: <strong>0</strong>
            </span>
          )}
          <span className={styles.metricBadge}>
            Evidence: <strong>{scorecard.evidenceReadinessState}</strong>
          </span>
          <span className={styles.metricBadge}>
            Actions: <strong>{openActionCount}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
