/**
 * TrustTiles — "Trust and Governance" (Req 10).
 *
 * Exactly 5 tiles in the documented order (Permission-aware,
 * Evidence-linked, Human-reviewed, Export-controlled, Enterprise-ready).
 * Each description is authored at ≤ 20 whitespace-separated words and
 * avoids compliance-certification / perfect-accuracy language
 * (Req 10.3, 10.4; Property P2, P9).
 *
 * Pure presentational component.
 */

import type { ReactNode } from "react";
import { HOME_COPY } from "./home-copy";

type TrustLabel = (typeof HOME_COPY.trust.tiles)[number]["label"];

function PermissionIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 11V8a6 6 0 0 1 12 0v3" />
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M12 15v3" />
    </svg>
  );
}

function EvidenceLinkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M10 13a4 4 0 0 0 5.66 0l2.83-2.83a4 4 0 1 0-5.66-5.66L11.5 6" />
      <path d="M14 11a4 4 0 0 0-5.66 0l-2.83 2.83a4 4 0 1 0 5.66 5.66L12.5 18" />
    </svg>
  );
}

function HumanReviewedIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="m15 13 2 2 4-4" />
    </svg>
  );
}

function ExportControlledIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 19h16" />
      <path d="M12 19h0" />
    </svg>
  );
}

function EnterpriseReadyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 21V8l8-5 8 5v13" />
      <path d="M9 21v-6h6v6" />
      <path d="M9 11h.01M12 11h.01M15 11h.01" />
    </svg>
  );
}

const ICONS: Record<TrustLabel, () => ReactNode> = {
  "Permission-aware": PermissionIcon,
  "Evidence-linked": EvidenceLinkIcon,
  "Human-reviewed": HumanReviewedIcon,
  "Export-controlled": ExportControlledIcon,
  "Enterprise-ready": EnterpriseReadyIcon,
};

export default function TrustTiles() {
  return (
    <section
      className="review-section"
      aria-labelledby="trust-title"
      data-home-section="trust"
    >
      <div className="review-section-head">
        <p className="review-eyebrow">Trust and governance</p>
        <h2 id="trust-title">{HOME_COPY.trust.sectionTitle}</h2>
      </div>
      <div className="review-trust-grid">
        {HOME_COPY.trust.tiles.map((tile) => {
          const Icon = ICONS[tile.label];
          return (
            <article key={tile.label} className="review-trust-tile">
              <Icon />
              <h3>{tile.label}</h3>
              <p>{tile.description}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
