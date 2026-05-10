"use client";

const REVIEW_AREAS = [
  {
    area: "Security",
    tests: "Identity, RBAC, PIM, managed identity, Key Vault, encryption, network isolation, Defender.",
    evidence: "Identity design, access matrix, secrets model, threat controls, private access design."
  },
  {
    area: "Reliability",
    tests: "Availability zones, backup, DR, RTO/RPO, health probes, retries, failover.",
    evidence: "HA/DR design, backup policy, failover runbook, resilience test evidence."
  },
  {
    area: "Operations",
    tests: "IaC, CI/CD, monitoring, alerting, runbooks, tagging, support model.",
    evidence: "Bicep/Terraform, pipeline diagram, Log Analytics design, alert matrix, runbooks."
  },
  {
    area: "Cost",
    tests: "SKU rationale, right-sizing, autoscale, reservations, budgets, unit economics.",
    evidence: "Azure pricing estimate, capacity model, cost assumptions, budget/alert plan."
  },
  {
    area: "Performance",
    tests: "Scale targets, load profile, caching, async patterns, SKU capacity, load testing.",
    evidence: "NFR table, load test results, capacity plan, performance risks and limits."
  },
  {
    area: "CAF / ALZ Governance",
    tests: "Management groups, subscriptions, Azure Policy, RBAC, hub-spoke/VWAN, central logging.",
    evidence: "ALZ diagram, subscription model, policy assignment list, network topology."
  }
];

export function EvidenceGuidancePanel() {
  return (
    <section className="surface-panel arb-evidence-guidance" aria-labelledby="arb-evidence-guidance-title">
      <div className="board-card-head">
        <div className="board-card-head-copy">
          <p className="board-card-subtitle">Review criteria</p>
          <h2 id="arb-evidence-guidance-title" className="section-title">
            What this review tests before scoring the package
          </h2>
        </div>
        <a
          className="secondary-button"
          href="/templates/cari-arb-design-template.md"
          download="cari-arb-design-template.md"
        >
          Download design template
        </a>
      </div>

      <p className="section-copy">
        Use this checklist to prepare the design package. The assessment gives full credit only when the document
        includes explicit, traceable evidence for the control, design decision, and owner.
      </p>

      <div className="arb-evidence-matrix" role="list">
        {REVIEW_AREAS.map((item) => (
          <article key={item.area} className="arb-evidence-matrix-row" role="listitem">
            <div>
              <strong>{item.area}</strong>
              <p>{item.tests}</p>
            </div>
            <div>
              <span>Expected evidence</span>
              <p>{item.evidence}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
