"use client";

import styles from "./arb-evidence-page.module.css";

export interface EvidenceGroupToggleProps {
  mode: "domain" | "sourceFile";
  onModeChange: (mode: "domain" | "sourceFile") => void;
}

export function EvidenceGroupToggle({ mode, onModeChange }: EvidenceGroupToggleProps) {
  return (
    <div style={{ display: "inline-flex", gap: 4 }}>
      <button
        type="button"
        className={`${styles.filterChip}${mode === "domain" ? ` ${styles.filterChipActive}` : ""}`}
        onClick={() => onModeChange("domain")}
        aria-pressed={mode === "domain"}
      >
        Group by domain
      </button>
      <button
        type="button"
        className={`${styles.filterChip}${mode === "sourceFile" ? ` ${styles.filterChipActive}` : ""}`}
        onClick={() => onModeChange("sourceFile")}
        aria-pressed={mode === "sourceFile"}
      >
        Group by source file
      </button>
    </div>
  );
}
