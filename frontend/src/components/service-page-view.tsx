"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuthSession } from "@/components/auth-session-provider";
import { ItemDrawer } from "@/components/item-drawer";
import { QualityBadge } from "@/components/quality-badge";
import { ServicePricingPanel } from "@/components/service-pricing-panel";
import { ServiceRegionalFitPanel } from "@/components/service-regional-fit";
import { SeverityBadge } from "@/components/severity-badge";
import { filterItems } from "@/lib/filters";
import { buildExportRows, downloadCsv, downloadJson, downloadText } from "@/lib/export";
import {
  createEmptyReview,
  loadActivePackageId,
  loadPackages,
  loadScopedReviews,
  saveScopedReviews,
  upsertPackage
} from "@/lib/review-storage";
import { PRIMARY_AUTH_PROVIDER, buildLoginUrl } from "@/lib/review-cloud";
import type { ChecklistItem, ReviewDraft, ReviewPackage, ServicePayload } from "@/types";

type ExportFormat = "csv" | "json" | "text";

type FamilyGroup = {
  title: string;
  intro: string;
  items: ServicePayload["service"]["families"];
  empty: string;
};

function getLearnUrl(item: ChecklistItem) {
  return item.link ?? item.sourceUrl ?? "";
}

function formatList(values: string[], fallback: string, limit = 4) {
  return values.length > 0 ? values.slice(0, limit).join(", ") : fallback;
}

function hasReviewActivity(review: ReviewDraft | undefined) {
  if (!review) {
    return false;
  }

  return Boolean(
    review.packageDecision !== "Needs Review" ||
      review.comments.trim() ||
      review.owner.trim() ||
      review.dueDate.trim() ||
      review.evidenceLinks.length > 0
  );
}

function buildServiceFindingsText(
  serviceName: string,
  items: ChecklistItem[],
  reviews: Record<string, ReviewDraft>
) {
  const lines = [
    `Service: ${serviceName}`,
    `Findings exported: ${items.length.toLocaleString()}`,
    ""
  ];

  items.forEach((item) => {
    const review = reviews[item.guid];
    const learnUrl = getLearnUrl(item);

    lines.push(`${item.severity ?? "Unspecified"} | ${item.text}`);
    lines.push(`Framework: ${item.waf ?? "Unmapped"}`);
    lines.push(`Family: ${item.technology}`);
    lines.push(`Decision: ${review?.packageDecision ?? "Needs Review"}`);

    if (item.description) {
      lines.push(`Recommendation: ${item.description}`);
    }

    if (review?.comments.trim()) {
      lines.push(`Notes: ${review.comments.trim()}`);
    }

    if (learnUrl) {
      lines.push(`Link: ${learnUrl}`);
    }

    lines.push("");
  });

  return lines.join("\n");
}

