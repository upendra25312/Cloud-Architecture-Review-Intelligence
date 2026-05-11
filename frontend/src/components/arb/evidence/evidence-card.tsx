"use client";

import { useState } from "react";
import type { ArbEvidenceFact } from "@/arb/types";
import type { LinkedFinding } from "./evidence-utils";
import { truncateAtWordBoundary } from "./evidence-utils";
import styles from "./arb-evidence-page.module.css";

export interface EvidenceCardProps {
  evidence: ArbEvidenceFact;
  linkedFindings: LinkedFinding[];
  allFallback: boolean;
  reviewId: string;
}

function getConfidenceClass(confidence: string): string {
  if (confidence === "High") return styles["confidenceBadge--high"];
  if (confidence === "Medium") return styles["confidenceBadge--medium"];
  return styles["confidenceBadge--low"];
}

function getSeverityClass(severity: string): string {
  if (severity === "High") return styles["severityBadge--high"];
  if (severity === "Medium") return styles["severityBadge--medium"];
  return styles["severityBadge--low"];
}

export function EvidenceCard({
  evidence,
  linkedFindings,
  allFallback,
  reviewId,
}: EvidenceCardProps) {
  const [expanded, setExpanded] = useState(false);

  const summaryTruncated = truncateAtWordBoundary(evidence.summary ?? "", 150);
  const needsTruncation = (evidence.summary ?? "").length > 150;
  const fileNameDisplay = truncateAtWordBoundary(evidence.sourceFileName ?? "Unknown source", 40);
  const fileNameFull = evidence.sourceFileName ?? "Unknown source";
  const hasExcerpt = Boolean(evidence.sourceExcerpt);
  const linkCount = linkedFindings.length;
  const isVisualEvidence = evidence.factType === "VisualArchitecture" || Boolean(evidence.visualEvidenceId);
  const sourceLocation = [
    evidence.sourcePage ? `Page ${evidence.sourcePage}` : null,
    evidence.sourceSlide ? `Slide ${evidence.sourceSlide}` : null,
    evidence.sourceSheet ? `Sheet ${evidence.sourceSheet}` : null,
  ].filter(Boolean).join(" · ");

  function handleToggle() {
    setExpanded((prev) => !prev);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleToggle();
    }
  }

  return (
    <div className={styles.evidenceCard}>
      {/* Header: confidence badge + source file */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span
          className={`${styles.confidenceBadge} ${getConfidenceClass(evidence.confidence)}`}
          aria-label={`Confidence: ${evidence.confidence}`}
        >
          {evidence.confidence}
        </span>
        <span
          style={{ fontSize: "0.82rem", color: "var(--t2)", cursor: fileNameFull.length > 40 ? "help" : undefined }}
          title={fileNameFull.length > 40 ? fileNameFull : undefined}
        >
          {fileNameDisplay}
        </span>
        {hasExcerpt && (
          <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--brand, #0078D4)", background: "#EFF6FF", padding: "1px 6px", borderRadius: 3 }}>
            Quoted
          </span>
        )}
        {isVisualEvidence && (
          <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "#166534", background: "#DCFCE7", padding: "1px 6px", borderRadius: 3 }}>
            Visual
          </span>
        )}
      </div>

      {isVisualEvidence && (
        <div style={{ marginBottom: 8, display: "flex", flexDirection: "column", gap: 4, fontSize: "0.78rem", color: "var(--t2)" }}>
          <span><strong>ID:</strong> {evidence.visualEvidenceId || evidence.evidenceId}</span>
          {sourceLocation ? <span><strong>Location:</strong> {sourceLocation}</span> : null}
          {evidence.imageUri ? <span><strong>Artifact:</strong> {evidence.imageUri}</span> : null}
        </div>
      )}

      {/* Summary */}
      <p style={{ margin: "0 0 8px", fontSize: "0.9rem", color: "var(--t1)", lineHeight: 1.55 }}>
        {expanded ? evidence.summary : summaryTruncated}
      </p>

      {needsTruncation && (
        <span
          role="button"
          tabIndex={0}
          onClick={handleToggle}
          onKeyDown={handleKeyDown}
          style={{ fontSize: "0.82rem", color: "var(--brand, #0078D4)", cursor: "pointer", fontWeight: 500 }}
        >
          {expanded ? "Show less" : "Read more"}
        </span>
      )}

      {/* Expanded: source excerpt */}
      {expanded && hasExcerpt && (
        <div className={styles.excerptBlock}>
          {evidence.sourceExcerpt}
        </div>
      )}

      {expanded && isVisualEvidence && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, fontSize: "0.82rem", color: "var(--t2)" }}>
          {evidence.detectedAzureServices?.length ? (
            <span><strong>Azure services:</strong> {evidence.detectedAzureServices.join(", ")}</span>
          ) : null}
          {evidence.detectedArchitecturePatterns?.length ? (
            <span><strong>Patterns:</strong> {evidence.detectedArchitecturePatterns.join(", ")}</span>
          ) : null}
          {evidence.extractionSource ? <span><strong>Extraction:</strong> {evidence.extractionSource}</span> : null}
          {evidence.promptInjectionRisk && evidence.promptInjectionRisk !== "NoneDetected" ? (
            <span style={{ color: "#B45309" }}><strong>Prompt-injection risk:</strong> {evidence.promptInjectionRisk}</span>
          ) : null}
          {evidence.analysisError ? (
            <span style={{ color: "#B91C1C" }}><strong>Visual analysis warning:</strong> {evidence.analysisError}</span>
          ) : null}
        </div>
      )}

      {/* Linked findings count (always visible) */}
      <div style={{ marginTop: 8, fontSize: "0.82rem", color: "var(--t2)" }}>
        {allFallback ? (
          <span style={{ fontStyle: "italic", color: "var(--t3, #9CA3AF)" }}>
            Finding linkage unavailable — re-run assessment
          </span>
        ) : linkCount > 0 ? (
          <span>Supports {linkCount} finding{linkCount !== 1 ? "s" : ""}</span>
        ) : (
          <span style={{ color: "var(--t3, #9CA3AF)" }}>No linked findings</span>
        )}
      </div>

      {/* Expanded: linked finding titles with severity badges */}
      {expanded && !allFallback && linkCount > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {linkedFindings.map((lf) => (
            <a
              key={lf.findingId}
              href={`/arb/${encodeURIComponent(reviewId)}/findings`}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", color: "var(--t1)", textDecoration: "none" }}
            >
              <span className={`${styles.severityBadge} ${getSeverityClass(lf.severity)}`}>
                {lf.severity}
              </span>
              <span style={{ textDecoration: "underline" }}>{lf.title}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
