# CARI ARB Design Document Template

Use this template to prepare a review-ready Azure design package for Cloud Architecture Review Intelligence. Replace every prompt with project-specific evidence. Attach diagrams, exports, screenshots, IaC, cost estimates, test results, and runbooks where noted.

Microsoft Learn reference set used by this template:

- Azure Well-Architected Framework: https://learn.microsoft.com/en-us/azure/well-architected/
- WAF pillars: https://learn.microsoft.com/en-us/azure/well-architected/pillars
- Cloud Adoption Framework: https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/
- Azure landing zones: https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/landing-zone/
- Azure landing zone design areas: https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/landing-zone/design-areas
- CAF AI adoption: https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ai/
- Well-Architected AI workloads: https://learn.microsoft.com/en-us/azure/well-architected/ai/
- Azure migration overview: https://learn.microsoft.com/en-us/azure/migration/migrate-to-azure
- Migration runbook and cutover planning: https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/plan-migration

This template follows the macro-free Azure Review Checklists pattern from https://github.com/Azure/review-checklists/tree/main/spreadsheet/macrofree. Use explicit checklist rows with a review area, sub area, checklist item, severity, status, evidence comment, and Microsoft Learn reference. Recommended status values:

- Not verified: the item has not been assessed.
- Open: a gap or action is currently open.
- In progress: evidence or remediation is being prepared.
- Fulfilled: the design evidence satisfies the item.
- Not required: the item is not applicable and the rationale is documented.

## 0. Review Checklist

| Check ID | Main area | Sub area | Checklist item | Description | Severity | Status | Evidence / comment | More info | Training | WAF pillar | Source checklist |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CARI-SEC-001 | Security | Identity and access | Document Entra ID tenant model, RBAC, PIM, managed identities, and break-glass access. | Required for WAF Security and ALZ identity review. | High | Not verified | | https://learn.microsoft.com/en-us/azure/well-architected/security/ | https://learn.microsoft.com/azure/cloud-adoption-framework/ready/landing-zone/design-area/identity-access-landing-zones | Security | CARI / WAF / ALZ |
| CARI-REL-001 | Reliability | HA and DR | Document availability zones, RTO/RPO, backup, failover, and resilience testing. | Required for WAF Reliability review. | High | Not verified | | https://learn.microsoft.com/en-us/azure/well-architected/reliability/ | https://learn.microsoft.com/en-us/azure/well-architected/reliability/principles | Reliability | CARI / WAF |
| CARI-OPS-001 | Operations | Monitoring and runbooks | Document IaC, CI/CD, monitoring, alerts, runbooks, change control, and support model. | Required for WAF Operational Excellence and CAF Manage. | Medium | Not verified | | https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/ | https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/manage/best-practices | Operational Excellence | CARI / WAF / CAF |
| CARI-ALZ-001 | CAF / ALZ Governance | Platform foundation | Document management groups, subscriptions, policies, RBAC, central logging, and network topology. | Required for Azure landing zone review. | High | Not verified | | https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/landing-zone/ | https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/landing-zone/design-areas | Security / Operational Excellence | CARI / ALZ |
| CARI-AI-001 | AI Landing Zone | AI workload controls | Document model architecture, grounding data, responsible AI, private networking, evaluation, and content safety. | Required when AI services, Foundry, agents, RAG, or model endpoints are in scope. | High | Not required | | https://learn.microsoft.com/en-us/azure/well-architected/ai/ | https://learn.microsoft.com/en-us/azure/architecture/ai-ml/architecture/baseline-microsoft-foundry-landing-zone | Security / Reliability / Cost / Performance | CARI / AI LZ |
| CARI-MIG-001 | Migration Readiness | Cutover and rollback | Document source inventory, assessment, migration waves, test migration, cutover, rollback, and validation. | Required when migration or cutover is in scope. | Medium | Not required | | https://learn.microsoft.com/en-us/azure/migration/migrate-to-azure | https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/plan-migration | Operational Excellence / Reliability | CARI / Migration |

## 1. Executive Summary

| Field | Response |
|---|---|
| Project name | |
| Customer / business unit | |
| Workload tier and criticality | |
| Target Azure regions | |
| Production date | |
| Decision requested from ARB | |
| Recommendation requested: Approved, Approved with Conditions, Needs Revision, Rejected | |
| Known risks, exceptions, or waivers | |

## 2. Business, Delivery, And Migration Context

Relevant Microsoft Learn:

