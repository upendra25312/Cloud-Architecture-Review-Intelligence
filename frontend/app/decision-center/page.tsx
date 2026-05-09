import Link from "next/link";
import { ArbReviewLibrary } from "@/components/arb/review-library";

export default function DecisionCenterPage() {
  return (
    <main className="arb-page-stack">
      <section className="review-command-panel">
        <div className="review-command-copy">
          <p className="header-badge">Decision Center</p>
          <h1 className="review-command-title">Review score, conditions, and final sign-off in one place.</h1>
          <p className="review-command-summary">
            Review scores, open conditions, and record the final decision for each architecture review.
          </p>
        </div>

        <div className="review-command-metrics">
          <article className="review-command-metric">
            <span>Decision states</span>
            <strong>Approved / Needs Revision / Rejected</strong>
            <p>Make the final outcome explicit instead of leaving sign-off implied.</p>
          </article>
          <article className="review-command-metric">
            <span>Derived recommendation</span>
            <strong>Keep assessment guidance visible</strong>
            <p>The weighted recommendation stays visible, but the recorded reviewer decision takes precedence.</p>
          </article>
          <article className="review-command-metric">
            <span>Checkpoint metadata</span>
            <strong>Reviewer, role, timestamp</strong>
            <p>Every sign-off needs a named human owner, role context, and a visible recorded checkpoint.</p>
          </article>
          <article className="review-command-metric">
            <span>Conditions</span>
            <strong>Open actions stay visible</strong>
            <p>Blocked actions, evidence gaps, and reviewer verification remain visible before approval.</p>
          </article>
        </div>

        <div className="review-command-band">
          <div className="review-command-band-actions">
            <Link href="/arb" className="primary-link review-command-button">
              Back to architecture review
            </Link>
            <Link href="/services" className="secondary-button review-command-secondary">
              Open services explorer
            </Link>
          </div>
        </div>
      </section>

      <ArbReviewLibrary focus="decision" />
    </main>
  );
}
