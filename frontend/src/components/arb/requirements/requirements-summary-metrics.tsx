"use client";

import type { RequirementsMetrics } from "./requirements-utils";
import styles from "./arb-requirements-page.module.css";

export interface RequirementsSummaryMetricsProps {
  metrics: RequirementsMetrics;
}

export function RequirementsSummaryMetrics({ metrics }: RequirementsSummaryMetricsProps) {
  const acceptanceTone =
    metrics.acceptanceRate >= 80 ? "green" : metrics.acceptanceRate >= 50 ? "amber" : "red";
  const acceptanceClass = styles[`metricValue--${acceptanceTone}`];

  return (
    <div className={styles.summaryMetrics}>
      <div>
        <p style={{ margin: 0, fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--brand, #0078D4)" }}>
          Total requirements
        </p>
        <p className={styles.metricValue}>{metrics.total}</p>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <span className={`${styles.criticalityBadge} ${styles["criticalityBadge--high"]}`}>
          {metrics.highCount} High
        </span>
        <span className={`${styles.criticalityBadge} ${styles["criticalityBadge--medium"]}`}>
          {metrics.mediumCount} Medium
        </span>
      </div>

      <div>
        <p style={{ margin: 0, fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--brand, #0078D4)" }}>
          Acceptance rate
        </p>
        <p className={`${styles.metricValue} ${acceptanceClass}`}>
          {metrics.acceptanceRate}%
        </p>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <span className={`${styles.statusBadge} ${styles["statusBadge--pending"]}`}>
          {metrics.pendingCount} Pending
        </span>
        <span className={`${styles.statusBadge} ${styles["statusBadge--accepted"]}`}>
          {metrics.acceptedCount} Accepted
        </span>
        <span className={`${styles.statusBadge} ${styles["statusBadge--rejected"]}`}>
          {metrics.rejectedCount} Rejected
        </span>
      </div>
    </div>
  );
}
