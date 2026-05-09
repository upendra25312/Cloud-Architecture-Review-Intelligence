/**
 * ReportPackPreview — "From Technical Findings to Board-Ready Decisions"
 * (Req 9).
 *
 * Document-style visual composed from HTML + inline SVG.  No raster
 * screenshot (Req 9.4).  The visible copy avoids any implication that
 * exports are automatically approved or certified (Req 9.5, 12.4,
 * Property P9).
 *
 * Pure presentational component.
 */

import { HOME_COPY } from "./home-copy";

function PaperFoldIcon() {
  return (
    <svg
      viewBox="0 0 48 48"
      width="48"
      height="48"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 4h18l10 10v30H12z" />
      <path d="M30 4v10h10" />
      <path d="M18 22h16" />
      <path d="M18 28h16" />
      <path d="M18 34h12" />
    </svg>
  );
}

function FormatIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 3h8l4 4v10H4z" />
      <path d="M12 3v4h4" />
    </svg>
  );
}

export default function ReportPackPreview() {
  const copy = HOME_COPY.reportPack;
  return (
    <section
      className="review-section"
      aria-labelledby="report-title"
      data-home-section="report-pack"
    >
      <div className="review-section-head">
        <p className="review-eyebrow">Review deliverables</p>
        <h2 id="report-title">{copy.sectionTitle}</h2>
        <p>{copy.subheading}</p>
      </div>

      <div className="review-report-paper">
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "14px",
              color: "var(--t2)",
            }}
          >
            <PaperFoldIcon />
            <div>
              <strong
                style={{
                  display: "block",
                  color: "var(--t1)",
                  fontSize: "1.05rem",
                }}
              >
                {copy.sectionsHeading}
              </strong>
              <small style={{ color: "var(--t3)" }}>
                Six deliverables per review package
              </small>
            </div>
          </div>
          <ol className="review-report-toc" aria-label={copy.sectionsHeading}>
            {copy.sections.map((section, index) => (
              <li key={section}>
                <span className="review-report-toc-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{section}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="review-report-formats">
          <h3>{copy.formatsHeading}</h3>
          <ul
            className="review-report-format-list"
            aria-label={copy.formatsHeading}
          >
            {copy.formats.map((format) => (
              <li key={format} className="review-report-format-chip">
                <FormatIcon />
                {format}
              </li>
            ))}
          </ul>
          <p className="review-report-note">{copy.note}</p>
        </div>
      </div>
    </section>
  );
}
