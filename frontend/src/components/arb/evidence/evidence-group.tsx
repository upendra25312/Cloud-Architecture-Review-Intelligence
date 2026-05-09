"use client";

import { useState } from "react";
import type { ArbEvidenceFact } from "@/arb/types";
import type { LinkedFinding } from "./evidence-utils";
import { EvidenceCard } from "./evidence-card";
import styles from "./arb-evidence-page.module.css";

export interface EvidenceGroupProps {
  groupName: string;
  evidenceItems: ArbEvidenceFact[];
  linkageMap: Map<string, LinkedFinding[]>;
  defaultExpanded: boolean;
  reviewId: string;
}

export function EvidenceGroup({
  groupName,
  evidenceItems,
  linkageMap,
  defaultExpanded,
  reviewId,
}: EvidenceGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Determine if all findings across all evidence items are fallback
  const allLinked = evidenceItems.flatMap((e) => linkageMap.get(e.evidenceId) ?? []);
  const allFallback =
    allLinked.length > 0 && allLinked.every((lf) => lf.findingId.startsWith("fallback-"));

  return (
    <div className={styles.groupSection}>
      <button
        type="button"
        className={styles.groupHeader}
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className={`${styles.chevron}${expanded ? ` ${styles.chevronExpanded}` : ""}`}>
          ▶
        </span>
        <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>
          {groupName} ({evidenceItems.length})
        </span>
      </button>

      {expanded && (
        <div className={styles.cardGrid}>
          {evidenceItems.map((item) => (
            <EvidenceCard
              key={item.evidenceId}
              evidence={item}
              linkedFindings={linkageMap.get(item.evidenceId) ?? []}
              allFallback={allFallback}
              reviewId={reviewId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
