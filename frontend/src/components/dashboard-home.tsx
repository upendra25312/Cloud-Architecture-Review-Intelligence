import type { Route } from "next";
import Link from "next/link";
import { HomepageServiceBrowser } from "@/components/homepage-service-browser";
import { HomepageReviewInitializer } from "@/components/homepage-review-initializer";
import { Sparkline } from "@/components/sparkline";
import { SeverityBadge } from "@/components/severity-badge";
import type { HomepagePricingSnapshot } from "@/lib/homepage-pricing";
import type { CatalogSummary, ChecklistItem, ServiceIndex, ServiceSummary } from "@/types";

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function getFindingHref(item: ChecklistItem): Route {
  if (item.serviceSlug) return `/services/${item.serviceSlug}` as Route;
  if (item.technologySlug) return `/technologies/${item.technologySlug}` as Route;
  return "/review-package";
}

/* Derive a fake-but-plausible upward trend ending at `current` */
function makeTrend(current: number, points = 10): number[] {
  return Array.from({ length: points }, (_, i) =>
    Math.round(current * (0.72 + (i / (points - 1)) * 0.28))
  );
}

export function DashboardHome({
  summary,
  serviceIndex,
  featuredServices,
  pricingSnapshot,
  featuredFindings,
}: {
  summary: CatalogSummary;
  serviceIndex: ServiceIndex;
  featuredServices: ServiceSummary[];
  pricingSnapshot: HomepagePricingSnapshot;
  featuredFindings: ChecklistItem[];
}) {
  const generatedDate = new Date(summary.generatedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const pricingGeneratedDate = new Date(pricingSnapshot.generatedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const servicesTrend = makeTrend(serviceIndex.services.length);
  const findingsTrend = makeTrend(summary.itemCount);

  const previewFindings = featuredFindings.slice(0, 4);
  const samplePricingRow = pricingSnapshot.rows[0];

  const featureCards = [
    {
      icon: "⬡",
      title: "Traceable findings",
      copy: "Every finding stays tied to source guidance so reviewers can verify why it matters.",
    },
    {
      icon: "⊙",
      title: "Region & pricing context",
      copy: "Retail pricing snapshots and region fit surface inside the review — not in a separate tab.",
    },
    {
      icon: "↗",
      title: "Exportable outputs",
      copy: "Executive summary, action list, pricing snapshot, and ARB-ready pack — all visible before commitment.",
    },
  ];

  const arbSteps = [
    { n: "01", label: "Upload design docs" },
    { n: "02", label: "Engine extracts findings" },
    { n: "03", label: "Weighted scorecard" },
    { n: "04", label: "Human sign-off" },
  ];

  const workflowSteps = [
    {
      title: "Start the review",
      copy: "Choose a standard review for fast scoping or step into ARB-grade rigor when the design needs stronger evidence.",
    },
    {
      title: "Confirm scope, regions, findings",
      copy: "Scope services, review pricing and region fit, and confirm findings in one guided workspace.",
    },
    {
      title: "Export the pack",
      copy: "Share an executive summary, action list, pricing snapshot, or ARB-ready pack without rebuilding context later.",
    },
  ];

  return (
    <main className="dashboard-main">
      <HomepageReviewInitializer />

      {/* ── BENTO HERO ──────────────────────────────────────── */}
      <section className="bento-hero" aria-label="Product hero">

        {/* Cell 1 — headline */}
        <article className="bento-cell bento-cell--headline">
          <p className="bento-kicker">Azure architects &amp; review boards</p>
          <h1 className="bento-headline">
            Architecture reviews that{" "}
            <em>ship,</em> not stall.
          </h1>
          <p className="bento-sub">
            Scope services, confirm findings with evidence, and export a review pack
            without rebuilding context mid-review.
          </p>
          <div className="bento-actions">
            <Link href="/review-package" className="primary-button">
              Start a review
            </Link>
            <Link href="/services" className="ghost-button">
              Explore services
            </Link>
          </div>
          <div className="bento-stat-chips">
            <span className="bento-chip">{serviceIndex.services.length}+ services</span>
            <span className="bento-chip">{summary.itemCount.toLocaleString()} findings</span>
            <span className="bento-chip">Pricing &middot; {pricingGeneratedDate}</span>
          </div>
        </article>

        {/* Cell 2 — live preview panel */}
        <article className="bento-cell bento-cell--preview" aria-label="Sample findings preview">
          <div className="bento-preview-head">
            <strong>Sample findings</strong>
            <span className="bento-preview-badge">WAF-aligned</span>
          </div>
          {previewFindings.length > 0 ? (
            <div className="bento-preview-list">
              {previewFindings.map((f) => (
                <Link
                  key={`${f.guid}_${f.technologySlug}`}
                  href={getFindingHref(f)}
                  className="bento-preview-row"
                >
                  <SeverityBadge severity={f.severity} compact />
                  <span className="bento-preview-text">{truncateText(f.text, 72)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="bento-preview-list">
              <div className="bento-preview-row">
                <SeverityBadge severity="High" compact />
                <span className="bento-preview-text">Enable zone-redundant replicas for your primary database.</span>
              </div>
              <div className="bento-preview-row">
                <SeverityBadge severity="Medium" compact />
                <span className="bento-preview-text">Configure retry policies on all outbound HTTP calls.</span>
              </div>
              <div className="bento-preview-row">
                <SeverityBadge severity="Low" compact />
                <span className="bento-preview-text">Enable soft-delete on storage accounts to recover accidental deletes.</span>
              </div>
            </div>
          )}
          {samplePricingRow && (
            <div className="bento-preview-pricing">
              <span className="bento-preview-pricing-label">Pricing</span>
              <span>
                {samplePricingRow.serviceName}{" "}
                from{" "}
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: samplePricingRow.currencyCode,
                  maximumFractionDigits: 4,
                }).format(samplePricingRow.retailPrice)}
                {" "}/ {samplePricingRow.unitOfMeasure || "unit"}
              </span>
            </div>
          )}
          <Link href="/review-package" className="bento-preview-cta muted-link">
            Open full workspace →
          </Link>
        </article>

        {/* Cell 3 — services stat */}
        <article className="bento-cell bento-cell--stat">
          <Sparkline values={servicesTrend} label="Services growth trend" />
          <strong className="bento-stat-value">{serviceIndex.services.length}</strong>
          <span className="bento-stat-label">Azure services</span>
        </article>

        {/* Cell 4 — findings stat */}
        <article className="bento-cell bento-cell--stat">
          <Sparkline values={findingsTrend} color="var(--high)" label="Findings growth trend" />
          <strong className="bento-stat-value">{summary.itemCount.toLocaleString()}</strong>
          <span className="bento-stat-label">WAF-aligned findings</span>
        </article>

        {/* Cell 5 — ARB stat */}
        <article className="bento-cell bento-cell--stat bento-cell--stat-arb">
          <span className="bento-stat-label">Formal review mode</span>
          <strong className="bento-stat-value bento-stat-value--accent">ARB</strong>
          <Link href="/arb" className="bento-stat-link">
            Open ARB workspace →
          </Link>
        </article>

      </section>

      {/* ── FEATURE GRID ────────────────────────────────────── */}
      <section className="feature-grid-section" aria-label="Product features">
        {featureCards.map((card) => (
          <article className="feature-card surface-panel" key={card.title}>
            <span className="feature-card-icon" aria-hidden="true">{card.icon}</span>
            <strong className="feature-card-title">{card.title}</strong>
            <p className="feature-card-copy">{card.copy}</p>
          </article>
        ))}

        {/* Wide ARB teaser */}
        <article className="feature-card feature-card--wide surface-panel arb-teaser">
          <div className="arb-teaser-copy">
            <p className="dashboard-kicker">Advanced review mode</p>
            <h2 className="arb-teaser-title">ARB-grade review</h2>
            <p className="arb-teaser-sub">
              Evidence-first intake, weighted scorecard, and human sign-off in one reviewer-owned queue.
            </p>
            <Link href="/arb" className="primary-button">
              Open ARB workspace
            </Link>
          </div>
          <div className="arb-flow-steps">
            {arbSteps.map((step) => (
              <div className="arb-flow-step" key={step.n}>
                <span className="arb-flow-n">{step.n}</span>
                <span className="arb-flow-label">{step.label}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────── */}
      <section className="dashboard-how-section" aria-label="How it works">
        <div className="dashboard-section-head">
          <div>
            <p className="dashboard-kicker">How it works</p>
            <h2 className="dashboard-section-title">Three steps. One guided review flow.</h2>
          </div>
        </div>
        <div className="dashboard-how-grid">
          {workflowSteps.map((step, index) => (
            <article className="dashboard-how-card surface-panel" key={step.title}>
              <span className="dashboard-step-index">0{index + 1}</span>
              <strong>{step.title}</strong>
              <p>{step.copy}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── DUAL GRID: Services + Trust ─────────────────────── */}
      <section className="dashboard-dual-grid">
        <article className="surface-panel dashboard-guidance-panel">
          <div className="dashboard-section-head">
            <div>
              <p className="dashboard-kicker">Explore Azure guidance</p>
              <h2 className="dashboard-section-title">Useful before a review starts.</h2>
              <p className="dashboard-section-copy">
                Browse services, compare relevance, and open guidance without creating a review first.
              </p>
            </div>
            <Link href="/services" className="ghost-button">Open services</Link>
          </div>
          <HomepageServiceBrowser services={serviceIndex.services} featuredServices={featuredServices} />
        </article>

        <article className="surface-panel dashboard-trust-panel">
          <div className="dashboard-section-head">
            <div>
              <p className="dashboard-kicker">Trust and status</p>
              <h2 className="dashboard-section-title">Public-safe trust signals.</h2>
              <p className="dashboard-section-copy">
                Signed-out users still see freshness state, source context, and what sign-in unlocks.
              </p>
            </div>
            <Link href="/data-health" className="ghost-button">View status page</Link>
          </div>
          <div className="dashboard-trust-grid">
            <article className="dashboard-trust-card">
              <span>Catalog freshness</span>
              <strong>{generatedDate}</strong>
              <p>Latest mapped source refresh visible without exposing backend internals.</p>
            </article>
            <article className="dashboard-trust-card">
              <span>Pricing refresh</span>
              <strong>{pricingGeneratedDate}</strong>
              <p>Retail pricing snapshots show source dates and assumptions in plain language.</p>
            </article>
            <article className="dashboard-trust-card">
              <span>Sign-in unlocks</span>
              <strong>Saved reviews &amp; ARB rigor</strong>
              <p>Public pages stay useful even before a user signs in.</p>
            </article>
          </div>
        </article>
      </section>

      {/* ── FINAL CTA ───────────────────────────────────────── */}
      <section className="dashboard-final-cta surface-panel">
        <div>
          <p className="dashboard-kicker">Next action</p>
          <h2 className="dashboard-section-title">
            Start with a standard review, then step up when the design needs more rigor.
          </h2>
          <p className="dashboard-section-copy">
            Standard reviews keep teams moving. ARB-grade review mode adds document upload,
            stronger evidence handling, and decision-ready outputs inside the same product.
          </p>
        </div>
        <div className="button-row">
          <Link href="/review-package" className="primary-button">Open review workspace</Link>
          <Link href="/my-project-reviews" className="secondary-button">Open reviews dashboard</Link>
        </div>
      </section>
    </main>
  );
}
