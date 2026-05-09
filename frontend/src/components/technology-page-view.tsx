"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { TechnologyPayload, ReviewDraft, ReviewPackage } from "@/types";
import { ItemDrawer } from "@/components/item-drawer";
import { QualityBadge } from "@/components/quality-badge";
import { filterItems } from "@/lib/filters";
import {
  createEmptyReview,
  loadActivePackageId,
  loadPackages,
  loadScopedReviews,
  saveScopedReviews
} from "@/lib/review-storage";

export function TechnologyPageView({ payload }: { payload: TechnologyPayload }) {
  const [selectedGuid, setSelectedGuid] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [reviews, setReviews] = useState<Record<string, ReviewDraft>>({});
  const [activePackage, setActivePackage] = useState<ReviewPackage | null>(null);
  const [storageReady, setStorageReady] = useState(false);

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

  const reviewedCount = filtered.filter((item) => {
    const review = reviews[item.guid];

    return review && review.reviewState !== "Not Reviewed";
  }).length;

  const selectedItem =
    selectedGuid !== null
      ? payload.items.find((item) => item.guid === selectedGuid) ?? null
      : null;

  const generatedDate = new Date(payload.generatedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  const familyDecisionCues = [
    {
      label: "Default role",
      value: `${payload.technology.quality.recommendedUsageConfidence} confidence`,
      copy:
        "Use this family according to the confidence it has earned, rather than because it merely exists in the checklist repository."
    },
    {
      label: "Validation pressure",
      value: `${payload.technology.highSeverityCount.toLocaleString()} high-severity findings`,
      copy:
        "High-severity items deserve faster review, but still need source-aware interpretation before they become leadership conclusions."
    },
    {
      label: "Proof path",
      value: `${payload.technology.quality.sourceCoverageQuality}% source-linked coverage`,
      copy:
        "Keep traceability visible so reviewers can inspect the originating family, repository source, and normalization run before promotion."
    }
  ];
  const familyCommandMetrics = [
    {
      label: "Family findings",
      value: payload.technology.itemCount.toLocaleString(),
      detail: "Normalized items available in this checklist family."
    },
    {
      label: "High-severity findings",
      value: payload.technology.highSeverityCount.toLocaleString(),
      detail: "Items that should receive faster architectural attention."
    },
    {
      label: "Usage confidence",
      value: payload.technology.quality.recommendedUsageConfidence,
      detail: "How much default review weight this family should carry."
    },
    {
      label: "Project review state",
      value: activePackage ? activePackage.name : "No active review",
      detail: activePackage
        ? `Notes in this family view are scoped to ${activePackage.audience}.`
        : "Activate a project review when you want family notes carried into a saved solution review."
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

  return (
    <main className="section-stack">
      <section className="review-command-panel">
        <div className="detail-command-grid">
          <div className="detail-command-copy">
            <div>
              <p className="eyebrow">Checklist family</p>
              <h1 className="review-command-title">{payload.technology.technology}</h1>
              <p className="review-command-summary">{payload.technology.description}</p>
              <p className="microcopy">
                Generated {generatedDate}. Use this family at the confidence level it has earned,
                rather than treating every checklist source as equally reliable.
              </p>
            </div>
            <div className="button-row">
              <Link href="/" className="secondary-button">
                Back to overview
              </Link>
              <Link href="/how-to-use" className="ghost-button">
                Review guidance
              </Link>
            </div>
          </div>

          <aside className="leadership-brief detail-command-sidecar">
            <p className="eyebrow">Family brief</p>
            <h2 className="leadership-title">How much weight this family should carry.</h2>
            <div className="leadership-list">
              <article>
                <strong>Maturity position</strong>
                <p>
                  Source status is {payload.technology.status} and this family is classified as{" "}
                  {payload.technology.maturityBucket}.
                </p>
              </article>
              <article>
                <strong>Recommended use</strong>
                <p>
                  {payload.technology.quality.recommendedUsageConfidence} confidence.{" "}
                  {payload.technology.whatThisMeans}
                </p>
              </article>
              <article>
                <strong>Review caution</strong>
                <p>
                  Keep source traceability intact and validate severity interpretation before using
                  this family in decision packs.
                </p>
              </article>
            </div>
          </aside>
        </div>

        <div className="review-command-metrics">
          {familyCommandMetrics.map((metric) => (
            <article className="review-command-metric" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <p>{metric.detail}</p>
            </article>
          ))}
        </div>
      </section>

      {activePackage ? (
        <section className="filter-card package-context-card">
          <div className="package-context-grid">
            <div>
              <p className="eyebrow">Active project review</p>
              <h2 className="section-title">{activePackage.name}</h2>
              <p className="section-copy">
                Notes in this family view are being captured under the active project review for{" "}
                {activePackage.audience}. Project decisions remain scoped to that solution.
              </p>
            </div>
            <div className="package-context-actions">
              <Link href="/review-package" className="secondary-button">
                Open project review
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      <section className="surface-panel board-stage-panel story-ribbon">
        <div className="decision-cue-grid">
          {familyDecisionCues.map((cue) => (
            <article className="decision-cue-card" key={cue.label}>
              <span>{cue.label}</span>
              <strong>{cue.value}</strong>
              <p>{cue.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="surface-panel board-stage-panel family-metric-strip">
        <div className="hero-metrics-row">
          <article className="hero-metric-card">
            <span>Family findings</span>
            <strong>{payload.technology.itemCount.toLocaleString()}</strong>
            <p>Normalized items available in this checklist family.</p>
          </article>
          <article className="hero-metric-card">
            <span>High-severity findings</span>
            <strong>{payload.technology.highSeverityCount.toLocaleString()}</strong>
            <p>Items that should receive faster architectural attention.</p>
          </article>
          <article className="hero-metric-card">
            <span>Usage confidence</span>
            <strong>{payload.technology.quality.recommendedUsageConfidence}</strong>
            <p>How much default review weight this family should carry.</p>
          </article>
        </div>
      </section>

      <section className="surface-panel board-stage-panel executive-brief-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Family recommendation</p>
            <h2 className="section-title">
              Use this family according to its confidence level, not just its presence in the repository.
            </h2>
            <p className="section-copy">
              This page helps architects and leaders decide how much weight this family deserves
              in a review pack and what validation is still required.
            </p>
          </div>
        </div>
        <div className="executive-brief-layout">
          <div className="executive-brief-list">
            <article className="brief-point">
              <strong>Confidence is transparent rather than implied.</strong>
              <p>{payload.technology.quality.summary}</p>
            </article>
            <article className="brief-point">
              <strong>Source linkage remains visible.</strong>
              <p>
                Every item stays connected to the originating source file path, source folder,
                normalization run, and repository source so reviewers can verify intent before
                carrying a finding into leadership material.
              </p>
            </article>
            <article className="brief-point">
              <strong>This family should support judgment, not replace it.</strong>
              <p>
                Use it to deepen review conversations, but retain workload context, design
                authority, and formal sign-off outside the review board.
              </p>
            </article>
          </div>

          <aside className="leadership-action-card">
            <p className="eyebrow">Recommended handling</p>
            <h3>{payload.technology.whatThisMeans}</h3>
            <p>
              Leadership should use this family only at the confidence level it has earned.
              Architects should confirm source intent before turning these findings into review
              commitments or executive conclusions.
            </p>
            <QualityBadge technology={payload.technology} />
          </aside>
        </div>
      </section>

      <section className="surface-panel board-stage-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Quality profile</p>
            <h2 className="section-title">
              Show why this family should carry more or less weight in a decision pack.
            </h2>
            <p className="section-copy">
              The quality profile combines maturity status, metadata completeness, severity
              coverage, source coverage, and freshness into one transparent confidence view.
            </p>
          </div>
        </div>
        <div className="traceability-grid">
          <article className="trace-card">
            <strong>Metadata completeness</strong>
            <p>{payload.technology.quality.metadataCompleteness}% of tracked fields present.</p>
          </article>
          <article className="trace-card">
            <strong>Severity confidence</strong>
            <p>{payload.technology.quality.severityConfidence}% of items carry severity metadata.</p>
          </article>
          <article className="trace-card">
            <strong>Source coverage quality</strong>
            <p>{payload.technology.quality.sourceCoverageQuality}% source-linked coverage.</p>
          </article>
          <article className="trace-card">
            <strong>Generated date</strong>
            <p>{payload.technology.quality.generatedDate}</p>
          </article>
        </div>
      </section>

      <section className="surface-panel board-stage-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Source traceability</p>
            <h2 className="section-title">
              Every rendered item stays connected to the source family, repository file, and normalization run.
            </h2>
          </div>
        </div>
        <div className="traceability-grid">
          <article className="trace-card">
            <strong>Source path</strong>
            <p>{payload.technology.sourcePath}</p>
          </article>
          <article className="trace-card">
            <strong>Repository source</strong>
            {payload.technology.sourceUrl ? (
              <a
                href={payload.technology.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="muted-link"
              >
                Open source family
              </a>
            ) : (
              <p>Unavailable</p>
            )}
          </article>
          <article className="trace-card">
            <strong>Source folder</strong>
            <p>{payload.technology.sourceKind}</p>
          </article>
          <article className="trace-card">
            <strong>Categories</strong>
            <p>{payload.technology.categories.join(", ") || "Unavailable"}</p>
          </article>
          <article className="trace-card">
            <strong>Services</strong>
            <p>{payload.technology.services.join(", ") || "Unavailable"}</p>
          </article>
        </div>
      </section>

      <section className="surface-panel board-stage-panel">
        <div className="section-head family-list-head">
          <div>
            <p className="eyebrow">Family findings</p>
            <h2 className="section-title">
              Review one checklist family with local notes, source context, and a cleaner working surface.
            </h2>
            <p className="section-copy">
              Search within the family, open any item for detail, and capture review notes
              that stay in this browser unless you export them deliberately.
            </p>
          </div>
          <div className="chip-row family-actions">
            <span className="chip">{filtered.length.toLocaleString()} visible items</span>
            <span className="chip">{reviewedCount.toLocaleString()} locally reviewed</span>
          </div>
        </div>
        <div className="filter-card workspace-toolbar board-toolbar-card">
          <div className="workspace-toolbar-main">
            <input
              className="search-input"
              type="search"
              placeholder="Search within this family by finding, service, or category"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <p className="microcopy">
              Use the search when you already know the question you are trying to answer. For
              general review posture, start with the recommendation and quality sections above.
            </p>
          </div>
        </div>
        {filtered.length > 0 ? (
          <article className="list-card review-list-card">
            <div className="item-list">
              {filtered.map((item) => (
                <div className="item-row" key={`${item.guid}_${item.technologySlug}`}>
                  <button type="button" onClick={() => setSelectedGuid(item.guid)}>
                    <div className="item-topline">
                      {item.severity ? <span className="pill">{item.severity}</span> : null}
                      {item.waf ? <span className="pill">{item.waf}</span> : null}
                      {item.category ? <span className="pill">{item.category}</span> : null}
                      <span className="pill">{item.technologyMaturityBucket}</span>
                      {reviews[item.guid]?.packageDecision ? (
                        <span className="pill">{reviews[item.guid]?.packageDecision}</span>
                      ) : null}
                    </div>
                    <p className="item-text">{item.text}</p>
                    <div className="item-meta">
                      {item.id ? <span className="chip">{item.id}</span> : null}
                      {item.subcategory ? <span className="chip">{item.subcategory}</span> : null}
                      {item.serviceCanonical ?? item.service ? (
                        <span className="chip">{item.serviceCanonical ?? item.service}</span>
                      ) : null}
                    </div>
                    {item.description ? <p className="item-description">{item.description}</p> : null}
                  </button>
                </div>
              ))}
            </div>
          </article>
        ) : (
          <section className="filter-card">
            <p className="eyebrow">No matching items</p>
            <h3>Broaden the search to restore the family view.</h3>
            <p className="microcopy">
              Try a shorter term or remove service-specific wording so the broader family guidance
              becomes visible again.
            </p>
          </section>
        )}
      </section>

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
