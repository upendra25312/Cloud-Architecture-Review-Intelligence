"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getServiceEstimateProfile,
  resolveEstimateInputs
} from "@/lib/monthly-estimate-profiles";
import { matchesPricingTargetRegion } from "@/lib/service-pricing";
import type {
  ChecklistItem,
  EstimateInputMode,
  ReviewDraft,
  ReviewServiceAssumption,
  ServicePricing,
  ServiceRegionalFit,
  ServiceSummary
} from "@/types";

type MatrixChipTone = "good" | "warning" | "danger" | "neutral";

type MatrixChip = {
  label: string;
  tone: MatrixChipTone;
};

type ProjectReviewServiceDrawerRow = {
  service: ServiceSummary;
  itemCount: number;
  includedCount: number;
  notApplicableCount: number;
  excludedCount: number;
  pendingCount: number;
  regionFit: {
    chips: MatrixChip[];
    summary: string;
  };
  costFit: {
    chips: MatrixChip[];
    summary: string;
  };
  checklistChips: MatrixChip[];
  checklistSummary: string;
  serviceItems: ChecklistItem[];
  regionalFit?: ServiceRegionalFit;
  pricing?: ServicePricing;
  serviceAssumption: ReviewServiceAssumption;
};

type ProjectReviewServiceDrawerProps = {
  row: ProjectReviewServiceDrawerRow;
  targetRegions: string[];
  reviews: Record<string, ReviewDraft>;
  activePackageName?: string | null;
  pricingLoading: boolean;
  pricingError: string | null;
  regionalFitLoading: boolean;
  regionalFitError: string | null;
  onClose: () => void;
  onOpenItem: (guid: string) => void;
  onUpdateServiceAssumption: (
    serviceSlug: string,
    next: Partial<ReviewServiceAssumption>
  ) => void;
  onUpdateServiceEstimateInput: (
    serviceSlug: string,
    key: string,
    value: string | number | boolean
  ) => void;
  onUpdateServiceEstimateInputMode: (
    serviceSlug: string,
    mode: EstimateInputMode
  ) => void;
};

const CHECKLIST_DECISION_ORDER = {
  "Needs Review": 0,
  Include: 1,
  "Not Applicable": 2,
  Exclude: 3
} as const;

const SEVERITY_ORDER = {
  High: 0,
  Medium: 1,
  Low: 2,
  "": 3
} as const;

function formatRetailPrice(price: number | undefined, currencyCode = "USD") {
  if (price === undefined || Number.isNaN(price)) {
    return "Not published";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 6
  }).format(price);
}

function normalizeRegionName(value: string) {
  return value.trim().toLowerCase();
}

function getTargetRegionStatus(
  targetRegion: string,
  regionalFit: ServiceRegionalFit | undefined
) {
  if (!regionalFit) {
    return {
      label: `${targetRegion} · Loading`,
      tone: "neutral" as const
    };
  }

  if (regionalFit.isGlobalService) {
    return {
      label: `${targetRegion} · Global service`,
      tone: "neutral" as const
    };
  }

  const normalizedTarget = normalizeRegionName(targetRegion);
  const availableRegion = regionalFit.regions.find(
    (region) => normalizeRegionName(region.regionName) === normalizedTarget
  );

  if (availableRegion) {
    if (availableRegion.accessState === "ReservedAccess") {
      return {
        label: `${targetRegion} · Restricted`,
        tone: "warning" as const
      };
    }

    if (availableRegion.accessState === "EarlyAccess") {
      return {
        label: `${targetRegion} · Early access`,
        tone: "warning" as const
      };
    }

    if (availableRegion.availabilityState === "Preview") {
      return {
        label: `${targetRegion} · Preview`,
        tone: "warning" as const
      };
    }

    if (availableRegion.availabilityState === "Retiring") {
      return {
        label: `${targetRegion} · Retiring`,
        tone: "warning" as const
      };
    }

    return {
      label: `${targetRegion} · Available`,
      tone: "good" as const
    };
  }

  const unavailableRegion = regionalFit.unavailableRegions.find(
    (region) => normalizeRegionName(region.regionName) === normalizedTarget
  );

  if (unavailableRegion) {
    return {
      label:
        unavailableRegion.accessState === "ReservedAccess"
          ? `${targetRegion} · Restricted region`
          : `${targetRegion} · Unavailable`,
      tone: unavailableRegion.accessState === "ReservedAccess" ? ("warning" as const) : ("danger" as const)
    };
  }

  return {
    label: `${targetRegion} · Not in feed`,
    tone: "danger" as const
  };
}

