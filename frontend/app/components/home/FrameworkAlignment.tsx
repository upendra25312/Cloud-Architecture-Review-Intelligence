/**
 * FrameworkAlignment — CAF / WAF / Azure Landing Zone (Req 6).
 *
 * Renders three <h3> + <ul> columns with factual framework content.
 * The WAF pillar list is the exact 5-element official set (Property P3).
 *
 * Extended_Review_Domains:
 *   This file intentionally does NOT render Extended_Review_Domains
 *   (Sustainability, Experience, or any other non-official domain) under
 *   the WAF pillar heading.  A future delta MAY add those items, but they
 *   MUST appear under a separate `<h3>Extended Review Domains</h3>` so
 *   Property P3 (Official WAF Pillar Closure) remains intact (Req 6.3,
 *   6.4).
 *
 * Pure presentational component (no hooks, no "use client").
 */

import {
  AZURE_LANDING_ZONE_COMPONENTS,
  CAF_DESIGN_AREAS,
  HOME_COPY,
  WAF_PILLARS,
} from "./home-copy";

export interface FrameworkAlignmentProps {
  anchorId?: "framework-alignment";
}

export default function FrameworkAlignment({
  anchorId = "framework-alignment",
}: FrameworkAlignmentProps) {
  const copy = HOME_COPY.framework;
  return (
    <section
      id={anchorId}
      className="review-section"
      aria-labelledby="framework-alignment-title"
      data-home-section="framework-alignment"
    >
      <div className="review-section-head">
        <p className="review-eyebrow">Framework alignment</p>
        <h2 id="framework-alignment-title">{copy.sectionTitle}</h2>
      </div>

      <div className="review-framework-grid">
        <div className="review-framework-column" data-framework="caf">
          <h3>{copy.cafHeading}</h3>
          <ul aria-label={copy.cafHeading}>
            {CAF_DESIGN_AREAS.map((area) => (
              <li key={area}>{area}</li>
            ))}
          </ul>
        </div>

        <div className="review-framework-column" data-framework="waf">
          <h3>{copy.wafHeading}</h3>
          {/*
            Property P3: this list MUST equal exactly the 5 official pillars.
            Extended review domains (Sustainability, Experience, etc.) belong
            under a separate <h3>Extended Review Domains</h3> heading — see
            component-level docstring above.
          */}
          <ul aria-label={copy.wafHeading}>
            {WAF_PILLARS.map((pillar) => (
              <li key={pillar}>{pillar}</li>
            ))}
          </ul>
        </div>

        <div className="review-framework-column" data-framework="alz">
          <h3>{copy.alzHeading}</h3>
          <ul aria-label={copy.alzHeading}>
            {AZURE_LANDING_ZONE_COMPONENTS.map((component) => (
              <li key={component}>{component}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
