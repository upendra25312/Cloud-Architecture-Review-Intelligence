"use client";

import { useState } from "react";
import type React from "react";
import type { ArbRequirement } from "@/arb/types";
import { truncateAtWordBoundary } from "./requirements-utils";
import styles from "./arb-requirements-page.module.css";

export interface RequirementCardProps {
  requirement: ArbRequirement;
}

function getCriticalityClass(criticality: string): string {
  if (criticality === "High") return styles["criticalityBadge--high"];
  return styles["criticalityBadge--medium"];
}

function getStatusClass(status: string): string {
  if (status === "Accepted") return styles["statusBadge--accepted"];
  if (status === "Rejected") return styles["statusBadge--rejected"];
  return styles["statusBadge--pending"];
}

const CARI_STATUS_STYLE: Record<string, React.CSSProperties> = {
  Validated:  { background: "#DCFCE7", color: "#14532D", border: "1px solid #16A34A" },
  Partial:    { background: "#FEF9C3", color: "#713F12", border: "1px solid #CA8A04" },
  "Not Found": { background: "#FEE2E2", color: "#7F1D1D", border: "1px solid #DC2626" },
  Gap:        { background: "#FFF7ED", color: "#7C2D12", border: "1px solid #EA580C" },
};

export function RequirementCard({ requirement }: RequirementCardProps) {
  const [expanded, setExpanded] = useState(false);

  const textTruncated = truncateAtWordBoundary(requirement.normalizedText ?? "", 150);
  const needsTruncation = (requirement.normalizedText ?? "").length > 150;
  const fileNameDisplay = truncateAtWordBoundary(requirement.sourceFileName ?? "Unknown source", 40);
  const fileNameFull = requirement.sourceFileName ?? "Unknown source";

  function handleToggle() {
    setExpanded((prev) => !prev);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleToggle();
    }
  }

  const cariStatus = requirement.cariStatus;
  const isGap = requirement.isGap === true;
  const cariStyle = cariStatus ? CARI_STATUS_STYLE[cariStatus] : undefined;

  return (
    <div className={styles.requirementCard} style={isGap ? { borderLeft: "3px solid #EA580C" } : undefined}>
      {/* Gap banner */}
      {isGap && (
        <div style={{ marginBottom: 8, fontSize: "0.78rem", fontWeight: 700, color: "#7C2D12", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          ⚠ Design Gap — Not in SOW
        </div>
      )}

      {/* Header: criticality badge + reviewer status badge + CARI badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        {!isGap && (
          <span
            className={`${styles.criticalityBadge} ${getCriticalityClass(requirement.criticality)}`}
            aria-label={`Criticality: ${requirement.criticality}`}
          >
            {requirement.criticality}
          </span>
        )}
        {!isGap && (
          <span className={`${styles.statusBadge} ${getStatusClass(requirement.reviewerStatus)}`}>
            {requirement.reviewerStatus}
          </span>
        )}
        {cariStatus && cariStyle && (
          <span style={{ fontSize: "0.75rem", fontWeight: 600, padding: "2px 8px", borderRadius: 10, ...cariStyle }}>
            CARI: {cariStatus}
          </span>
        )}
      </div>

      {/* Normalized text */}
      <p style={{ margin: "0 0 8px", fontSize: "0.9rem", color: "var(--t1)", lineHeight: 1.55 }}>
        {expanded ? requirement.normalizedText : textTruncated}
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

      {/* CARI validation note */}
      {requirement.cariValidationNote && (
        <p style={{ margin: "6px 0 0", fontSize: "0.8rem", color: "var(--t2)", fontStyle: "italic", lineHeight: 1.4 }}>
          {requirement.cariValidationNote}
        </p>
      )}

      {/* Source file + category */}
      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span
          style={{ fontSize: "0.82rem", color: "var(--t2)", cursor: fileNameFull.length > 40 ? "help" : undefined }}
          title={fileNameFull.length > 40 ? fileNameFull : undefined}
        >
          {fileNameDisplay}
        </span>
        <span style={{ fontSize: "0.82rem", color: "var(--t3, #9CA3AF)" }}>·</span>
        <span style={{ fontSize: "0.82rem", color: "var(--t2)" }}>
          {requirement.category}
        </span>
      </div>
    </div>
  );
}
