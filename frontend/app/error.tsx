"use client";

export default function GlobalError({
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
          <p className="eyebrow">Something went wrong</p>
          <h1 className="review-command-title">
            This page ran into an unexpected error.
          </h1>
          <p className="review-command-summary">
            The issue has been logged. You can try again or return to the home page.
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
            <a href="/" className="home-init-button review-command-button" style={{ marginLeft: 12 }}>
              Return to home
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
