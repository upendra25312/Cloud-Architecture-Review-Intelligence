"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type CachedSourceHealth = {
  ok: boolean;
  ttlHours: number;
  lastSuccessfulRefreshAt?: string | null;
  lastRefreshMode?: string | null;
  sourceUrl?: string | null;
  expiresAt?: string | null;
  lastError?: string | null;
  publicRegionCount?: number;
  lastServiceSlug?: string | null;
  lastWarmCount?: number;
};

type HealthPayload = {
  status: string;
  checkedAt: string;
  backendMode: string;
  functionAppName?: string;
  applicationInsightsConfigured: boolean;
  copilotConfigured: boolean;
  copilotModelName?: string | null;
  copilotDeployment?: string | null;
  copilotEndpoint?: string | null;
  storageConfigured: boolean;
  tableStorageConfigured?: boolean;
  refreshSchedule: string;
  manualRefreshEnabled: boolean;
  warmServiceIndexUrl?: string | null;
  warmServiceLimit?: number;
  availability?: CachedSourceHealth;
  pricing?: CachedSourceHealth;
  error?: string;
};

function formatDate(value?: string | null) {
  if (!value) {
    return "Not refreshed yet";
  }

  return new Date(value).toLocaleString("en-US");
}

export function DataHealthView() {
  const [payload, setPayload] = useState<HealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetch("/api/health", {
      cache: "no-store"
    })
      .then(async (response) => {
        const contentType = response.headers.get("content-type") ?? "";
        const isJson = contentType.toLowerCase().includes("application/json");
        const body = isJson ? ((await response.json()) as HealthPayload) : null;

        if (!active) {
          return;
        }

        if (!response.ok) {
          setPayload(body);

          if (body?.error) {
            setError(body.error);
            return;
          }

          setError(
            response.status === 404
              ? "The dedicated backend is not available in this environment yet. Freshness indicators and live status require the deployed API host."
              : `Health check failed with status ${response.status}.`
          );
          return;
        }

        if (!body) {
          setError("The backend returned an unexpected response. Refresh status could not be verified.");
          return;
        }

        setPayload(body);
      })
      .catch((nextError) => {
        if (!active) {
          return;
        }

        setError(nextError instanceof Error ? nextError.message : "Unable to load backend health.");
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="section-stack">
      <section className="review-command-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Trust and status</p>
            <h1 className="review-command-title">See source freshness, service status, and fallback posture.</h1>
            <p className="review-command-summary">
              This page shows whether Azure guidance, availability, and pricing are current enough to
              trust for review work. It stays public-safe by focusing on freshness and degraded mode,
              not internal implementation details.
            </p>
          </div>
          <div className="button-row">
            <Link href="/review-package" className="secondary-button">
              Start a review
            </Link>
            <Link href="/services" className="ghost-button">
              Browse services
            </Link>
          </div>
        </div>

        {payload ? (
          <div className="package-stats-grid">
            <article className="hero-metric-card">
              <span>Product status</span>
              <strong>{payload.status}</strong>
              <p>{payload.backendMode}</p>
            </article>
            <article className="hero-metric-card">
              <span>Availability freshness</span>
              <strong>{formatDate(payload.availability?.lastSuccessfulRefreshAt)}</strong>
              <p>Latest successful source refresh for regional availability.</p>
            </article>
            <article className="hero-metric-card">
              <span>Pricing freshness</span>
              <strong>{formatDate(payload.pricing?.lastSuccessfulRefreshAt)}</strong>
              <p>Latest successful source refresh for pricing context.</p>
            </article>
            <article className="hero-metric-card">
              <span>Fallback posture</span>
              <strong>{payload.pricing?.lastError || payload.availability?.lastError ? "Degraded" : "Normal"}</strong>
              <p>
                {payload.pricing?.lastError || payload.availability?.lastError
                  ? "One or more sources fell back to cache or need review."
                  : "No current source degradation is being reported."}
              </p>
            </article>
            <article className="hero-metric-card">
              <span>Last checked</span>
              <strong>{formatDate(payload.checkedAt)}</strong>
              <p>Latest public status read for the product.</p>
            </article>
          </div>
        ) : (
          <section className="filter-card board-stage-panel">
            <p className="eyebrow">Health check</p>
            <h3>Loading backend health.</h3>
            <p className="microcopy">
              The page is checking the dedicated backend, scheduled refresh state, and cache freshness.
            </p>
          </section>
        )}

        {payload ? (
          <>
            <div className="traceability-grid">
              <article className="trace-card">
                <strong>Availability source state</strong>
                <p>
                  {payload.availability?.ok ? "Ready" : "Waiting"}
                  {payload.availability?.publicRegionCount
                    ? ` · ${payload.availability.publicRegionCount.toLocaleString()} public regions`
                    : ""}
                </p>
              </article>
              <article className="trace-card">
                <strong>Pricing source state</strong>
                <p>
                  {payload.pricing?.ok ? "Ready" : "Warming on demand"}
                  {payload.pricing?.lastWarmCount
                    ? ` · ${payload.pricing.lastWarmCount.toLocaleString()} services warmed`
                    : ""}
                </p>
              </article>
              <article className="trace-card">
                <strong>Source freshness model</strong>
                <p>Live refresh, scheduled cache, and fallback cache are all surfaced explicitly.</p>
              </article>
              <article className="trace-card">
                <strong>Pricing assumptions</strong>
                <p>Retail pricing remains a baseline, not a negotiated estimate.</p>
              </article>
              <article className="trace-card">
                <strong>Public-safe posture</strong>
                <p>Internal service names and admin-only implementation details stay off this page.</p>
              </article>
              <article className="trace-card">
                <strong>Review readiness</strong>
                <p>{payload.availability?.ok && payload.pricing?.ok ? "Ready for product use" : "Use with caution until sources recover"}</p>
              </article>
            </div>

            <div className="traceability-grid">
              <article className="trace-card">
                <strong>Availability refreshed</strong>
                <p>{formatDate(payload.availability?.lastSuccessfulRefreshAt)}</p>
              </article>
              <article className="trace-card">
                <strong>Pricing refreshed</strong>
                <p>{formatDate(payload.pricing?.lastSuccessfulRefreshAt)}</p>
              </article>
              <article className="trace-card">
                <strong>Service status</strong>
                <p>{payload.availability?.ok && payload.pricing?.ok ? "Healthy" : "Degraded or partial"}</p>
              </article>
              <article className="trace-card">
                <strong>Fallback mode</strong>
                <p>{payload.pricing?.lastError || payload.availability?.lastError ? "Active for at least one source" : "Not active"}</p>
              </article>
            </div>

            <div className="traceability-grid">
              <article className="trace-card">
                <strong>Availability source</strong>
                <p>
                  {payload.availability?.sourceUrl ? (
                    <a
                      href={payload.availability.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="muted-link"
                    >
                      Microsoft availability feed
                    </a>
                  ) : (
                    "Not refreshed yet"
                  )}
                </p>
              </article>
              <article className="trace-card">
                <strong>Pricing source</strong>
                <p>
                  {payload.pricing?.sourceUrl ? (
                    <a
                      href={payload.pricing.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="muted-link"
                    >
                      Azure Retail Prices API
                    </a>
                  ) : (
                    "Not refreshed yet"
                  )}
                </p>
              </article>
              <article className="trace-card">
                <strong>Refresh cadence</strong>
                <p>{payload.refreshSchedule}</p>
              </article>
            </div>
          </>
        ) : null}

        {payload?.availability?.lastError ? (
          <section className="filter-card board-stage-panel">
            <p className="eyebrow">Availability warning</p>
            <h3>The last availability refresh reported an issue.</h3>
            <p className="microcopy">{payload.availability.lastError}</p>
          </section>
        ) : null}

        {payload?.pricing?.lastError ? (
          <section className="filter-card board-stage-panel">
            <p className="eyebrow">Pricing warning</p>
            <h3>The last pricing refresh reported an issue.</h3>
            <p className="microcopy">{payload.pricing.lastError}</p>
          </section>
        ) : null}

        {error ? (
          <section className="filter-card board-stage-panel">
            <p className="eyebrow">Health check</p>
            <h3>The backend health check is degraded.</h3>
            <p className="microcopy">{error}</p>
          </section>
        ) : null}
      </section>
    </main>
  );
}
