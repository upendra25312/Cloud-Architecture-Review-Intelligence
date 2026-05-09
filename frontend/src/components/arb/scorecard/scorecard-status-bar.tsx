"use client";

import type { ArbAction, ArbReviewSummary, ArbScorecard } from "@/arb/types";
import { generateSummary } from "@/components/arb/findings/findings-utils";
import styles from "./arb-scorecard-page.module.css";

export interface ScorecardStatusBarProps {
  scorecard: ArbScorecard;
  actions: ArbAction[];
  review: ArbReviewSummary;
  onExport: () => void;
  exportLoading: boolean;
}

export function ScorecardStatusBar({
  scorecard,
  actions,
  review,
  onExport,
  exportLoading,
}: ScorecardStatusBarProps) {
  // generateSummary expects findings — derive a minimal summary from scorecard data
  const summaryText = generateSummary([], scorecard);

  return (
    <div className={styles.statusBar}>
      <span className={styles.metricBadge}>{summaryText}</span>

      <span className={styles.metricBadge}>
        Workflow: <strong>{review.workflowState}</strong>
      </span>

      <span className={styles.metricBadge}>
        Evidence: <strong>{scorecard.evidenceReadinessState}</strong>
      </span>

      {scorecard.criticalBlockers > 0 && (
        <span className={styles.blockerBadge}>
          🚫 <strong>{scorecard.criticalBlockers}</strong> blocker{scorecard.criticalBlockers !== 1 ? "s" : ""}
        </span>
      )}

      {scorecard.confidence === "Low" && (
        <span className={styles.metricBadge} style={{ color: "#B45309", fontWeight: 600 }}>
          ⚠ Provisional scorecard
        </span>
      )}

      <button
        className="primary-button"
        onClick={onExport}
        disabled={exportLoading}
        style={{ marginLeft: "auto" }}
      >
        {exportLoading ? "Exporting…" : "Export Board Pack"}
      </button>
    </div>
  );
}
