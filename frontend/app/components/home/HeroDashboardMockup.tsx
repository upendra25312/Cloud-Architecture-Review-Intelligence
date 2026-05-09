/**
 * HeroDashboardMockup — inline composite cockpit visual for the hero panel.
 *
 * Pure presentational component composed entirely from HTML + CSS + inline SVG.
 * No raster images, no external image CDNs (Req 1.9, 15.1, 15.2).
 *
 * Accessibility: the outer wrapper carries role="img" with a single-sentence
 * aria-label summarising the composite (Req 1.8). Inner tiles use native text,
 * so the wrapper's label is the only assistive-tech entry point.
 */

export interface HeroDashboardMockupProps {
  /** Optional overall score (0–100). Defaults to 78 for the sample data. */
  overallScore?: number;
  /** Counts for the severity strip; defaults mirror the design sample. */
  findings?: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

const DEFAULT_FINDINGS = {
  critical: 2,
  high: 4,
  medium: 7,
  low: 3,
} as const;

const WAF_PILLAR_LABELS = [
  "Reliability",
  "Security",
  "Cost Optimization",
  "Operational Excellence",
  "Performance Efficiency",
] as const;

const ARIA_LABEL =
  "Sample Review Cockpit showing review score 78 out of 100, four findings by severity, CAF alignment, WAF pillar coverage, reviewer decision status, export readiness, and evidence confidence.";

export default function HeroDashboardMockup({
  overallScore = 78,
  findings = DEFAULT_FINDINGS,
}: HeroDashboardMockupProps) {
  const clamped = Math.max(0, Math.min(100, overallScore));
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const progress = (clamped / 100) * circumference;

  return (
    <div
      className="review-hero-mockup"
      role="img"
      aria-label={ARIA_LABEL}
      data-home-section="hero-mockup"
    >
      <div className="review-hero-mockup-score">
        <svg
          width="64"
          height="64"
          viewBox="0 0 64 64"
          aria-hidden="true"
          focusable="false"
        >
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="6"
          />
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke="#22d3ee"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${progress} ${circumference}`}
            transform="rotate(-90 32 32)"
          />
          <text
            x="32"
            y="36"
            textAnchor="middle"
            fontSize="14"
            fontWeight="800"
            fill="#f8fafc"
          >
            {clamped}
          </text>
        </svg>
        <span className="review-hero-mockup-score-label">
          <strong>{clamped}/100</strong>
          <small>Overall review score</small>
        </span>
      </div>

      <span className="review-hero-mockup-caf">CAF aligned</span>

      <div className="review-hero-mockup-severity">
        <div className="review-hero-mockup-severity-tile review-hero-mockup-severity-tile--critical">
          <span>Critical</span>
          <strong>{findings.critical}</strong>
        </div>
        <div className="review-hero-mockup-severity-tile review-hero-mockup-severity-tile--high">
          <span>High</span>
          <strong>{findings.high}</strong>
        </div>
        <div className="review-hero-mockup-severity-tile review-hero-mockup-severity-tile--medium">
          <span>Medium</span>
          <strong>{findings.medium}</strong>
        </div>
        <div className="review-hero-mockup-severity-tile review-hero-mockup-severity-tile--low">
          <span>Low</span>
          <strong>{findings.low}</strong>
        </div>
      </div>

      <div className="review-hero-mockup-pillars">
        {WAF_PILLAR_LABELS.map((label) => (
          <div key={label} className="review-hero-mockup-pillar-tile">
            {label}
          </div>
        ))}
      </div>

      <div className="review-hero-mockup-status">
        <small>Reviewer decision</small>
        <strong>Pending reviewer sign-off</strong>
      </div>

      <div className="review-hero-mockup-status">
        <small>Export readiness</small>
        <strong>Ready for export</strong>
      </div>

      <div className="review-hero-mockup-status" style={{ gridColumn: "1 / span 2" }}>
        <small>Evidence confidence</small>
        <strong>Evidence confidence: Medium</strong>
      </div>
    </div>
  );
}
