"use client";

import { useState } from "react";
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

  return (
    <div className={styles.requirementCard}>
      {/* Header: criticality badge + status badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span
          className={`${styles.criticalityBadge} ${getCriticalityClass(requirement.criticality)}`}
          aria-label={`Criticality: ${requirement.criticality}`}
        >
          {requirement.criticality}
        </span>
        <span
          className={`${styles.statusBadge} ${getStatusClass(requirement.reviewerStatus)}`}
        >
          {requirement.reviewerStatus}
        </span>
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
