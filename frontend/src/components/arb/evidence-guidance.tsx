"use client";

import { useState } from "react";

type ReviewArea = {
  id: string;
  title: string;
  summary: string;
  icons: string[];
  services: string;
  evidence: string[];
  links: Array<[string, string]>;
};

const REVIEW_AREAS: ReviewArea[] = [
  {
    id: "security",
    title: "Security",
    summary: "Identity, access, secrets, encryption, threat protection",
    icons: [
      "/azure-icons/readiness/security-key-vault.svg",
      "/azure-icons/readiness/security-defender-for-cloud.svg"
    ],
    services: "Microsoft Entra ID • Azure RBAC • Key Vault • Defender",
    evidence: [
      "Microsoft Entra ID and Azure RBAC model",
      "Privileged Identity Management and break-glass access",
      "Azure Key Vault and secrets management design",
      "Microsoft Defender for Cloud coverage"
    ],
    links: [
      ["WAF: Security", "https://learn.microsoft.com/en-us/azure/well-architected/security/"],
      ["CAF: Secure", "https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/secure/"]
    ]
  },
  {
    id: "networking",
    title: "Networking",
    summary: "Connectivity, segmentation, private access, DNS, routing",
    icons: [
      "/azure-icons/readiness/networking-virtual-network.svg",
      "/azure-icons/readiness/networking-firewall.svg"
    ],
    services: "Virtual Network • Azure Firewall • Private Link • ExpressRoute",
    evidence: [
      "Azure Virtual Network, hub-spoke, or Virtual WAN design",
      "Subnet, NSG, UDR, route table, and route evidence",
      "Azure Firewall, NVA, or egress control architecture",
      "Private Link, Private Endpoint, and Private DNS design",
      "ExpressRoute, VPN Gateway, and hybrid connectivity evidence"
    ],
    links: [
      ["ALZ network topology", "https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/landing-zone/design-areas"],
      ["Hub-spoke topology", "https://learn.microsoft.com/en-us/azure/architecture/networking/architecture/hub-spoke"]
    ]
  },
  {
    id: "reliability",
    title: "Reliability",
    summary: "Availability, backup, recovery, failover, RTO/RPO",
    icons: ["/azure-icons/readiness/reliability-recovery-services.svg"],
    services: "Availability Zones • Azure Backup • Site Recovery • Front Door",
    evidence: [
      "Availability zone and region design",
      "Azure Backup and restore policy",
      "Azure Site Recovery or workload failover approach",
      "RTO/RPO requirements and validation evidence"
    ],
    links: [
      ["WAF: Reliability", "https://learn.microsoft.com/en-us/azure/well-architected/reliability/"],
      ["Reliability principles", "https://learn.microsoft.com/en-us/azure/well-architected/reliability/principles"]
    ]
  },
  {
    id: "operations",
    title: "Operational Excellence",
    summary: "Monitoring, diagnostics, alerting, runbooks",
    icons: ["/azure-icons/readiness/operations-monitor.svg"],
    services: "Azure Monitor • Log Analytics • Application Insights • Automation",
    evidence: [
      "Azure Monitor and Log Analytics workspace design",
      "Application Insights configuration",
      "Diagnostic settings and retention approach",
      "Alerting, incident response, and runbook evidence"
    ],
    links: [
      ["WAF: Operational Excellence", "https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/"],
      ["CAF: Manage", "https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/manage/"]
    ]
  },
  {
    id: "cost",
    title: "Cost Optimization",
    summary: "Estimates, sizing, budgets, reservations, optimization",
    icons: ["/azure-icons/readiness/cost-management.svg"],
    services: "Cost Management • Azure Advisor • Reservations • Savings Plan",
    evidence: [
      "Azure pricing estimate",
      "SKU and sizing rationale",
      "Microsoft Cost Management budget model",
      "Azure Advisor or reservation recommendations"
    ],
    links: [
      ["WAF: Cost Optimization", "https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/"],
      ["Cost principles", "https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/principles"]
    ]
  },
  {
    id: "performance",
    title: "Performance Efficiency",
    summary: "Capacity, latency, scaling, throughput",
    icons: ["/azure-icons/readiness/performance-load-testing.svg"],
    services: "Azure Monitor • Autoscale • Azure Load Testing • Redis",
    evidence: [
      "Capacity and throughput assumptions",
      "Autoscale configuration",
      "Azure Load Testing results, if available",
      "Azure Monitor performance metrics"
    ],
    links: [
      ["WAF: Performance Efficiency", "https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/"],
      ["Performance principles", "https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/principles"]
    ]
  },
  {
    id: "governance",
    title: "Governance and ALZ",
    summary: "Policy, subscriptions, governance, landing zone",
    icons: [
      "/azure-icons/readiness/governance-landing-zone.svg",
      "/azure-icons/readiness/governance-policy.svg"
    ],
    services: "Management Groups • Azure Policy • Template Specs • RBAC",
    evidence: [
      "Management group hierarchy",
      "Subscription model and environment separation",
      "Azure Policy assignments and initiatives",
      "Azure Landing Zone architecture diagram"
    ],
    links: [
      ["ALZ design principles", "https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/landing-zone/design-principles"],
      ["ALZ design areas", "https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/landing-zone/design-areas"]
    ]
  },
  {
    id: "ai-landing-zone",
    title: "Azure AI Landing Zone",
    summary: "Private access, grounding, evaluation, responsible AI",
    icons: [
      "/azure-icons/readiness/ai-content-safety.svg",
      "/azure-icons/readiness/ai-search.svg"
    ],
    services: "Azure AI Foundry • AI Search • Content Safety • Private Endpoint",
    evidence: [
      "Azure AI Foundry architecture",
      "Model deployment and access model",
      "Azure AI Search or grounding architecture, if used",
      "Private Endpoint, Private DNS, and responsible AI controls"
    ],
    links: [
      ["CAF: AI adoption", "https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ai/"],
      ["WAF: AI workloads", "https://learn.microsoft.com/en-us/azure/well-architected/ai/"]
    ]
  },
  {
    id: "migration",
    title: "Migration Readiness",
    summary: "Discovery, assessment, wave planning, validation",
    icons: ["/azure-icons/readiness/migration-azure-migrate.svg"],
    services: "Azure Migrate • Dependency Mapping • Cutover • Rollback",
    evidence: [
      "Azure Migrate discovery and assessment output",
      "Application and dependency mapping",
      "Migration wave plan",
      "Cutover, rollback, and post-migration validation checklist"
    ],
    links: [
      ["Azure Migrate", "https://learn.microsoft.com/en-us/azure/migrate/"],
      ["CAF: Migrate", "https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/plan-migration"]
    ]
  }
];

