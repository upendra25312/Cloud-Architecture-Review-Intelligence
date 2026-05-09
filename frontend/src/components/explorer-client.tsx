"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CatalogSummary, ChecklistItem, ExplorerFilters, ReviewDraft, ReviewPackage } from "@/types";
import { ItemDrawer } from "@/components/item-drawer";
import { buildExportRows, downloadCsv, downloadJson } from "@/lib/export";
import { filterItems } from "@/lib/filters";
import { QualityBadge } from "@/components/quality-badge";
import {
  createEmptyReview,
  loadActivePackageId,
  loadFilters,
  loadPackages,
  loadScopedReviews,
  saveFilters,
  saveScopedReviews
} from "@/lib/review-storage";

const EMPTY_FILTERS: ExplorerFilters = {
  search: "",
  statuses: [],
  maturityBuckets: ["GA"],
  severities: [],
  waf: [],
  services: [],
  sourceKinds: [],
  technologies: []
};

function uniqueValues(items: ChecklistItem[], selector: (item: ChecklistItem) => string | undefined) {
  return [...new Set(items.map(selector).filter(Boolean) as string[])].sort((left, right) =>
    left.localeCompare(right)
  );
}

function toggleValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value];
}

function matchesValues(current: string[], expected: string[]) {
  if (current.length !== expected.length) {
    return false;
  }

  return expected.every((value) => current.includes(value));
}

function mergeFilters(storedFilters: Partial<ExplorerFilters> | null) {
  return {
    ...EMPTY_FILTERS,
    ...storedFilters,
    statuses: storedFilters?.statuses ?? EMPTY_FILTERS.statuses,
    maturityBuckets: storedFilters?.maturityBuckets ?? EMPTY_FILTERS.maturityBuckets,
    severities: storedFilters?.severities ?? EMPTY_FILTERS.severities,
    waf: storedFilters?.waf ?? EMPTY_FILTERS.waf,
    services: storedFilters?.services ?? EMPTY_FILTERS.services,
    sourceKinds: storedFilters?.sourceKinds ?? EMPTY_FILTERS.sourceKinds,
    technologies: storedFilters?.technologies ?? EMPTY_FILTERS.technologies
  };
}

