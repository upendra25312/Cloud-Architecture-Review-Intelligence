"use client";

import Link from "next/link";

export default function ArbReviewError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="empty-state-page">
      <section className="review-command-panel" style={{ width: "min(100%, 720px)" }}>
        <div className="review-command-copy">
          <p className="eyebrow">Review error</p>
          <h1 className="review-command-title">
            Unable to load this review step.
          </h1>
          <p className="review-command-summary">
            The review data may be temporarily unavailable. Try again or go back to the review queue.
          </p>
        </div>
        <div className="review-command-band">
          <div className="review-command-band-actions">
            <button
              type="button"
              className="home-init-button review-command-button"
              onClick={() => reset()}
            >
              Try again
            </button>
            <Link href="/arb" className="secondary-button">
              Back to reviews
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
