# cari-finops

## Purpose

Add FinOps review support to CARI ARB findings. Enable CARI to surface Azure cost optimization findings grounded in customer evidence — right-sizing, Reserved Instances, Azure Hybrid Benefit, storage tiering, idle resources, and AI service cost impact. All FinOps findings must be evidence-grounded; never invent savings numbers.

## When to Use

- Adding FinOps findings to the ARB agent domain model
- Creating new deterministic rules for cost optimization patterns
- Reviewing scorecard Cost pillar weighting
- Adding FinOps eval cases to the eval dataset
- Reviewing board-pack cost section content

## When Not to Use

- Making pricing API calls without explicit cost management integration approved
- Generating specific savings estimates without customer workload evidence (CPU utilization, reserved capacity data)
- Replacing the WAF Cost Optimization pillar — FinOps findings map INTO the Cost pillar

## FinOps Finding Areas

| Area | Evidence needed | Confidence without evidence |
|---|---|---|
| Right-sizing (over-provisioned VMs) | CPU/memory utilization data (monitoring export) | Low |
| Reserved Instances / Savings Plans | Current VM SKU inventory + usage pattern | Medium (RI list sufficient) |
| Azure Hybrid Benefit | On-premises license inventory | Medium (HB flag in ARM export) |
| Storage tiering (hot vs cool vs archive) | Blob access pattern data | Low without access logs |
| Idle resources (unused NICs, IPs, disks) | Azure Advisor export or inventory | High if in inventory |
| DR cost impact | DR architecture evidence + region pricing | Low without DR design |
| AI service cost (Document Intelligence, AI Search) | Usage volume data | Low without volume evidence |
| Logging cost (Log Analytics ingestion) | Workspace daily ingestion volume | Medium if workspace config visible |

## Inputs

- Customer inventory spreadsheets (VM SKU, storage tiers, licensing)
- Azure Advisor export (if provided)
- Architecture diagrams (for idle resource pattern detection)
- Extracted evidence facts from CARI extraction pipeline

## Process

1. Identify FinOps-relevant evidence in extracted facts (VM SKU list, utilization data, license inventory)
2. Map to FinOps finding area (right-sizing, RI, HB, etc.)
3. Assign `domain: "Cost"`, `framework: "WAF"`, `frameworkPillar: "Cost Optimization"`
4. Set confidence based on evidence strength (see table above)
5. Never generate savings estimates without utilization or capacity data — use `missingEvidence` instead
6. `criticalBlocker` must always be `false` for Cost findings (cost is never an ARB blocker by default)
7. Reference `learnMoreUrl` from MS Learn MCP: WAF Cost pillar or Azure Cost Management

## Outputs

- FinOps findings in ARB JSON with `domain: "Cost"`, `frameworkPillar: "Cost Optimization"`
- `recommendation` includes specific Azure cost optimization action
- `evidenceBasis` explains what cost evidence was found (or why confidence is Low)
- `learnMoreUrl` points to WAF Cost Optimization or Azure Cost Management MS Learn page
- No invented savings numbers

## CARI Runtime Mapping

| Component | File |
|---|---|
| Cost domain rules | `api/data/arb-rules/` (add `cost-optimization-rules.json`) |
| Scorecard Cost pillar | `api/src/shared/arb-scoring.js` |
| Board-pack cost section | `api/src/shared/arb-pptx-export.js` |
| FinOps eval cases | `evals/datasets/cari_arb_baseline_extended.jsonl` |
| MCP grounding | `api/src/shared/fetchMicrosoftLearnGrounding.js` — Cost domain fallback |

## Guardrails

- NEVER invent savings estimates (e.g., "save $50k/month") without utilization or reservation data in customer evidence
- NEVER mark a FinOps finding `criticalBlocker: true` — cost findings are advisory, not blockers
- NEVER generate a right-sizing finding without CPU/memory utilization evidence
- NEVER recommend a specific RI term length without knowing the customer's workload stability
- Do NOT use pricing APIs without explicit integration approval — use MS Learn cost guidance instead

## Acceptance Criteria

- FinOps findings appear in `domain: "Cost"` section of eval output when cost evidence is present
- Zero savings estimates appear without supporting utilization data in evidence
- All FinOps findings have `criticalBlocker: false`
- `learnMoreUrl` points to WAF Cost Optimization MS Learn page
- Low confidence set when cost evidence is absent (inventory spreadsheet not uploaded)
- Board-pack cost section populated from FinOps findings (not a blank slide)

## Implementation Status

FinOps findings are currently a backlog item (N9 in `docs/CARI_IMPLEMENTATION_BACKLOG.md`). This SKILL.md documents the design contract. No `cost-optimization-rules.json` exists yet — create it before adding FinOps findings to the agent.