- CAF Strategy: https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/strategy/
- CAF Plan: https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/plan/
- Migration plan: https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/plan-migration
- Cloud adoption plan template: https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/plan/migration-adoption-plan

Provide evidence for:

- Business outcome and success measures:
- Scope in and out:
- Migration, modernization, rebuild, or greenfield approach:
- Timeline and milestones:
- Dependencies:
- Delivery team, support team, and named owners:
- Cutover and rollback approach:
- Open delivery risks:

## 3. Architecture Overview

Relevant Microsoft Learn:

- Azure Architecture Center: https://learn.microsoft.com/en-us/azure/architecture/
- WAF overview: https://learn.microsoft.com/en-us/azure/well-architected/what-is-well-architected-framework
- WAF pillars: https://learn.microsoft.com/en-us/azure/well-architected/pillars

Attach the current architecture diagram and include:

- Azure services used:
- Data flows:
- Trust boundaries:
- Internet-facing endpoints:
- Integration points:
- Region and availability-zone placement:
- Environments: dev, test, stage, production:
- Major assumptions:

## 4. Azure Services Inventory

| Service | Purpose | Region | SKU / tier | HA setting | Data classification | Owner | Microsoft Learn reference |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

## 5. Security, Identity, And Access Evidence

Relevant Microsoft Learn:

- WAF Security pillar: https://learn.microsoft.com/en-us/azure/well-architected/security/
- Security design principles: https://learn.microsoft.com/en-us/azure/well-architected/security/principles
- CAF Secure: https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/secure/
- ALZ identity and access management: https://learn.microsoft.com/azure/cloud-adoption-framework/ready/landing-zone/design-area/identity-access-landing-zones

Provide evidence for:

- Microsoft Entra tenant model:
- RBAC role assignments:
- Privileged Identity Management:
- Managed identities:
- Break-glass access:
- Conditional Access / MFA:
- Service principals and credential rotation:
- Key Vault, secrets, certificates, and purge protection:
- Encryption at rest and in transit:
- Defender for Cloud and threat detection:

Attach: access matrix, identity diagram, role assignment export, PIM policy evidence, Key Vault design, security exception register.

## 6. Network And Perimeter Security Evidence

Relevant Microsoft Learn:

- Azure landing zone design areas: https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/landing-zone/design-areas
- Azure landing zone design principles: https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/landing-zone/design-principles
- Landing zone governance: https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/considerations/landing-zone-governance

Provide evidence for:

- Hub-spoke or Virtual WAN topology:
- Subnets, NSGs, route tables:
- Firewall, WAF, Application Gateway, Front Door, APIM:
- Private Endpoints and private DNS:
- Ingress and egress controls:
- TLS and certificate management:
- Connectivity subscription and DNS design:
- Internet-facing attack surface and mitigation:

Attach: network topology diagram, firewall rules, NSG summary, route table summary, private endpoint list, DNS zones, WAF/APIM policy evidence.

## 7. Reliability, Backup, And DR Evidence

Relevant Microsoft Learn:

- WAF Reliability pillar: https://learn.microsoft.com/en-us/azure/well-architected/reliability/
- Reliability principles: https://learn.microsoft.com/en-us/azure/well-architected/reliability/principles

Provide evidence for:

- Availability zones or explicit non-zone rationale:
- RTO and RPO:
- Backup policy:
- Failover design:
- Health probes and retry patterns:
- Dependency resilience:
- DR test or planned test:
- Known single points of failure:

Attach: HA/DR diagram, backup policy, runbook, failover test result, SLA/SLO table, recovery dependency map.

## 8. Operational Excellence Evidence

Relevant Microsoft Learn:

- WAF Operational Excellence pillar: https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/
- Operational Excellence principles: https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/principles
- CAF Manage: https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/manage/
- Azure operations best practices: https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/manage/best-practices

Provide evidence for:

- Infrastructure as Code: Bicep, Terraform, ARM, or equivalent:
- CI/CD pipeline:
- Monitoring and logging:
- Alert rules:
- Runbooks:
- Incident management:
- Change control, rollback, and drift management:
- Tagging strategy:
- Support model and escalation path:

Attach: repository path, pipeline screenshot/export, alert matrix, runbook links, Log Analytics design, change process, support RACI.

## 9. Cost Optimization Evidence

Relevant Microsoft Learn:

- WAF Cost Optimization pillar: https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/
- Cost design principles: https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/principles

Provide evidence for:

- Azure pricing calculator estimate:
- SKU and capacity rationale:
- Autoscale design:
- Reservations / savings plan assumptions:
- Budget and cost alerts:
- Environment shutdown or scale-down policy:
- Cost owner:

