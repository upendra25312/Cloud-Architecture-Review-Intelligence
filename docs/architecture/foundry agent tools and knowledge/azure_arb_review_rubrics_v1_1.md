# Azure ARB Review Rubrics v1.1

## Purpose

This document defines the scoring rubric used by the Azure Architecture Review Board (ARB) agent and human reviewers to evaluate architecture submissions. Every domain score, recommendation, and critical blocker decision must trace back to these rubrics.

---

## Scoring Domains and Weights

| Domain | Weight | Primary Framework Mapping |
|---|---:|---|
| Requirements Coverage | 20% | WAF: All pillars |
| Security | 20% | WAF: Security, ALZ: Security baseline |
| Reliability and Resilience | 15% | WAF: Reliability, ALZ: Management |
| Operational Excellence | 10% | WAF: Operational Excellence, CAF: Manage |
| Cost Optimization | 10% | WAF: Cost Optimization, CAF: Plan |
| Performance Efficiency | 10% | WAF: Performance Efficiency |
| Governance / Platform Alignment | 10% | CAF: Govern, ALZ: Policy, CAF: Ready |
| Documentation Completeness | 5% | Internal |

**Total weight: 100%. Overall score = weighted sum of domain scores (0-100 per domain).**

---

## Decision Bands

| Overall Score | Recommendation |
|---|---|
| 90 - 100 | ARB Approved |
| 75 - 89 | Approved with Conditions |
| 50 - 74 | Needs Improvement |
| Below 50 | Not Ready For Review |

**Critical blocker override:** Any unresolved critical blocker forces the recommendation to `Needs Revision` or `Rejected` regardless of numeric score.

---

## Domain Rubrics

### 1. Requirements Coverage (20%)

**What it measures:** Alignment between the stated requirements (SOW, engagement scope, client constraints) and the design evidence submitted.

| Score Band | Criteria |
|---|---|
| 90-100 | All stated requirements are addressed explicitly in design evidence. Traceability is clear. |
| 70-89 | Most requirements addressed. Minor gaps that are low risk. |
| 50-69 | Significant requirements are unaddressed or only partially covered. |
| Below 50 | Core requirements are absent from the design or contradicted by the evidence. |

**Common failures:**
- Compliance requirement stated but no control design evidence
- Customer data residency requirement but no region justification
- Scalability targets stated but no capacity model

---

### 2. Security (20%)

**What it measures:** Identity model, network controls, secrets management, boundary protection, encryption, and threat detection.

| Score Band | Criteria |
|---|---|
| 90-100 | Identity model (Entra ID, RBAC, managed identity, PIM) fully described. No public exposure without WAF/Firewall. Secrets in Key Vault. Encryption at rest and in transit. Defender for Cloud in scope. |
| 70-89 | Most controls described. Minor gaps (e.g. incomplete RBAC, no Defender plan stated). |
| 50-69 | Notable gaps: missing identity design OR no boundary control OR secrets not managed. |
| Below 50 | Multiple critical security gaps. Internet-facing with no controls. No identity model. |

**Critical blockers (set criticalBlocker: true):**
- Internet-facing design with no WAF, NSG, APIM, or Firewall
- No identity model described (no Entra ID, no managed identity, no RBAC)
- Secrets stored in config/plaintext (no Key Vault)
- Regulated data with no encryption at rest

**WAF reference:** https://learn.microsoft.com/azure/well-architected/security/

---

### 3. Reliability and Resilience (15%)

**What it measures:** HA design, DR strategy, backup, RTO/RPO commitments, and recovery patterns.

| Score Band | Criteria |
|---|---|
| 90-100 | Redundancy zones/regions specified. RTO/RPO defined and matched to recovery pattern. Backup policy documented. DR runbook exists. |
| 70-89 | HA design present. Some DR gaps (e.g. no DR runbook, RTO stated but no test evidence). |
| 50-69 | Partial HA. Missing backup strategy or DR plan for production data. |
| Below 50 | Production workload with no HA, no backup, no DR. Single point of failure not addressed. |

