"use client";

import type { RequirementsMetrics } from "./requirements-utils";
import styles from "./arb-requirements-page.module.css";

export interface RequirementsSummaryMetricsProps {
  metrics: RequirementsMetrics;
}

export function RequirementsSummaryMetrics({ metrics }: RequirementsSummaryMetricsProps) {
  const allPending = metrics.total > 0 && metrics.pendingCount === metrics.total;
  const acceptanceTone =
    allPending ? "pending" : metrics.acceptanceRate >= 80 ? "green" : metrics.acceptanceRate >= 50 ? "amber" : "red";
  const acceptanceClass = acceptanceTone === "pending" ? styles.metricValue : styles[`metricValue--${acceptanceTone}`];
  const acceptanceLabel = allPending
    ? `${metrics.pendingCount} pending`
    : `${metrics.acceptanceRate}%`;

  return (
    <div className={styles.summaryMetrics}>
      <div>
        <p style={{ margin: 0, fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--brand, #0078D4)" }}>
          Total requirements
        </p>
        <p className={styles.metricValue}>{metrics.total}</p>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        {metrics.highCount > 0 && (
          <span className={`${styles.criticalityBadge} ${styles["criticalityBadge--high"]}`}>
            {metrics.highCount} High
          </span>
        )}
        <span className={`${styles.criticalityBadge} ${styles["criticalityBadge--medium"]}`}>
          {metrics.mediumCount} Medium
        </span>
      </div>

      <div>
        <p style={{ margin: 0, fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--brand, #0078D4)" }}>
          Acceptance rate
        </p>
        <p className={acceptanceClass}>
          {acceptanceLabel}
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

      {(metrics.validatedCount > 0 || metrics.partialCount > 0 || metrics.notFoundCount > 0) && (
        <div style={{ minWidth: 220 }}>
          <p style={{ margin: "0 0 6px", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--brand, #0078D4)" }}>
            SOW coverage
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 10, borderRadius: 6, background: "#F3F4F6", overflow: "hidden", display: "flex" }}>
              {metrics.validatedCount > 0 && (
                <div style={{ width: `${Math.round((metrics.validatedCount / (metrics.total - metrics.gapCount)) * 100)}%`, background: "#16A34A", transition: "width 0.4s" }} />
              )}
              {metrics.partialCount > 0 && (
                <div style={{ width: `${Math.round((metrics.partialCount / (metrics.total - metrics.gapCount)) * 100)}%`, background: "#CA8A04", transition: "width 0.4s" }} />
              )}
              {metrics.notFoundCount > 0 && (
                <div style={{ width: `${Math.round((metrics.notFoundCount / (metrics.total - metrics.gapCount)) * 100)}%`, background: "#DC2626", transition: "width 0.4s" }} />
              )}
            </div>
            <span style={{ fontSize: "0.82rem", fontWeight: 700, color: metrics.coverageRate >= 80 ? "#14532D" : metrics.coverageRate >= 50 ? "#713F12" : "#7F1D1D", whiteSpace: "nowrap" }}>
              {metrics.coverageRate}%
            </span>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 5, flexWrap: "wrap" }}>
            {metrics.validatedCount > 0 && (
              <span style={{ fontSize: "0.72rem", color: "#15803D" }}>● {metrics.validatedCount} Validated</span>
            )}
            {metrics.partialCount > 0 && (
              <span style={{ fontSize: "0.72rem", color: "#B45309" }}>● {metrics.partialCount} Partial</span>
            )}
            {metrics.notFoundCount > 0 && (
              <span style={{ fontSize: "0.72rem", color: "#DC2626" }}>● {metrics.notFoundCount} Not Found</span>
            )}
            {metrics.gapCount > 0 && (
              <span style={{ fontSize: "0.72rem", color: "#EA580C" }}>● {metrics.gapCount} Design Gap{metrics.gapCount !== 1 ? "s" : ""}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
