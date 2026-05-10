/**
 * TrustTiles — "Built for Enterprise Security and Governance" (Req 10).
 * Five tiles aligned to PRD security spec: zero secrets, audit trail,
 * data residency, encryption, RBAC.
 */

import type { ReactNode } from "react";
import { HOME_COPY } from "./home-copy";

type TrustLabel = (typeof HOME_COPY.trust.tiles)[number]["label"];

function ZeroSecretsIcon() {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false" width="40" height="40">
      <circle cx="20" cy="20" r="20" fill="#EFF6FF" />
      <path d="M14 19V14a6 6 0 0 1 12 0v5" stroke="#0078D4" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="11" y="19" width="18" height="12" rx="2.5" stroke="#0078D4" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="20" cy="25" r="1.5" fill="#0078D4"/>
      <path d="M29 11 L31 9" stroke="#C8102E" strokeWidth="2" strokeLinecap="round"/>
      <path d="M31 11 L29 9" stroke="#C8102E" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function AuditTrailIcon() {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false" width="40" height="40">
      <circle cx="20" cy="20" r="20" fill="#F0FDF4" />
      <path d="M12 14h16M12 19h12M12 24h9" stroke="#16a34a" strokeWidth="1.75" strokeLinecap="round"/>
      <path d="M27 22 L30 25 L35 20" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8 10h20l2 2v20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V12a2 2 0 0 1 2-2z" stroke="#16a34a" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function DataResidencyIcon() {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false" width="40" height="40">
      <circle cx="20" cy="20" r="20" fill="#FFF7ED" />
      <path d="M20 8C16 8 13 11 13 15c0 6 7 13 7 13s7-7 7-13c0-4-3-7-7-7z" stroke="#ea580c" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="20" cy="15" r="2.5" stroke="#ea580c" strokeWidth="1.75"/>
      <path d="M10 30 Q20 27 30 30" stroke="#ea580c" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2"/>
    </svg>
  );
}

function EncryptionIcon() {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false" width="40" height="40">
      <circle cx="20" cy="20" r="20" fill="#FDF4FF" />
      <path d="M20 8 L28 12 V20 C28 25 24 29 20 31 C16 29 12 25 12 20 V12 Z" stroke="#9333ea" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M17 20 L19 22 L23 18" stroke="#9333ea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function RbacIcon() {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false" width="40" height="40">
      <circle cx="20" cy="20" r="20" fill="#FFF1F2" />
      <circle cx="20" cy="13" r="3" stroke="#C8102E" strokeWidth="1.75"/>
      <circle cx="12" cy="27" r="2.5" stroke="#C8102E" strokeWidth="1.5"/>
      <circle cx="28" cy="27" r="2.5" stroke="#C8102E" strokeWidth="1.5"/>
      <path d="M20 16 L20 21 M20 21 L12 24.5 M20 21 L28 24.5" stroke="#C8102E" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

const ICONS: Record<TrustLabel, () => ReactNode> = {
  "Zero Secrets in Code": ZeroSecretsIcon,
  "Immutable Audit Trail": AuditTrailIcon,
  "East US 2 Data Residency": DataResidencyIcon,
  "Encrypted End-to-End": EncryptionIcon,
  "Least-Privilege RBAC": RbacIcon,
};

export default function TrustTiles() {
  return (
    <section
      className="review-section review-section--dark-tint"
      aria-labelledby="trust-title"
      data-home-section="trust"
    >
      <div className="review-section-head">
        <p className="review-eyebrow">Security and governance</p>
        <h2 id="trust-title">{HOME_COPY.trust.sectionTitle}</h2>
        <p>Designed for enterprise cloud environments where security, auditability, and data sovereignty are non-negotiable.</p>
      </div>
      <div className="review-trust-grid">
        {HOME_COPY.trust.tiles.map((tile) => {
          const Icon = ICONS[tile.label];
          return (
            <article key={tile.label} className="review-trust-tile review-trust-tile--rich">
              <div className="review-trust-tile-icon">
                <Icon />
              </div>
              <h3>{tile.label}</h3>
              <p>{tile.description}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
