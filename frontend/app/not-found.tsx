import Link from "next/link";

export default function NotFound() {
  return (
    <main className="empty-state-page">
      <section className="review-command-panel" style={{ width: "min(100%, 720px)" }}>
        <div className="review-command-copy">
          <p className="eyebrow">Not found</p>
          <h1 className="review-command-title">The requested checklist view is not available.</h1>
          <p className="review-command-summary">
            This page may have been moved or is no longer available.
          </p>
        </div>
        <div className="review-command-band">
          <div className="review-command-band-actions">
            <Link href="/" className="home-init-button review-command-button">
              Return to home
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
