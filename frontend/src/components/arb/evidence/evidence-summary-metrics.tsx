"use client";

import type { EvidenceMetrics } from "./evidence-utils";
import styles from "./arb-evidence-page.module.css";

export interface EvidenceSummaryMetricsProps {
  metrics: EvidenceMetrics;
}

function getCoverageTone(value: number): "green" | "amber" | "red" {
  if (value >= 80) return "green";
  if (value >= 50) return "amber";
  return "red";
}

function getQualityModifier(label: string): string {
  if (label === "Strong") return styles["qualityLabel--strong"];
  if (label === "Moderate") return styles["qualityLabel--moderate"];
  return styles["qualityLabel--weak"];
}

export function EvidenceSummaryMetrics({ metrics }: EvidenceSummaryMetricsProps) {
  const coverageTone = getCoverageTone(metrics.domainCoverage);
  const coverageClass = styles[`metricValue--${coverageTone}`];

  return (
    <div className={styles.summaryMetrics}>
      <div>
        <p style={{ margin: 0, fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--brand, #0078D4)" }}>
          Total evidence
        </p>
        <p className={styles.metricValue}>{metrics.total}</p>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <span className={`${styles.confidenceBadge} ${styles["confidenceBadge--high"]}`}>
          {metrics.highCount} High
        </span>
        <span className={`${styles.confidenceBadge} ${styles["confidenceBadge--medium"]}`}>
          {metrics.mediumCount} Medium
        </span>
        <span className={`${styles.confidenceBadge} ${styles["confidenceBadge--low"]}`}>
          {metrics.lowCount} Low
        </span>
      </div>

      <div>
        <p style={{ margin: 0, fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--brand, #0078D4)" }}>
          Domain coverage
        </p>
        <p className={`${styles.metricValue} ${coverageClass}`}>
          {metrics.domainCoverage}%
        </p>
      </div>

      <div>
        <p style={{ margin: 0, fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--brand, #0078D4)" }}>
          High-confidence coverage
        </p>
        <p className={styles.metricValue}>
          {metrics.highConfidenceCoverage}%
        </p>
      </div>

      <div>
        <p style={{ margin: 0, fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--brand, #0078D4)", marginBottom: 4 }}>
          Quality
        </p>
        <span className={`${styles.qualityLabel} ${getQualityModifier(metrics.qualityLabel)}`}>
          {metrics.qualityLabel}
        </span>
      </div>
    </div>
  );
}
