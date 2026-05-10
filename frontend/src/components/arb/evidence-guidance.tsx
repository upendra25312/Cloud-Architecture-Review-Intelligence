"use client";

const REVIEW_AREAS = [
  {
    area: "Security",
    tests: "Identity, RBAC, PIM, managed identity, Key Vault, encryption, network isolation, Defender.",
    evidence: "Identity design, access matrix, secrets model, threat controls, private access design.",
    links: [
      ["WAF Security", "https://learn.microsoft.com/en-us/azure/well-architected/security/"],
      ["CAF Secure", "https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/secure/"]
    ]
  },
  {
    area: "Reliability",
    tests: "Availability zones, backup, DR, RTO/RPO, health probes, retries, failover.",
    evidence: "HA/DR design, backup policy, failover runbook, resilience test evidence.",
    links: [
      ["WAF Reliability", "https://learn.microsoft.com/en-us/azure/well-architected/reliability/"],
      ["Reliability principles", "https://learn.microsoft.com/en-us/azure/well-architected/reliability/principles"]
    ]
  },
  {
    area: "Operations",
    tests: "IaC, CI/CD, monitoring, alerting, runbooks, tagging, support model.",
    evidence: "Bicep/Terraform, pipeline diagram, Log Analytics design, alert matrix, runbooks.",
    links: [
      ["WAF Operations", "https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/"],
      ["CAF Manage", "https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/manage/"]
    ]
  },
  {
    area: "Cost",
    tests: "SKU rationale, right-sizing, autoscale, reservations, budgets, unit economics.",
    evidence: "Azure pricing estimate, capacity model, cost assumptions, budget/alert plan.",
    links: [
      ["WAF Cost", "https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/"],
      ["Cost principles", "https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/principles"]
    ]
  },
  {
    area: "Performance",
    tests: "Scale targets, load profile, caching, async patterns, SKU capacity, load testing.",
    evidence: "NFR table, load test results, capacity plan, performance risks and limits.",
    links: [
      ["WAF Performance", "https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/"],
      ["Performance principles", "https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/principles"]
    ]
  },
  {
    area: "CAF / ALZ Governance",
    tests: "Management groups, subscriptions, Azure Policy, RBAC, hub-spoke/VWAN, central logging.",
    evidence: "ALZ diagram, subscription model, policy assignment list, network topology.",
    links: [
      ["CAF Ready", "https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/"],
      ["Azure landing zones", "https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/landing-zone/"],
      ["ALZ design areas", "https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/landing-zone/design-areas"]
    ]
  },
  {
    area: "AI Landing Zone",
    tests: "AI architecture, Foundry baseline, RAG, agents, responsible AI, content safety, private access.",
    evidence: "AI architecture diagram, model inventory, grounding sources, evaluation plan, safety controls.",
    links: [
      ["CAF AI adoption", "https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ai/"],
      ["WAF AI", "https://learn.microsoft.com/en-us/azure/well-architected/ai/"],
      ["Foundry landing zone", "https://learn.microsoft.com/en-us/azure/architecture/ai-ml/architecture/baseline-microsoft-foundry-landing-zone"]
    ]
  },
  {
    area: "Migration Readiness",
    tests: "Estate assessment, migration method, wave plan, cutover, rollback, validation, hypercare.",
    evidence: "Azure Migrate assessment, migration runbook, dependency map, rollback plan, validation checklist.",
    links: [
      ["Azure migration", "https://learn.microsoft.com/en-us/azure/migration/migrate-to-azure"],
      ["Plan migration", "https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/plan-migration"],
      ["Execute migration", "https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/release/complete-migration"]
    ]
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
          href="/templates/cari-arb-design-template.xlsx"
          download="cari-arb-design-template.xlsx"
        >
          Download Excel template
        </a>
      </div>

      <p className="section-copy">
        Use this checklist to prepare the design package. The assessment gives full credit only when the document
        includes explicit, traceable evidence for the control, design decision, and owner. The Excel template follows
        the macro-free Azure Review Checklists pattern: review area, sub area, checklist item, severity, status,
        evidence comment, and Microsoft Learn reference.
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
              <div className="arb-evidence-link-row" aria-label={`${item.area} Microsoft Learn references`}>
                {item.links.map(([label, href]) => (
                  <a key={href} href={href} target="_blank" rel="noreferrer">
                    {label}
                  </a>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
