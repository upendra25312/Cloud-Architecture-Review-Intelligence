import type { ArbFinding, ArbScorecard } from "@/arb/types";

// ── Filter state (local-only, not persisted) ──────────────────────────
export interface FindingsFilterState {
  severities: Set<string>;
  domains: Set<string>;
  statuses: Set<string>;
}

// ── Canonical ordering constants ──────────────────────────────────────
export const SEVERITY_ORDER: Record<string, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
};

export const DOMAIN_ORDER: Record<string, number> = {
  Security: 0,
  Reliability: 1,
  Cost: 2,
  Operations: 3,
  Architecture: 4,
  Governance: 5,
  Delivery: 6,
};

// ── Sort: severity → blocker → domain ─────────────────────────────────
export function sortFindings(findings: ArbFinding[]): ArbFinding[] {
  return [...findings].sort((a, b) => {
    const sevA = SEVERITY_ORDER[a.severity] ?? 3;
    const sevB = SEVERITY_ORDER[b.severity] ?? 3;
    if (sevA !== sevB) return sevA - sevB;

    const blockerA = a.criticalBlocker ? 0 : 1;
    const blockerB = b.criticalBlocker ? 0 : 1;
    if (blockerA !== blockerB) return blockerA - blockerB;

    const domA = DOMAIN_ORDER[a.domain] ?? 99;
    const domB = DOMAIN_ORDER[b.domain] ?? 99;
    return domA - domB;
  });
}

// ── Filter: AND logic across severity, domain, status ─────────────────
export function filterFindings(
  findings: ArbFinding[],
  filters: FindingsFilterState,
): ArbFinding[] {
  return findings.filter((f) => {
    if (filters.severities.size > 0 && !filters.severities.has(f.severity))
      return false;
    if (filters.domains.size > 0 && !filters.domains.has(f.domain))
      return false;
    if (filters.statuses.size > 0) {
      const normalized = f.status === "Closed" ? "Closed" : "Open";
      if (!filters.statuses.has(normalized)) return false;
    }
    return true;
  });
}

// ── Summary sentence for the status bar ───────────────────────────────
export function generateSummary(
  findings: ArbFinding[],
  scorecard: ArbScorecard | null,
): string {
  const blockers = findings.filter((f) => f.criticalBlocker);
  const domainsAtRisk = [
    ...new Set(
      findings.filter((f) => f.severity === "High").map((f) => f.domain),
    ),
  ];

  const parts: string[] = [];

  if (blockers.length > 0) {
    parts.push(
      `${blockers.length} critical blocker${blockers.length > 1 ? "s" : ""} must be resolved before approval.`,
    );
  }

  if (domainsAtRisk.length > 0) {
    parts.push(
      `${domainsAtRisk.join(" and ")} domain${domainsAtRisk.length > 1 ? "s" : ""} need${domainsAtRisk.length === 1 ? "s" : ""} attention.`,
    );
  }

  if (parts.length === 0) {
    if (scorecard?.recommendation?.includes("Approved")) {
      return "All findings addressed. Review is ready for sign-off.";
    }
    return "Review findings below and assign owners to open items.";
  }

  return parts.join(" ");
}

// ── Score tone classification ─────────────────────────────────────────
export function getScoreTone(
  score: number | null,
): "green" | "amber" | "red" {
  if (score === null) return "red";
  if (score >= 85) return "green";
  if (score >= 70) return "amber";
  return "red";
}
