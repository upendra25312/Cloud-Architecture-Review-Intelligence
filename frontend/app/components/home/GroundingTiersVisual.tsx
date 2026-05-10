/**
 * GroundingTiersVisual — "Why findings are trustworthy" (T1–T4 knowledge hierarchy).
 * Shows the 4-tier grounding architecture that distinguishes CARI from generic AI tools.
 * Pure presentational, inline SVG, no raster images.
 */

const TIERS = [
  {
    tier: "T1",
    label: "Customer Evidence",
    detail: "HLDs, SOWs, architecture diagrams, IaC, and design documents uploaded by the reviewer",
    badge: "Most authoritative",
    badgeClass: "grounding-badge--t1",
    color: "#0078D4",
    bg: "#EFF6FF",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" width="18" height="18" aria-hidden="true">
        <path d="M4 2h9l4 4v13H4z" stroke="#0078D4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M13 2v4h4" stroke="#0078D4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M7 11l2 2 4-4" stroke="#0078D4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    tier: "T2",
    label: "Framework Rubrics",
    detail: "WAF pillars, CAF design areas, and Azure Landing Zone standards stored in a vector knowledge base",
    badge: "Grounded",
    badgeClass: "grounding-badge--t2",
    color: "#7c3aed",
    bg: "#F5F3FF",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" width="18" height="18" aria-hidden="true">
        <rect x="2" y="2" width="7" height="7" rx="1" stroke="#7c3aed" strokeWidth="1.5"/>
        <rect x="11" y="2" width="7" height="7" rx="1" stroke="#7c3aed" strokeWidth="1.5"/>
        <rect x="2" y="11" width="7" height="7" rx="1" stroke="#7c3aed" strokeWidth="1.5"/>
        <rect x="11" y="11" width="7" height="7" rx="1" stroke="#7c3aed" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    tier: "T3",
    label: "Live Microsoft Learn",
    detail: "Real-time documentation fetched via MCP Server during review — always current, never stale",
    badge: "Current",
    badgeClass: "grounding-badge--t3",
    color: "#0369a1",
    bg: "#F0F9FF",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" width="18" height="18" aria-hidden="true">
        <circle cx="10" cy="10" r="8" stroke="#0369a1" strokeWidth="1.5"/>
        <path d="M2 10h16M10 2a14 14 0 0 1 0 16M10 2a14 14 0 0 0 0 16" stroke="#0369a1" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    tier: "T4",
    label: "Model Knowledge",
    detail: "Parametric knowledge used as a last resort only — findings from this tier are always flagged as low confidence",
    badge: "Flagged — last resort",
    badgeClass: "grounding-badge--t4",
    color: "#b45309",
    bg: "#FFFBEB",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" width="18" height="18" aria-hidden="true">
        <path d="M10 2l1.8 5.6H18l-4.9 3.5 1.8 5.6L10 13.2l-4.9 3.5 1.8-5.6L2 7.6h6.2z" stroke="#b45309" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
] as const;

export default function GroundingTiersVisual() {
  return (
    <section
      className="review-section"
      aria-labelledby="grounding-title"
      data-home-section="grounding-tiers"
    >
      <div className="review-section-head">
        <p className="review-eyebrow">Knowledge grounding</p>
        <h2 id="grounding-title">Why CARI findings are defensible — not just generated.</h2>
        <p>Every finding traces through a prioritised knowledge hierarchy. Customer evidence always wins. Model guesswork is always flagged.</p>
      </div>

      <div className="grounding-tiers-stack">
        {TIERS.map((tier, i) => (
          <div
            key={tier.tier}
            className="grounding-tier-row"
            style={{ "--tier-color": tier.color, "--tier-bg": tier.bg } as React.CSSProperties}
          >
            <div className="grounding-tier-left">
              <div className="grounding-tier-badge-wrap">
                <span className="grounding-tier-id" style={{ background: tier.color }}>{tier.tier}</span>
                {i < TIERS.length - 1 && (
                  <span className="grounding-tier-connector" aria-hidden="true" />
                )}
              </div>
            </div>
            <div className="grounding-tier-body" style={{ background: tier.bg }}>
              <div className="grounding-tier-head">
                <span className="grounding-tier-icon">{tier.icon}</span>
                <strong className="grounding-tier-label">{tier.label}</strong>
                <span className={`grounding-badge ${tier.badgeClass}`}>{tier.badge}</span>
              </div>
              <p className="grounding-tier-detail">{tier.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="grounding-note">
        CARI uses T1 evidence first. If a finding cannot be grounded in customer evidence or framework rubrics, it is labelled with confidence level <strong>Low</strong> and the source tier is shown to the reviewer.
      </p>
    </section>
  );
}
