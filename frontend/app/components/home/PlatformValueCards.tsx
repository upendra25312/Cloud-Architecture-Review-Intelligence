/**
 * PlatformValueCards — "What the platform does" (Req 2).
 *
 * Four statically-authored cards, each with an inline SVG icon marked
 * aria-hidden. The card heading provides the accessible name.
 *
 * Pure presentational component — no hooks, no "use client" directive.
 */

import type { ReactNode } from "react";
import { HOME_COPY } from "./home-copy";

interface ValueCardIconProps {
  title: string;
}

function EvidenceIcon({ title }: ValueCardIconProps) {
  return (
    <svg
      className="review-card-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      role="presentation"
      data-icon-title={title}
    >
      <path d="M7 3h8l4 4v14H7z" />
      <path d="M15 3v4h4" />
      <path d="m9 13 2 2 4-4" />
    </svg>
  );
}

function FrameworkIcon({ title }: ValueCardIconProps) {
  return (
    <svg
      className="review-card-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      role="presentation"
      data-icon-title={title}
    >
      <rect x="3" y="3" width="7" height="7" rx="1.25" />
      <rect x="14" y="3" width="7" height="7" rx="1.25" />
      <rect x="3" y="14" width="7" height="7" rx="1.25" />
      <rect x="14" y="14" width="7" height="7" rx="1.25" />
    </svg>
  );
}

function HumanReviewIcon({ title }: ValueCardIconProps) {
  return (
    <svg
      className="review-card-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      role="presentation"
      data-icon-title={title}
    >
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 20.5a5.5 5.5 0 0 1 11 0" />
      <path d="m15.5 12.5 2 2 4-4" />
    </svg>
  );
}

function ExportIcon({ title }: ValueCardIconProps) {
  return (
    <svg
      className="review-card-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      role="presentation"
      data-icon-title={title}
    >
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 19h16" />
    </svg>
  );
}

const CARD_ICONS: ReadonlyArray<(props: ValueCardIconProps) => ReactNode> = [
  EvidenceIcon,
  FrameworkIcon,
  HumanReviewIcon,
  ExportIcon,
];

export default function PlatformValueCards() {
  return (
    <section
      className="review-section"
      aria-labelledby="platform-does-title"
      data-home-section="platform-does"
    >
      <div className="review-section-head">
        <p className="review-eyebrow">Platform role</p>
        <h2 id="platform-does-title">What the platform does</h2>
      </div>
      <div className="review-card-grid review-card-grid-4">
        {HOME_COPY.platformValues.map((card, index) => {
          const Icon = CARD_ICONS[index] ?? EvidenceIcon;
          return (
            <article
              key={card.title}
              className="review-card review-value-card"
              data-home-card={card.title}
            >
              <Icon title={card.title} />
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