export function ProjectReviewServiceDrawer({
  row,
  targetRegions,
  reviews,
  activePackageName,
  pricingLoading,
  pricingError,
  regionalFitLoading,
  regionalFitError,
  onClose,
  onOpenItem,
  onUpdateServiceAssumption,
  onUpdateServiceEstimateInput,
  onUpdateServiceEstimateInputMode
}: ProjectReviewServiceDrawerProps) {
  const [pricingScope, setPricingScope] = useState<"target" | "all">(
    targetRegions.length > 0 ? "target" : "all"
  );

  useEffect(() => {
    setPricingScope(targetRegions.length > 0 ? "target" : "all");
  }, [targetRegions]);

  const targetRegionChips = useMemo(
    () => targetRegions.map((targetRegion) => getTargetRegionStatus(targetRegion, row.regionalFit)),
    [row.regionalFit, targetRegions]
  );
  const estimateProfile = useMemo(() => getServiceEstimateProfile(row.service.slug), [row.service.slug]);
  const resolvedEstimateInputs = useMemo(
    () => resolveEstimateInputs(estimateProfile, row.serviceAssumption),
    [estimateProfile, row.serviceAssumption]
  );

  const scopedPricingRows = useMemo(() => {
    if (!row.pricing) {
      return [];
    }

    if (pricingScope === "all" || targetRegions.length === 0) {
      return row.pricing.rows;
    }

    return row.pricing.rows.filter(
      (pricingRow) =>
        matchesPricingTargetRegion(
          pricingRow.armRegionName,
          pricingRow.location,
          targetRegions,
          row.pricing?.targetPricingLocations,
          pricingRow.locationKind
        ) ||
        pricingRow.locationKind !== "Region"
    );
  }, [pricingScope, row.pricing, targetRegions]);

  const sortedServiceItems = useMemo(() => {
    return [...row.serviceItems].sort((left, right) => {
      const leftReview = reviews[left.guid];
      const rightReview = reviews[right.guid];
      const leftDecision = leftReview?.packageDecision ?? "Needs Review";
      const rightDecision = rightReview?.packageDecision ?? "Needs Review";

      if (CHECKLIST_DECISION_ORDER[leftDecision] !== CHECKLIST_DECISION_ORDER[rightDecision]) {
        return CHECKLIST_DECISION_ORDER[leftDecision] - CHECKLIST_DECISION_ORDER[rightDecision];
      }

      const leftSeverity = SEVERITY_ORDER[left.severity ?? ""];
      const rightSeverity = SEVERITY_ORDER[right.severity ?? ""];

      if (leftSeverity !== rightSeverity) {
        return leftSeverity - rightSeverity;
      }

      return left.text.localeCompare(right.text);
    });
  }, [reviews, row.serviceItems]);

  const visibleServiceItems = sortedServiceItems.slice(0, 14);
  const hiddenFindingCount = sortedServiceItems.length - visibleServiceItems.length;
  const pricingRowsToShow = scopedPricingRows.slice(0, 24);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer-panel service-drawer-panel"
        onClick={(event) => event.stopPropagation()}
        aria-label={`${row.service.service} project review details`}
      >
        <div className="drawer-header service-drawer-header">
          <div className="service-drawer-header-copy">
            <p className="eyebrow">Service detail</p>
            <h2 className="drawer-title">{row.service.service}</h2>
            <p className="note">
              {activePackageName
                ? `This drawer keeps the current region, pricing, and checklist context inside ${activePackageName}.`
                : "This drawer keeps the current region, pricing, and checklist context inside the active project review."}
            </p>
            <div className="drawer-meta">
              <span className="pill">{row.service.familyCount.toLocaleString()} families</span>
              <span className="pill">{row.itemCount.toLocaleString()} findings</span>
              <span className="pill">{row.pendingCount.toLocaleString()} pending</span>
            </div>
          </div>
          <div className="button-row">
            <Link href={`/services/${row.service.slug}`} className="secondary-button">
              Open full service review
            </Link>
            <button type="button" className="ghost-button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <section className="drawer-section">
          <div className="hero-metrics-row service-drawer-metrics">
            <article className="hero-metric-card">
              <span>Region fit</span>
              <strong>{row.regionFit.chips.length.toLocaleString()}</strong>
              <p>{row.regionFit.summary}</p>
            </article>
            <article className="hero-metric-card">
              <span>Cost fit</span>
              <strong>{row.costFit.chips.length.toLocaleString()}</strong>
              <p>{row.costFit.summary}</p>
            </article>
            <article className="hero-metric-card">
              <span>Checklist status</span>
              <strong>{row.pendingCount.toLocaleString()}</strong>
              <p>{row.checklistSummary}</p>
            </article>
          </div>
        </section>

        <section className="drawer-section">
          <h3>Design assumptions</h3>
          <p className="microcopy">
            These assumptions stay tied to this service in the active project review and keep the matrix compact by moving estimate and pricing refinement into this drawer.
          </p>
          <div className="matrix-assumption-grid service-drawer-assumptions">
            <label>
              <span className="microcopy">Planned region</span>
              <input
                className="field-input"
                value={row.serviceAssumption.plannedRegion}
                onChange={(event) =>
                  onUpdateServiceAssumption(row.service.slug, {
                    plannedRegion: event.target.value
                  })
                }
                placeholder={targetRegions[0] ?? "East US"}
              />
            </label>
            <label>
              <span className="microcopy">Preferred SKU</span>
              <input
                className="field-input"
                value={row.serviceAssumption.preferredSku}
                onChange={(event) =>
                  onUpdateServiceAssumption(row.service.slug, {
                    preferredSku: event.target.value
                  })
                }
                placeholder="Standard v2, Premium, P1v3, S1"
              />
            </label>
            <label>
              <span className="microcopy">Sizing note</span>
              <textarea
                className="field-textarea matrix-textarea"
                value={row.serviceAssumption.sizingNote}
                onChange={(event) =>
                  onUpdateServiceAssumption(row.service.slug, {
                    sizingNote: event.target.value
                  })
                }
                placeholder="Capture scale, customer constraints, or estimate assumptions for this service."
              />
            </label>
          </div>
        </section>

        {estimateProfile && estimateProfile.inputDefinitions.length > 0 ? (
          <section className="drawer-section">
            <h3>Estimate inputs</h3>
            <p className="microcopy">
              Monthly-estimate tuning lives here so the matrix stays scannable. Keep the profile defaults for the first pass, then switch to custom only when you need a tighter estimate.
            </p>
            <div className="matrix-assumption-grid service-drawer-assumptions">
              <label>
                <span className="microcopy">Estimate input mode</span>
                <select
                  className="field-input"
                  value={row.serviceAssumption.estimateInputMode ?? "defaults"}
                  onChange={(event) =>
                    onUpdateServiceEstimateInputMode(
                      row.service.slug,
                      event.target.value as EstimateInputMode
                    )
                  }
                >
                  <option value="defaults">Use profile defaults</option>
                  <option value="custom">Customize estimate inputs</option>
                </select>
              </label>
              {estimateProfile.inputDefinitions.map((definition) => {
                const inputId = `${row.service.slug}-${definition.key}`;
                const currentValue = resolvedEstimateInputs[definition.key] ?? definition.defaultValue;

                if (definition.kind === "boolean") {
                  return (
                    <label key={inputId}>
                      <span className="microcopy">{definition.label}</span>
                      <input
                        className="field-input"
                        type="checkbox"
                        checked={Boolean(currentValue)}
                        onChange={(event) =>
                          onUpdateServiceEstimateInput(
                            row.service.slug,
                            definition.key,
                            event.target.checked
                          )
                        }
                      />
                      <span className="microcopy">{definition.description}</span>
                    </label>
                  );
                }

                if (definition.kind === "select") {
                  return (
                    <label key={inputId}>
                      <span className="microcopy">{definition.label}</span>
                      <select
                        className="field-input"
                        value={String(currentValue)}
                        onChange={(event) =>
                          onUpdateServiceEstimateInput(
                            row.service.slug,
                            definition.key,
                            event.target.value
                          )
                        }
                      >
                        {(definition.options ?? []).map((option) => (
                          <option key={`${inputId}-${option.value}`} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <span className="microcopy">{definition.description}</span>
                    </label>
                  );
                }

                return (
                  <label key={inputId}>
                    <span className="microcopy">
                      {definition.label}
                      {definition.unit ? ` · ${definition.unit}` : ""}
                    </span>
                    <input
                      className="field-input"
                      type="number"
                      min={definition.min}
                      step={definition.step}
                      value={Number(currentValue)}
                      onChange={(event) =>
                        onUpdateServiceEstimateInput(
                          row.service.slug,
                          definition.key,
                          Number(event.target.value)
                        )
                      }
                    />
                    <span className="microcopy">{definition.description}</span>
                  </label>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="drawer-section">
          <h3>Regional fit detail</h3>
          <div className="chip-row">
            {row.regionFit.chips.map((chip) => (
              <span className={`matrix-chip matrix-chip-${chip.tone}`} key={`${row.service.slug}-${chip.label}`}>
                {chip.label}
              </span>
            ))}
          </div>
          {targetRegionChips.length > 0 ? (
            <div className="service-drawer-subsection">
              <strong>Target-region view</strong>
              <div className="chip-row">
                {targetRegionChips.map((chip) => (
                  <span className={`matrix-chip matrix-chip-${chip.tone}`} key={chip.label}>
                    {chip.label}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {regionalFitLoading && !row.regionalFit ? (
            <section className="trace-card">
              <strong>Loading live availability</strong>
              <p>The dedicated backend is still resolving the latest Microsoft regional fit for this service.</p>
            </section>
          ) : null}
          {regionalFitError ? (
            <section className="trace-card">
              <strong>Availability note</strong>
              <p>{regionalFitError}</p>
            </section>
          ) : null}
          {row.regionalFit ? (
            <div className="traceability-grid">
              <article className="trace-card">
                <strong>Mapped offering</strong>
                <p>{row.regionalFit.matchedOfferingName ?? row.service.service}</p>
              </article>
              <article className="trace-card">
                <strong>Available regions</strong>
                <p>{row.regionalFit.availableRegionCount.toLocaleString()}</p>
              </article>
              <article className="trace-card">
                <strong>Restricted regions</strong>
                <p>{row.regionalFit.restrictedRegionCount.toLocaleString()}</p>
              </article>
              <article className="trace-card">
                <strong>Unavailable regions</strong>
                <p>{row.regionalFit.unavailableRegionCount.toLocaleString()}</p>
              </article>
            </div>
          ) : null}
          {row.regionalFit?.notes.length ? (
            <div className="service-drawer-subsection">
              <strong>Availability notes</strong>
              <div className="service-drawer-note-list">
                {row.regionalFit.notes.map((note) => (
                  <p className="microcopy" key={note}>
                    {note}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="drawer-section">
          <div className="service-drawer-section-head">
            <div>
              <h3>Pricing detail</h3>
              <p className="microcopy">
                List pricing still works even when no sizing note is written. Sizing becomes important later when you turn list pricing into an estimate.
              </p>
            </div>
            {targetRegions.length > 0 ? (
              <div className="button-row">
                <button
                  type="button"
                  className={pricingScope === "target" ? "secondary-button" : "ghost-button"}
                  onClick={() => setPricingScope("target")}
                >
                  Target regions first
                </button>
                <button
                  type="button"
                  className={pricingScope === "all" ? "secondary-button" : "ghost-button"}
                  onClick={() => setPricingScope("all")}
                >
                  All pricing rows
                </button>
              </div>
            ) : null}
          </div>
          <div className="chip-row">
            {row.costFit.chips.map((chip) => (
              <span className={`matrix-chip matrix-chip-${chip.tone}`} key={`${row.service.slug}-cost-${chip.label}`}>
                {chip.label}
              </span>
            ))}
          </div>
          {pricingLoading && !row.pricing ? (
            <section className="trace-card">
              <strong>Loading pricing</strong>
              <p>The dedicated backend is still resolving Microsoft retail pricing for this service.</p>
            </section>
          ) : null}
          {pricingError && !row.pricing ? (
            <section className="trace-card">
              <strong>Pricing note</strong>
              <p>{pricingError}</p>
            </section>
          ) : null}
          {!row.pricing ? (
            <section className="trace-card">
              <strong>Pricing rows unavailable</strong>
              <p>{row.costFit.summary}</p>
            </section>
          ) : (
            <>
              <div className="traceability-grid">
                <article className="trace-card">
                  <strong>Starting retail row</strong>
                  <p>{formatRetailPrice(row.pricing.startsAtRetailPrice, row.pricing.currencyCode)}</p>
                </article>
                <article className="trace-card">
                  <strong>Published SKUs</strong>
                  <p>{row.pricing.skuCount.toLocaleString()}</p>
                </article>
                <article className="trace-card">
                  <strong>Billing locations</strong>
                  <p>{row.pricing.billingLocationCount.toLocaleString()}</p>
                </article>
                <article className="trace-card">
                  <strong>Target-region matches</strong>
                  <p>{row.pricing.targetRegionMatchCount.toLocaleString()}</p>
                </article>
              </div>
              {row.pricing.notes.length > 0 ? (
                <div className="chip-row">
                  {row.pricing.notes.map((note) => (
                    <span className="chip" key={note}>
                      {note}
                    </span>
                  ))}
                </div>
              ) : null}
              {pricingRowsToShow.length > 0 ? (
                <div className="pricing-drilldown-table service-drawer-pricing-table">
                  <div className="pricing-drilldown-head">
                    <span>Location</span>
                    <span>SKU</span>
                    <span>Meter</span>
                    <span>Retail price</span>
                    <span>Unit</span>
                  </div>
                  {pricingRowsToShow.map((pricingRow) => (
                    <div
                      className="pricing-drilldown-row"
                      key={`${row.service.slug}-${pricingRow.meterId}-${pricingRow.location}-${pricingRow.skuName}`}
                    >
                      <span>{pricingRow.location || pricingRow.armRegionName || "Global"}</span>
                      <span>{pricingRow.skuName || pricingRow.armSkuName || "Unspecified SKU"}</span>
                      <span>{pricingRow.meterName}</span>
                      <span>{formatRetailPrice(pricingRow.retailPrice, pricingRow.currencyCode)}</span>
                      <span>{pricingRow.unitOfMeasure}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <section className="trace-card">
                  <strong>No pricing rows in view</strong>
                  <p>{row.costFit.summary}</p>
                </section>
              )}
              {scopedPricingRows.length > pricingRowsToShow.length ? (
                <p className="microcopy">
                  Showing the first {pricingRowsToShow.length.toLocaleString()} pricing rows in this drawer. Use the pricing export when you need every scoped row.
                </p>
              ) : null}
            </>
          )}
        </section>

        <section className="drawer-section">
          <div className="service-drawer-section-head">
            <div>
              <h3>Checklist context</h3>
              <p className="microcopy">
                Review the most relevant findings here, then open a finding detail drawer when you want to add the actual project note.
              </p>
            </div>
            <div className="chip-row">
              {row.checklistChips.map((chip) => (
                <span className={`matrix-chip matrix-chip-${chip.tone}`} key={`${row.service.slug}-check-${chip.label}`}>
                  {chip.label}
                </span>
              ))}
            </div>
          </div>
          {visibleServiceItems.length > 0 ? (
            <article className="list-card review-list-card">
              <div className="item-list">
                {visibleServiceItems.map((item) => {
                  const review = reviews[item.guid];
                  const packageDecision = review?.packageDecision ?? "Needs Review";

                  return (
                    <div className="item-row" key={`${item.guid}_${item.technologySlug}`}>
                      <div>
                        <div className="item-topline">
                          <span className="pill">{packageDecision}</span>
                          {item.severity ? <span className="pill">{item.severity}</span> : null}
                          {item.waf ? <span className="pill">{item.waf}</span> : null}
                          <span className="pill">{item.technology}</span>
                        </div>
                        <p className="item-text">{item.text}</p>
                        <p className="item-description">
                          {review?.comments?.trim()
                            ? review.comments
                            : item.description || "Open the finding detail drawer to capture project-specific reasoning."}
                        </p>
                      </div>
                      <div className="button-row">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => onOpenItem(item.guid)}
                        >
                          Open finding detail
                        </button>
                        <Link href={`/technologies/${item.technologySlug}`} className="muted-link">
                          Open family detail
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          ) : (
            <section className="trace-card">
              <strong>No findings scoped yet</strong>
              <p>Add this service to the project review or broaden the service selection before trying to review findings here.</p>
            </section>
          )}
          {hiddenFindingCount > 0 ? (
            <p className="microcopy">
              Showing the first {visibleServiceItems.length.toLocaleString()} findings in this drawer. Open the full service review when you need the complete service checklist.
            </p>
          ) : null}
        </section>
      </aside>
    </div>
  );
}
