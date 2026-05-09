"use client";

import type { ArbFinding } from "@/arb/types";
import type { FindingsFilterState } from "./findings-utils";
import { filterFindings } from "./findings-utils";
import styles from "./arb-findings-page.module.css";

export interface FindingFilterChipsProps {
  filters: FindingsFilterState;
  onFiltersChange: (filters: FindingsFilterState) => void;
  findings: ArbFinding[];
}

const SEVERITIES = ["High", "Medium", "Low"] as const;
const DOMAINS = [
  "Security",
  "Reliability",
  "Cost",
  "Operations",
  "Architecture",
  "Governance",
  "Delivery",
] as const;
const STATUSES = ["Open", "Closed"] as const;

function toggleInSet(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

export function FindingFilterChips({
  filters,
  onFiltersChange,
  findings,
}: FindingFilterChipsProps) {
  const anyActive =
    filters.severities.size > 0 ||
    filters.domains.size > 0 ||
    filters.statuses.size > 0;

  const filteredCount = filterFindings(findings, filters).length;
  const totalCount = findings.length;

  function handleToggle(
    group: "severities" | "domains" | "statuses",
    value: string,
  ) {
    onFiltersChange({
      ...filters,
      [group]: toggleInSet(filters[group], value),
    });
  }

  function handleClear() {
    onFiltersChange({
      severities: new Set(),
      domains: new Set(),
      statuses: new Set(),
    });
  }

  return (
    <div className={styles.filterRow}>
      {SEVERITIES.map((s) => (
        <button
          key={s}
          type="button"
          className={filters.severities.has(s) ? styles.chipActive : styles.chipInactive}
          onClick={() => handleToggle("severities", s)}
        >
          {s}
        </button>
      ))}

      {DOMAINS.map((d) => (
        <button
          key={d}
          type="button"
          className={filters.domains.has(d) ? styles.chipActive : styles.chipInactive}
          onClick={() => handleToggle("domains", d)}
        >
          {d}
        </button>
      ))}

      {STATUSES.map((st) => (
        <button
          key={st}
          type="button"
          className={filters.statuses.has(st) ? styles.chipActive : styles.chipInactive}
          onClick={() => handleToggle("statuses", st)}
        >
          {st}
        </button>
      ))}

      {anyActive && (
        <>
          <button
            type="button"
            className={styles.clearFilters}
            onClick={handleClear}
          >
            Clear filters
          </button>
          <span className={styles.filterCount}>
            {filteredCount} of {totalCount} findings
          </span>
        </>
      )}
    </div>
  );
}
