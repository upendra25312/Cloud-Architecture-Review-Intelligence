import type { ChecklistItem, ExplorerFilters } from "@/types";

function matchesMulti(selectors: string[], candidate?: string) {
  if (selectors.length === 0) {
    return true;
  }

  if (!candidate) {
    return false;
  }

  return selectors.includes(candidate);
}

export function filterItems(items: ChecklistItem[], filters: ExplorerFilters) {
  const search = filters.search.trim().toLowerCase();

  return items.filter((item) => {
    const searchable = [
      item.text,
      item.description,
      item.category,
      item.subcategory,
      item.serviceCanonical,
      item.service,
      item.technology,
      item.id
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (search && !searchable.includes(search)) {
      return false;
    }

    if (!matchesMulti(filters.statuses, item.technologyStatus)) {
      return false;
    }

    if (!matchesMulti(filters.maturityBuckets, item.technologyMaturityBucket)) {
      return false;
    }

    if (!matchesMulti(filters.severities, item.severity)) {
      return false;
    }

    if (!matchesMulti(filters.waf, item.waf)) {
      return false;
    }

    if (!matchesMulti(filters.services, item.serviceCanonical ?? item.service)) {
      return false;
    }

    if (!matchesMulti(filters.sourceKinds, item.sourceKind)) {
      return false;
    }

    if (!matchesMulti(filters.technologies, item.technologySlug)) {
      return false;
    }

    return true;
  });
}
