"use client";

import type { ArbFinding } from "@/arb/types";
import type { FindingsFilterState } from "./findings-utils";
import { sortFindings, filterFindings } from "./findings-utils";
import { FindingFilterChips } from "./finding-filter-chips";
import styles from "./arb-findings-page.module.css";

export interface FindingsListPanelProps {
  findings: ArbFinding[];
  selectedFindingId: string | null;
  onSelectFinding: (findingId: string) => void;
  filters: FindingsFilterState;
  onFiltersChange: (filters: FindingsFilterState) => void;
}

const SEVERITY_CLASS: Record<string, string> = {
  High: styles.severityHigh,
  Medium: styles.severityMedium,
  Low: styles.severityLow,
};

const CONFIDENCE_CLASS: Record<string, string> = {
  High: styles.confidenceHigh,
  Medium: styles.confidenceMedium,
  Low: styles.confidenceLow,
};

export function FindingsListPanel({
  findings,
  selectedFindingId,
  onSelectFinding,
  filters,
  onFiltersChange,
}: FindingsListPanelProps) {
  const sorted = sortFindings(findings);
  const filtered = filterFindings(sorted, filters);

  function handleKeyDown(event: React.KeyboardEvent) {
    const currentIndex = filtered.findIndex(
      (f) => f.findingId === selectedFindingId,
    );

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = Math.min(currentIndex + 1, filtered.length - 1);
      if (filtered[next]) onSelectFinding(filtered[next].findingId);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const prev = Math.max(currentIndex - 1, 0);
      if (filtered[prev]) onSelectFinding(filtered[prev].findingId);
    }
  }

  return (
    <div className={styles.listPanel}>
      <FindingFilterChips
        filters={filters}
        onFiltersChange={onFiltersChange}
        findings={findings}
      />

      <div
        role="listbox"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label="Findings list"
      >
        {filtered.map((finding) => {
          const isSelected = finding.findingId === selectedFindingId;
          const severityClass = SEVERITY_CLASS[finding.severity] ?? "";
          const itemClass = [
            styles.findingItem,
            severityClass,
            isSelected ? styles.findingItemSelected : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div
              key={finding.findingId}
              role="option"
              aria-selected={isSelected}
              className={itemClass}
              onClick={() => onSelectFinding(finding.findingId)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={styles.findingItemTitle}>{finding.title}</span>
                {finding.criticalBlocker && (
                  <span className={styles.blockerTag}>Blocker</span>
                )}
              </div>
              <div className={styles.findingItemMeta}>
                <span className={styles.domainTag}>{finding.domain}</span>
                <span>{finding.status}</span>
                {finding.confidence && (
                  <span className={`${styles.confidenceBadge} ${CONFIDENCE_CLASS[finding.confidence] ?? ""}`}>
                    {finding.confidence}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
