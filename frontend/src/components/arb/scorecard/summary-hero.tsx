"use client";

import type { ArbScorecard } from "@/arb/types";
import { getScoreTone, getScoreBandLabel, getRecommendationTone } from "./scorecard-utils";
import styles from "./arb-scorecard-page.module.css";

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

export interface SummaryHeroProps {
  scorecard: ArbScorecard;
  openActionCount: number;
  finalDecision?: string | null;
}

export function SummaryHero({ scorecard, openActionCount, finalDecision }: SummaryHeroProps) {
  const tone = getScoreTone(scorecard.overallScore);
  const bandLabel = getScoreBandLabel(scorecard.overallScore);

  const overrideDecision = scorecard.reviewerOverride?.overrideDecision ?? finalDecision;
  const cariRecommendation = scorecard.recommendation;
  const hasHumanDecision = !!overrideDecision;

  // When a human decision exists, show it prominently. Show CARI recommendation
  // as a secondary note only when the two differ.
  const decisionTone = getRecommendationTone(overrideDecision ?? cariRecommendation);
  const showCariNote = hasHumanDecision && overrideDecision !== cariRecommendation;

  // Score colour: neutral when decision is recorded (score is historical context, not a live risk signal)
  const scoreTone = hasHumanDecision ? "neutral" : tone;

  return (
    <div className={styles.summaryHero}>
      <div className={styles.scoreCluster}>
        <span className={`${styles.scoreNumber} ${TONE_CLASS[scoreTone] ?? styles.scoreNumberNeutral}`}>
          {scorecard.overallScore ?? "—"}
        </span>
        <span className={styles.scoreBandLabel}>{hasHumanDecision ? "Score at decision" : bandLabel}</span>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {scorecard.reviewSummary && (
          <p style={{ margin: "0 0 8px", color: "var(--t1)", fontSize: "0.95rem", lineHeight: 1.4 }}>
            {scorecard.reviewSummary}
          </p>
        )}

        <div className={styles.metricsRow}>
          {hasHumanDecision ? (
            <>
              <span
                className={`${styles.recommendationBadge} ${BADGE_CLASS[decisionTone] ?? styles.recommendationBadgeNeutral}`}
                style={{ fontSize: "0.9rem", padding: "4px 12px" }}
              >
                Reviewer: {overrideDecision}
              </span>
              {showCariNote && (
                <span className={styles.metricBadge} style={{ color: "var(--t3)", fontStyle: "italic" }}>
                  CARI assessed: {cariRecommendation}
                </span>
              )}
            </>
          ) : (
            <>
              <span
                className={`${styles.recommendationBadge} ${BADGE_CLASS[decisionTone] ?? styles.recommendationBadgeNeutral}`}
              >
                {cariRecommendation}
              </span>
              {scorecard.confidence === "High" && (
                <span className={styles.metricBadge} style={{ color: "#107C10", fontWeight: 600 }}>
                  Assessment: High
                </span>
              )}
              {scorecard.criticalBlockers > 0 && (
                <span className={styles.blockerBadge}>
                  <strong>{scorecard.criticalBlockers}</strong> unresolved blocker{scorecard.criticalBlockers !== 1 ? "s" : ""}
                </span>
              )}
            </>
          )}
          <span className={styles.metricBadge}>
            Actions: <strong>{openActionCount}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
