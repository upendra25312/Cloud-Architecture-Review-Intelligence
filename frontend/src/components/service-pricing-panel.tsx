
"use client";

import { useEffect, useMemo, useState } from "react";
import { DataSourceStatusCard } from "@/components/data-source-status";
import { buildServiceMonthlyEstimate } from "@/lib/monthly-estimate";
import { buildServicePricingRequest, loadServicePricingBatch, matchesPricingTargetRegion } from "@/lib/service-pricing";
import type { ServicePricing, ServiceRegionalFitSummary, ServiceSummary } from "@/types";

type PricingRowView = ServicePricing["rows"][number] & {
  officialRegionName?: string;
  displayRegionName?: string;
  geographyName?: string;
  priceType?: string;
  mappingConfidence?: string;
  productionSuitability?: string;
  warnings?: string[];
  assumptions?: string[];
  approximateMonthlyPrice?: number;
};

function formatRetailPrice(price: number | undefined, currencyCode: string) {
  if (price === undefined || Number.isNaN(price)) {
    return "Not published";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 6
  }).format(price);
}

function formatEstimatePrice(price: number | undefined, currencyCode: string) {
  if (price === undefined || Number.isNaN(price)) {
    return "Not modeled";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 2
  }).format(price);
}

function getPriceTypeLabel(priceType?: string) {
  switch (priceType) {
    case "validated-retail-price":
      return "Validated retail price";
    case "estimated-selected-retail-meter":
      return "Selected retail meter";
    case "partial-price-component":
      return "Partial price component";
    case "pricing-needs-review":
      return "Pricing needs review";
    default:
      return null;
  }
}

function getProductionSuitabilityLabel(productionSuitability?: string) {
  switch (productionSuitability) {
    case "non-production":
      return "Non-production tier";
    case "free-tier":
      return "Free tier";
    default:
      return null;
  }
}

function getConfidenceLabel(confidence?: string) {
  switch (confidence) {
    case "high":
      return "High confidence";
    case "medium":
      return "Medium confidence";
    case "low":
      return "Low confidence";
    default:
      return null;
  }
}

function getRowRegionLabel(row: PricingRowView) {
  return row.displayRegionName || row.officialRegionName || row.location || row.armRegionName || "No published billing location";
}

function findBaseMonthlyRow(pricing: ServicePricing | null, targetRegions: string[]) {
  if (!pricing) {
    return null;
  }

  const scopedRows =
    targetRegions.length > 0
      ? pricing.rows.filter(
          (row) =>
            matchesPricingTargetRegion(
              row.armRegionName,
              row.location,
              targetRegions,
              pricing.targetPricingLocations,
              row.locationKind
            ) || row.locationKind === "Global"
        )
      : pricing.rows;

  const baseRow =
    scopedRows.find(
      (row) => /base/i.test(row.meterName) && /month/i.test(row.unitOfMeasure)
    ) ??
    scopedRows.find(
      (row) =>
        /base|included routing rules/i.test(row.meterName) &&
        (/month/i.test(row.unitOfMeasure) || /hour/i.test(row.unitOfMeasure))
    );

  if (!baseRow) {
    return null;
  }

  if (/hour/i.test(baseRow.unitOfMeasure)) {
    return {
      ...baseRow,
      retailPrice: baseRow.retailPrice * 730,
      unitOfMeasure: "Estimated month"
    };
  }

  return baseRow;
}

