"use client";

import type { MouseEvent } from "react";
import { trackArbEvent } from "@/lib/telemetry";
import { HOME_COPY } from "./home-copy";
import HeroDashboardMockup from "./HeroDashboardMockup";

export interface HeroSectionProps {
  /** Resolved by HomeClientSection. "/arb" when signed in, SWA login URL otherwise. */
  getStartedHref: string;
  /** Optional resume-review link when a principal has an existing review. */
  resumeLink?: string | null;
  resumeLabel?: string | null;
  resumeStatus?: string | null;
}

type TrackableCta = "start_azure_review" | "view_sample_review";

function isTrackableCta(value: string | undefined): value is TrackableCta {
  return value === "start_azure_review" || value === "view_sample_review";
}

export default function HeroSection({
  getStartedHref,
  resumeLink,
  resumeLabel,
  resumeStatus,
}: HeroSectionProps) {
  const handleCtaClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const cta = event.currentTarget.dataset.arbCta;
    if (!isTrackableCta(cta)) return;
    trackArbEvent({
      name: "arb_home_cta_click",
      properties: { cta, location: "hero" },
    });
  };

  const hero = HOME_COPY.hero;

  return (
    <section
      className="review-hero"
      aria-labelledby="home-hero-title"
      data-home-section="hero"
    >
      <div className="review-hero-copy">
        <p className="review-eyebrow">{hero.eyebrow}</p>
        <h1 id="home-hero-title">{hero.title}</h1>
        <p className="review-hero-kicker">{hero.kicker}</p>
        <p className="review-hero-sub">{hero.sub}</p>
        <div className="review-hero-actions" aria-label="Primary actions">
          <a
            href={getStartedHref}
            className="review-btn review-btn-primary"
            data-arb-cta="start_azure_review"
            onClick={handleCtaClick}
          >
            {hero.primaryCta}
          </a>
          <a
            href="/demo"
            className="review-btn review-btn-secondary"
            data-arb-cta="view_sample_review"
            onClick={handleCtaClick}
          >
            {hero.secondaryCta}
          </a>
          <a href="#framework-alignment" className="review-text-link">
            {hero.tertiaryCta}
          </a>
        </div>
        <ul className="review-hero-chips" aria-label="Platform guarantees">
          {hero.trustChips.map((chip) => (
            <li key={chip} className="review-hero-chip">
              {chip}
            </li>
          ))}
        </ul>
        {resumeLink ? (
          <a href={resumeLink} className="review-resume-card">
            <span>Continue latest review</span>
            {resumeLabel ? <strong>{resumeLabel}</strong> : null}
            {resumeStatus ? <small>{resumeStatus}</small> : null}
          </a>
        ) : null}
      </div>
      <HeroDashboardMockup />
    </section>
  );
}
