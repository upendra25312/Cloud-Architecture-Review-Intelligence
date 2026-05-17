/**
 * TimeSavingsVisual - "Before vs After" time savings infographic.
 * Rackspace brand-aligned: red accent stats, Azure blue for "with CARI" side.
 * Pure presentational, inline SVG, no raster images.
 */

const CHECK = (
  <svg viewBox="0 0 16 16" fill="none" width="14" height="14" aria-hidden="true">
    <circle cx="8" cy="8" r="7" fill="#dbeafe" stroke="#0078D4" strokeWidth="1.5"/>
    <path d="M5 8l2 2 4-4" stroke="#0078D4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const CLOCK = (
  <svg viewBox="0 0 16 16" fill="none" width="14" height="14" aria-hidden="true">
    <circle cx="8" cy="8" r="7" stroke="#94a3b8" strokeWidth="1.5"/>
    <path d="M8 5v3.5l2 1.5" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export default function TimeSavingsVisual() {
  return (
    <section
      className="review-section review-time-savings-section"
      aria-labelledby="time-savings-title"
      data-home-section="time-savings"
    >
      <div className="review-section-head">
        <p className="review-eyebrow">Time to value</p>
        <h2 id="time-savings-title">Architecture review packs used to take half a day. CARI gets them to minutes.</h2>
        <p>Teams move from scattered evidence and manual write-ups to a framework-aligned review package in a single working session.</p>
      </div>

      <div className="review-time-savings-grid">
        {/* ── Before card ── */}
        <div className="review-ts-card review-ts-card--before">
          <div className="review-ts-card-badge">Traditional ARB Review</div>
          <div className="review-ts-stat review-ts-stat--before">4–12 hrs</div>
          <ul className="review-ts-steps">
            <li>{CLOCK} Manual evidence gathering from email and shared drives</li>
            <li>{CLOCK} Cross-reference WAF, CAF, ALZ documents manually</li>
            <li>{CLOCK} Write findings report from scratch in Word or PowerPoint</li>
            <li>{CLOCK} Chase reviewers for sign-off across days of emails</li>
            <li>{CLOCK} No traceability — decisions buried in threads</li>
          </ul>
        </div>

        {/* ── Arrow ── */}
        <div className="review-ts-arrow" aria-hidden="true">
          <svg viewBox="0 0 60 60" fill="none" width="56" height="56">
            <circle cx="30" cy="30" r="29" fill="var(--surf-0)" stroke="var(--border)" strokeWidth="1.5"/>
            <path d="M16 30H44M35 21L44 30L35 39" stroke="var(--rxt-red)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="review-ts-arrow-label">CARI</span>
        </div>

        {/* ── After card ── */}
        <div className="review-ts-card review-ts-card--after">
          <div className="review-ts-card-badge review-ts-card-badge--after">With CARI</div>
          <div className="review-ts-stat review-ts-stat--after">10-20 min</div>
          <ul className="review-ts-steps review-ts-steps--after">
            <li>{CHECK} Drag-and-drop upload — PDF, Word, PPT, IaC, diagrams</li>
            <li>{CHECK} Automated review against WAF, CAF, ALZ, and 16 deterministic rules</li>
            <li>{CHECK} Scored findings with Microsoft Learn reference links</li>
            <li>{CHECK} One-click reviewer sign-off with immutable audit trail</li>
            <li>{CHECK} Board-ready PDF — decision, findings, and assumption log</li>
          </ul>
        </div>
      </div>

      {/* ── Stat strip ── */}
      <div className="review-ts-stat-strip">
        <div className="review-ts-stat-chip">
          <span className="review-ts-stat-chip-value">3</span>
          <span className="review-ts-stat-chip-label">Access roles</span>
        </div>
        <div className="review-ts-stat-chip">
          <span className="review-ts-stat-chip-value">16</span>
          <span className="review-ts-stat-chip-label">Deterministic rules</span>
        </div>
        <div className="review-ts-stat-chip">
          <span className="review-ts-stat-chip-value">5</span>
          <span className="review-ts-stat-chip-label">WAF pillars scored</span>
        </div>
        <div className="review-ts-stat-chip">
          <span className="review-ts-stat-chip-value">~$0.013</span>
          <span className="review-ts-stat-chip-label">Cost per review</span>
        </div>
      </div>
    </section>
  );
}
