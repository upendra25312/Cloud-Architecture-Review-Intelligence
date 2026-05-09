"use client";

import type { ArbEvidenceFact, ArbReviewSummary } from "@/arb/types";
import { computeEvidenceMetrics, getDistinctDomains } from "./evidence-utils";
import styles from "./arb-evidence-page.module.css";

export interface EvidenceStatusBarProps {
  evidence: ArbEvidenceFact[];
  review: ArbReviewSummary;
  onExport: () => void;
  exportLoading: boolean;
}

export function EvidenceStatusBar({
  evidence,
  review,
  onExport,
  exportLoading,
}: EvidenceStatusBarProps) {
  if (evidence.length === 0) {
    return (
      <div className={styles.statusBar}>
        <span style={{ flex: 1, fontSize: "0.9rem", color: "var(--t2)" }}>
          No evidence has been extracted
        </span>
      </div>
    );
  }

  const metrics = computeEvidenceMetrics(evidence);
  const domains = getDistinctDomains(evidence);
  const summary = `${metrics.total} evidence fact${metrics.total !== 1 ? "s" : ""} across ${domains.length} domain${domains.length !== 1 ? "s" : ""}. Evidence quality: ${metrics.qualityLabel}.`;

  return (
    <div className={styles.statusBar}>
      <span style={{ flex: 1, fontSize: "0.9rem", color: "var(--t1)" }}>
        {summary}
      </span>
      <span style={{ fontSize: "0.82rem", color: "var(--t2)" }}>
        {review.workflowState}
      </span>
      <span style={{ fontSize: "0.82rem", color: "var(--t2)" }}>
        {review.evidenceReadinessState}
      </span>
      <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--t1)" }}>
        {metrics.total} total
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
