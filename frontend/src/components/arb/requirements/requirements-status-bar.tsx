"use client";

import type { ArbRequirement, ArbReviewSummary } from "@/arb/types";
import { computeRequirementsMetrics, getDistinctCategories } from "./requirements-utils";
import styles from "./arb-requirements-page.module.css";

export interface RequirementsStatusBarProps {
  requirements: ArbRequirement[];
  review: ArbReviewSummary;
}

export function RequirementsStatusBar({
  requirements,
  review,
}: RequirementsStatusBarProps) {
  if (requirements.length === 0) {
    return (
      <div className={styles.statusBar}>
        <span style={{ flex: 1, fontSize: "0.9rem", color: "var(--t2)" }}>
          No requirements have been extracted
        </span>
      </div>
    );
  }

  const metrics = computeRequirementsMetrics(requirements);
  const categories = getDistinctCategories(requirements);
  const sowTotal = metrics.total - metrics.gapCount;
  const coverageSuffix = sowTotal > 0 && (metrics.validatedCount > 0 || metrics.partialCount > 0 || metrics.notFoundCount > 0)
    ? ` CARI coverage: ${metrics.coverageRate}% (${metrics.validatedCount} validated, ${metrics.notFoundCount} not found).`
    : "";
  const summary = `${metrics.total} requirement${metrics.total !== 1 ? "s" : ""} across ${categories.length} categor${categories.length !== 1 ? "ies" : "y"}. ${metrics.pendingCount} pending review.${coverageSuffix}`;

  return (
    <div className={styles.statusBar}>
      <span style={{ flex: 1, fontSize: "0.9rem", color: "var(--t1)" }}>
        {summary}
      </span>
      <span style={{ fontSize: "0.82rem", color: "var(--t2)" }}>
        {review.workflowState}
      </span>
      <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--t1)" }}>
        {metrics.total} total
      </span>
    </div>
  );
}
