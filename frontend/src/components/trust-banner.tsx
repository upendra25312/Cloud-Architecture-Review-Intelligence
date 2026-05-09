import Link from "next/link";

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="trust-check-icon">
      <circle cx="7" cy="7" r="6.5" stroke="currentColor" strokeOpacity="0.25" />
      <path d="M4 7l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TrustBanner() {
  return (
    <section className="trust-banner" aria-label="Trust guidance">
      <div className="trust-banner-inner">
        <div className="trust-banner-heading">
          <span className="trust-banner-kicker">Trust guidance</span>
          <p className="trust-banner-headline">
            Traceable evidence, current source dates, and human review stay visible.
          </p>
          <Link href="/how-to-use" className="trust-banner-link muted-link">
            Read product guidance →
          </Link>
        </div>

        <ul className="trust-checklist" role="list">
          <li className="trust-checklist-item">
            <CheckIcon />
            <span>
              <strong>Traceable guidance</strong> — findings stay connected to source so reviewers
              can verify why they matter.
            </span>
          </li>
          <li className="trust-checklist-item">
            <CheckIcon />
            <span>
              <strong>Public-safe freshness</strong> — services, pricing, and trust pages show
              data state without exposing internal details.
            </span>
          </li>
          <li className="trust-checklist-item">
            <CheckIcon />
            <span>
              <strong>Review posture</strong> — standard reviews move quickly; ARB-grade adds
              stronger evidence, checkpoints, and sign-off discipline.
            </span>
          </li>
          <li className="trust-checklist-item">
            <CheckIcon />
            <span>
              <strong>Output boundary</strong> — the product prepares review packs and action lists.
              It does not replace accountable sign-off.
            </span>
          </li>
        </ul>

        <div className="trust-banner-pills">
          <span className="data-source-status-pill data-source-status-pill-live">Live refresh</span>
          <span className="data-source-status-pill data-source-status-pill-cache">Scheduled cache</span>
          <span className="data-source-status-pill data-source-status-pill-fallback">Fallback cache</span>
        </div>
      </div>
    </section>
  );
}
