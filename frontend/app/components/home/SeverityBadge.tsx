/**
 * SeverityBadge — non-colour-only severity indicator (Req 5.4).
 *
 * Renders visible text "Severity: {level}" together with a severity-shaped
 * inline SVG glyph.  Colour is reinforced by the CSS class and the glyph
 * shape so users relying on assistive tech or monochrome displays still
 * receive the signal.
 *
 * Pure presentational component.
 */

export type Severity = "Critical" | "High" | "Medium" | "Low";

export interface SeverityBadgeProps {
  severity: Severity;
  /** Visually hidden prefix for screen readers, defaults to "Severity". */
  labelPrefix?: string;
}

function SeverityGlyph({ severity }: { severity: Severity }) {
  if (severity === "Critical" || severity === "High") {
    return (
      <svg
        className="sev-badge-glyph"
        viewBox="0 0 12 12"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M6 1.2 11 10.4H1Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="0.6"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (severity === "Medium") {
    return (
      <svg
        className="sev-badge-glyph"
        viewBox="0 0 12 12"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="6" cy="6" r="4" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg
      className="sev-badge-glyph"
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="m2 6 2.8 2.8L10 3.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SeverityBadge({
  severity,
  labelPrefix = "Severity",
}: SeverityBadgeProps) {
  const modifier = severity.toLowerCase();
  return (
    <span className={`sev-badge sev-badge--${modifier}`}>
      <SeverityGlyph severity={severity} />
      {labelPrefix}: {severity}
    </span>
  );
}
