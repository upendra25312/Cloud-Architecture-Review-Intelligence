"use client";

import type { ArbEvidenceFact } from "@/arb/types";
import type { EvidenceFilterState } from "./evidence-utils";
import { filterEvidence } from "./evidence-utils";
import styles from "./arb-evidence-page.module.css";

export interface EvidenceFilterChipsProps {
  filters: EvidenceFilterState;
  onFiltersChange: (filters: EvidenceFilterState) => void;
  evidence: ArbEvidenceFact[];
  domains: string[];
}

const CONFIDENCE_LEVELS = ["High", "Medium", "Low"] as const;

export function EvidenceFilterChips({
  filters,
  onFiltersChange,
  evidence,
  domains,
}: EvidenceFilterChipsProps) {
  const filteredCount = filterEvidence(evidence, filters).length;
  const hasActiveFilters = filters.confidences.size > 0 || filters.domains.size > 0;

  function toggleConfidence(level: string) {
    const next = new Set(filters.confidences);
    if (next.has(level)) {
      next.delete(level);
    } else {
      next.add(level);
    }
    onFiltersChange({ ...filters, confidences: next });
  }

  function toggleDomain(domain: string) {
    const next = new Set(filters.domains);
    if (next.has(domain)) {
      next.delete(domain);
    } else {
      next.add(domain);
    }
    onFiltersChange({ ...filters, domains: next });
  }

  function clearAll() {
    onFiltersChange({ confidences: new Set(), domains: new Set() });
  }

  return (
    <div className={styles.filterRow}>
      {CONFIDENCE_LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          className={`${styles.filterChip}${filters.confidences.has(level) ? ` ${styles.filterChipActive}` : ""}`}
          onClick={() => toggleConfidence(level)}
          aria-pressed={filters.confidences.has(level)}
          aria-label={`Filter by ${level} confidence`}
        >
          {level}
        </button>
      ))}

      {domains.map((domain) => (
        <button
          key={domain}
          type="button"
          className={`${styles.filterChip}${filters.domains.has(domain) ? ` ${styles.filterChipActive}` : ""}`}
          onClick={() => toggleDomain(domain)}
          aria-pressed={filters.domains.has(domain)}
          aria-label={`Filter by ${domain} domain`}
        >
          {domain}
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
            {filteredCount} of {evidence.length} evidence items
          </span>
        </>
      )}
    </div>
  );
}