export function ExplorerClient({ summary }: { summary: CatalogSummary }) {
  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const [filters, setFilters] = useState<ExplorerFilters>(EMPTY_FILTERS);
  const [selectedItem, setSelectedItem] = useState<ChecklistItem | null>(null);
  const [reviews, setReviews] = useState<Record<string, ReviewDraft>>({});
  const [activePackage, setActivePackage] = useState<ReviewPackage | null>(null);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    let active = true;

    fetch("/data/catalog.json")
      .then((response) => response.json())
      .then((payload: { items: ChecklistItem[] }) => {
        if (active) {
          setItems(payload.items);
        }
      });

    const packageId = loadActivePackageId();
    const nextActivePackage = loadPackages().find((entry) => entry.id === packageId) ?? null;

    setActivePackage(nextActivePackage);
    setFilters(mergeFilters(loadFilters()));
    setReviews(loadScopedReviews(packageId));
    setStorageReady(true);

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    saveFilters(filters);
  }, [filters]);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    saveScopedReviews(activePackage?.id ?? null, reviews);
  }, [activePackage?.id, reviews, storageReady]);

  if (!items) {
    return (
      <section id="explorer" className="surface-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Explorer</p>
            <h2 className="section-title">Preparing the findings workspace.</h2>
            <p className="section-copy">
              Defaulting to the GA-ready baseline and loading source-backed filters. The detailed
              workspace appears in a moment so the first experience feels deliberate instead of empty.
            </p>
          </div>
        </div>
        <div className="loading-panel loading-skeleton-grid" aria-hidden="true">
          <div className="loading-skeleton-card">
            <span className="loading-skeleton-line loading-skeleton-line-short" />
            <span className="loading-skeleton-line" />
            <span className="loading-skeleton-line loading-skeleton-line-medium" />
          </div>
          <div className="loading-skeleton-card">
            <span className="loading-skeleton-line loading-skeleton-line-short" />
            <span className="loading-skeleton-line" />
            <span className="loading-skeleton-line loading-skeleton-line-medium" />
          </div>
          <div className="loading-skeleton-card">
            <span className="loading-skeleton-line loading-skeleton-line-short" />
            <span className="loading-skeleton-line" />
            <span className="loading-skeleton-line loading-skeleton-line-medium" />
          </div>
        </div>
      </section>
    );
  }

  const filteredItems = filterItems(items, filters);
  const services = uniqueValues(items, (item) => item.serviceCanonical ?? item.service);
  const wafPillars = uniqueValues(items, (item) => item.waf);
  const severities = uniqueValues(items, (item) => item.severity);
  const reviewedCount = filteredItems.filter((item) => {
    const review = reviews[item.guid];

    return review && review.reviewState !== "Not Reviewed";
  }).length;
  const highSeverityCount = filteredItems.filter((item) => item.severity === "High").length;
  const selectedService = filters.services[0] ?? "";
  const selectedWaf = filters.waf[0] ?? "";
  const selectedTechnology = filters.technologies[0] ?? "";
  const selectedStatus = filters.statuses[0] ?? "";
  const selectedSourceKind = filters.sourceKinds[0] ?? "";
  const explorerMetrics = [
    {
      label: "Visible findings",
      value: filteredItems.length.toLocaleString(),
      detail: "Scoped by the current GA-first filters and advanced explorer controls."
    },
    {
      label: "High severity",
      value: highSeverityCount.toLocaleString(),
      detail: "Items that deserve earlier architectural attention in the current scope."
    },
    {
      label: "Checklist families",
      value: new Set(filteredItems.map((item) => item.technologySlug)).size.toLocaleString(),
      detail: "Families represented in the current filtered result set."
    },
    {
      label: "Locally reviewed",
      value: reviewedCount.toLocaleString(),
      detail: "Items with local notes or review-state changes in this browser."
    }
  ];
  const isGaOnly = matchesValues(filters.maturityBuckets, ["GA"]);
  const isIncludingPreview = matchesValues(filters.maturityBuckets, ["GA", "Preview", "Mixed"]);
  const isShowingAll = matchesValues(filters.maturityBuckets, [
    "GA",
    "Preview",
    "Mixed",
    "Deprecated"
  ]);

  function updateFilter<K extends keyof ExplorerFilters>(key: K, value: ExplorerFilters[K]) {
    setFilters((current) => ({
      ...current,
      [key]: value
    }));
  }

  function exportFilteredJson() {
    downloadJson("azure-review-findings.json", buildExportRows(filteredItems, reviews));
  }

  function exportFilteredCsv() {
    downloadCsv("azure-review-findings.csv", buildExportRows(filteredItems, reviews));
  }

  function updateReview(guid: string, next: Partial<ReviewDraft>) {
    setReviews((current) => {
      const existing = current[guid] ?? createEmptyReview();

      return {
        ...current,
        [guid]: {
          ...existing,
          ...next
        }
      };
    });
  }

  return (
    <>
      <section id="explorer" className="surface-panel explorer-shell board-stage-panel">
        <section className="review-command-panel">
          <div className="detail-command-grid">
            <div className="detail-command-copy">
              <div>
                <p className="eyebrow">Explorer</p>
                <h2 className="review-command-title">
                  Move from executive posture to detailed findings without losing clarity.
                </h2>
                <p className="review-command-summary">
                  This explorer keeps the high-value controls visible, defaults to GA-ready guidance,
                  and tucks deeper scoping behind a simpler advanced filter panel.
                </p>
              </div>
            </div>
            <div className="chip-row" style={{ alignSelf: "start", justifyContent: "flex-end" }}>
              <span className="chip">{filteredItems.length.toLocaleString()} visible findings</span>
              <span className="chip">{reviewedCount.toLocaleString()} locally reviewed</span>
            </div>
          </div>
          <div className="review-command-metrics">
            {explorerMetrics.map((metric) => (
              <article className="review-command-metric" key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <p>{metric.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <div className="future-grid workspace-brief">
          <article className="future-card">
            <h3>Leadership baseline</h3>
            <p>
              Keep the explorer anchored on GA-ready guidance first, then widen only when the
              review question requires more exploratory depth.
            </p>
          </article>
          <article className="future-card">
            <h3>Architect workflow</h3>
            <p>
              Narrow quickly by severity, service, or maturity, then move into source-backed
              family detail pages when a design area requires deeper judgment.
            </p>
          </article>
          <article className="future-card">
            <h3>Operator handoff</h3>
            <p>
              Capture local review notes and export filtered results without turning the product
              into a fake workflow system.
            </p>
          </article>
        </div>

        {activePackage ? (
          <div className="filter-card package-context-card">
            <div className="package-context-grid">
              <div>
                <p className="eyebrow">Active project review</p>
                <h3>{activePackage.name}</h3>
                <p className="microcopy">
                  Explorer notes are being written into the active project review for{" "}
                  {activePackage.audience}. Service selection and exports can be managed from the
                  project review workspace.
                </p>
              </div>
              <div className="package-context-actions">
                <Link href="/review-package" className="secondary-button">
                  Open project review
                </Link>
              </div>
            </div>
          </div>
        ) : null}

        <div className="filter-card workspace-toolbar board-toolbar-card">
          <div className="workspace-toolbar-main">
            <input
              className="search-input"
              type="search"
              placeholder="Search findings, services, or design areas"
              value={filters.search}
              onChange={(event) => updateFilter("search", event.target.value)}
            />
            <div className="button-row">
              <button
                type="button"
                className={isGaOnly ? "secondary-button" : "ghost-button"}
                onClick={() => updateFilter("maturityBuckets", ["GA"])}
              >
                GA-ready only
              </button>
              <button
                type="button"
                className={isIncludingPreview ? "secondary-button" : "ghost-button"}
                onClick={() => updateFilter("maturityBuckets", ["GA", "Preview", "Mixed"])}
              >
                Include preview
              </button>
              <button
                type="button"
                className={isShowingAll ? "secondary-button" : "ghost-button"}
                onClick={() =>
                  updateFilter("maturityBuckets", ["GA", "Preview", "Mixed", "Deprecated"])
                }
              >
                Show all content
              </button>
            </div>
            <p className="microcopy">
              Start with service or severity, then open advanced filters only when you need deeper scoping.
            </p>
          </div>
          <div className="workspace-toolbar-side">
            <button type="button" className="secondary-button" onClick={exportFilteredCsv}>
              Export local CSV
            </button>
            <button type="button" className="secondary-button" onClick={exportFilteredJson}>
              Export local JSON
            </button>
          </div>
        </div>

        <div className="filter-card workspace-filter-strip">
          <div className="filter-field">
            <span className="microcopy">Maturity bucket</span>
            <div className="filter-grid compact-chip-row">
              {["GA", "Preview", "Mixed", "Deprecated"].map((bucket) => (
                <button
                  key={bucket}
                  type="button"
                  className="chip"
                  aria-pressed={filters.maturityBuckets.includes(
                    bucket as ChecklistItem["technologyMaturityBucket"]
                  )}
                  onClick={() =>
                    updateFilter(
                      "maturityBuckets",
                      toggleValue(filters.maturityBuckets, bucket) as ExplorerFilters["maturityBuckets"]
                    )
                  }
                >
                  {bucket}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-field">
            <span className="microcopy">Severity</span>
            <div className="filter-grid compact-chip-row">
              {severities.map((severity) => (
                <button
                  key={severity}
                  type="button"
                  className="chip"
                  aria-pressed={filters.severities.includes(severity)}
                  onClick={() =>
                    updateFilter("severities", toggleValue(filters.severities, severity))
                  }
                >
                  {severity}
                </button>
              ))}
            </div>
          </div>
        </div>

        <details className="advanced-filters-card">
          <summary>Advanced filters and scope</summary>
          <p className="microcopy">
            Use these controls when you need deeper scoping by source status, service, pillar,
            family, or source folder.
          </p>
          <div className="advanced-filters-grid">
            <label className="filter-field">
              <span className="microcopy">Source status</span>
              <select
                className="field-select"
                value={selectedStatus}
                onChange={(event) =>
                  updateFilter(
                    "statuses",
                    event.target.value ? [event.target.value as ChecklistItem["technologyStatus"]] : []
                  )
                }
              >
                <option value="">All source statuses</option>
                {["GA", "Preview", "Deprecated", "Unknown"].map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="filter-field">
              <span className="microcopy">WAF pillar</span>
              <select
                className="field-select"
                value={selectedWaf}
                onChange={(event) =>
                  updateFilter("waf", event.target.value ? [event.target.value] : [])
                }
              >
                <option value="">All pillars</option>
                {wafPillars.map((pillar) => (
                  <option key={pillar} value={pillar}>
                    {pillar}
                  </option>
                ))}
              </select>
            </label>

            <label className="filter-field">
              <span className="microcopy">Service</span>
              <select
                className="field-select"
                value={selectedService}
                onChange={(event) =>
                  updateFilter("services", event.target.value ? [event.target.value] : [])
                }
              >
                <option value="">All services</option>
                {services.map((service) => (
                  <option key={service} value={service}>
                    {service}
                  </option>
                ))}
              </select>
            </label>

            <label className="filter-field">
              <span className="microcopy">Checklist family</span>
              <select
                className="field-select"
                value={selectedTechnology}
                onChange={(event) =>
                  updateFilter("technologies", event.target.value ? [event.target.value] : [])
                }
              >
                <option value="">All checklist families</option>
                {summary.technologies.map((technology) => (
                  <option key={technology.slug} value={technology.slug}>
                    {technology.technology}
                  </option>
                ))}
              </select>
            </label>

            <label className="filter-field">
              <span className="microcopy">Source folder</span>
              <select
                className="field-select"
                value={selectedSourceKind}
                onChange={(event) =>
                  updateFilter("sourceKinds", event.target.value ? [event.target.value] : [])
                }
              >
                <option value="">All source folders</option>
                {["checklists", "checklists-ext"].map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </label>

            <div className="filter-field advanced-reset">
              <span className="microcopy">Workspace reset</span>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setFilters(EMPTY_FILTERS)}
              >
                Restore GA-first defaults
              </button>
            </div>
          </div>
        </details>

        <div className="results-toolbar">
          <div className="pill-row result-summary">
            <span className="pill">{filteredItems.length.toLocaleString()} findings</span>
            <span className="pill">{highSeverityCount.toLocaleString()} high severity</span>
            <span className="pill">
              {new Set(filteredItems.map((item) => item.technologySlug)).size.toLocaleString()} families
            </span>
          </div>
          <p className="microcopy">
            Source traceability remains attached to every item and family detail view.
          </p>
        </div>

        {filteredItems.length > 0 ? (
          <article className="list-card review-list-card">
            <div className="item-list">
              {filteredItems.slice(0, 250).map((item) => {
                const review = reviews[item.guid];
                const technology = summary.technologies.find(
                  (candidate) => candidate.slug === item.technologySlug
                );

                return (
                  <div className="item-row" key={`${item.guid}_${item.technologySlug}`}>
                    <button type="button" onClick={() => setSelectedItem(item)}>
                      <div className="item-topline">
                        {item.severity ? <span className="pill">{item.severity}</span> : null}
                      {item.waf ? <span className="pill">{item.waf}</span> : null}
                      <span className="pill">{item.technology}</span>
                      <span className="pill">{item.technologyMaturityBucket}</span>
                      {review ? <span className="pill">{review.reviewState}</span> : null}
                      {review?.packageDecision ? <span className="pill">{review.packageDecision}</span> : null}
                    </div>
                      <p className="item-text">{item.text}</p>
                      <div className="item-meta">
                        {item.id ? <span className="chip">{item.id}</span> : null}
                        {item.category ? <span className="chip">{item.category}</span> : null}
                        {item.subcategory ? <span className="chip">{item.subcategory}</span> : null}
                        {item.serviceCanonical ?? item.service ? (
                          <span className="chip">{item.serviceCanonical ?? item.service}</span>
                        ) : null}
                      </div>
                      {technology ? <QualityBadge technology={technology} compact /> : null}
                      {item.description ? (
                        <p className="item-description">
                          {item.description.length > 220
                            ? `${item.description.slice(0, 220)}...`
                            : item.description}
                        </p>
                      ) : null}
                    </button>
                    <div className="button-row">
                      <Link href={`/technologies/${item.technologySlug}`} className="muted-link">
                        Open family detail
                      </Link>
                      {item.serviceSlug ? (
                        <Link href={`/services/${item.serviceSlug}`} className="muted-link">
                          Open service view
                        </Link>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        ) : (
          <section className="filter-card">
            <p className="eyebrow">No matching findings</p>
            <h3>Reset to the GA-ready baseline or widen scope deliberately.</h3>
            <p className="microcopy">
              No findings match the current filters. Start by restoring the default posture,
              then expand maturity or service scope as needed.
            </p>
          </section>
        )}

        {filteredItems.length > 250 ? (
          <p className="microcopy">
            Showing the first 250 filtered findings for readability. Export includes the full
            filtered result set.
          </p>
        ) : null}
      </section>

      {selectedItem ? (
        <ItemDrawer
          item={selectedItem}
          review={reviews[selectedItem.guid] ?? createEmptyReview()}
          onClose={() => setSelectedItem(null)}
          onUpdate={(next) => updateReview(selectedItem.guid, next)}
          activePackageName={activePackage?.name ?? null}
        />
      ) : null}
    </>
  );
}