export function EvidenceGuidancePanel() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <section className="surface-panel arb-evidence-guidance" aria-labelledby="arb-evidence-guidance-title">
      <div className="arb-readiness-head">
        <div>
          <p className="board-card-subtitle">Review criteria</p>
          <h2 id="arb-evidence-guidance-title" className="section-title">
            Prepare your Azure review package
          </h2>
          <p className="arb-readiness-subtitle">
            Gather evidence across the Azure architecture areas below before starting the review. Expand each area
            for examples and Microsoft guidance.
          </p>
        </div>
        <a
          className="secondary-button arb-readiness-template"
          href="/templates/cari-arb-design-template.xlsx"
          download="cari-arb-design-template.xlsx"
        >
          Download Excel template
        </a>
      </div>

      <div className="arb-readiness-grid" role="list">
        {REVIEW_AREAS.map((item) => {
          const expanded = expandedId === item.id;
          const panelId = `arb-readiness-panel-${item.id}`;
          const buttonId = `arb-readiness-button-${item.id}`;

          return (
            <article
              key={item.id}
              className={`arb-readiness-card${expanded ? " arb-readiness-card-expanded" : ""}`}
              role="listitem"
            >
              <button
                id={buttonId}
                type="button"
                className="arb-readiness-card-button"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setExpandedId((current) => (current === item.id ? null : item.id))}
              >
                <span className={`arb-readiness-symbol${item.icons.length > 1 ? " arb-readiness-symbol-stack" : ""}`}>
                  {item.icons.map((iconSrc, iconIndex) => (
                    <img
                      key={iconSrc}
                      src={iconSrc}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      className={iconIndex === 0 ? "arb-readiness-icon-primary" : "arb-readiness-icon-secondary"}
                    />
                  ))}
                </span>
                <span className="arb-readiness-card-copy">
                  <strong>{item.title}</strong>
                  <span>{item.summary}</span>
                </span>
                <span className="arb-readiness-action-wrap">
                  <span className="arb-readiness-action">
                    {expanded ? "Hide guidance" : "View evidence guidance"}
                  </span>
                  <span className="arb-readiness-chevron" aria-hidden="true">⌄</span>
                </span>
              </button>

              <div
                id={panelId}
                className="arb-readiness-panel"
                role="region"
                aria-labelledby={buttonId}
                hidden={!expanded}
              >
                <p className="arb-readiness-services">{item.services}</p>
                <div className="arb-readiness-panel-grid">
                  <div>
                    <span className="arb-readiness-panel-label">What to prepare</span>
                    <ul>
                      {item.evidence.map((evidence) => (
                        <li key={evidence}>{evidence}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <span className="arb-readiness-panel-label">Guidance</span>
                    <div className="arb-evidence-link-row" aria-label={`${item.title} Microsoft guidance`}>
                      {item.links.map(([label, href]) => (
                        <a key={href} href={href} target="_blank" rel="noreferrer">
                          {label}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="arb-readiness-next">
        <p>Once your evidence is ready, upload your review package below to begin the architecture review.</p>
      </div>
    </section>
  );
}
