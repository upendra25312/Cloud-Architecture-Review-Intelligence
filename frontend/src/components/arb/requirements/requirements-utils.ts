import type { ArbRequirement } from "@/arb/types";

// ── Interfaces ────────────────────────────────────────────────────────

export interface RequirementsFilterState {
  criticalities: Set<string>;
  categories: Set<string>;
  statuses: Set<string>;
}

export interface RequirementsMetrics {
  total: number;
  highCount: number;
  mediumCount: number;
  pendingCount: number;
  acceptedCount: number;
  rejectedCount: number;
  categoryCount: number;
  acceptanceRate: number;
}

// ── Pure utility functions ────────────────────────────────────────────

export function computeRequirementsMetrics(requirements: ArbRequirement[]): RequirementsMetrics {
  const total = requirements.length;
  const highCount = requirements.filter((r) => r.criticality === "High").length;
  const mediumCount = requirements.filter((r) => r.criticality === "Medium").length;
  const pendingCount = requirements.filter((r) => r.reviewerStatus === "Pending").length;
  const acceptedCount = requirements.filter((r) => r.reviewerStatus === "Accepted").length;
  const rejectedCount = requirements.filter((r) => r.reviewerStatus === "Rejected").length;

  const categorySet = new Set<string>();
  for (const r of requirements) {
    if (r.category) categorySet.add(r.category.toLowerCase());
  }
  const categoryCount = categorySet.size;

  const reviewed = acceptedCount + rejectedCount;
  const acceptanceRate = reviewed > 0 ? Math.round((acceptedCount / reviewed) * 100) : 0;

  return { total, highCount, mediumCount, pendingCount, acceptedCount, rejectedCount, categoryCount, acceptanceRate };
}

export function groupRequirementsByCategory(
  requirements: ArbRequirement[],
): Map<string, ArbRequirement[]> {
  const keyToDisplay = new Map<string, string>();
  const groups = new Map<string, ArbRequirement[]>();

  for (const r of requirements) {
    const key = (r.category ?? "Uncategorized").toLowerCase();
    if (!keyToDisplay.has(key)) {
      keyToDisplay.set(key, r.category ?? "Uncategorized");
    }
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const sorted = [...keyToDisplay.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const result = new Map<string, ArbRequirement[]>();
  for (const [key, display] of sorted) {
    result.set(display, groups.get(key) ?? []);
  }
  return result;
}

export function groupRequirementsBySourceFile(
  requirements: ArbRequirement[],
): Map<string, ArbRequirement[]> {
  const groups = new Map<string, ArbRequirement[]>();

  for (const r of requirements) {
    const name = r.sourceFileName ?? "Unknown source";
    const list = groups.get(name) ?? [];
    list.push(r);
    groups.set(name, list);
  }

  const sorted = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return new Map(sorted);
}

export function filterRequirements(
  requirements: ArbRequirement[],
  filters: RequirementsFilterState,
): ArbRequirement[] {
  return requirements.filter((r) => {
    if (filters.criticalities.size > 0 && !filters.criticalities.has(r.criticality)) {
      return false;
    }
    if (filters.categories.size > 0) {
      const key = (r.category ?? "").toLowerCase();
      const match = [...filters.categories].some((c) => c.toLowerCase() === key);
      if (!match) return false;
    }
    if (filters.statuses.size > 0 && !filters.statuses.has(r.reviewerStatus)) {
      return false;
    }
    return true;
  });
}

export function getDistinctCategories(requirements: ArbRequirement[]): string[] {
  const seen = new Map<string, string>();
  for (const r of requirements) {
    const key = (r.category ?? "").toLowerCase();
    if (key && !seen.has(key)) {
      seen.set(key, r.category ?? "");
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxLength * 0.5) {
    return truncated.slice(0, lastSpace) + "…";
  }
  return truncated + "…";
}
