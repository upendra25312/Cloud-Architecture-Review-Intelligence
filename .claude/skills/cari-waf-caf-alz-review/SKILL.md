# cari-waf-caf-alz-review

## Purpose

Support CARI ARB reviews against the Azure Well-Architected Framework (WAF), Cloud Adoption Framework (CAF), and Azure Landing Zone (ALZ) reference architecture. Ensure findings are correctly classified by pillar, critical blockers are calibrated against WAF Security and Reliability, and scorecard weights reflect the correct framework mapping.

## When to Use

- Implementing or reviewing ARB agent system instructions and grounding context
- Adding or updating deterministic rules in `api/data/arb-rules/`
- Investigating incorrect domain or pillar assignment on a finding
- Reviewing scorecard logic for WAF pillar weights
- Creating new WAF/CAF/ALZ eval cases

## When Not to Use

- Reviewing customer code or application architecture (CARI reviews cloud infrastructure, not application code)
- Replacing the Foundry ARB agent — this skill informs the agent configuration
- Recommending ALZ topology changes (hub-spoke vs Virtual WAN) without network architecture evidence from the customer

## Inputs

- Customer architecture evidence (SOW, network diagrams, inventory spreadsheets)
- Extracted evidence facts (post-extraction)
- Microsoft Learn MCP grounding (WAF/CAF/ALZ guidance pages)
- Deterministic rules from `api/data/arb-rules/`

## Process

1. Classify each finding: assign `domain`, `framework` (`WAF|CAF|ALZ`), `frameworkPillar`
2. Run deterministic rules engine before agent to flag known ALZ control gaps (no hub, no MDC, no Private DNS)
3. Apply WAF pillar scoring weights to scorecard
4. Apply critical blocker override: any Critical finding in Security or Reliability is a blocker regardless of overall score
5. Provide WAF/CAF/ALZ context from MS Learn MCP to agent as grounding
6. Map `learnMoreUrl` to correct WAF/CAF/ALZ MS Learn page for each finding

## WAF Pillar → CARI Domain Mapping

| WAF Pillar | CARI domain | Critical blocker eligible |
|---|---|---|
| Reliability | Reliability | Yes |
| Security | Security | Yes |
| Cost Optimization | Cost | No |
| Operational Excellence | Operations | No |
| Performance Efficiency | Performance | No |

## ALZ Key Checks

| Control | Absence triggers |
|---|---|
| Management group hierarchy | High finding, Governance domain |
| Azure Policy at MG scope | High finding, Governance domain |
| MDC regulatory compliance | Critical blocker, Security domain |
| Private DNS in connectivity sub | High finding, Security domain |
| Centralized Log Analytics | High finding, Operations domain |
| PIM for privileged roles | Critical blocker, Security domain |
| Zone-redundant deployment | High finding, Reliability domain |

## Outputs

- Finding with `domain`, `framework`, `frameworkPillar` fields populated
- `criticalBlocker: true` for Critical/High Security and Reliability findings without remediation evidence
- Scorecard with WAF pillar breakdown
- `learnMoreUrl` pointing to correct WAF/CAF/ALZ MS Learn page (not generic Azure home)

## CARI Runtime Mapping

| Component | File |
|---|---|
| Deterministic rules | `api/data/arb-rules/*.json` |
| Scorecard logic | `api/src/shared/arb-scoring.js` |
| Foundry ARB agent instructions | Azure AI Foundry (model-router deployment) |
| Board-pack export | `api/src/shared/arb-pptx-export.js` |
| Eval rubric | `evals/rubrics/cari_review_quality_rubric.md` |
| MCP grounding | `api/src/shared/fetchMicrosoftLearnGrounding.js` |

## Guardrails

- NEVER mix WAF pillars in a single finding — one pillar per finding
- NEVER mark a finding `criticalBlocker: true` for Cost or Performance findings without a security/reliability evidence basis
- NEVER generate an ALZ finding without direct evidence that the ALZ control is absent
- NEVER recommend hub-spoke vs Virtual WAN without network architecture evidence from the customer
- ALWAYS provide `learnMoreUrl` — never invent MS Learn URLs
- Deterministic rules fire BEFORE the agent — agent must not re-generate a finding already covered by a deterministic rule

## Examples

```
Valid:   No MDC regulatory compliance policy → Security, ALZ, criticalBlocker: true
Valid:   No Private DNS zone in connectivity sub → Security, ALZ, criticalBlocker: false, High
Valid:   RTO/RPO undefined → Reliability, WAF, criticalBlocker: true (blocking if no DR plan evidence)
Invalid: No VNet diagram evidence → do not generate hub-spoke finding at High confidence
Invalid: Cost finding → criticalBlocker: true (cost findings are never blockers)
```

## Acceptance Criteria

- All findings in eval dataset have correct `domain` and `frameworkPillar`
- Critical blockers only appear on Security and Reliability findings with direct evidence
- `learnMoreUrl` maps to correct WAF/CAF/ALZ page (not generic Azure.com)
- Deterministic rules fire before agent — no duplicate findings for same control gap
- Scorecard pillar breakdown visible in PPTX export references slide and frontend scorecard
- `rulesVersion` logged in telemetry for every ARB agent run
