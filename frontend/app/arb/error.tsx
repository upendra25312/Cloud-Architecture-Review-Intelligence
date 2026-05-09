"use client";

export default function ArbError({
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
            The review workspace ran into an issue.
          </h1>
          <p className="review-command-summary">
            This may be a temporary problem with the review data or backend services.
            Try again, or go back to the review queue.
          </p>
        </div>
        <div className="review-command-band">
          <div className="review-command-band-actions">
            <button
              type="button"
              className="home-init-button review-command-button"
              onClick={reset}
            >
              Try again
            </button>
            <a href="/arb" className="home-init-button review-command-button" style={{ marginLeft: 12 }}>
              Back to reviews
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
