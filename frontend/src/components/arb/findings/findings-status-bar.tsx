"use client";

import type { ArbFinding, ArbAction, ArbScorecard, ArbReviewSummary } from "@/arb/types";
import { generateSummary, getScoreTone } from "./findings-utils";
import styles from "./arb-findings-page.module.css";

export interface FindingsStatusBarProps {
  findings: ArbFinding[];
  actions: ArbAction[];
  scorecard: ArbScorecard | null;
  review: ArbReviewSummary;
  onExport: () => void;
  exportLoading: boolean;
}

const TONE_COLORS: Record<string, string> = {
  green: "#107C10",
  amber: "#B45309",
  red: "#D92B2B",
};

export function FindingsStatusBar({
  findings,
  actions,
  scorecard,
  review,
  onExport,
  exportLoading,
}: FindingsStatusBarProps) {
  const summary = generateSummary(findings, scorecard);
  const totalCount = findings.length;
  const blockerCount = findings.filter((f) => f.criticalBlocker).length;
  const score = review.overallScore;
  const tone = getScoreTone(score);
  const openActionCount = actions.filter((a) => a.status !== "Closed").length;

  return (
    <div className={styles.statusBar}>
      <span style={{ flex: 1, minWidth: 0 }}>{summary}</span>

      <span className={styles.metricBadge} title="Total findings">
        <strong>{totalCount}</strong> findings
      </span>

      {blockerCount > 0 && (
        <span className={styles.blockerBadge} title="Critical blockers">
          <strong>{blockerCount}</strong> blocker{blockerCount !== 1 ? "s" : ""}
        </span>
      )}

      <span
        className={styles.metricBadge}
        style={{ color: TONE_COLORS[tone] }}
        title="Overall score"
      >
        {score !== null ? (
          <>
            Score: <strong>{score}</strong>
          </>
        ) : (
          "Pending"
        )}
      </span>

      <span className={styles.metricBadge} title="Evidence readiness">
        {review.evidenceReadinessState}
      </span>

      <span className={styles.metricBadge} title="Open actions">
        <strong>{openActionCount}</strong> open action{openActionCount !== 1 ? "s" : ""}
      </span>

      <button
        type="button"
        className="primary-button"
        onClick={onExport}
        disabled={exportLoading}
      >
        {exportLoading ? "Exporting\u2026" : "Export Board Pack"}
      </button>
    </div>
  );
}