**Critical blockers:**
- Production workload with no backup or snapshot strategy
- No DR region or recovery pattern for a stated RTO/RPO requirement

**WAF reference:** https://learn.microsoft.com/azure/well-architected/reliability/

---

### 4. Operational Excellence (10%)

**What it measures:** Monitoring, alerting, runbooks, IaC, CI/CD, observability, and supportability.

| Score Band | Criteria |
|---|---|
| 90-100 | Azure Monitor + Log Analytics + Application Insights configured. Alert rules defined. Runbooks documented. IaC (Bicep/Terraform) used. CI/CD pipeline defined. |
| 70-89 | Monitoring present, minor gaps (e.g. no runbooks, IaC partial). |
| 50-69 | Monitoring not described for production. No IaC or manual deployment only. |
| Below 50 | No monitoring, no alerting, no operational ownership. |

**WAF reference:** https://learn.microsoft.com/azure/well-architected/operational-excellence/

---

### 5. Cost Optimization (10%)

**What it measures:** Sizing rationale, FinOps controls, cost assumptions, reserved capacity, and cost guardrails.

| Score Band | Criteria |
|---|---|
| 90-100 | Cost estimate provided with assumptions. Reserved instances or Savings Plans evaluated. Budget alerts configured. Right-sizing rationale documented. |
| 70-89 | Cost estimate exists. Some FinOps controls missing. |
| 50-69 | SKUs selected with no sizing rationale. No budget alerts. |
| Below 50 | No cost consideration. Arbitrary sizing. No FinOps controls. |

**WAF reference:** https://learn.microsoft.com/azure/well-architected/cost-optimization/

---

### 6. Performance Efficiency (10%)

**What it measures:** Service SKU fit, scaling model, caching, load distribution, bottleneck awareness.

| Score Band | Criteria |
|---|---|
| 90-100 | SKUs justified against load profile. Autoscale configured. CDN/Redis for appropriate workloads. Load testing evidence or load model provided. |
| 70-89 | Service choices reasonable. Some gaps (no autoscale, no load test). |
| 50-69 | SKU choices not justified. No scaling strategy. |
| Below 50 | Fixed-size monolith with no scaling consideration. |

**WAF reference:** https://learn.microsoft.com/azure/well-architected/performance-efficiency/

---

### 7. Governance / Platform Alignment (10%)

**What it measures:** Landing zone alignment, management group hierarchy, Azure Policy assignments, subscription vending, compliance framework mapping.

| Score Band | Criteria |
|---|---|
| 90-100 | ALZ or equivalent landing zone described. Management group hierarchy defined. Azure Policy assignments documented. RBAC model at subscription level. Compliance mapped to policy initiatives. |
| 70-89 | Subscription design present. Some governance gaps (no policy list, partial RBAC). |
| 50-69 | No landing zone. Governance assumed but not documented. |
| Below 50 | No governance design. No policy. No RBAC. Compliance requirement unstated. |

**CAF reference:** https://learn.microsoft.com/azure/cloud-adoption-framework/ready/landing-zone/

---

### 8. Documentation Completeness (5%)

**What it measures:** Evidence package completeness — whether enough artefacts are present for a fair review.

| Score Band | Criteria |
|---|---|
| 90-100 | Solution design, architecture diagram, SOW/requirements, IaC or equivalent. |
| 70-89 | Most artefacts present. Minor gaps. |
| 50-69 | Key artefact missing (e.g. no architecture diagram). |
| Below 50 | Minimal evidence. Unable to assess one or more domains fairly. |

**Critical blocker:** If evidence is so thin that no domain can be fairly assessed, set criticalBlocker: true on DOC-002.

---

## Reviewer Override Rules

Human reviewers may override the AI recommendation if:
- They have information not available in the submitted documents
- The AI mis-weighted a domain due to ambiguous evidence
- Business context changes the risk profile

All overrides must include a written rationale and are stored separately from the model output.

---

## Version History

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-04-10 | Initial scoring model |
| 1.1 | 2026-05-08 | Aligned to deterministic rules catalog; added domain rubric bands |
