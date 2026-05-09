"use client";

import type { MouseEvent } from "react";
import { trackArbEvent } from "@/lib/telemetry";
import { HOME_COPY } from "./home-copy";

/**
 * FinalCtaSection — last <section> inside <main> (Req 11).
 *
 * Mirrors the hero CTAs.  "Start Azure Review" routes to `getStartedHref`
 * (signed-in users → /arb, anonymous users → the SWA login URL resolved
 * by HomeClientSection).  "View Sample Review" routes to /demo.
 *
 * Both CTAs emit `arb_home_cta_click` via the shared handler (Req 19.3,
 * 19.4).  The section carries data-home-section="final-cta" so the
 * telemetry helper tags `location: "final-cta"`.
 */

export interface FinalCtaSectionProps {
  getStartedHref: string;
}

type TrackableCta = "start_azure_review" | "view_sample_review";

function isTrackableCta(value: string | undefined): value is TrackableCta {
  return value === "start_azure_review" || value === "view_sample_review";
}

export default function FinalCtaSection({
  getStartedHref,
}: FinalCtaSectionProps) {
  const handleCtaClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const cta = event.currentTarget.dataset.arbCta;
    if (!isTrackableCta(cta)) return;
    trackArbEvent({
      name: "arb_home_cta_click",
      properties: { cta, location: "final-cta" },
    });
  };

  const copy = HOME_COPY.finalCta;

  return (
    <section
      className="review-final-cta-v2"
      aria-labelledby="final-cta-title"
      data-home-section="final-cta"
    >
      <h2 id="final-cta-title">{copy.heading}</h2>
      <div className="review-hero-actions" aria-label="Primary actions">
        <a
          href={getStartedHref}
          className="review-btn review-btn-primary"
          data-arb-cta="start_azure_review"
          onClick={handleCtaClick}
        >
          {copy.primaryCta}
        </a>
        <a
          href="/demo"
          className="review-btn review-btn-secondary"
          data-arb-cta="view_sample_review"
          onClick={handleCtaClick}
        >
          {copy.secondaryCta}
        </a>
      </div>
    </section>
  );
}