export function ServicePricingPanel({
  service,
  regionalFit,
  targetRegions
}: {
  service: Pick<ServiceSummary, "slug" | "service" | "aliases" | "regionalFitSummary">;
  regionalFit?: ServiceRegionalFitSummary;
  targetRegions: string[];
}) {
  const [pricing, setPricing] = useState<ServicePricing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<"all" | "target">(targetRegions.length > 0 ? "target" : "all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"retail" | "estimate">("retail");

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError(null);

    loadServicePricingBatch([buildServicePricingRequest(service, regionalFit, targetRegions)])
      .then((payload) => {
        if (!active) {
          return;
        }

        setPricing(payload[0] ?? null);
        setLoading(false);
      })
      .catch((nextError) => {
        if (!active) {
          return;
        }

        setError(nextError instanceof Error ? nextError.message : "Unable to load pricing.");
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [regionalFit, service, targetRegions]);

  useEffect(() => {
    if (targetRegions.length > 0) {
      setScope("target");
      return;
    }

    setScope("all");
  }, [targetRegions]);

  const scopedRows = useMemo(() => {
    if (!pricing) {
      return [];
    }

    if (scope === "all" || targetRegions.length === 0) {
      return pricing.rows as PricingRowView[];
    }

    return (pricing.rows as PricingRowView[]).filter(
      (row) =>
        matchesPricingTargetRegion(
          row.armRegionName,
          row.location,
          targetRegions,
          pricing.targetPricingLocations,
          row.locationKind
        ) ||
        row.locationKind !== "Region"
    );
  }, [pricing, scope, targetRegions]);

  const baseMonthlyRow = useMemo(
    () => findBaseMonthlyRow(pricing, targetRegions),
    [pricing, targetRegions]
  );
  const monthlyEstimate = useMemo(
    () =>
      pricing
        ? buildServiceMonthlyEstimate(
            pricing,
            {
              plannedRegion: "",
              preferredSku: "",
              sizingNote: "",
              estimateInputMode: "defaults",
              estimateInputs: {}
            },
            targetRegions
          )
        : null,
    [pricing, targetRegions]
  );
  const highlightedStartingPrice =
    pricing?.startsAtTargetRetailPrice ?? pricing?.startsAtRetailPrice;

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return scopedRows;
    }

    return scopedRows.filter((row) =>
      [row.location, row.armRegionName, row.skuName, row.productName, row.meterName]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch)
    );
  }, [scopedRows, search]);

  if (loading) {
    return (
      <section className="surface-panel board-stage-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Commercial fit</p>
            <h2 className="section-title">Loading pricing posture for this service.</h2>
            <p className="section-copy">
              Pricing is pulled from Microsoft’s Azure Retail Prices API so pre-sales and solution
              teams can see real SKU and region meter data before creating a project review export.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="surface-panel board-stage-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Commercial fit</p>
            <h2 className="section-title">Pricing could not be loaded right now.</h2>
            <p className="section-copy">{error}</p>
          </div>
        </div>
      </section>
    );
  }

  if (!pricing || !pricing.mapped) {
    return (
      <section className="surface-panel board-stage-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Commercial fit</p>
            <h2 className="section-title">Public retail pricing has not been mapped for this service yet.</h2>
            <p className="section-copy">
              Some review services are umbrella concepts or control-plane helpers, so Microsoft does
              not publish them as a clean standalone retail-priced service.
            </p>
          </div>
        </div>
        <div className="traceability-grid">
          {(pricing?.notes ?? []).map((note) => (
            <article className="trace-card" key={note}>
              <strong>Pricing note</strong>
              <p>{note}</p>
            </article>
          ))}
          <article className="trace-card">
            <strong>Official source</strong>
            <p>
              <a href="https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices" target="_blank" rel="noreferrer" className="muted-link">
                Azure Retail Prices API
              </a>
            </p>
          </article>
          <article className="trace-card">
            <strong>Calculator</strong>
            <p>
              <a href="https://azure.microsoft.com/en-us/pricing/calculator/" target="_blank" rel="noreferrer" className="muted-link">
                Azure Pricing Calculator
              </a>
            </p>
          </article>
        </div>
      </section>
    );
  }

  return (
    <section className="surface-panel board-stage-panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">Commercial fit</p>
          <h2 className="section-title">Use Microsoft retail pricing directly, or switch to a calculator-aligned estimate view.</h2>
          <p className="section-copy">
            This page uses Microsoft’s Azure Retail Prices API as the source of truth. The estimate view adds site-owned assumptions on top of those published retail meters. It does not call an official Azure Pricing Calculator API.
          </p>
        </div>
      </div>

      <div className="button-row">
        <button
          type="button"
          className={view === "retail" ? "secondary-button" : "ghost-button"}
          onClick={() => setView("retail")}
        >
          Retail Meter View
        </button>
        <button
          type="button"
          className={view === "estimate" ? "secondary-button" : "ghost-button"}
          onClick={() => setView("estimate")}
        >
          Monthly Estimate View
        </button>
        {targetRegions.length > 0 ? (
          <>
            <button
              type="button"
              className={scope === "target" ? "secondary-button" : "ghost-button"}
              onClick={() => setScope("target")}
            >
              Target regions first
            </button>
            <button
              type="button"
              className={scope === "all" ? "secondary-button" : "ghost-button"}
              onClick={() => setScope("all")}
            >
              All pricing rows
            </button>
          </>
        ) : null}
      </div>

      {view === "retail" ? (
        <div className="hero-metrics-row">
          <article className="hero-metric-card">
            <span>{pricing.startsAtTargetRetailPrice !== undefined ? "Lowest scoped meter" : "Lowest published meter"}</span>
            <strong>{formatRetailPrice(highlightedStartingPrice, pricing.currencyCode)}</strong>
            <p>
              This is the lowest published retail meter row in the current pricing scope. It is not a monthly Azure Pricing Calculator estimate.
            </p>
          </article>
          <article className="hero-metric-card">
            <span>Base monthly fee</span>
            <strong>{baseMonthlyRow ? formatRetailPrice(baseMonthlyRow.retailPrice, baseMonthlyRow.currencyCode) : "Not isolated"}</strong>
            <p>
              {baseMonthlyRow
                ? `${baseMonthlyRow.meterName} from the retail feed. Use this as a baseline recurring meter, not as a full calculator total.`
                : "No clear recurring base-fee meter was isolated for this service."}
            </p>
          </article>
          <article className="hero-metric-card">
            <span>Target-region matches</span>
            <strong>{pricing.targetRegionMatchCount.toLocaleString()}</strong>
            <p>Pricing locations that match the active project review target regions.</p>
          </article>
          <article className="hero-metric-card">
            <span>Default monthly estimate</span>
            <strong>
              {monthlyEstimate?.supported
                ? formatEstimatePrice(monthlyEstimate.selectedMonthlyCost, monthlyEstimate.currencyCode)
                : "Not modeled"}
            </strong>
            <p>
              {monthlyEstimate?.supported
                ? `${monthlyEstimate.selectedSkuName ?? "Selected SKU"} is available in the estimate view using Microsoft retail pricing plus site assumptions.`
                : "This service does not yet have a modeled estimate; use the raw retail meters below or build a manual worksheet in the Azure Pricing Calculator."}
            </p>
          </article>
        </div>
      ) : (
        <div className="hero-metrics-row">
          <article className="hero-metric-card">
            <span>Selected hourly estimate</span>
            <strong>{formatEstimatePrice(monthlyEstimate?.selectedHourlyCost, monthlyEstimate?.currencyCode ?? pricing.currencyCode)}</strong>
            <p>Average hourly view derived from the selected estimate profile and scoped retail rows.</p>
          </article>
          <article className="hero-metric-card">
            <span>Selected monthly estimate</span>
            <strong>{formatEstimatePrice(monthlyEstimate?.selectedMonthlyCost, monthlyEstimate?.currencyCode ?? pricing.currencyCode)}</strong>
            <p>Calculated from Microsoft retail meters. This is not fetched from an Azure Pricing Calculator API.</p>
          </article>
          <article className="hero-metric-card">
            <span>Estimate coverage</span>
            <strong>{monthlyEstimate?.coverage?.replaceAll("-", " ") ?? "Not modeled"}</strong>
            <p>{monthlyEstimate?.selectedSkuName ? `Selected SKU ${monthlyEstimate.selectedSkuName}` : "No estimate profile could be resolved for this service."}</p>
          </article>
          <article className="hero-metric-card">
            <span>Profile version</span>
            <strong>{monthlyEstimate?.profileVersion ?? "n/a"}</strong>
            <p>Retail meters are Microsoft-sourced. Estimate defaults on this page are product-owned assumptions.</p>
          </article>
        </div>
      )}

      <div className="traceability-grid">
        <article className="trace-card">
          <strong>Query used</strong>
          <p>
            {pricing.query
              ? `${pricing.query.field} ${pricing.query.operator} ${pricing.query.value}`
              : "No retail pricing query was captured."}
          </p>
        </article>
        <article className="trace-card">
          <strong>Billing locations</strong>
          <p>{pricing.billingLocationCount.toLocaleString()}</p>
        </article>
        <article className="trace-card">
          <strong>Meters returned</strong>
          <p>{pricing.meterCount.toLocaleString()}</p>
        </article>
        <article className="trace-card">
          <strong>Pricing source</strong>
          <p>
            <a href={pricing.sourceUrl} target="_blank" rel="noreferrer" className="muted-link">
              Azure Retail Prices API
            </a>
          </p>
          <p className="microcopy">
            Live values on this page come from the retail prices feed. The calculator is linked below only for monthly estimate refinement.
          </p>
        </article>
      </div>

      <DataSourceStatusCard
        label="Pricing source"
        dataSource={pricing.dataSource}
        loadingSummary="The pricing panel is still resolving whether the dedicated backend can serve a fresh retail-pricing refresh or the scheduled cache."
        fallbackSummary="The pricing panel stayed on the last successful cache so the commercial review can continue."
      />

      <div className="filter-card">
        <p className="eyebrow">Pricing note</p>
        <h3>Use retail pricing as the customer-facing baseline, then refine with quantity assumptions.</h3>
        <p className="microcopy">{pricing.priceDisclaimer}</p>
        <p className="microcopy">
          The Azure Pricing Calculator can show a different figure because it layers Microsoft-owned configuration assumptions on top of the same published retail price source. This page only uses the Azure Retail Prices API plus site-owned estimate defaults.
        </p>
        {pricing.notes.length > 0 ? (
          <div className="chip-row">
            {pricing.notes.map((note) => (
              <span className="chip" key={note}>
                {note}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {view === "retail" ? (
        <>
          <div className="filter-card workspace-toolbar">
            <div className="workspace-toolbar-main">
              <input
                className="search-input"
                type="search"
                placeholder="Search pricing rows by location, SKU, product, or meter"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <p className="microcopy">
                {scope === "target" && targetRegions.length > 0
                  ? `Target-region scope uses ${targetRegions.join(", ")} and also includes matching billing-zone or global meters when Microsoft prices a service that way.`
                  : "All published pricing rows are shown, including zone-based billing rows for global services."}
              </p>
            </div>
          </div>

          {filteredRows.length > 0 ? (
            <article className="list-card review-list-card">
              <div className="item-list">
                {filteredRows.slice(0, 200).map((row) => {
                  const priceTypeLabel = getPriceTypeLabel(row.priceType);
                  const productionSuitabilityLabel = getProductionSuitabilityLabel(
                    row.productionSuitability
                  );
                  const confidenceLabel = getConfidenceLabel(row.mappingConfidence);

                  return (
                    <div className="item-row" key={`${row.meterId}-${row.location}-${row.tierMinimumUnits}-${row.retailPrice}`}>
                      <div>
                        <div className="item-topline">
                          <span className="pill">{row.locationKind}</span>
                          {row.skuName ? <span className="pill">{row.skuName}</span> : null}
                          {row.displayRegionName ? <span className="pill">{row.displayRegionName}</span> : null}
                          {priceTypeLabel ? <span className="pill">{priceTypeLabel}</span> : null}
                          {productionSuitabilityLabel ? (
                            <span className="pill">{productionSuitabilityLabel}</span>
                          ) : null}
                          {matchesPricingTargetRegion(
                            row.armRegionName,
                            row.location,
                            targetRegions,
                            pricing.targetPricingLocations,
                            row.locationKind
                          ) ? (
                            <span className="pill">Target region match</span>
                          ) : null}
                        </div>
                        <p className="item-text">{getRowRegionLabel(row)}</p>
                        <p className="item-description">
                          {row.productName} · {row.meterName} · {formatRetailPrice(row.retailPrice, row.currencyCode)} per{" "}
                          {row.unitOfMeasure}
                          {row.approximateMonthlyPrice !== undefined
                            ? ` · approx. ${formatEstimatePrice(row.approximateMonthlyPrice, row.currencyCode)} monthly`
                            : ""}
                          {row.tierMinimumUnits > 0
                            ? ` after ${row.tierMinimumUnits.toLocaleString()} units`
                            : ""}
                        </p>
                        {confidenceLabel || row.warnings?.length || row.assumptions?.length ? (
                          <div className="chip-row" style={{ marginTop: "0.6rem" }}>
                            {confidenceLabel ? <span className="chip">{confidenceLabel}</span> : null}
                            {(row.warnings ?? []).map((warning) => (
                              <span className="chip" key={warning}>
                                {warning}
                              </span>
                            ))}
                            {(row.assumptions ?? []).map((assumption) => (
                              <span className="chip" key={assumption}>
                                {assumption}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          ) : null}
        </>
      ) : (
        <div className="traceability-grid">
          {monthlyEstimate?.supported && monthlyEstimate.selectedSkuName
            ? (monthlyEstimate.skuEstimates.find((entry) => entry.skuName === monthlyEstimate.selectedSkuName)?.components ?? []).map((component) => (
                <article className="trace-card" key={`${component.meterId ?? component.meterName}-${component.label}`}>
                  <strong>{component.label}</strong>
                  <p>{formatEstimatePrice(component.hourlyCost, monthlyEstimate.currencyCode)}/hour</p>
                  <p>{formatEstimatePrice(component.monthlyCost, monthlyEstimate.currencyCode)}/month</p>
                  <p className="microcopy">{component.location} · {component.meterName}</p>
                </article>
              ))
            : null}
          <article className="trace-card">
            <strong>Estimate input mode</strong>
            <p>{monthlyEstimate?.selectedInputMode ?? "defaults"}</p>
          </article>
          <article className="trace-card">
            <strong>Selected inputs</strong>
            <p>
              {monthlyEstimate && Object.keys(monthlyEstimate.selectedInputs).length > 0
                ? Object.entries(monthlyEstimate.selectedInputs)
                    .map(([key, value]) => `${key}: ${String(value)}`)
                    .join(" | ")
                : "Profile defaults are in use."}
            </p>
          </article>
          <article className="trace-card">
            <strong>Retail source disclosure</strong>
            <p>Prices are sourced from the Azure Retail Prices API. For the Azure Pricing Calculator, use Microsoft’s calculator separately.</p>
          </article>
        </div>
      )}

      {view === "retail" && filteredRows.length === 0 ? (
        <section className="filter-card">
          <p className="eyebrow">No pricing rows in view</p>
          <h3>Broaden the pricing filter to see more SKU and meter rows.</h3>
          <p className="microcopy">
            This can happen when the active project review target regions do not line up with the current
            retail billing locations published for the service.
          </p>
        </section>
      ) : null}

      {view === "retail" && filteredRows.length > 200 ? (
        <section className="filter-card">
          <p className="eyebrow">Result cap</p>
          <h3>Showing the first 200 pricing rows for readability.</h3>
          <p className="microcopy">
            Export the project review commercial snapshot to download every selected pricing row.
          </p>
        </section>
      ) : null}
    </section>
  );
}
