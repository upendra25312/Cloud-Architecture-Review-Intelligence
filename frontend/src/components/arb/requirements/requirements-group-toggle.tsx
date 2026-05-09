"use client";

import styles from "./arb-requirements-page.module.css";

export interface RequirementsGroupToggleProps {
  mode: "category" | "sourceFile";
  onModeChange: (mode: "category" | "sourceFile") => void;
}

export function RequirementsGroupToggle({ mode, onModeChange }: RequirementsGroupToggleProps) {
  return (
    <div style={{ display: "inline-flex", gap: 4 }}>
      <button
        type="button"
        className={`${styles.filterChip}${mode === "category" ? ` ${styles.filterChipActive}` : ""}`}
        onClick={() => onModeChange("category")}
        aria-pressed={mode === "category"}
      >
        Group by category
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
