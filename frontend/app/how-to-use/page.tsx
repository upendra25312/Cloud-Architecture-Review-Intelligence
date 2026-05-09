import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How to Use",
  description:
    "Use the review board to prepare architecture discussions, not to issue approval or replace accountable sign-off."
};

export default function HowToUsePage() {
  return (
    <main className="section-stack">
      <section className="review-command-panel">
        <div className="detail-command-grid">
          <div className="detail-command-copy">
            <div>
              <p className="eyebrow">Docs</p>
              <h1 className="review-command-title">Understand the product, the workflows, and the outputs without reading internal product language.</h1>
              <p className="review-command-summary">
                Rackspace Cloud Architecture Review Intelligence helps teams start a review, inspect Azure guidance, work from
                findings and evidence, and export a usable review pack. These docs explain what the
                product is for, what sign-in unlocks, and how to read the outputs.
              </p>
            </div>
            <div className="button-row">
              <Link href="/" className="primary-button">
                Back to home
              </Link>
              <Link href="/arb" className="secondary-button">
                Start a review
              </Link>
            </div>
          </div>

          <section className="leadership-brief detail-command-sidecar">
            <p className="eyebrow">Product guide</p>
            <h2 className="leadership-title">Intent first, workflow second.</h2>
            <p>
              Start with the task you need to finish: begin a review, explore services, or inspect trust
              signals. The system model only appears after that choice is clear.
            </p>
          </section>
        </div>
      </section>

      <section className="surface-panel board-stage-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Core workflows</p>
            <h2 className="section-title">Choose the right path quickly.</h2>
            <p className="section-copy">
              Most teams need one of three things: start a review, step up to ARB-grade rigor, or
              explore Azure guidance before they decide what belongs in scope.
            </p>
          </div>
        </div>
        <div className="how-timeline">
          <article className="how-timeline-step future-card">
            <div className="how-timeline-number">01</div>
            <h3>Start a review</h3>
            <p>
              Use the main review workspace when you need a scoped service list, findings, pricing,
              evidence, and exportable outputs in one guided flow.
            </p>
          </article>
          <article className="how-timeline-step future-card">
            <div className="how-timeline-number">02</div>
            <h3>ARB-grade review</h3>
            <p>
              Use the advanced ARB path when the review needs uploaded source material, stricter
              evidence handling, and decision-oriented sign-off steps.
            </p>
          </article>
          <article className="how-timeline-step future-card">
            <div className="how-timeline-number">03</div>
            <h3>Explore services</h3>
            <p>
              Browse services and guidance without creating a review first. This is useful during
              discovery, presales, and early architecture conversations.
            </p>
          </article>
          <article className="how-timeline-step future-card">
            <div className="how-timeline-number">04</div>
            <h3>Export outputs</h3>
            <p>
              Review packs, action lists, executive summaries, and pricing snapshots should be visible
              early so users understand what success looks like.
            </p>
          </article>
        </div>
      </section>

      <section className="surface-panel board-stage-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Reading the outputs</p>
            <h2 className="section-title">Interpret findings, evidence, and pricing together.</h2>
          </div>
        </div>
        <div className="future-grid">
          <article className="future-card">
            <h3>Findings</h3>
            <p>
              Findings are useful only when they stay tied to the right service, a clear rationale,
              and the original guidance source.
            </p>
          </article>
          <article className="future-card">
            <h3>Evidence</h3>
            <p>
              Evidence should tell reviewers how confident the product is, what source supports the
              conclusion, and what still needs human follow-up.
            </p>
          </article>
          <article className="future-card">
            <h3>Pricing</h3>
            <p>
              Pricing views use Microsoft retail data as a baseline. Region context, refresh date,
              and assumptions should stay visible so the comparison remains credible.
            </p>
          </article>
        </div>
      </section>

      <section className="surface-panel board-stage-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Trust and boundaries</p>
            <h2 className="section-title">Be explicit about what the product helps with and what stays human-owned.</h2>
          </div>
        </div>
        <div className="bar-list">
          <article className="trace-card">
            <strong>What this is</strong>
            <p>
              An internal review intelligence product for Azure architects that helps structure scope, findings,
              evidence, pricing context, and exports.
            </p>
          </article>
          <article className="trace-card">
            <strong>What this is not</strong>
            <p>
              Not an approval system, not a compliance certification tool, and not a replacement
              for architecture sign-off.
            </p>
          </article>
          <article className="trace-card">
            <strong>What sign-in unlocks</strong>
            <p>
              Saved reviews, Azure-backed continuity, and ARB-grade review steps. Public pages still
              remain useful without sign-in.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
