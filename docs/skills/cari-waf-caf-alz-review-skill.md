# CARI WAF / CAF / ALZ Review Skill Specification

_Design spec — Mode B output, 2026-05-26. See `.claude/skills/cari-waf-caf-alz-review/SKILL.md` for the Claude Code skill._

---

## Purpose

Support Azure architecture review against the Well-Architected Framework (WAF), Cloud Adoption Framework (CAF), and Azure Landing Zone (ALZ) patterns. Ensure CARI findings are mapped to the correct framework pillar, domain, and governance control.

---

## Trigger Conditions

- Implementing or reviewing ARB agent system instructions
- Adding or updating deterministic governance rules in `api/data/arb-rules/`
- Reviewing scorecard logic against WAF pillar weights
- Investigating incorrect framework mapping in findings
- Creating new WAF/CAF/ALZ eval cases

---

## WAF Pillars Coverage

| Pillar | CARI finding domain | Key checks |
|---|---|---|
| Reliability | Reliability | DR, HA, RTO/RPO, zone redundancy, circuit breaker, retry policy |
| Security | Security | Identity, RBAC, network isolation, encryption, threat detection |
| Cost Optimization | Cost | Right-sizing, RI/Savings Plan, idle resources, storage tiering |
| Operational Excellence | Operations | Monitoring, alerting, patch management, runbooks, change control |
| Performance Efficiency | Performance | Scaling, caching, CDN, latency budgets, load testing |

---

## CAF Phases Coverage

| Phase | Relevance |
|---|---|
| Strategy | Scoping and business justification in SOW review |
| Plan | Landing zone design assessment |
| Ready | ALZ topology: hub-spoke vs Virtual WAN, subscription model |
| Adopt | Workload deployment patterns |
| Govern | Policy, RBAC, management groups, tagging |
| Manage | Operations, monitoring, support model |

---

## ALZ Domains Coverage

| Domain | Key checks |
|---|---|
| Management groups | Correct hierarchy: Root → Platform → Landing Zones → Sandboxes |
| Subscriptions | Subscription vending, purpose separation |
| Identity | Azure AD / Entra ID, MFA, PIM, Conditional Access |
| RBAC | Least privilege, custom roles, no standing Owner assignments |
| Policy | Azure Policy at management group scope, deny effects |
| Hub-spoke / Virtual WAN | Hub design, peering, forced tunneling, UDR |
| Private DNS | Private DNS zones in connectivity subscription, DNS resolver |
| Logging | Centralized Log Analytics workspace, diagnostic settings |
| Defender for Cloud | MDC enabled, regulatory compliance dashboard |

---

## Inputs

- Customer architecture evidence (diagrams, SOW, inventory spreadsheets)
- Extracted evidence facts from CARI extraction pipeline
- Microsoft Learn MCP grounding results (WAF/CAF/ALZ guidance)
- Deterministic rules from `api/data/arb-rules/`

---

## Process

1. **Domain classification:** Assign each finding to a WAF pillar + CAF phase + ALZ domain where applicable
2. **Rule evaluation:** Run deterministic rules engine before agent — flag known patterns (missing hub, no MDC, no DR subscription)
3. **Agent grounding:** Provide WAF/CAF/ALZ context from MCP in agent system instructions
4. **Scorecard calculation:** Weight findings by pillar; surface `criticalBlockerCount` before scoring
5. **Critical blocker override:** Any Critical finding in Security or Reliability is a blocker regardless of overall score
6. **Framework citation:** Every finding must cite the correct WAF pillar or CAF/ALZ reference via `learnMoreUrl`

---

## Outputs

- Finding with `domain`, `framework` (`WAF|CAF|ALZ`), `frameworkPillar` fields populated
- `criticalBlocker: true` for Critical/High Security and Reliability findings without remediation evidence
- Scorecard with pillar breakdown
- `learnMoreUrl` pointing to correct WAF/CAF/ALZ MS Learn page

---

## CARI Runtime Mapping

| Step | File |
|---|---|
| Deterministic rules | `api/data/arb-rules/*.json` |
| Scorecard logic | `api/src/shared/arb-scoring.js` |
| Agent system instructions | Foundry ARB agent (Azure AI Foundry) |
| Board-pack output | `api/src/shared/arb-pptx-export.js` |
| Eval rubric | `evals/rubrics/cari_review_quality_rubric.md` |
| MCP grounding | `api/src/shared/fetchMicrosoftLearnGrounding.js` |

---

## Guardrails

- Never mix WAF pillars in a single finding — one pillar per finding
- Never mark a finding `criticalBlocker: true` for Cost or Performance findings without a blocking security/reliability evidence basis
- Never generate a critical ALZ finding without direct evidence of the ALZ control being absent (not just assumed)
- Do not recommend ALZ topology changes (hub-spoke vs Virtual WAN) without seeing network architecture evidence
- Always provide `learnMoreUrl` — never invent MS Learn URLs

---

## Examples

**Valid:** Missing Private DNS zone in connectivity subscription → `domain: "Security"`, `framework: "ALZ"`, `criticalBlocker: false`  
**Valid:** No MDC regulatory compliance policy assigned → `domain: "Security"`, `framework: "ALZ"`, `criticalBlocker: true` (blocks ARB approval)  
**Invalid:** No evidence of VNet topology → do not generate hub-spoke finding at High confidence  
**Valid:** DR plan missing, RTO/RPO undefined → `domain: "Reliability"`, `framework: "WAF"`, `frameworkPillar: "Reliability"`

---

## Acceptance Criteria

- [ ] All findings in eval dataset have correct `domain` and `frameworkPillar`
- [ ] Critical blockers only appear on Security and Reliability findings with direct evidence
- [ ] `learnMoreUrl` maps to correct WAF/CAF/ALZ page (not generic Azure home)
- [ ] Deterministic rules fire before agent — no duplicate findings
- [ ] Scorecard pillar breakdown visible in PPTX export and frontend scorecard

---

## Risks

- CAF/ALZ guidance evolves — MCP results should be treated as current but may drift from latest ALZ design principles
- Deterministic rules must be versioned (`rulesVersion` in telemetry) to detect drift
- Over-reliance on ALZ patterns may penalise intentional deviations with documented justification — reviewer must have ability to record exceptions