Attach: pricing export, capacity worksheet, budget policy, cost optimization assumptions, forecast and variance plan.

## 10. Performance Efficiency Evidence

Relevant Microsoft Learn:

- WAF Performance Efficiency pillar: https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/
- Performance design principles: https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/principles

Provide evidence for:

- Expected users / transactions / data volume:
- Peak load:
- Latency targets:
- Scale-out behavior:
- Caching and CDN:
- Async processing:
- Load test results or test plan:
- Capacity constraints:

Attach: NFR table, load test report, capacity model, performance risk log.

## 11. CAF And Azure Landing Zone Evidence

Relevant Microsoft Learn:

- CAF Ready: https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/
- Azure landing zones: https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/landing-zone/
- ALZ design principles: https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/landing-zone/design-principles
- ALZ design areas: https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/landing-zone/design-areas
- Platform landing zone implementation options: https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/enterprise-scale/
- Keep landing zone up to date: https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/landing-zone/design-area/keep-azure-landing-zone-up-to-date

Provide evidence for:

- Management group hierarchy:
- Subscription model and vending:
- Azure Policy assignments:
- RBAC model:
- Central logging:
- Connectivity subscription:
- Identity subscription:
- Platform and application landing zone boundaries:
- Governance exceptions:
- Landing zone update process:

Attach: ALZ diagram, management group export, policy assignment list, subscription map, governance exception register.

## 12. AI Landing Zone And AI Workload Evidence

Relevant Microsoft Learn:

- CAF AI adoption: https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ai/
- Azure Architecture Center AI and ML: https://learn.microsoft.com/en-us/azure/architecture/ai-ml/
- Microsoft Foundry chat baseline architecture: https://learn.microsoft.com/en-us/azure/architecture/ai-ml/architecture/baseline-microsoft-foundry-chat
- Microsoft Foundry chat baseline in Azure landing zone: https://learn.microsoft.com/en-us/azure/architecture/ai-ml/architecture/baseline-microsoft-foundry-landing-zone
- WAF AI workload guidance: https://learn.microsoft.com/en-us/azure/well-architected/ai/
- RAG design and evaluation: https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/rag/rag-solution-design-and-evaluation-guide
- AI agent orchestration patterns: https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns

Complete this section when the workload includes Azure AI, Foundry, agents, RAG, model endpoints, or AI landing-zone scope.

Provide evidence for:

- Model and deployment architecture:
- Data grounding sources:
- Prompt, orchestration, and agent design:
- Responsible AI controls:
- Content safety and abuse monitoring:
- Private networking for AI services:
- Evaluation plan and quality metrics:
- Data retention and privacy model:
- Cost and token management:

Attach: AI architecture diagram, model inventory, RAG evaluation plan, content safety configuration, private endpoint design, evaluation results.

## 13. Migration Runbook And Cutover Evidence

Relevant Microsoft Learn:

- Azure migration overview: https://learn.microsoft.com/en-us/azure/migration/migrate-to-azure
- Azure Migrate: https://learn.microsoft.com/en-us/azure/migrate/
- Assessment prerequisites: https://learn.microsoft.com/en-us/azure/migrate/assessment-prerequisites
- Prepare machines for migration: https://learn.microsoft.com/en-us/azure/migrate/prepare-for-migration
- Assess workloads: https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/assess/
- Prepare workloads: https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/deploy/index
- Execute migration to cloud: https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/release/complete-migration
- Cutover guidance: https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/relocate/cutover

Complete this section when the review includes migration or cutover.

Provide evidence for:

- Source estate inventory:
- Migration method:
- Dependency mapping:
- Readiness assessment:
- Test migration:
- Cutover plan:
- Rollback plan:
- Business validation:
- Hypercare plan:

Attach: Azure Migrate assessment, migration wave plan, runbook, validation checklist, rollback checklist, stakeholder approval.

## 14. Requirements Traceability

| Requirement | Evidence location | Microsoft framework | Owner | Status | Notes |
|---|---|---|---|---|---|
| | | WAF / CAF / ALZ / AI / Migration | | Missing / Partial / Ready | |

## 15. Open Risks, Exceptions, And Decisions

| Item | Type | Impact | Owner | Decision needed | Due date |
|---|---|---|---|---|---|
| | Risk / Exception / Decision | | | | |

## 16. Evidence Appendix

List every supporting artifact included in the package.

| Artifact | Type | What it proves | Related review area | Microsoft Learn reference |
|---|---|---|---|---|
| | | | | |
