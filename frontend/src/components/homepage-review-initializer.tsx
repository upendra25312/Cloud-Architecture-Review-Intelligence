"use client";

import Link from "next/link";

export function HomepageReviewInitializer() {
  return (
    <section className="dashboard-hero" aria-labelledby="dashboard-hero-title">
      <div className="dashboard-hero-copy">
        <p className="dashboard-kicker">Azure review workflows for working architects</p>
        <h1 id="dashboard-hero-title" className="dashboard-hero-title">
          Review Azure designs faster with traceable checks, region fit, pricing context, and exportable review packs.
        </h1>
        <p className="dashboard-hero-summary">
          Rackspace Cloud Architecture Review Intelligence helps teams start a standard review quickly, step up into ARB-grade rigor when needed,
          and leave with outputs that are usable outside the product.
        </p>

        <div className="dashboard-hero-actions">
          <Link href="/review-package" className="primary-button dashboard-hero-button">
            Start a review
          </Link>
          <Link href="/services" className="secondary-button dashboard-hero-button">
            Explore Azure guidance
          </Link>
        </div>

        <div className="dashboard-hero-points" aria-label="Primary value points">
          <span className="dashboard-point-chip">Standard review and ARB-grade review modes</span>
          <span className="dashboard-point-chip">Sample outputs visible before sign-in</span>
          <span className="dashboard-point-chip">Signed-in features only appear when they unlock value</span>
        </div>
      </div>

      <aside className="dashboard-hero-preview surface-panel" aria-label="Review preview">
        <div className="dashboard-hero-preview-head">
          <div>
            <p className="dashboard-preview-kicker">Example review pack</p>
            <h2>What reviewers leave with</h2>
          </div>
          <span className="dashboard-status-badge dashboard-status-badge-good">Ready to share</span>
        </div>

        <div className="dashboard-hero-preview-grid">
          <article className="dashboard-preview-card">
            <span>Review summary</span>
            <strong>12 findings across 5 services</strong>
            <p>Executive summary, action list, and pricing snapshot stay aligned to the same scope.</p>
          </article>
          <article className="dashboard-preview-card">
            <span>Evidence state</span>
            <strong>9 source-backed, 3 need follow-up</strong>
            <p>Each recommendation keeps source lineage and a confidence cue.</p>
          </article>
          <article className="dashboard-preview-card">
            <span>Commercial context</span>
            <strong>Retail baseline with assumptions</strong>
            <p>Region fit, source date, and list-pricing assumptions stay visible in the pack.</p>
          </article>
        </div>
      </aside>
    </section>
  );
}

