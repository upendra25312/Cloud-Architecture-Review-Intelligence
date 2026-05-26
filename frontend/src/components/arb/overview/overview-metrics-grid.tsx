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
import { computeRequirementsMetrics } from "@/components/arb/requirements/requirements-utils";
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
  const reqMetrics = computeRequirementsMetrics(requirements);
  const hasCariCoverage = reqMetrics.validatedCount > 0 || reqMetrics.partialCount > 0 || reqMetrics.notFoundCount > 0;

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
        <span className={styles.metricCardLabel}>SOW Requirements</span>
        <span className={styles.metricCardValue}>{requirements.length}</span>
        {hasCariCoverage ? (
          <div className={styles.metricCardBreakdown}>
            <span style={{ color: "#15803D", fontWeight: 600 }}>{reqMetrics.coverageRate}% covered</span>
            <span style={{ color: "#B45309" }}>{reqMetrics.partialCount} partial</span>
            <span style={{ color: "#DC2626" }}>{reqMetrics.notFoundCount} not found</span>
          </div>
        ) : (
          <div className={styles.metricCardBreakdown}>
            <span>{reqMetrics.highCount} High</span>
            <span>{reqMetrics.mediumCount} Medium</span>
          </div>
        )}
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