export function ServicePageView({ payload }: { payload: ServicePayload }) {
  const { principal, resolved } = useAuthSession();
  const [selectedGuid, setSelectedGuid] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [reviews, setReviews] = useState<Record<string, ReviewDraft>>({});
  const [activePackage, setActivePackage] = useState<ReviewPackage | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("csv");
  const baselineFamilies = payload.service.families.filter((family) => family.maturityBucket === "GA");
  const extendedFamilies = payload.service.families.filter(
    (family) => family.maturityBucket === "Preview" || family.maturityBucket === "Mixed"
  );
  const deprecatedFamilies = payload.service.families.filter(
    (family) => family.maturityBucket === "Deprecated"
  );
  const signedIn = resolved ? Boolean(principal) : null;

  useEffect(() => {
    const packageId = loadActivePackageId();
    const nextActivePackage = loadPackages().find((entry) => entry.id === packageId) ?? null;

    setActivePackage(nextActivePackage);
    setReviews(loadScopedReviews(packageId));
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    saveScopedReviews(activePackage?.id ?? null, reviews);
  }, [activePackage?.id, reviews, storageReady]);

  const filtered = useMemo(
    () =>
      filterItems(payload.items, {
        search,
        statuses: [],
        maturityBuckets: [],
        severities: [],
        waf: [],
        services: [],
        sourceKinds: [],
        technologies: []
      }),
    [payload.items, search]
  );

  const reviewedCount = filtered.filter((item) => hasReviewActivity(reviews[item.guid])).length;
  const selectedItem =
    selectedGuid !== null
      ? payload.items.find((item) => item.guid === selectedGuid) ?? null
      : null;
  const generatedDate = new Date(payload.generatedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  const isServiceInActivePackage = Boolean(
    activePackage?.selectedServiceSlugs.includes(payload.service.slug)
  );
  const canAddToActivePackage = Boolean(activePackage) && !isServiceInActivePackage;
  const familyGroups: FamilyGroup[] = [
    {
      title: "Baseline families",
      intro: "Lead with these first when the conversation needs the safest default guidance.",
      items: baselineFamilies,
      empty: "No GA-ready baseline families are mapped yet."
    },
    {
      title: "Extended guidance",
      intro: "Use these after the baseline when the architecture question needs more depth.",
      items: extendedFamilies,
      empty: "No preview or mixed-confidence families are mapped right now."
    },
    {
      title: "Historical context",
      intro: "Keep these for migration context, not as the primary design baseline.",
      items: deprecatedFamilies,
      empty: "No deprecated families are attached to this service."
    }
  ];

  function updateReview(guid: string, next: Partial<ReviewDraft>) {
    setReviews((current) => {
      return {
        ...current,
        [guid]: {
          ...(current[guid] ?? createEmptyReview()),
          ...next
        }
      };
    });
  }

  function addServiceToActivePackage() {
    if (!activePackage || isServiceInActivePackage) {
      return;
    }

    const nextPackage = upsertPackage({
      ...activePackage,
      selectedServiceSlugs: [...activePackage.selectedServiceSlugs, payload.service.slug]
    });

    setActivePackage(nextPackage);
  }

  function handleExport() {
    if (filtered.length === 0) {
      return;
    }

    const baseName = `${payload.service.slug}-findings`;
    const rows = buildExportRows(filtered, reviews);

    if (exportFormat === "csv") {
      downloadCsv(`${baseName}.csv`, rows);
      return;
    }

    if (exportFormat === "json") {
      downloadJson(`${baseName}.json`, rows);
      return;
    }

    downloadText(`${baseName}.txt`, buildServiceFindingsText(payload.service.service, filtered, reviews));
  }

  return (
    <main className="section-stack svc-detail-page">
      <section className="surface-panel svc-detail-header">
        <div className="svc-detail-header-top">
          <div className="svc-detail-title">
            <p className="eyebrow">Service explorer</p>
            <h1 className="review-command-title">{payload.service.service}</h1>
            <p className="svc-detail-sub">{payload.service.description}</p>
          </div>

          <div className="svc-detail-actions">
            <Link href="/services" className="secondary-button">
              Back to services
            </Link>
            {signedIn === true ? (
              canAddToActivePackage ? (
                <button type="button" className="primary-button" onClick={addServiceToActivePackage}>
                  Add to review workspace
                </button>
              ) : (
                <Link href="/arb" className="primary-button">
                  {isServiceInActivePackage ? "Open review workspace →" : "Start Architecture Review →"}
                </Link>
              )
            ) : signedIn === false ? (
              <>
                <a href="#service-findings-workspace" className="primary-button">
                  View instant findings below ↓
                </a>
                <a href={buildLoginUrl(PRIMARY_AUTH_PROVIDER, "/arb")} className="ghost-button">
                  Sign in to save to Architecture Review →
                </a>
              </>
            ) : null}
          </div>
        </div>

        <div className="svc-detail-kpis">
          <article className="future-card">
            <p className="board-card-subtitle">Findings</p>
            <strong>{payload.service.itemCount.toLocaleString()}</strong>
            <p>Findings currently mapped to this service.</p>
          </article>
          <article className="future-card">
            <p className="board-card-subtitle">High severity</p>
            <strong>{payload.service.highSeverityCount.toLocaleString()}</strong>
            <p>Findings to triage first before any sign-off conversation.</p>
          </article>
          <article className="future-card">
            <p className="board-card-subtitle">Baseline families</p>
            <strong>{payload.service.gaFamilyCount.toLocaleString()}</strong>
            <p>GA-ready families you can lead with in the review.</p>
          </article>
          <article className="future-card">
            <p className="board-card-subtitle">Project review</p>
            <strong>
              {activePackage
                ? isServiceInActivePackage
                  ? "Included"
                  : "Not added"
                : "Not started"}
            </strong>
            <p>
              {activePackage
                ? `Current review: ${activePackage.name}.`
                : "Create or open a project review to keep scoped decisions."}
            </p>
          </article>
        </div>

        <div className="svc-detail-signal-row">
          <span className="chip">Categories: {formatList(payload.service.categories, "General guidance")}</span>
          <span className="chip">WAF: {formatList(payload.service.wafPillars, "Unmapped")}</span>
          <span className="chip">Updated {generatedDate}</span>
        </div>

        <p className="microcopy svc-detail-guidance">{payload.service.whatThisMeans}</p>
      </section>

      <section id="service-findings-workspace" className="surface-panel svc-detail-workspace">
        <div className="board-card-head svc-detail-workspace-head">
          <div className="board-card-head-copy">
            <p className="board-card-subtitle">Findings workspace</p>
            <h2 className="section-title">
              Search this service, open a finding, and capture only the notes you need.
            </h2>
          </div>

          <div className="svc-detail-toolbar-actions">
            <label className="svc-export-picker">
              <span>Export format</span>
              <select
                className="field-select"
                value={exportFormat}
                onChange={(event) => setExportFormat(event.target.value as ExportFormat)}
              >
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
                <option value="text">Text</option>
              </select>
            </label>
            <button
              type="button"
              className="secondary-button"
              onClick={handleExport}
              disabled={filtered.length === 0}
            >
              Download findings
            </button>
          </div>
        </div>

        <div className="svc-detail-banner">
          <strong>
            {activePackage
              ? isServiceInActivePackage
                ? `${payload.service.service} is already in the active project review.`
                : `${payload.service.service} is not yet in the active project review.`
              : signedIn === false
                ? "Instant findings are available now."
                : "No active project review is selected."}
          </strong>
          <p>
            {activePackage
              ? `Use this page to keep scoped decisions for ${activePackage.audience} without losing the raw source guidance.`
              : signedIn === false
                ? "Search, open, and export findings without sign-in. Sign in only when you want a saved architecture review workspace with scoped decisions."
                : "You can still search and annotate findings here, then start a project review when you are ready to scope decisions."}
          </p>
        </div>

        <div className="filter-card workspace-toolbar board-toolbar-card svc-detail-toolbar">
          <div className="workspace-toolbar-main">
            <input
              className="search-input"
              type="search"
              placeholder={`Search ${payload.service.service} findings by title, recommendation, family, or category`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="chip-row">
            <span className="chip">{filtered.length.toLocaleString()} visible findings</span>
            <span className="chip">{reviewedCount.toLocaleString()} reviewed</span>
            <span className="chip">{payload.service.familyCount.toLocaleString()} related families</span>
          </div>
        </div>

        {filtered.length > 0 ? (
          <div className="svc-detail-table-shell">
            <table className="svc-detail-table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Finding</th>
                  <th>Framework</th>
                  <th>Family</th>
                  <th>Recommendation</th>
                  <th>Learn</th>
                  <th>Review</th>
                  <th>Open</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const learnUrl = getLearnUrl(item);
                  const review = reviews[item.guid];

                  return (
                    <tr
                      key={`${item.guid}_${item.technologySlug}`}
                      className={selectedGuid === item.guid ? "svc-detail-table-row-active" : undefined}
                    >
                      <td>
                        <SeverityBadge severity={item.severity} compact />
                      </td>
                      <td>
                        <div className="svc-detail-table-main">
                          <strong>{item.text}</strong>
                          <div className="chip-row">
                            {item.category ? <span className="chip">{item.category}</span> : null}
                            {item.subcategory ? <span className="chip">{item.subcategory}</span> : null}
                            {item.serviceCanonical ?? item.service ? (
                              <span className="chip">{item.serviceCanonical ?? item.service}</span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td>{item.waf ?? "Unmapped"}</td>
                      <td>
                        <Link href={`/technologies/${item.technologySlug}`} className="muted-link">
                          {item.technology}
                        </Link>
                      </td>
                      <td className="svc-detail-recommendation">
                        {item.description ?? "No recommendation captured."}
                      </td>
                      <td>
                        {learnUrl ? (
                          <a
                            href={learnUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="svc-detail-link"
                          >
                            Open
                          </a>
                        ) : (
                          <span className="svc-detail-link-disabled">Unavailable</span>
                        )}
                      </td>
                      <td>
                        <span className="chip">{review?.packageDecision ?? "Needs Review"}</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => setSelectedGuid(item.guid)}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <section className="filter-card svc-detail-empty">
            <p className="eyebrow">No matching findings</p>
            <h3>Broaden the search to bring the findings back into view.</h3>
            <p className="microcopy">
              Try a shorter search term or clear the query to return to the full service view.
            </p>
          </section>
        )}
      </section>

      <details className="svc-detail-disclosure">
        <summary>Availability and regional fit</summary>
        <div className="svc-detail-disclosure-body">
          <ServiceRegionalFitPanel
            service={payload.service}
            regionalFit={payload.regionalFit}
            targetRegions={activePackage?.targetRegions ?? []}
          />
        </div>
      </details>

      <details className="svc-detail-disclosure">
        <summary>Public pricing</summary>
        <div className="svc-detail-disclosure-body">
          <ServicePricingPanel
            service={payload.service}
            regionalFit={payload.regionalFit}
            targetRegions={activePackage?.targetRegions ?? []}
          />
        </div>
      </details>

      <details className="svc-detail-disclosure">
        <summary>Related checklist families</summary>
        <div className="svc-detail-disclosure-body">
          <section className="surface-panel">
            <div className="svc-family-grid">
              {familyGroups.map((group) => (
                <article className="future-card svc-family-card" key={group.title}>
                  <div className="svc-family-card-head">
                    <h3>{group.title}</h3>
                    <p className="microcopy">{group.intro}</p>
                  </div>
                  <div className="svc-family-list">
                    {group.items.length > 0 ? (
                      group.items.map((family) => (
                        <div className="svc-family-list-item" key={family.slug}>
                          <Link href={`/technologies/${family.slug}`} className="muted-link">
                            {family.technology}
                          </Link>
                          <QualityBadge technology={family} compact />
                        </div>
                      ))
                    ) : (
                      <p className="microcopy">{group.empty}</p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </details>

      {selectedItem ? (
        <ItemDrawer
          item={selectedItem}
          review={reviews[selectedItem.guid] ?? createEmptyReview()}
          onClose={() => setSelectedGuid(null)}
          onUpdate={(next) => updateReview(selectedItem.guid, next)}
          activePackageName={activePackage?.name ?? null}
        />
      ) : null}
    </main>
  );
}
