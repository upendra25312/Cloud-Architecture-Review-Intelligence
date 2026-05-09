/**
 * HeroDashboardMockup — executive-grade review cockpit visual for the hero panel.
 *
 * Pure presentational component composed entirely from HTML + CSS + inline SVG.
 * No raster images, no external image CDNs (Req 1.9, 15.1, 15.2).
 */

export interface HeroDashboardMockupProps {
  overallScore?: number;
  findings?: { critical: number; high: number; medium: number; low: number };
}

const DEFAULT_FINDINGS = { critical: 2, high: 4, medium: 7, low: 3 } as const;

const WAF_PILLARS = [
  "Reliability",
  "Security",
  "Cost Optimization",
  "Operational Excellence",
  "Performance Efficiency",
] as const;

const ARIA_LABEL =
  "Sample Architecture Review Cockpit: score 78 out of 100, 16 findings across four severity levels, all five WAF pillars covered, board pack ready for export.";

export default function HeroDashboardMockup({
  overallScore = 78,
  findings = DEFAULT_FINDINGS,
}: HeroDashboardMockupProps) {
  const clamped = Math.max(0, Math.min(100, overallScore));
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const progress = (clamped / 100) * circumference;
  const total = findings.critical + findings.high + findings.medium + findings.low;

  return (
    <div
      className="review-hero-mockup"
      role="img"
      aria-label={ARIA_LABEL}
      data-home-section="hero-mockup"
    >
      {/* ── Header ── */}
      <div className="rhm-header">
        <span className="rhm-header-title">Architecture Review</span>
        <span className="rhm-badge-live">In Review</span>
      </div>

      {/* ── Score + Findings row ── */}
      <div className="rhm-top-row">
        <div className="rhm-score-tile">
          <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true" focusable="false">
            <circle cx="48" cy="48" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="8" />
            <circle
              cx="48" cy="48" r={radius} fill="none"
              stroke="#C8102E" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${progress} ${circumference}`}
              transform="rotate(-90 48 48)"
            />
            <text x="48" y="54" textAnchor="middle" fontSize="22" fontWeight="800" fill="#0f172a">
              {clamped}
            </text>
          </svg>
          <div className="rhm-score-body">
            <span className="rhm-score-number">{clamped}<span className="rhm-score-denom">/100</span></span>
            <span className="rhm-score-label">Review Score</span>
            <div className="rhm-score-bar-track">
              <div className="rhm-score-bar-fill" style={{ width: `${clamped}%` }} />
            </div>
          </div>
        </div>

        <div className="rhm-findings-tile">
          <span className="rhm-findings-total">{total}</span>
          <span className="rhm-findings-label">Findings</span>
          <div className="rhm-findings-grid">
            <div className="rhm-sev rhm-sev--critical"><span>{findings.critical}</span><small>Critical</small></div>
            <div className="rhm-sev rhm-sev--high"><span>{findings.high}</span><small>High</small></div>
            <div className="rhm-sev rhm-sev--medium"><span>{findings.medium}</span><small>Medium</small></div>
            <div className="rhm-sev rhm-sev--low"><span>{findings.low}</span><small>Low</small></div>
          </div>
        </div>
      </div>

      {/* ── WAF Coverage ── */}
      <div className="rhm-pillars-section">
        <span className="rhm-section-label">WAF Coverage</span>
        <div className="rhm-pillars-grid">
          {WAF_PILLARS.map((pillar) => (
            <div key={pillar} className="rhm-pillar">
              <span className="rhm-pillar-check" aria-hidden="true">✓</span>
              {pillar}
            </div>
          ))}
        </div>
      </div>

      {/* ── Decision + Export row ── */}
      <div className="rhm-bottom-row">
        <div className="rhm-status-tile">
          <span className="rhm-status-value">5 / 5</span>
          <span className="rhm-status-label">Pillars reviewed</span>
        </div>
        <div className="rhm-status-tile rhm-status-tile--green">
          <span className="rhm-status-value">Board-ready</span>
          <span className="rhm-status-label">Export pack</span>
        </div>
      </div>
    </div>
  );
}
