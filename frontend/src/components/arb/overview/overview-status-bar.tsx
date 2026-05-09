"use client";

import type { ArbReviewSummary } from "@/arb/types";
import styles from "./arb-overview-page.module.css";

export interface OverviewStatusBarProps {
  review: ArbReviewSummary;
  onExport: () => void;
  exportLoading: boolean;
}

export function OverviewStatusBar({
  review,
  onExport,
  exportLoading,
}: OverviewStatusBarProps) {
  const summary = review.finalDecision
    ? `Decision recorded: ${review.finalDecision}. ${review.projectName} review is ${review.workflowState.toLowerCase()}.`
    : `${review.projectName} review is ${review.workflowState.toLowerCase()}. Recommendation: ${review.recommendation ?? "Pending"}.`;

  return (
    <div className={styles.statusBar}>
      <span className={styles.metricBadge} style={{ flex: 1 }}>
        {summary}
      </span>

      <span className={styles.metricBadge}>
        Workflow: <strong>{review.workflowState}</strong>
      </span>

      <button
        className="primary-button"
        onClick={onExport}
        disabled={exportLoading}
      >
        {exportLoading ? "Exporting…" : "Export Board Pack"}
      </button>
    </div>
  );
}
