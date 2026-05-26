"use client";

import type { ArbFinding } from "@/arb/types";
import type { FindingsFilterState } from "./findings-utils";
import { sortFindings, filterFindings } from "./findings-utils";
import { FindingFilterChips } from "./finding-filter-chips";
import styles from "./arb-findings-page.module.css";

export type FindingChangeType = "new" | "escalated" | "improved" | "unchanged" | "resolved";

const CHANGE_BADGE: Record<FindingChangeType, { label: string; bg: string; color: string } | undefined> = {
  new:       { label: "NEW",       bg: "#DCFCE7", color: "#166534" },
  escalated: { label: "ESCALATED", bg: "#FEE2E2", color: "#991B1B" },
  improved:  { label: "IMPROVED",  bg: "#DBEAFE", color: "#1E40AF" },
  resolved:  undefined,
  unchanged: undefined,
};

export interface FindingsListPanelProps {
  findings: ArbFinding[];
  selectedFindingId: string | null;
  onSelectFinding: (findingId: string) => void;
  filters: FindingsFilterState;
  onFiltersChange: (filters: FindingsFilterState) => void;
  checkedIds?: Set<string>;
  onToggleCheck?: (findingId: string) => void;
  onToggleAll?: (select: boolean, ids: string[]) => void;
  deltaMap?: Map<string, FindingChangeType>;
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
  checkedIds,
  onToggleCheck,
  onToggleAll,
  deltaMap,
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

  const allChecked = filtered.length > 0 && filtered.every((f) => checkedIds?.has(f.findingId));
  const someChecked = !allChecked && filtered.some((f) => checkedIds?.has(f.findingId));

  return (
    <div className={styles.listPanel}>
      <FindingFilterChips
        filters={filters}
        onFiltersChange={onFiltersChange}
        findings={findings}
      />

      {onToggleAll && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "5px 12px",
            borderBottom: "1px solid var(--border)",
            background: "var(--surf-hover)",
          }}
        >
          <input
            type="checkbox"
            id="select-all-findings"
            checked={allChecked}
            ref={(el) => { if (el) el.indeterminate = someChecked; }}
            onChange={(e) => onToggleAll(e.target.checked, filtered.map((f) => f.findingId))}
            style={{ cursor: "pointer", flexShrink: 0 }}
          />
          <label
            htmlFor="select-all-findings"
            style={{ fontSize: "0.8rem", color: "var(--t2)", cursor: "pointer", userSelect: "none" }}
          >
            {checkedIds && checkedIds.size > 0
              ? `${checkedIds.size} of ${filtered.length} selected`
              : `Select all (${filtered.length})`}
          </label>
        </div>
      )}

      <div
        role="listbox"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label="Findings list"
      >
        {filtered.map((finding) => {
          const isSelected = finding.findingId === selectedFindingId;
          const isChecked = checkedIds?.has(finding.findingId) ?? false;
          const severityClass = SEVERITY_CLASS[finding.severity] ?? "";
          const itemClass = [
            styles.findingItem,
            severityClass,
            isSelected ? styles.findingItemSelected : "",
          ]
            .filter(Boolean)
            .join(" ");

          const changeType = deltaMap?.get(finding.findingId);
          const changeBadge = changeType ? CHANGE_BADGE[changeType] : undefined;

          return (
            <div
              key={finding.findingId}
              role="option"
              aria-selected={isSelected}
              className={itemClass}
              onClick={() => onSelectFinding(finding.findingId)}
              style={{ display: "flex", alignItems: "flex-start", gap: 8 }}
            >
              {onToggleCheck && (
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => {}}
                  onClick={(e) => { e.stopPropagation(); onToggleCheck(finding.findingId); }}
                  aria-label={`Select finding: ${finding.title}`}
                  style={{ marginTop: 3, flexShrink: 0, cursor: "pointer" }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span className={styles.findingItemTitle}>{finding.title}</span>
                  {finding.criticalBlocker && (
                    <span className={styles.blockerTag}>Blocker</span>
                  )}
                  {changeBadge && (
                    <span style={{
                      fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.04em",
                      padding: "1px 5px", borderRadius: 3,
                      background: changeBadge.bg, color: changeBadge.color,
                    }}>
                      {changeBadge.label}
                    </span>
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
