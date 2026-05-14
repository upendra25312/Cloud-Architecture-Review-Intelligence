import { describe, it, expect } from "vitest";
import { filterItems } from "@/lib/filters";
import type { ChecklistItem, ExplorerFilters } from "@/types";

const emptyFilters: ExplorerFilters = {
  search: "",
  statuses: [],
  maturityBuckets: [],
  severities: [],
  waf: [],
  services: [],
  sourceKinds: [],
  technologies: [],
};

function makeItem(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return {
    id: "test-001",
    text: "Enable diagnostic logging",
    description: "Ensure all resources have diagnostic settings configured",
    category: "Operational Excellence",
    subcategory: "Monitoring",
    serviceCanonical: "azure-monitor",
    service: "Azure Monitor",
    severity: "High",
    waf: "Operational Excellence",
    technologyStatus: "GA",
    technologyMaturityBucket: "GA",
    technologySlug: "azure-monitor",
    sourceKind: "CAF",
    ...overrides,
  } as ChecklistItem;
}

describe("filterItems", () => {
  describe("search filter", () => {
    it("returns all items when search is empty", () => {
      const items = [makeItem(), makeItem({ id: "test-002", text: "Another item" })];
      expect(filterItems(items, emptyFilters)).toHaveLength(2);
    });

    it("matches on item text (case-insensitive)", () => {
      const items = [
        makeItem({ text: "Enable diagnostic logging" }),
        makeItem({ id: "test-002", text: "Configure RBAC assignments", description: "Set up role-based access control" }),
      ];
      const result = filterItems(items, { ...emptyFilters, search: "DIAGNOSTIC" });
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe("Enable diagnostic logging");
    });

    it("matches on description", () => {
      const items = [makeItem({ description: "Ensure TLS 1.2 minimum" })];
      const result = filterItems(items, { ...emptyFilters, search: "tls" });
      expect(result).toHaveLength(1);
    });

    it("matches on serviceCanonical", () => {
      const items = [
        makeItem({ serviceCanonical: "azure-key-vault" }),
        makeItem({ id: "test-002", serviceCanonical: "azure-monitor" }),
      ];
      const result = filterItems(items, { ...emptyFilters, search: "key-vault" });
      expect(result).toHaveLength(1);
    });

    it("returns empty when no items match search", () => {
      const items = [makeItem({ text: "Enable logging" })];
      const result = filterItems(items, { ...emptyFilters, search: "kubernetes" });
      expect(result).toHaveLength(0);
    });

    it("trims whitespace from search term", () => {
      const items = [makeItem({ text: "Enable diagnostic logging" })];
      const result = filterItems(items, { ...emptyFilters, search: "  diagnostic  " });
      expect(result).toHaveLength(1);
    });
  });

  describe("severity filter", () => {
    it("passes all items when severities is empty", () => {
      const items = [makeItem({ severity: "High" }), makeItem({ id: "t2", severity: "Low" })];
      expect(filterItems(items, emptyFilters)).toHaveLength(2);
    });

    it("filters to matching severity only", () => {
      const items = [
        makeItem({ severity: "High" }),
        makeItem({ id: "t2", severity: "Medium" }),
        makeItem({ id: "t3", severity: "Low" }),
      ];
      const result = filterItems(items, { ...emptyFilters, severities: ["High"] });
      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe("High");
    });

    it("supports multi-select severity", () => {
      const items = [
        makeItem({ severity: "High" }),
        makeItem({ id: "t2", severity: "Medium" }),
        makeItem({ id: "t3", severity: "Low" }),
      ];
      const result = filterItems(items, { ...emptyFilters, severities: ["High", "Medium"] });
      expect(result).toHaveLength(2);
    });

    it("excludes items with undefined severity when filter is active", () => {
      const items = [makeItem({ severity: undefined })];
      const result = filterItems(items, { ...emptyFilters, severities: ["High"] });
      expect(result).toHaveLength(0);
    });
  });

  describe("service filter", () => {
    it("uses serviceCanonical when available", () => {
      const items = [
        makeItem({ serviceCanonical: "azure-key-vault", service: "Key Vault" }),
        makeItem({ id: "t2", serviceCanonical: "azure-monitor", service: "Monitor" }),
      ];
      const result = filterItems(items, { ...emptyFilters, services: ["azure-key-vault"] });
      expect(result).toHaveLength(1);
    });

    it("falls back to service when serviceCanonical is undefined", () => {
      const items = [makeItem({ serviceCanonical: undefined, service: "Azure Monitor" })];
      const result = filterItems(items, { ...emptyFilters, services: ["Azure Monitor"] });
      expect(result).toHaveLength(1);
    });
  });

  describe("combined filters", () => {
    it("applies all active filters conjunctively (AND logic)", () => {
      const items = [
        makeItem({ severity: "High", waf: "Security", sourceKind: "CAF" }),
        makeItem({ id: "t2", severity: "High", waf: "Reliability", sourceKind: "CAF" }),
        makeItem({ id: "t3", severity: "Medium", waf: "Security", sourceKind: "WAF" }),
      ];
      const result = filterItems(items, {
        ...emptyFilters,
        severities: ["High"],
        waf: ["Security"],
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("test-001");
    });

    it("returns empty array for empty input", () => {
      expect(filterItems([], emptyFilters)).toHaveLength(0);
    });
  });
});
