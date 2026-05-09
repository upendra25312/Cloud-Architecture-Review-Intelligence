"use client";

import type {
  ArbAction,
  ArbEvidenceFact,
  ArbFinding,
  ArbRequirement,
  ArbReviewSummary,
} from "@/arb/types";
import { getSeverityDistribution } from "./overview-utils";
import { computeEvidenceMetrics } from "@/components/arb/evidence/evidence-utils";
import styles from "./arb-overview-page.module.css";

export interface OverviewMetricsGridProps {
  findings: ArbFinding[];
  evidence: ArbEvidenceFact[];
  requirements: ArbRequirement[];
  actions: ArbAction[];
  review: ArbReviewSummary;
}

export function OverviewMetricsGrid({
  findings,
  evidence,
  requirements,
  actions,
  review,
}: OverviewMetricsGridProps) {
  const severity = getSeverityDistribution(findings);
  const evidenceMetrics = computeEvidenceMetrics(evidence);
  const openActions = actions.filter((a) => a.status !== "Closed");
  const criticalBlockers = findings.filter((f) => f.criticalBlocker);

  const criticalReqs = requirements.filter(
    (r) => r.criticality?.toLowerCase() === "critical" || r.criticality?.toLowerCase() === "high",
  );
  const standardReqs = requirements.filter(
    (r) => r.criticality?.toLowerCase() === "medium" || r.criticality?.toLowerCase() === "standard",
  );
  const lowReqs = requirements.filter(
    (r) =>
      r.criticality?.toLowerCase() === "low" ||
      (!["critical", "high", "medium", "standard"].includes(r.criticality?.toLowerCase() ?? "")),
  );

  return (
    <div className={styles.metricsGrid}>
      {/* Findings */}
      <div className={`${styles.metricCard} ${styles.metricAccentRed}`}>
        <span className={styles.metricCardLabel}>Findings</span>
        <span className={styles.metricCardValue}>{findings.length}</span>
        <div className={styles.metricCardBreakdown}>
          <span style={{ color: "#D92B2B" }}>{severity.high} High</span>
          <span style={{ color: "#B45309" }}>{severity.medium} Med</span>
          <span style={{ color: "#0078D4" }}>{severity.low} Low</span>
        </div>
      </div>

      {/* Evidence */}
      <div className={`${styles.metricCard} ${styles.metricAccentBlue}`}>
        <span className={styles.metricCardLabel}>Evidence</span>
        <span className={styles.metricCardValue}>{evidence.length}</span>
        <div className={styles.metricCardBreakdown}>
          <span>{evidenceMetrics.highCount} High</span>
          <span>{evidenceMetrics.mediumCount} Med</span>
          <span>{evidenceMetrics.lowCount} Low</span>
        </div>
      </div>

      {/* Requirements */}
      <div className={`${styles.metricCard} ${styles.metricAccentGreen}`}>
        <span className={styles.metricCardLabel}>Requirements</span>
        <span className={styles.metricCardValue}>{requirements.length}</span>
        <div className={styles.metricCardBreakdown}>
          <span>{criticalReqs.length} Critical</span>
          <span>{standardReqs.length} Standard</span>
          <span>{lowReqs.length} Other</span>
        </div>
      </div>

      {/* Open Actions */}
      <div className={`${styles.metricCard} ${styles.metricAccentAmber}`}>
        <span className={styles.metricCardLabel}>Open Actions</span>
        <span className={styles.metricCardValue}>{openActions.length}</span>
        <div className={styles.metricCardBreakdown}>
          <span>{actions.length} total</span>
          <span>{actions.length - openActions.length} closed</span>
        </div>
      </div>

      {/* Critical Blockers */}
      <div className={`${styles.metricCard} ${styles.metricAccentRed}`}>
        <span className={styles.metricCardLabel}>Critical Blockers</span>
        <span className={styles.metricCardValue}>{criticalBlockers.length}</span>
        <div className={styles.metricCardBreakdown}>
          <span>{criticalBlockers.length > 0 ? "Must resolve before approval" : "None identified"}</span>
        </div>
      </div>

      {/* Evidence Readiness */}
      <div className={`${styles.metricCard} ${styles.metricAccentGreen}`}>
        <span className={styles.metricCardLabel}>Evidence Readiness</span>
        <span className={styles.metricCardValue} style={{ fontSize: "1.1rem" }}>
          {review.evidenceReadinessState}
        </span>
        <div className={styles.metricCardBreakdown}>
          <span>{evidenceMetrics.qualityLabel} quality</span>
        </div>
      </div>
    </div>
  );
}
