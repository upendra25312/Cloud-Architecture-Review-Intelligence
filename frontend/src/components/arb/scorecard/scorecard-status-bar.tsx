"use client";

import type { ArbAction, ArbReviewSummary, ArbScorecard } from "@/arb/types";
import { generateSummary } from "@/components/arb/findings/findings-utils";
import styles from "./arb-scorecard-page.module.css";

export interface ScorecardStatusBarProps {
  scorecard: ArbScorecard;
  actions: ArbAction[];
  review: ArbReviewSummary;
}

export function ScorecardStatusBar({
  scorecard,
  actions,
  review,
}: ScorecardStatusBarProps) {
  // generateSummary expects findings — derive a minimal summary from scorecard data
  const summaryText = generateSummary([], scorecard);

  const isDecided = !!review.finalDecision;
  const displayWorkflow = isDecided ? "Decision Recorded" : review.workflowState;
  const displayEvidence = isDecided ? "Decision Recorded" : scorecard.evidenceReadinessState;

  return (
    <div className={styles.statusBar}>
      <span className={styles.metricBadge}>{summaryText}</span>

      <span className={styles.metricBadge}>
        Workflow: <strong>{displayWorkflow}</strong>
      </span>

      <span className={styles.metricBadge}>
        Evidence: <strong>{displayEvidence}</strong>
      </span>

    </div>
  );
}
