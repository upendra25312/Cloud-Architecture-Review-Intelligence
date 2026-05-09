"use client";

import { useEffect, useMemo, useState } from "react";
import { DataSourceStatusCard } from "@/components/data-source-status";
import { buildServiceRegionalFitRequest, loadServiceRegionalFitBatch } from "@/lib/service-regional-fit";
import type { ServiceRegionalFit, ServiceSummary } from "@/types";

const ACCESS_LABELS = {
  Open: "Open access",
  ReservedAccess: "Restricted access",
  EarlyAccess: "Early access"
} as const;

function normalizeRegionName(value: string) {
  return value.trim().toLowerCase();
}

export function ServiceRegionalFitPanel({
  service,
  regionalFit,
  targetRegions
}: {
  service: Pick<ServiceSummary, "slug" | "service" | "aliases" | "regionalFitSummary">;
  regionalFit: ServiceRegionalFit | undefined;
  targetRegions: string[];
}) {
  const [scope, setScope] = useState<"all" | "target">(
    targetRegions.length > 0 ? "target" : "all"
  );
  const [liveRegionalFit, setLiveRegionalFit] = useState<ServiceRegionalFit | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveLoading, setLiveLoading] = useState(true);
  const normalizedTargets = useMemo(
    () => targetRegions.map((region) => normalizeRegionName(region)),
    [targetRegions]
  );
  const resolvedRegionalFit =
    liveRegionalFit && (liveRegionalFit.mapped || !regionalFit) ? liveRegionalFit : regionalFit;
  const usingLiveRegionalFit = Boolean(liveRegionalFit && resolvedRegionalFit === liveRegionalFit);
  const regionalDataSource = resolvedRegionalFit?.dataSource;

  useEffect(() => {
    if (targetRegions.length > 0) {
      setScope("target");
    }
  }, [targetRegions]);

  useEffect(() => {
    let active = true;

    setLiveLoading(true);
    setLiveError(null);

    loadServiceRegionalFitBatch([buildServiceRegionalFitRequest(service)])
      .then((payload) => {
        if (!active) {
          return;
        }

        setLiveRegionalFit(payload[0] ?? null);
        setLiveLoading(false);
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setLiveError(error instanceof Error ? error.message : "Unable to load live regional availability.");
        setLiveLoading(false);
      });

    return () => {
      active = false;
    };
  }, [service]);

  if (!resolvedRegionalFit || !resolvedRegionalFit.mapped) {
    return (
      <section className="surface-panel board-stage-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Regional fit</p>
            <h2 className="section-title">Official regional availability could not be mapped for this service yet.</h2>
            <p className="section-copy">
              Some checklist services are umbrella concepts, helper resources, or source aliases
              that do not line up cleanly with a single Microsoft offering in the regional
              availability catalog.
            </p>
          </div>
        </div>
        {liveLoading ? (
          <section className="filter-card">
            <p className="eyebrow">Availability source</p>
            <h3>Checking the Azure Function cache and Microsoft’s current regional feed.</h3>
            <p className="microcopy">
              The page first asks the dedicated backend for scheduled cache data and only falls back
              to the generated snapshot if the backend call fails.
            </p>
          </section>
        ) : null}
        {liveError && regionalFit ? (
          <section className="filter-card">
            <p className="eyebrow">Availability source</p>
            <h3>Using the generated snapshot because the backend availability call did not complete.</h3>
            <p className="microcopy">{liveError}</p>
          </section>
        ) : null}
        <div className="traceability-grid">
          {(resolvedRegionalFit?.notes ?? [
            "An official Azure Product Availability by Region offering could not be matched automatically for this service."
          ]).map((note) => (
            <article className="trace-card" key={note}>
              <strong>Mapping note</strong>
              <p>{note}</p>
            </article>
          ))}
          <article className="trace-card">
            <strong>Official source</strong>
            <p>
              <a href={resolvedRegionalFit?.availabilitySourceUrl ?? "https://azure.microsoft.com/en-us/explore/global-infrastructure/products-by-region/table"} target="_blank" rel="noreferrer" className="muted-link">
                Azure Product Availability by Region
              </a>
            </p>
          </article>
          <article className="trace-card">
            <strong>Region restrictions</strong>
            <p>
              <a href={resolvedRegionalFit?.regionsSourceUrl ?? "https://learn.microsoft.com/en-us/azure/reliability/regions-list"} target="_blank" rel="noreferrer" className="muted-link">
                Azure regions list
              </a>
            </p>
          </article>
        </div>
      </section>
    );
  }

  const filteredRegions =
    scope === "target" && normalizedTargets.length > 0
      ? resolvedRegionalFit.regions.filter((region) =>
          normalizedTargets.includes(normalizeRegionName(region.regionName))
        )
      : resolvedRegionalFit.regions;
  const filteredUnavailable =
    scope === "target" && normalizedTargets.length > 0
      ? resolvedRegionalFit.unavailableRegions.filter((region) =>
          normalizedTargets.includes(normalizeRegionName(region.regionName))
        )
      : resolvedRegionalFit.unavailableRegions;
  const missingTargetRegions =
    scope === "target" && normalizedTargets.length > 0
      ? targetRegions.filter((targetRegion) => {
          const normalizedTarget = normalizeRegionName(targetRegion);

          return !resolvedRegionalFit.regions.some(
            (region) => normalizeRegionName(region.regionName) === normalizedTarget
          ) &&
            !resolvedRegionalFit.unavailableRegions.some(
              (region) => normalizeRegionName(region.regionName) === normalizedTarget
            );
        })
      : [];

  return (
    <section className="surface-panel board-stage-panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">Regional fit</p>
          <h2 className="section-title">See where this service is available, restricted, or non-regional.</h2>
          <p className="section-copy">
            Availability is sourced from Microsoft’s `Product Availability by Region` catalog and
            filtered to public commercial Azure regions. Restricted and early-access region markers
            follow Microsoft’s official regional guidance.
          </p>
        </div>
        {targetRegions.length > 0 ? (
          <div className="button-row">
            <button
              type="button"
              className={scope === "target" ? "secondary-button" : "ghost-button"}
              onClick={() => setScope("target")}
            >
              Target regions only
            </button>
            <button
              type="button"
              className={scope === "all" ? "secondary-button" : "ghost-button"}
              onClick={() => setScope("all")}
            >
              All public regions
            </button>
          </div>
        ) : null}
      </div>

      <div className="hero-metrics-row">
        <article className="hero-metric-card">
          <span>Availability mapping</span>
          <strong>{resolvedRegionalFit.matchedOfferingName ?? "Mapped"}</strong>
          <p>
            {resolvedRegionalFit.matchType === "manual"
              ? "Mapped deliberately to the official Microsoft offering."
              : resolvedRegionalFit.matchType === "alias"
                ? "Matched through a retained service alias."
                : "Matched directly to the official Microsoft offering."}
          </p>
        </article>
        <article className="hero-metric-card">
          <span>Available regions</span>
          <strong>{filteredRegions.length.toLocaleString()}</strong>
          <p>
            {resolvedRegionalFit.isGlobalService && filteredRegions.length === 0
              ? "This service is treated as global or non-regional by Microsoft."
              : "Public commercial regions where the service currently appears in Microsoft’s availability feed."}
          </p>
        </article>
        <article className="hero-metric-card">
          <span>Restricted regions</span>
          <strong>
            {filteredRegions
              .filter((region) => region.accessState === "ReservedAccess")
              .length.toLocaleString()}
          </strong>
          <p>Regions marked by Microsoft as restricted access for specific deployment scenarios.</p>
        </article>
      </div>

      <div className="traceability-grid">
        <article className="trace-card">
          <strong>Preview regions</strong>
          <p>
            {filteredRegions
              .filter((region) => region.skuStates.some((entry) => entry.state === "Preview"))
              .length.toLocaleString()}
          </p>
        </article>
        <article className="trace-card">
          <strong>Retiring regions</strong>
          <p>
            {filteredRegions
              .filter((region) => region.skuStates.some((entry) => entry.state === "Retiring"))
              .length.toLocaleString()}
          </p>
        </article>
        <article className="trace-card">
          <strong>Unavailable regions</strong>
          <p>{filteredUnavailable.length.toLocaleString()}</p>
        </article>
        <article className="trace-card">
          <strong>Official sources</strong>
          <p>
            <a href={resolvedRegionalFit.availabilitySourceUrl} target="_blank" rel="noreferrer" className="muted-link">
              Product Availability by Region
            </a>
            {" · "}
            <a href={resolvedRegionalFit.regionsSourceUrl} target="_blank" rel="noreferrer" className="muted-link">
              Azure regions list
            </a>
          </p>
        </article>
      </div>

      <DataSourceStatusCard
        label="Availability source"
        dataSource={regionalDataSource}
        loadingSummary={
          liveError
            ? `${liveError} The page stayed on the generated snapshot so the service review could continue.`
            : liveRegionalFit && regionalFit
              ? "The backend returned a weaker match than the generated snapshot, so the page kept the generated snapshot until the mapping can be improved."
              : usingLiveRegionalFit
                ? "The page is using the dedicated backend availability feed while the current source state settles."
                : "The backend availability fetch is still loading. The generated snapshot remains visible until the live result arrives."
        }
        fallbackSummary="The page stayed on the last successful cache or generated snapshot so the service review could continue."
      />

      {resolvedRegionalFit.notes.length > 0 ? (
        <div className="traceability-grid">
          {resolvedRegionalFit.notes.map((note) => (
            <article className="trace-card" key={note}>
              <strong>Mapping note</strong>
              <p>{note}</p>
            </article>
          ))}
        </div>
      ) : null}

      {scope === "target" && targetRegions.length > 0 ? (
        <div className="filter-card">
          <p className="eyebrow">Project review region filter</p>
          <h3>Showing the regions listed in the active project review.</h3>
          <p className="microcopy">
            Target regions: {targetRegions.join(", ")}
            {missingTargetRegions.length > 0
              ? `. Some target regions were not found in the current availability dataset: ${missingTargetRegions.join(", ")}.`
              : "."}
          </p>
        </div>
      ) : null}

      {resolvedRegionalFit.isGlobalService ? (
        <div className="filter-card">
          <p className="eyebrow">Global service note</p>
          <h3>Microsoft exposes this service as non-regional for at least part of its offering.</h3>
          <p className="microcopy">
            Use this carefully in design reviews. A global service can still have region-dependent
            data residency, backend dependency, or add-on capability differences.
          </p>
          {resolvedRegionalFit.globalSkuStates.length > 0 ? (
            <div className="chip-row">
              {resolvedRegionalFit.globalSkuStates.map((entry) => (
                <span className="chip" key={`${entry.skuName}-${entry.state}`}>
                  {entry.skuName} · {entry.state}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {filteredRegions.length > 0 ? (
        <article className="list-card review-list-card">
          <div className="item-list">
            {filteredRegions.map((region) => (
              <div className="item-row" key={region.regionName}>
                <div>
                  <div className="item-topline">
                    <span className="pill">{region.availabilityState}</span>
                    <span className="pill">{ACCESS_LABELS[region.accessState]}</span>
                    <span className="pill">{region.geographyName}</span>
                  </div>
                  <p className="item-text">{region.regionName}</p>
                  <p className="item-description">
                    {region.skuStates.length > 0
                      ? region.skuStates
                          .map((entry) => `${entry.skuName} (${entry.state})`)
                          .join(", ")
                      : "No SKU breakdown published in the current feed."}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </article>
      ) : (
        <section className="filter-card">
          <p className="eyebrow">No regional rows in view</p>
          <h3>There are no regional availability rows for the current filter.</h3>
          <p className="microcopy">
            This can happen when the service is global or when the active project review target regions do
            not intersect with Microsoft’s current public regional availability rows.
          </p>
        </section>
      )}

      {filteredUnavailable.length > 0 ? (
        <section className="filter-card">
          <p className="eyebrow">Unavailable regions</p>
          <h3>These public regions are not listed for this service in Microsoft’s current feed.</h3>
          <div className="chip-row">
            {filteredUnavailable.map((region) => (
              <span className="chip" key={region.regionName}>
                {region.regionName}
                {region.accessState !== "Open" ? ` · ${ACCESS_LABELS[region.accessState]}` : ""}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
