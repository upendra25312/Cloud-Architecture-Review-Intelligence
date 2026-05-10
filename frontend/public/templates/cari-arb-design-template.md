# CARI ARB Design Document Template

Use this template when preparing a design package for Cloud Architecture Review Intelligence. Replace every prompt with project-specific evidence. Attach diagrams, exports, screenshots, IaC, and runbooks where noted.

## 1. Executive Summary

- Project name:
- Customer / business unit:
- Workload tier and criticality:
- Target regions:
- Production date:
- Decision requested from ARB:
- Known risks, exceptions, or waivers:

## 2. Business And Delivery Requirements

- Business outcome:
- Scope in / out:
- Key non-functional requirements:
- Timeline and milestones:
- Dependencies:
- Delivery team, support team, and named owners:
- Migration or greenfield approach:

## 3. Architecture Overview

Attach the current architecture diagram and include:

- Azure services used:
- Data flows:
- Trust boundaries:
- Internet-facing endpoints:
- Integration points:
- Region and availability-zone placement:
- Environments: dev, test, stage, production:

## 4. Azure Services Inventory

| Service | Purpose | Region | SKU / Tier | HA setting | Owner | Notes |
|---|---|---|---|---|---|---|
| | | | | | | |

## 5. Identity And Access Evidence

Provide evidence for:

- Microsoft Entra tenant model:
- RBAC role assignments:
- Privileged Identity Management:
- Managed identities:
- Break-glass access:
- Conditional Access / MFA:
- Service principals and credential rotation:

Attach: access matrix, identity diagram, role assignment export, PIM policy evidence.

## 6. Network And Security Evidence

Provide evidence for:

- Hub-spoke or Virtual WAN topology:
- Subnets, NSGs, route tables:
- Firewall, WAF, Application Gateway, Front Door, APIM:
- Private Endpoints and private DNS:
- Ingress and egress controls:
- TLS and certificate management:
- Key Vault, secrets, and encryption:
- Defender for Cloud and threat detection:

Attach: network diagram, firewall rules, NSG summary, private endpoint list, Key Vault design.

## 7. Reliability, Backup, And DR Evidence

Provide evidence for:

- Availability zones or explicit non-zone rationale:
- RTO and RPO:
- Backup policy:
- Failover design:
- Health probes and retry patterns:
- Dependency resilience:
- DR test or planned test:

Attach: HA/DR diagram, backup policy, runbook, failover test result, SLA/SLO table.

## 8. Operations Evidence

Provide evidence for:

- Infrastructure as Code: Bicep, Terraform, ARM, or equivalent:
- CI/CD pipeline:
- Monitoring and logging:
- Alert rules:
- Runbooks:
- Incident management:
- Tagging strategy:
- Support model and escalation path:

Attach: repository path, pipeline screenshot/export, alert matrix, runbook links, Log Analytics design.

## 9. Cost Evidence

Provide evidence for:

- Azure pricing calculator estimate:
- SKU and capacity rationale:
- Autoscale design:
- Reservations / savings plan assumptions:
- Budget and cost alerts:
- Cost owner:

Attach: pricing export, capacity worksheet, budget policy, cost optimization assumptions.

## 10. Performance Evidence

Provide evidence for:

- Expected users / transactions / data volume:
- Peak load:
- Latency targets:
- Scale-out behavior:
- Caching and CDN:
- Async processing:
- Load test results or test plan:

Attach: NFR table, load test report, capacity model, performance risk log.

## 11. CAF And Azure Landing Zone Evidence

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

Attach: ALZ diagram, management group export, policy assignment list, subscription map.

## 12. Requirements Traceability

| Requirement | Evidence location | Owner | Status | Notes |
|---|---|---|---|---|
| | | | | |

## 13. Open Risks, Exceptions, And Decisions

| Item | Type | Impact | Owner | Decision needed | Due date |
|---|---|---|---|---|---|
| | Risk / Exception / Decision | | | | |

## 14. Evidence Appendix

List every supporting artifact included in the package.

| Artifact | Type | What it proves | Related review area |
|---|---|---|---|
| | | | |
