"use client";

import type { ArbRequirement } from "@/arb/types";
import type { RequirementsFilterState } from "./requirements-utils";
import { filterRequirements } from "./requirements-utils";
import styles from "./arb-requirements-page.module.css";

export interface RequirementsFilterChipsProps {
  filters: RequirementsFilterState;
  onFiltersChange: (filters: RequirementsFilterState) => void;
  requirements: ArbRequirement[];
  categories: string[];
}

const CRITICALITY_LEVELS = ["High", "Medium"] as const;
const STATUS_VALUES = ["Pending", "Accepted", "Rejected"] as const;

export function RequirementsFilterChips({
  filters,
  onFiltersChange,
  requirements,
  categories,
}: RequirementsFilterChipsProps) {
  const filteredCount = filterRequirements(requirements, filters).length;
  const hasActiveFilters =
    filters.criticalities.size > 0 || filters.categories.size > 0 || filters.statuses.size > 0;

  function toggleCriticality(level: string) {
    const next = new Set(filters.criticalities);
    if (next.has(level)) next.delete(level);
    else next.add(level);
    onFiltersChange({ ...filters, criticalities: next });
  }

  function toggleCategory(category: string) {
    const next = new Set(filters.categories);
    if (next.has(category)) next.delete(category);
    else next.add(category);
    onFiltersChange({ ...filters, categories: next });
  }

  function toggleStatus(status: string) {
    const next = new Set(filters.statuses);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    onFiltersChange({ ...filters, statuses: next });
  }

  function clearAll() {
    onFiltersChange({ criticalities: new Set(), categories: new Set(), statuses: new Set() });
  }

  return (
    <div className={styles.filterRow}>
      {CRITICALITY_LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          className={`${styles.filterChip}${filters.criticalities.has(level) ? ` ${styles.filterChipActive}` : ""}`}
          onClick={() => toggleCriticality(level)}
          aria-pressed={filters.criticalities.has(level)}
          aria-label={`Filter by ${level} criticality`}
        >
          {level}
        </button>
      ))}

      {categories.map((category) => (
        <button
          key={category}
          type="button"
          className={`${styles.filterChip}${filters.categories.has(category) ? ` ${styles.filterChipActive}` : ""}`}
          onClick={() => toggleCategory(category)}
          aria-pressed={filters.categories.has(category)}
          aria-label={`Filter by ${category} category`}
        >
          {category}
        </button>
      ))}

      {STATUS_VALUES.map((status) => (
        <button
          key={status}
          type="button"
          className={`${styles.filterChip}${filters.statuses.has(status) ? ` ${styles.filterChipActive}` : ""}`}
          onClick={() => toggleStatus(status)}
          aria-pressed={filters.statuses.has(status)}
          aria-label={`Filter by ${status} status`}
        >
          {status}
        </button>
      ))}

      {hasActiveFilters && (
        <>
          <button
            type="button"
            className={styles.filterChip}
            onClick={clearAll}
            style={{ fontStyle: "italic" }}
          >
            Clear filters
          </button>
          <span style={{ fontSize: "0.82rem", color: "var(--t2)" }}>
            {filteredCount} of {requirements.length} requirements
          </span>
        </>
      )}
    </div>
  );
}
