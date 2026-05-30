# CARI — Azure AI Foundry Agents API Migration Plan

**Document type:** Technical Migration Plan  
**Status:** Draft — Awaiting sign-off  
**Version:** 1.0  
**Date:** 2026-05-28  
**Last audit:** 2026-05-28 20:53 IST  
**Scheduled implementation start:** 2026-05-29 10:00 AM IST  
**Owner:** CARI Engineering Team  
**Live site:** https://thankful-pond-04383960f.7.azurestaticapps.net  
**Subscription:** 87cf2b93-5e52-4533-9e6b-7182cd7dbde6 | rg-arb-review-prod  

**Expert team authoring this plan:**
- Microsoft Expert Azure Cloud Architect
- Senior Project Manager / GitHub Expert
- Azure AI Architect
- Full-Stack Developer
- Senior Director, Cloud Solutions Architecture at Microsoft

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Why Migrate](#2-why-migrate)
3. [Current State Architecture](#3-current-state-architecture)
4. [Target State Architecture](#4-target-state-architecture)
5. [Risk Assessment](#5-risk-assessment)
6. [Backup and Rollback Strategy](#6-backup-and-rollback-strategy)
7. [Migration Phases](#7-migration-phases)
8. [Phase 1 — Telemetry Bridge](#8-phase-1--telemetry-bridge)
9. [Phase 2 — Synthesis Call Migration](#9-phase-2--synthesis-call-migration)
10. [Phase 3 — Full Fan-Out Migration](#10-phase-3--full-fan-out-migration)
11. [Quality Gate Preservation](#11-quality-gate-preservation)
12. [Feature Flag Strategy](#12-feature-flag-strategy)
13. [Testing Strategy](#13-testing-strategy)
14. [Deployment and CI/CD](#14-deployment-and-cicd)
15. [Monitoring During Migration](#15-monitoring-during-migration)
16. [Cost Impact](#16-cost-impact)
17. [Acceptance Criteria](#17-acceptance-criteria)
18. [Decision Log](#18-decision-log)
19. [Migration Dependency Register](#19-migration-dependency-register)
20. [Automated Browser Validation Plan](#20-automated-browser-validation-plan)
21. [Critical Handling Plan and PDCA Execution Model](#21-critical-handling-plan-and-pdca-execution-model)
22. [Live Migration Tracker and Resume Log](#22-live-migration-tracker-and-resume-log)
23. [Migration Control Dashboard](#23-migration-control-dashboard)
24. [Production Runbooks](#24-production-runbooks)
25. [RACI and Approval Matrix](#25-raci-and-approval-matrix)
26. [Data Protection and Logging Policy](#26-data-protection-and-logging-policy)
27. [Failure Injection and Recovery Drills](#27-failure-injection-and-recovery-drills)
28. [Shadow-Run Comparison Method](#28-shadow-run-comparison-method)
29. [Change Freeze and Roll-Forward Rules](#29-change-freeze-and-roll-forward-rules)
30. [Future Roadmap: Multi-Cloud MCP Integration (AWS and GCP)](#30-future-roadmap-multi-cloud-mcp-integration-aws-and-gcp)

---

## 1. Executive Summary

CARI currently invokes Azure AI models via direct Chat Completions API calls, bypassing the Azure AI Foundry Agent runtime for the production review path. The `cari-arb-review-agent` exists in the Foundry portal as a configuration reference (`FOUNDRY_AGENT_NAME=cari-arb-review-agent`, `FOUNDRY_AGENT_VERSION=7`) and the code already contains a low-level `foundryResponsesAgentRequest()` helper, but `runArbAgentReview()` does not call it for reviews.

This plan migrates CARI to invoke `cari-arb-review-agent` through Azure AI Foundry agent references in the Responses API in three phases. Each phase is independently deployable and reversible via feature flags. The live production site must remain fully operational throughout.

### 1.1 Verified Audit Baseline

Audit performed against the local repo at `C:\cari-repo`, public GitHub repository `upendra25312/Cloud-Architecture-Review-Intelligence`, live site `https://thankful-pond-04383960f.7.azurestaticapps.net`, and Azure subscription `87cf2b93-5e52-4533-9e6b-7182cd7dbde6`.

| Area | Verified finding | Plan impact |
|---|---|---|
| Live site | Site is reachable and redirects to `/arb`; public content shows CARI v0.1.0 | Keep zero-downtime requirement |
| API health | `https://func-arb-review-api-flex.azurewebsites.net/api/health` returns `Healthy` | Use as required smoke test for each phase |
| Function App | `func-arb-review-api-flex` is Linux Flex Consumption with system-assigned managed identity | Deployment slots are not available; rollback must be flag or redeploy |
| Static Web App | `stapp-arb-review-prod`, Standard SKU, default host `thankful-pond-04383960f.7.azurestaticapps.net` | Live-site mapping is correct |
| Foundry endpoint | `https://ai-arb-review-prod.services.ai.azure.com/api/projects/arb-review-proj` | Use project endpoint for agent-reference calls |
| Agent settings | `FOUNDRY_AGENT_NAME=cari-arb-review-agent`, `FOUNDRY_AGENT_VERSION=7`, `FOUNDRY_AGENT_ID` Key Vault reference | Preserve versioned agent reference during migration |
| Portal agent configuration | Version `7`, model `model-router`, instructions configured in Foundry portal, tools include File Search and Microsoft Learn MCP | Treat portal configuration as production contract; do not assume code prompt and portal prompt are identical |
| Portal tools | File Search with `cari-knowledge-store` (~29.57 KB) and MCP server `microsoft_learn` at `https://learn.microsoft.com/api/mcp` | Phase 3 can rely on native tool use only after tool-call traces are validated |
| Cost baseline | Month-to-date cost for `rg-arb-review-prod` on 2026-05-28 is ~₹3,734 (~$39); projected month-end is ~$43-45 at recent USD/INR rates | Preserve a hard $60/month ceiling; avoid preview features that add recurring model/embedding/search cost |
| Current flag state | `USE_DURABLE_ORCHESTRATION=ON`; `USE_AGENTS_API` is not set | Add `USE_AGENTS_API=off` before merge for explicit baseline |
| Model deployments | `model-router` capacity 120, `gpt-5.4` capacity 10, `arb-gpt41` capacity 100, `arb-gpt41mini` capacity 100 | TPM/capacity assumptions must use actual deployment capacities |
| SDK | `api/package.json` already includes `@azure/ai-projects@^2.1.1`; API and frontend require Node `>=22.0.0` | Do not add package as new dependency; validate Node 22, not Node 20 |
| Current code | `arb-foundry-agent.js` uses Chat Completions for fan-out and synthesis; `foundryResponsesAgentRequest()` exists but is unused in the review path | Migration should extend existing helper instead of introducing a separate client surface |
| Prompt contract drift | Portal instructions differ from `ARB_SYSTEM_PROMPT` in scoring weights, decision labels, visual evidence handling, and finding volume | Add prompt/schema alignment gate before enabling Phase 2 or Phase 3 |

**Migration summary:**

| Phase | Scope | Duration | Risk | Live site impact |
|---|---|---|---|---|
| Phase 1 | Telemetry bridge only — no logic change | 1–2 days | Very Low | Zero |
| Phase 2 | Synthesis call migrated to Agents API | 3–5 days | Medium | Zero (feature flagged) |
| Phase 3 | Full 7-domain fan-out via Agents API | 2–3 weeks | High | Zero (feature flagged) |

---

## 2. Why Migrate

### 2.1 Problem with the current approach

The current CARI runtime uses `az ai services openai deployments chat completions create`-style calls directly against the `ai-arb-review-prod` Cognitive Services account. This means:

1. **Zero portal visibility** — The Foundry agent monitor (`cari-arb-review-agent`) shows `Estimated cost: ₹0, Total token usage: 0, Agent runs: 0`. All actual usage is invisible in Foundry.
2. **No native tool calling** — Microsoft Learn MCP grounding is injected manually into prompts. The agent cannot call tools autonomously.
3. **No built-in evaluation** — The Evaluation tab in the Foundry portal only captures runs executed via the Agents API.
4. **No conversation threading** — Each review is stateless. There is no ability to ask follow-up questions about findings.
5. **Manual prompt management** — Agent system prompts require a code deployment to change. Via the Agents API, prompt updates can be made in the portal without deployment.
6. **Strategic misalignment** — Microsoft's AI investment is in the Agents API. Future capabilities (Bing grounding, Code Interpreter, new MCP tools) land there first.

### 2.2 Advantages of migrating

| Benefit | Detail |
|---|---|
| **Portal observability** | Foundry Monitor shows real runs, token counts, tool call traces, error rates, latency |
| **Native tool use** | Agent calls Microsoft Learn MCP, File Search, Bing grounding autonomously |
| **Agent-managed prompts** | Update system instructions via Foundry portal — no code deployment needed |
| **Conversation persistence (future)** | Responses/Conversations can support follow-up questions when CARI adds that UX; Phase 1-3 stay stateless |
| **Built-in evaluation** | Foundry Evaluation tab captures every run for quality assessment |
| **Per-agent cost tracking** | Cost visible at agent level in portal, not just at Cognitive Services account level |
| **Scheduled evaluations** | Automated red-teaming and quality regression detection |
| **Future capabilities** | First access to new Microsoft AI capabilities as they ship |

### 2.3 Disadvantages and mitigation

| Disadvantage | Severity | Mitigation |
|---|---|---|
| Higher latency (polling loop adds 3–10s) | Medium | Use streaming responses; set aggressive poll intervals |
| Complex fan-out (7 parallel agent-reference calls) | High | Phase 3 only; keep Chat Completions fan-out until Phase 3 |
| Evidence injection complexity | Medium | Pass evidence as File Search attachments or structured message content |
| Conversation lifecycle management | Low in Phase 1-3 | Use stateless single-turn Responses calls; if follow-up UX is added, add explicit conversation retention/deletion policy |
| Testing complexity (requires live endpoint) | Medium | Use mocked Agents API client for unit tests; integration tests against real endpoint |
| Polling timeout risk in Durable Functions | Medium | Set explicit run timeout in Agents API call; abort if Agents API stalls |

---

## 3. Current State Architecture

### 3.1 Current call path

```
Durable Orchestrator (orchestratorAgentReview.js)
  └── Activity: runAgent (25-min timeout)
        └── arb-foundry-agent.js → runArbAgentReview()
              ├── FANOUT_ENABLED = true
              │     ├── 7× parallel fetchJsonWithTimeout() → /openai/deployments/{model}/chat/completions
              │     │     (model-router → gpt-5.4 → arb-gpt41 fallback chain)
              │     └── synthesis call → /openai/deployments/model-router/chat/completions
              │
              └── FANOUT_ENABLED = false
                    └── monolithic call → /openai/deployments/model-router/chat/completions
```

### 3.2 Current model routing

```
Tier 1: model-router  (FOUNDRY_ANALYSIS_MODEL,   default: "model-router")   — primary
Tier 2: gpt-5.4       (FOUNDRY_ANALYSIS_MODEL_2,  default: "gpt-5.4")        — secondary
Tier 3: arb-gpt41     (FOUNDRY_AGENT_MODEL,        default: "arb-gpt41")      — fallback
Vision: arb-gpt41     (FOUNDRY_VISION_MODEL,        default: "arb-gpt41")      — image analysis
```

### 3.3 Current feature flags

| Flag | Current value | Purpose |
|---|---|---|
| `FOUNDRY_FANOUT_ENABLED` | not set in production; code default is `true` | Enable 7-domain parallel fan-out |
| `USE_DURABLE_ORCHESTRATION` | `ON` | Route through Durable orchestrator |
| `USE_DOMAIN_FANOUT` | not found in production app settings during audit | Legacy/domain fan-out variant flag, not used by the current `arb-foundry-agent.js` path |
| `USE_AGENTS_API` | not set in production | New migration flag; add explicit `off` before Phase 1 merge |
| `FOUNDRY_AGENT_ID` | Key Vault reference | Foundry agent ID (currently unused at runtime) |
| `FOUNDRY_AGENT_NAME` | `cari-arb-review-agent` | Agent name reference |
| `FOUNDRY_AGENT_VERSION` | `7` | Agent version reference |

### 3.4 Current quality gates (runAgent.js)

These gates run AFTER the model call and MUST be preserved in all phases:

1. Rule findings merged first; AI findings with duplicate `ruleId` excluded
2. LLM false-positive suppression (OPS_OWNERSHIP_PATTERNS + BOUNDARY_CONTROL_EVIDENCE_TERMS)
3. Schema validation (findings array, severity enum, scorecard range, recommendation enum)
4. Orphan evidence ID / visual evidence ID stripping
5. Thin-evidence High → Medium downgrade (agent findings with no evidence IDs + confidence not High)

---

## 4. Target State Architecture

### 4.1 Target call path (Phase 3 complete)

```
Durable Orchestrator (orchestratorAgentReview.js) ← 30-minute timeout
  └── Activity: runAgent (25-min timeout)
        └── arb-foundry-agent.js → runArbAgentReview()
              ├── USE_AGENTS_API = "full" (Phase 3)
              │     ├── [Pre-flight] Inject rule findings into each structured domain input (see §4.5)
              │     ├── 7× parallel Foundry Responses agent-reference calls → cari-arb-review-agent
              │     │     (each: build structured input → call /openai/v1/responses with agent_reference)
              │     ├── synthesis Foundry Responses agent-reference call → cari-arb-review-agent
              │     │     (receives all 7 domain results + merged rule findings as message content)
              │     └── no persistent conversation cleanup required for stateless calls
              │
              ├── USE_AGENTS_API = "synthesis" (Phase 2)
              │     ├── 7× parallel Chat Completions (unchanged)
              │     └── synthesis Foundry Responses agent-reference call → cari-arb-review-agent
              │
              └── USE_AGENTS_API = "off" (Phase 1 / rollback)
                    └── (current Chat Completions path, unchanged)
```

### 4.2 Orchestration timeout baseline

**The Durable orchestrator timeout is currently 30 minutes** in `api/src/durable/orchestratorAgentReview.js` (`ORCHESTRATION_TIMEOUT_MINUTES = 30`). The activity timeout is 25 minutes in `api/src/durable/activities/runAgent.js`, which ensures the activity normally resolves before the 30-minute outer timeout fires.

Do not assume a 40-minute orchestration window unless a separate code change updates `ORCHESTRATION_TIMEOUT_MINUTES` and its replay tests. If Phase 2 or Phase 3 needs more headroom, make the timeout increase an explicit PR with tests, not an undocumented plan assumption.

```
Durable orchestrator timer:  30 minutes  ← current outer guard
Activity runAgent timeout:   25 minutes  ← activity-level guard
Agent-reference domain timeout:  90 seconds  ← recommended per-domain call guard (Phase 3)
Agent-reference synthesis timeout:  5 minutes ← recommended synthesis call guard (Phase 2+)
```

### 4.3 SDK and API Surface Decision

The repo already has `@azure/ai-projects@^2.1.1` installed and the official JavaScript SDK for that version uses `AIProjectClient`, `project.getOpenAIClient()`, and agent references in the Responses/Conversations API. The existing code also already implements this lower-level shape in `foundryResponsesAgentRequest()`:

```javascript
POST {FOUNDRY_PROJECT_ENDPOINT}/openai/v1/responses
{
  "input": "...",
  "agent_reference": {
    "name": "cari-arb-review-agent",
    "type": "agent_reference",
    "version": "7"
  },
  "temperature": 0.2
}
```

Therefore this migration must use the existing Foundry Responses agent-reference pattern first. Do not introduce a non-existent `AzureAIFoundryAgentsClient` abstraction. If the team later chooses the classic threads/runs REST API or the separate `@azure/ai-agents` package, that must be a separate ADR because it changes SDK surface, cleanup semantics, and test mocks.

### 4.4 Foundry Portal Agent Contract

The Foundry portal configuration for `cari-arb-review-agent` becomes part of the runtime contract once CARI starts calling the agent. The configuration observed from the portal/screenshot and provided system instructions is:

| Setting | Portal value |
|---|---|
| Agent | `cari-arb-review-agent` |
| Version | `7` |
| Model | `model-router` |
| Instructions | CARI ARB Agent system instructions configured in Foundry portal |
| File Search | Enabled; vector store `cari-knowledge-store` (~29.57 KB) |
| MCP tool | `microsoft_learn` at `https://learn.microsoft.com/api/mcp` |
| Voice mode | Off |

#### Foundry feature decision under $60/month budget

The complete production solution must stay under **$60/month** unless explicitly re-approved. The current month-to-date Azure Cost Management query for `rg-arb-review-prod` is approximately **₹3,734** (~**$39**) on 2026-05-28, with an estimated month-end run rate around **$43-45** if usage remains steady. That leaves only about **$15-17/month** of safe headroom.

| Highlighted feature | Decision | Budget rationale | Quality rationale |
|---|---|---|---|
| File Search tool | **Use now** | Current `cari-knowledge-store` is small (~29.57 KB); keep it curated to avoid unnecessary embedding/search growth | Improves grounding for CARI-specific schema, rubric, standards, and ARB guidance |
| Knowledge section | **Do not add duplicate knowledge stores now** | Additional knowledge bases can increase ingestion, embedding, storage, or search cost depending on setup | Use only when it reuses/replaces the existing curated `cari-knowledge-store`; avoid duplicated grounding sources |
| Microsoft Learn MCP | **Use now, with monitoring** | Cost impact is mostly extra model/tool tokens; monitor Foundry Tools and Foundry Models lines after Phase 3 | Best path for current Azure service guidance and learn.microsoft.com references |
| Memory | **Do not enable in Phase 1-3** | Memory is preview and uses underlying chat/embedding models; it can add recurring cost and needs an embedding deployment | Not needed for stateless ARB reviews; also increases cross-review state-leakage risk |
| Guardrail | **Keep inherited `Microsoft.DefaultV2`; do not add custom guardrail yet** | Custom guardrail/content-safety controls can add cost/latency and may block valid security-review content | Default safety is enough for migration; add custom guardrails only after golden-path and FP validation pass |

Budget operating rule:
- Phase 2 may be enabled only when projected month-end cost is below **$50**.
- Phase 3 may be enabled only when projected month-end cost is below **$50**.
- After Phase 3 activation, **$60 projected or actual** is the rollback/action threshold.
- If actual month-to-date spend exceeds **$50** before the 20th calendar day, keep `USE_AGENTS_API=off` or `telemetry` only until the trend is back under the $60/month forecast.

#### Prompt/schema drift that must be resolved

The portal system instructions are close to the repo prompt but not identical. This is a migration risk because Phase 2 and Phase 3 move output generation from code-owned prompts to portal-owned instructions.

| Contract area | Portal agent instructions | Current code/runtime expectation | Required action |
|---|---|---|---|
| Recommendation enum | `Approved`, `Approved with Conditions`, `Needs Revision`, `Rejected` | `Recommended for Approval`, `Ready with Gaps`, `Needs Remediation`, `Rejected`; `parseRecommendation()` maps portal labels to runtime labels | Keep and test label mapping; do not remove `parseRecommendation()` |
| Scoring weights | Requirements 20%, Security 20%, Reliability 15%, Ops/Cost/Performance/Governance 10%, Docs 5% | Code prompt and fan-out synthesis use Requirements 15%, Security 15%, Networking 10%, Reliability 15%, Ops/Cost/Performance/Governance 10%, Docs 5% | Align portal instructions to runtime weights, or update code/tests in the same PR |
| Networking dimension | Not present as a scorecard dimension in the portal prompt | Current fan-out has a dedicated Networking domain and scorecard dimension weighted 10% | Add Networking back to portal instructions before Phase 3, or explicitly retire the separate Networking score in code |
| Visual evidence IDs | Portal prompt requires `evidenceIds`; mentions images but not `visualEvidenceIds` in the output schema | Runtime supports and validates `visualEvidenceIds` and visual evidence traceability | Add `visualEvidenceIds` to portal output schema before using the agent for full reviews |
| Finding volume | 8-15 findings for complete packages | Current quality gates do not require a fixed minimum; thin evidence should not force speculative findings | Keep evidence-first behavior; do not allow target volume to override grounding |
| Tool assumptions | File Search and Microsoft Learn MCP configured in portal | Current code manually injects Microsoft Learn grounding for Chat Completions | Phase 3 must validate actual tool-call traces before removing manual grounding |

Before Phase 2 go-live, export or screenshot the agent version `7` YAML/configuration and attach it to the PR. The PR must state whether the source of truth is the portal instructions, `ARB_SYSTEM_PROMPT`, or a synchronized prompt copied from code into Foundry.

### 4.5 The hardest problem: 7-domain fan-out + rule findings injection

This is the most constrained part of the migration. The Agents API does not natively support injecting structured deterministic data (rule findings) mid-flow. The approach used by CARI must be **message-first injection**, not mid-run injection.

#### The problem
In the current Chat Completions path, CARI constructs each domain prompt with:
1. Domain-specific evidence slice
2. Deterministic rule findings (pre-computed before AI runs)
3. MCP grounding context (injected manually)

The Agents API does not allow modifying the system prompt per-run at the message level in the same way — the agent already has its system instructions. Rule findings must be passed as user message content, not as system instructions.

#### The solution: Structured context message pattern

Each domain agent-reference input receives a **two-part user message**:

```
Part 1 — DETERMINISTIC CONTEXT (structured JSON, high priority):
{
  "type": "deterministic_rule_findings",
  "priority": "HIGH — these findings are authoritative and must be included",
  "findings": [ ...rule engine findings for this domain... ],
  "suppressionContext": "Do not generate AI findings that duplicate these ruleIds: [...]"
}

Part 2 — EVIDENCE AND INSTRUCTIONS (natural language):
"Review the following evidence for the [Domain] domain.
The deterministic findings above are confirmed. Your task is to identify
ADDITIONAL gaps not covered by the rule findings above.
Evidence: [domain-scoped evidence slice]"
```

This pattern:
- Preserves the rule findings injection (they are in the message, not the system prompt)
- Tells the agent explicitly not to duplicate rule findings (natural language constraint)
- Works within the Agents API message structure without modification
- Is testable: the message content can be logged as structured metadata in Application Insights/Log Analytics without logging full customer evidence

#### Fan-out orchestration pattern

The key challenge is that 7 concurrent agent-reference calls can still create a model-router TPM spike. With the chosen Responses API path, the correct pattern is **build-all-inputs, start-all-with-stagger, await-all-settled**, not serial domain execution:

```javascript
// CORRECT: build all 7 agent-reference inputs first, then run concurrently with a stagger
const results = await Promise.allSettled(
  domains.map(async (domain, i) => {
    if (i > 0) await sleep(i * 200);
    return foundryResponsesAgentRequest(
      buildDomainAgentInput(domain, evidence, ruleFindings)
    );
  })
);
// WRONG: for (domain of domains) await foundryResponsesAgentRequest(...)
```

#### Stagger to avoid TPM spike

Start calls 200ms apart to prevent all 7 domains hitting `model-router` simultaneously:

```javascript
const responses = await Promise.all(domains.map(async (d, i) => {
  if (i > 0) await sleep(i * 200); // 0, 200, 400, 600, 800, 1000, 1200ms stagger
  return foundryResponsesAgentRequest(buildDomainAgentInput(d, evidence, ruleFindings));
}));
```

#### Fallback cascade

```
If > 2 of 7 Agents API domain runs fail (non-completed status or timeout)
  → Fall back to Chat Completions fan-out for ALL 7 domains (entire fan-out path)
  → Log: "[agents-api] N/7 domain runs failed — full fallback to Chat Completions"

If exactly 1-2 domains fail
  → Use Chat Completions for the failed domains only
  → Continue with Agents API results for successful domains
  → Log: "[agents-api] Domain X fell back to Chat Completions"
```

### 4.6 Target Foundry agent configuration

| Setting | Value |
|---|---|
| Agent name | `cari-arb-review-agent` |
| Agent version | `7` initially, from production `FOUNDRY_AGENT_VERSION` |
| Model | `model-router` (MUST remain model-router — never change) |
| System instructions | Portal instructions must be synchronized with `ARB_SYSTEM_PROMPT` or explicitly treated as the source of truth |
| Tools | File Search (`cari-knowledge-store`) and Microsoft Learn MCP (`microsoft_learn`, `https://learn.microsoft.com/api/mcp`) |
| Runtime integration | Foundry Responses API with `agent_reference` |
| Conversation strategy | Stateless single-turn input for Phase 1 and Phase 2; use Conversations only if follow-up UX is explicitly added |
| Domain timeout | 90 seconds per domain call |
| Synthesis timeout | 300 seconds (5 minutes) |
| Contract gate | Recommendation labels, score weights, Networking dimension, and visual evidence schema must be reconciled before Phase 2 go-live |

---

## 5. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Agents API adds latency beyond 25-min activity timeout | Medium | High | Reduce domain call count or run timeout; use `cancelRun` if approaching limit |
| Conversation accumulation in Foundry | Low | Low | Phase 1-3 use stateless Responses calls; add retention policy before enabling persistent conversations |
| model-router unavailable during migration | Low | High | Three-tier fallback chain preserved; model-router 404 alerts already configured |
| Agents API SDK version breaking change | Low | Medium | Pin SDK version in package.json; test before upgrading |
| Evidence size exceeds Agents API message limit | Medium | Medium | Chunk evidence; use File Search for large documents |
| Memory preview feature increases cost/state risk | Medium | Medium | Do not enable Memory in Phase 1-3; revisit only after follow-up review chat is designed and budget headroom is confirmed |
| Custom guardrails block valid security review content | Medium | Medium | Keep inherited `Microsoft.DefaultV2`; add custom guardrails only after golden-path and FP validation prove no false blocking |
| Duplicate knowledge stores increase retrieval cost and inconsistency | Medium | Medium | Use the existing small `cari-knowledge-store`; avoid adding duplicate Knowledge sources until manual grounding is retired |
| Portal prompt/runtime schema drift | High | High | Reconcile portal instructions with code schema before enabling `USE_AGENTS_API=synthesis`; add regression tests for label mapping and score dimensions |
| Quality gates skipped due to code restructure | Low | High | Unit tests cover all 5 gates; CI blocks merge if tests fail |
| Live site down during deploy | Very Low | Critical | Zero-downtime deploy via Azure Functions Flex; feature flag prevents code path activation |
| Foundry Agents API quota exceeded | Low | Medium | Monitor token usage; Agents API shares TPM with Chat Completions |

---

## 6. Backup and Rollback Strategy

### 6.1 Before ANY code change — create a backup branch

```powershell
# Step 1: Create a backup tag of current working state
$backupTag = "backup/pre-agents-api-migration-$(Get-Date -Format yyyyMMdd)"
git tag $backupTag HEAD
git push origin $backupTag

# Step 2: Create migration working branch
git checkout -b feature/foundry-agents-api-migration
```

For bash shells, use `backupTag="backup/pre-agents-api-migration-$(date +%Y%m%d)"` and pass `$backupTag` to `git tag` and `git push`.

**The `backup/pre-agents-api-migration-YYYYMMDD` tag is the permanent restore point.**  
No force-push, no deletion. This tag must survive the entire migration.

### 6.2 Rollback procedure (any phase)

**Option A — Feature flag rollback (< 2 minutes, no deployment)**

Set `USE_AGENTS_API=off` in the Function App configuration:

```bash
az functionapp config appsettings set \
  --subscription 87cf2b93-5e52-4533-9e6b-7182cd7dbde6 \
  --resource-group rg-arb-review-prod \
  --name func-arb-review-api-flex \
  --settings "USE_AGENTS_API=off"
```

This immediately reverts CARI to the current Chat Completions path. No code redeploy needed.

**Option B — Code rollback (5–10 minutes, full redeploy)**

```bash
git checkout main
git revert HEAD~N   # or git reset to the backup tag
# Then trigger the deploy-api.yml workflow via GitHub Actions
```

**Option C — Emergency redeploy from backup tag**

`func-arb-review-api-flex` is on Azure Functions Flex Consumption. Azure CLI returned that deployment slots are not supported for this plan, so a slot swap is not a valid rollback path. If feature flag rollback is insufficient, redeploy `main` or a hotfix branch from the backup tag through `.github/workflows/deploy-api.yml`.

### 6.3 Rollback decision criteria

Trigger rollback if any of the following are observed:
- Review completion rate drops below 80% in a 30-minute window
- Agent activity timeout rate exceeds 5%
- Log Analytics shows `persistResults` or `runAgent` failure spike
- Any review returns empty findings that previously returned results
- P95 review latency exceeds 20 minutes

---

## 7. Migration Phases

### 7.1 Phase overview

```
Phase 1 (Days 1–2): Telemetry Bridge
  Goal: Make Foundry portal monitor show real activity
  Risk: Zero — no change to review logic whatsoever
  Feature flag: USE_AGENTS_API=telemetry

Phase 2 (Days 3–7): Synthesis Call Migration
  Goal: Replace the final synthesis Chat Completions call with an Agents API run
  Risk: Medium — synthesis call path changes; fan-out unchanged
  Feature flag: USE_AGENTS_API=synthesis

Phase 3 (Weeks 2–4): Full Fan-Out Migration
  Goal: Replace all 7 domain Chat Completions calls with Agents API runs
  Risk: High — full rewrite of the fan-out path
  Feature flag: USE_AGENTS_API=full
```

### 7.2 Go/no-go criteria between phases

**Phase 1 → Phase 2 go criteria:**
- [ ] Foundry portal Monitor shows > 0 Agent runs for May reviews
- [ ] Zero increase in review failure rate
- [ ] Log Analytics confirms telemetry pings without errors
- [ ] All 140+ unit tests pass on feature branch
- [ ] Foundry agent version `7` configuration exported or screenshotted and attached to the PR
- [ ] Portal instructions reconciled with runtime schema for recommendation labels, score weights, Networking dimension, and visual evidence IDs

**Phase 2 → Phase 3 go criteria:**
- [ ] Phase 2 running in production for minimum 5 business days
- [ ] 10+ reviews completed via Phase 2 path with correct findings
- [ ] P95 review latency not increased by more than 30 seconds vs baseline
- [ ] Projected monthly Azure cost remains below $50 before enabling Phase 3
- [ ] Scorecard and recommendation distribution consistent with pre-migration baseline
- [ ] Zero quality gate regressions (same findings for same evidence corpus)
- [ ] All E2E and FP validation tests pass
- [ ] Foundry agent version `7` tool configuration is exported or screenshotted and confirms File Search plus `microsoft_learn` are configured; actual tool-call trace validation moves to Phase 3 shadow/go-live

---

## 8. Phase 1 — Telemetry Bridge

### 8.1 Objective

Make `cari-arb-review-agent` in the Foundry portal show telemetry activity without changing any review logic. This is purely additive — a telemetry event is sent to the Agents API at the start and end of each review run. The actual review still uses Chat Completions.

Phase 1 telemetry runs are **not real ARB review runs**. They must be clearly labeled as telemetry and excluded from review-quality dashboards, baseline comparison, and agent-quality analysis. If telemetry pings create noisy or misleading Foundry traces, replace this phase with a dedicated lightweight telemetry agent rather than weakening the ARB review agent instructions.

### 8.2 Code change

**File:** `api/src/shared/arb-foundry-agent.js`

Add a new function `notifyAgentsApiTelemetry(reviewId, phase, metadata)` that:
1. Uses the existing Foundry Responses agent-reference helper pattern
2. Sends a structured telemetry input (`{"event": "review_started"|"review_completed", "reviewId": "...", ...}`)
3. Runs non-blocking from the review path with error catch
4. Does not change review findings, scorecard, evidence, or recommendation
5. Does not create persistent conversations unless follow-up UX is added later

This gives the Foundry portal a non-zero telemetry-labeled run count without affecting review quality or latency.

Because the portal agent instructions are optimized for full ARB JSON output, telemetry inputs must be tiny and explicitly marked as telemetry. Do not include customer evidence or file content in telemetry pings.

```javascript
// Add to arb-foundry-agent.js
async function notifyAgentsApiTelemetry(reviewId, phase, metadata = {}) {
  if (process.env.USE_AGENTS_API !== 'telemetry') return;
  if (!FOUNDRY_AGENT_NAME) return;
  try {
    await foundryResponsesAgentRequest(JSON.stringify({
      type: 'cari_review_telemetry',
      event: phase,
      reviewId,
      ...metadata,
      timestamp: new Date().toISOString()
    }));
  } catch (err) {
    // Telemetry failure must never break a review
    console.warn('[agents-api-telemetry] Non-fatal error:', err.message);
  }
}
```

### 8.3 Integration points

Call `notifyAgentsApiTelemetry` at two points in `runAgent.js`:
- Before the fan-out call: `await notifyAgentsApiTelemetry(reviewId, 'review_started', { fileCount, ruleCount })`
- After quality gates pass: `notifyAgentsApiTelemetry(reviewId, 'review_completed', { findingsCount, score, recommendation })` (fire and forget)

### 8.4 Feature flag

```bash
# Enable Phase 1 (telemetry only)
USE_AGENTS_API=telemetry

# Disable completely (rollback)
USE_AGENTS_API=off
```

### 8.5 SDK/package baseline

No new package is required. `api/package.json` already includes `@azure/ai-projects@^2.1.1` and `@azure/identity@^4.13.0`.

Verify compatibility with the actual repo runtime target: Node `>=22.0.0`, Azure Functions v4, and Linux Flex Consumption. Do not validate against Node 20 as the primary target unless the `engines` field is intentionally downgraded.

### 8.6 Deployment steps

1. Create branch: `feature/agents-api-phase1-telemetry`
2. Implement `notifyAgentsApiTelemetry` function
3. Add unit tests (mock the Agents API client — test that errors are swallowed)
4. Run `npm test` — all 140+ tests must pass
5. PR to `main` with reviewer sign-off
6. After merge, set `USE_AGENTS_API=telemetry` in Function App settings
7. Monitor Foundry portal for 24 hours — confirm telemetry-labeled agent run count > 0 and excluded from review-quality dashboards
8. Monitor Log Analytics for error spikes

### 8.7 Estimated effort

| Task | Owner | Hours |
|---|---|---|
| Implement `notifyAgentsApiTelemetry` | Full-Stack Developer | 2h |
| Unit tests | Full-Stack Developer | 1h |
| Code review + PR | Azure AI Architect | 1h |
| Deploy + monitor | Senior PM | 2h |
| **Total** | | **~6 hours** |

---

## 9. Phase 2 — Synthesis Call Migration

### 9.1 Objective

Replace the final synthesis Chat Completions call with a real Agents API run. The 7-domain fan-out calls remain as Chat Completions. This is the most impactful observability change — the synthesis call is the longest, most token-intensive call and produces the scorecard, recommendation, and executive summary.

### 9.2 How the synthesis call works today

After the 7 domain calls complete:
```javascript
// Current: direct Chat Completions synthesis
const synthesisResult = await fetchJsonWithTimeout(
  `${FOUNDRY_PROJECT_ENDPOINT}/openai/deployments/${FOUNDRY_ANALYSIS_MODEL}/chat/completions`,
  { messages: [{ role: 'system', content: SYNTHESIS_PROMPT }, { role: 'user', content: domainResultsJson }] },
  60000 // 60s timeout
);
```

### 9.3 Target: Foundry Responses agent-reference synthesis call

```javascript
// Phase 2: synthesis via the versioned Foundry agent reference
async function runSynthesisViaAgentsApi(domainResults, evidence, reviewContext) {
  const input = buildSynthesisAgentInput(domainResults, evidence, reviewContext);
  const responseText = await foundryResponsesAgentRequest(input, {
    timeoutMs: 300000,
    maxOutputTokens: 8000
  });
  return parseSynthesisResponse(responseText);
}
```

Implementation note: update `foundryResponsesAgentRequest()` to accept timeout and output-token options before Phase 2. It currently hard-codes a 120-second timeout and only sends `input`, `agent_reference`, and `temperature`.

### 9.4 Fallback path

If the agent-reference synthesis call fails for any reason, fall back to the current Chat Completions synthesis:

```javascript
let synthesisResult;
if (process.env.USE_AGENTS_API === 'synthesis' || process.env.USE_AGENTS_API === 'full') {
  try {
    synthesisResult = await runSynthesisViaAgentsApi(domainResults, evidence, reviewContext);
  } catch (err) {
    console.warn('[agents-api] Synthesis via Foundry agent failed, falling back to Chat Completions:', err.message);
    synthesisResult = await runSynthesisViaChatCompletions(domainResults, evidence, reviewContext);
  }
} else {
  synthesisResult = await runSynthesisViaChatCompletions(domainResults, evidence, reviewContext);
}
```

### 9.5 Evidence size handling

The synthesis call receives all 7 domain results + original evidence context. This may exceed Agents API message token limits. Strategy:

1. Truncate domain result text to 2,000 tokens each (7 × 2,000 = 14,000 tokens)
2. Pass summarised evidence (already truncated in current code)
3. If evidence exceeds 50,000 tokens, use File Search attachment instead of inline content

### 9.6 Feature flag

```bash
# Enable Phase 2 synthesis via Agents API
USE_AGENTS_API=synthesis

# Rollback to Chat Completions
USE_AGENTS_API=telemetry   # or "off"
```

### 9.7 Deployment steps

1. Create branch: `feature/agents-api-phase2-synthesis`
2. Implement `runSynthesisViaAgentsApi` with full fallback
3. Add integration test against real Foundry endpoint (use test review `gcp-test`)
4. Run full test suite: `npm test` + `npm run test:e2e:golden-path`
5. Deploy to a test review — validate findings quality vs baseline
6. PR to `main` with senior architect sign-off
7. Set `USE_AGENTS_API=synthesis` in Function App settings
8. Monitor for 5 days minimum before Phase 3

### 9.8 Acceptance criteria for Phase 2

- [ ] Foundry portal shows synthesis call as a real agent run with token count
- [ ] Review scorecard values within ±5 points of Chat Completions baseline for same evidence
- [ ] Recommendation (Approved/Gaps/Needs Remediation/Rejected) unchanged for same evidence
- [ ] Portal recommendation labels are normalized to runtime labels (`Approved` → `Recommended for Approval`, `Approved with Conditions` → `Ready with Gaps`, `Needs Revision` → `Needs Remediation`)
- [ ] Scorecard dimensions include the runtime-required Networking dimension or the code has been intentionally changed to remove that dimension
- [ ] Agent output includes valid `visualEvidenceIds` when findings depend on visual evidence
- [ ] P95 review latency increase < 30 seconds vs Phase 1 baseline
- [ ] All 5 quality gates still applied to Agents API output
- [ ] No persistent conversations created by the Phase 2 path unless an explicit follow-up feature is added
- [ ] Fallback to Chat Completions triggers correctly when Agents API returns non-`completed` status

### 9.9 Estimated effort

| Task | Owner | Hours |
|---|---|---|
| Implement `runSynthesisViaAgentsApi` + fallback | Full-Stack Developer | 6h |
| Evidence size handling + chunking | Azure AI Architect | 3h |
| Integration tests | Full-Stack Developer | 4h |
| Baseline comparison testing (5 reviews) | Azure AI Architect | 3h |
| Code review | Senior Director | 2h |
| Deploy + 5-day monitoring | Senior PM | 4h |
| **Total** | | **~22 hours** |

---

## 10. Phase 3 — Full Fan-Out Migration

### 10.1 Objective

Replace all 7 parallel domain Chat Completions calls with 7 parallel Foundry Responses agent-reference calls. This is the full migration. Each domain receives domain-scoped evidence, calls Microsoft Learn MCP natively when the agent version is configured with that tool, and returns domain findings.

### 10.2 Parallel agent-reference strategy

```javascript
async function runDomainFanOutViaAgentsApi(evidence, reviewContext, rulesFindings) {
  // Start 7 agent-reference calls concurrently with 90s per-domain timeout.
  // The 200ms stagger keeps all domains from entering model-router at exactly once.
  const domainResults = await Promise.allSettled(
    DOMAIN_CONFIGS.map(async (domain, i) => {
      if (i > 0) await sleep(i * 200);
      const input = buildDomainAgentInput(domain, evidence, reviewContext, rulesFindings);
      const responseText = await foundryResponsesAgentRequest(input, {
        timeoutMs: 90000,
        maxOutputTokens: 4000
      });
      return parseDomainResponse(responseText, domain);
    })
  );

  // If > 2 of 7 domains failed, fall back to Chat Completions fan-out
  const failCount = domainResults.filter(r => r.status === 'rejected').length;
  if (failCount > 2) {
    console.warn(`[agents-api] ${failCount}/7 domain runs failed — falling back to Chat Completions fan-out`);
    return runDomainFanOutViaChatCompletions(evidence, reviewContext, rulesFindings);
  }

  return domainResults.map((r, i) =>
    r.status === 'fulfilled' ? r.value : buildFallbackDomainResult(DOMAIN_CONFIGS[i])
  );
}
```

### 10.3 MCP tool use in Agents API

With the Agents API, native `microsoft_learn` MCP calls are made by the Foundry agent, not by CARI application code. Therefore the existing Blob-backed application MCP cache cannot control native Foundry MCP calls unless CARI later introduces an app-owned MCP proxy or tool endpoint.

Phase 3 decision:
1. Keep manual Learn grounding and the app-level MCP cache in the Chat Completions fallback path.
2. Do not claim the app cache controls native Foundry MCP calls.
3. Validate native tool traces and token/cost impact during Phase 3 shadow.
4. Remove manual Learn grounding from the authoritative Agents API path only after native traces and quality comparison pass.
5. Consider an app-owned MCP proxy as a future optimization if native tool cost becomes too high.

Expected native MCP volume still needs to be monitored. Each domain may call MCP 2–6 times, or 14–42 MCP calls per review.

Audit correction: native MCP calls only happen if agent version `7` is configured with the Microsoft Learn MCP tool in Foundry. The application code cannot assume this from `FOUNDRY_AGENT_NAME` alone. Before Phase 3 go-live, export or screenshot the agent tool configuration and attach it to the PR.

### 10.4 TPM impact

7 parallel agent-reference calls each with up to 90 seconds means concurrent token consumption could spike. Use the verified `model-router` deployment capacity of 120 as the planning baseline, and confirm current TPM/quota in Foundry before enabling Phase 3:

- Current: 7 calls sequenced via Promise.all but token usage spread across 30-60s
- Phase 3: 7 simultaneous agent-reference calls competing for the same model-router capacity
- **Risk:** TPM throttling if all 7 domains start simultaneously on a large evidence corpus
- **Mitigation:** Stagger domain starts by 200ms each; implement token-aware batching if throttling is detected

Verified deployment capacity on 2026-05-28:

| Deployment | Model | Version | SKU | Capacity |
|---|---|---|---|---|
| `model-router` | `model-router` | `2025-11-18` | GlobalStandard | 120 |
| `gpt-5.4` | `gpt-5.4` | `2026-03-05` | GlobalStandard | 10 |
| `arb-gpt41` | `gpt-4.1` | `2025-04-14` | GlobalStandard | 100 |
| `arb-gpt41mini` | `gpt-4.1-mini` | `2025-04-14` | GlobalStandard | 100 |

### 10.5 Feature flag

```bash
# Enable full fan-out via Agents API
USE_AGENTS_API=full

# Rollback to synthesis-only (Phase 2)
USE_AGENTS_API=synthesis

# Rollback to Chat Completions only
USE_AGENTS_API=off
```

### 10.6 Deployment steps

1. Create branch: `feature/agents-api-phase3-full-fanout`
2. Implement `runDomainFanOutViaAgentsApi` with fallback to Phase 2 Chat Completions fan-out
3. Run the CARI evaluation framework (27-test suite) against both paths for same inputs
4. Verify scorecard values, findings count, and recommendation are consistent
5. Run full FP validation test suite: `npm run test:e2e:fp-validation`
6. PR with mandatory sign-off from: Azure AI Architect + Senior Director
7. Deploy with `USE_AGENTS_API=synthesis` still active (Phase 2)
8. Shadow-run Phase 3 alongside Phase 2 for 5 reviews (compare outputs, do not use Phase 3 output)
9. If outputs match baseline: set `USE_AGENTS_API=full`
10. Monitor for 10 business days
11. Remove Chat Completions fan-out code path only after 30 days of stable Phase 3 operation

### 10.7 Estimated effort

| Task | Owner | Hours |
|---|---|---|
| Implement `runDomainFanOutViaAgentsApi` | Full-Stack Developer | 12h |
| MCP tool use integration + cache handling | Azure AI Architect | 8h |
| TPM throttling handling + stagger logic | Full-Stack Developer | 4h |
| Eval framework baseline comparison (27 tests) | Azure AI Architect | 6h |
| FP validation suite execution | Full-Stack Developer | 2h |
| Shadow-run on 5 reviews + analysis | Azure AI Architect + Senior Director | 8h |
| Code review (mandatory 2 reviewers) | Azure AI Architect + Senior Director | 4h |
| Deploy + 10-day monitoring | Senior PM | 8h |
| Documentation update | Senior PM | 4h |
| **Total** | | **~56 hours** |

---

## 11. Quality Gate Preservation

**This is non-negotiable.** All 5 quality gates in `runAgent.js` must be applied regardless of which code path runs.

The quality gates are applied to the output of `runArbAgentReview()` in `runAgent.js` — they sit outside `arb-foundry-agent.js` and do not need to change. The migration only changes what happens inside `arb-foundry-agent.js`.

**Verification checklist for every phase:**

- [ ] `suppressContraindicatedLlmFindings()` — OPS ownership + boundary control suppression applied
- [ ] Duplicate `ruleId` exclusion — rules-engine findings are authoritative
- [ ] Schema validation — all required fields present, enums valid
- [ ] Orphan ID stripping — evidence IDs not in evidence map are removed
- [ ] Thin-evidence downgrade — High → Medium when no evidence IDs remain

---

## 12. Feature Flag Strategy

All three phases use a single feature flag `USE_AGENTS_API` with four values:

| Value | Behavior | Phase |
|---|---|---|
| `off` | Chat Completions only — current state | Rollback / default |
| `telemetry` | Chat Completions + telemetry ping to Agents API | Phase 1 |
| `synthesis` | Chat Completions fan-out + Agents API synthesis call | Phase 2 |
| `full` | Full Agents API fan-out + synthesis | Phase 3 |

Set via Azure Function App configuration (instant, no redeploy):

```bash
az functionapp config appsettings set \
  --subscription 87cf2b93-5e52-4533-9e6b-7182cd7dbde6 \
  --resource-group rg-arb-review-prod \
  --name func-arb-review-api-flex \
  --settings "USE_AGENTS_API=<value>"
```

Production audit note: `USE_AGENTS_API` was not present in Function App settings on 2026-05-28. Add `USE_AGENTS_API=off` before merging Phase 1 so the baseline is explicit and every later flag change is auditable.

**Flag change takes effect within 60 seconds.** In-flight reviews complete on their current path before the flag takes effect (Durable Functions replay handles this safely).

---

## 13. Testing Strategy

### 13.1 Unit tests (must pass before every PR merge)

```bash
cd api && npm test   # Must show 140+ passing
```

New tests required:
- `notifyAgentsApiTelemetry` — error swallowing, no review impact
- `runSynthesisViaAgentsApi` — fallback on Agents API failure
- `runDomainFanOutViaAgentsApi` — fallback when >2 domains fail
- Portal output normalization — `Approved`, `Approved with Conditions`, and `Needs Revision` map to runtime enums
- Portal scorecard/schema compatibility — Networking dimension and `visualEvidenceIds` are preserved or intentionally migrated

All new tests must mock `foundryResponsesAgentRequest()` or the `@azure/ai-projects` client boundary. Do not hit the live Foundry endpoint in unit tests.

### 13.2 Integration tests (required before phase go-live)

Use the test review `gcp-test` or a dedicated `agents-api-integration-test` review:

```bash
cd frontend && npm run test:e2e:golden-path   # End-to-end review completion
cd frontend && npm run test:e2e:fp-validation  # False-positive regression
```

Also run the production API smoke test after deployment and before enabling each phase:

```bash
Invoke-WebRequest -Uri https://func-arb-review-api-flex.azurewebsites.net/api/health -UseBasicParsing -TimeoutSec 30
```

### 13.3 Baseline comparison testing

Before Phase 2 and Phase 3 go-live, run the same evidence corpus through both paths and compare:

| Metric | Acceptable variance |
|---|---|
| Total findings count | ±15% |
| Critical/High finding count | ±2 findings |
| Scorecard total | ±5 points |
| Recommendation | Must match exactly |
| FP finding rate | Must be zero for known FP patterns |

Use the CARI eval framework (27-test suite) at `evals/` for automated comparison.

### 13.4 Eval framework run

```bash
# Run full eval suite against both paths
USE_AGENTS_API=off   python evals/run_cari_eval.py > c:/tmp/eval-baseline.json
USE_AGENTS_API=full  python evals/run_cari_eval.py > c:/tmp/eval-agents-api.json
# Compare outputs
```

Audit correction: there is no `evals/run-eval.js` in the repo. The available eval entry points are `evals/run_cari_eval.py` and `evals/run_export_parity_eval.py`.

---

## 14. Deployment and CI/CD

### 14.1 Branch strategy

```
main                          ← production; protected
  └── feature/agents-api-phase1-telemetry
  └── feature/agents-api-phase2-synthesis
  └── feature/agents-api-phase3-full-fanout
```

Each phase branch is a separate PR. Phase branches are created from `main`, not from each other, to avoid dependency chains.

### 14.2 PR requirements

All PRs to `main` must pass:
- [ ] `deploy-api.yml` CI checks (test + security + build)
- [ ] All 140+ unit tests pass
- [ ] No new high/critical npm audit findings
- [ ] At least one reviewer sign-off
- [ ] Phase 3 PR requires two reviewers (Azure AI Architect + Senior Director)

### 14.3 Deployment sequence

Phase changes deploy via the normal `deploy-api.yml` GitHub Actions workflow. No special procedure needed — Azure Functions Flex Consumption deploys with zero downtime.

Feature flag activation is a separate step (az CLI), deliberately decoupled from code deployment. Deploy the code first, then activate the flag after smoke-test confirmation.

### 14.4 No Terraform required

The migration is entirely within application code and Function App configuration. No Terraform resource changes are needed for Phase 1 or Phase 2. The `FOUNDRY_AGENT_ID` environment variable is already set as a Key Vault reference and `@azure/ai-projects` is already installed in `api/package.json`.

Configuration-only changes required:
- Add `USE_AGENTS_API=off` before the Phase 1 code merge.
- Enable phase values (`telemetry`, `synthesis`, `full`) only after code deployment and smoke tests.
- Verify agent version `7` still points at `model-router` before enabling `synthesis` or `full`.

---

## 15. Monitoring During Migration

### 15.1 Metrics to watch

| Metric | Source | Alert threshold |
|---|---|---|
| Projected monthly cost | Azure Cost Management | > $50 warning; > $60 action |
| Review completion rate | Log Analytics (writeArbJobStatus) | < 80% in 30-min window |
| Agent activity timeout rate | Log Analytics (runAgent errors) | > 5% |
| P95 review latency | Application Insights | > 20 minutes |
| Agents API run status ≠ completed | Log Analytics | > 10% |
| TPM throttling (429 errors) | Log Analytics | Any 429 from model-router |
| Unexpected persistent conversation count | Foundry portal / Log Analytics | Any persistent conversation created by Phase 1-3 paths |
| Foundry Tools cost trend | Azure Cost Management | > 20% week-over-week growth after Phase 3 |

### 15.2 Log Analytics queries to create

```kusto
// Phase 1+: Agent telemetry ping success rate
AppTraces
| where Message has "agents-api-telemetry"
| summarize total=count(), errors=countif(Message has "Non-fatal error") by bin(TimeGenerated, 1h)

// Phase 2+: Synthesis via Agents API success/fallback
AppTraces
| where Message has "agents-api" and Message has "synthesis"
| summarize count() by Message, bin(TimeGenerated, 1h)

// Phase 3: Domain fan-out failure rate
AppTraces
| where Message has "domain runs failed"
| project TimeGenerated, Message
| order by TimeGenerated desc
```

### 15.3 Foundry portal monitoring

After Phase 1 is live, the Foundry Monitor for `cari-arb-review-agent` should show:
- Agent runs > 0
- Token usage > 0
- Error rate dashboard populated
- Tool calls visible (Phase 3 only — MCP calls visible)

---

## 16. Cost Impact

### 16.0 Current spend baseline and budget guardrail

Azure Cost Management query on 2026-05-28 for resource group `rg-arb-review-prod` returned **~₹3,734 month-to-date**. Using recent USD/INR rates around 95-96, this is approximately **$39 MTD** and **$43-45 projected month-end** if usage remains stable.

| Service | Month-to-date cost | Note |
|---|---:|---|
| Foundry Models | ~₹2,274 | Largest cost driver; agent migration increases this if prompts/tool outputs grow |
| Azure App Service | ~₹556 | Stable platform cost |
| Container Registry | ~₹231 | Stable unless image churn grows |
| Foundry Tools | ~₹221 | Watch closely when MCP/File Search usage increases |
| Functions | ~₹195 | Stable unless review volume grows |
| Monitor + Log Analytics | ~₹170 | Can grow with verbose traces |
| Storage + Key Vault + Bandwidth | ~₹87 | Low |

Budget policy:
- Hard target: **≤ $60/month complete solution**.
- Warning threshold: **$50/month projected**.
- Action threshold: **$60/month projected** or actual.
- Phase 2 and Phase 3 activation require projected month-end cost below **$50** so there is operating headroom under the $60 hard cap.
- If warning threshold is crossed, freeze new Foundry feature enablement and keep `USE_AGENTS_API` at `off` or `telemetry`.
- If action threshold is crossed, roll back to `USE_AGENTS_API=off`, reduce trace verbosity, and review Foundry Models/Tools usage before re-enabling.

### 16.1 Phase 1 cost impact

Negligible. Telemetry pings are tiny messages (~100 tokens each). Additional cost < ₹1/month.

### 16.2 Phase 2 cost impact

The synthesis call via Agents API uses approximately the same tokens as the current Chat Completions synthesis call. **No material cost change expected.**

Additional costs to model:
- Conversation storage: minimal for Phase 1-3 because the plan uses stateless Responses calls
- MCP calls are only activated in Phase 3
- Memory is not enabled
- Custom guardrails are not enabled

### 16.3 Phase 3 cost impact

Phase 3 enables native MCP tool calling and keeps File Search available. Each domain may call `microsoft_docs_search` 2–6 times per run. With 7 domains and ~25 real review runs/month:

- MCP calls per review: 14–42
- Total MCP calls/month: 350–1,050
- MCP token cost: estimate 1,000–3,000 tokens per MCP response
- Additional monthly token cost: ~350K–3M tokens

At model-router pricing, this could add **₹50–500/month** in AI tokens. Monitor in Cost Management after Phase 3 go-live and adjust if needed.

Do not enable Memory during Phase 3. Do not add additional Knowledge stores unless they replace the existing `cari-knowledge-store` or are approved with a cost estimate. Keep custom guardrails disabled until the migration is stable and cost headroom is confirmed.

---

## 17. Acceptance Criteria

### 17.1 Phase 1 complete when:
- [ ] Foundry portal Monitor shows > 0 Agent runs
- [ ] Zero review failures attributable to telemetry code
- [ ] Unit tests pass
- [ ] Telemetry runs are distinguishable from real review runs in traces and metadata
- [ ] Telemetry pings do not include customer evidence and do not create misleading ARB findings in traces
- [ ] Deployed to production for ≥ 24 hours without incident

### 17.2 Phase 2 complete when:
- [ ] Synthesis call appears as Agent run in Foundry portal with token usage
- [ ] 10+ real reviews completed via Phase 2 path
- [ ] Finding quality baseline comparison passed (±5 scorecard, ±2 critical findings)
- [ ] Prompt/schema drift gates passed: recommendation normalization, scorecard dimensions, and visual evidence IDs
- [ ] Projected monthly cost remains below $50 with Phase 2 enabled
- [ ] P95 latency increase < 30s
- [ ] All quality gates verified for all 10 reviews
- [ ] Deployed and stable for ≥ 5 business days

### 17.3 Phase 3 complete when:
- [ ] All 7 domain calls visible as Agent runs in Foundry portal
- [ ] File Search and `microsoft_learn` MCP tool calls visible in Foundry Traces for reviews that require those tools
- [ ] Memory remains disabled and no additional Knowledge store is added without cost approval
- [ ] Projected monthly cost remains below $60 after Phase 3 is enabled
- [ ] 27/27 eval framework tests pass on Phase 3 path
- [ ] FP validation suite passes
- [ ] 10+ real reviews completed on Phase 3 path
- [ ] Deployed and stable for ≥ 10 business days
- [ ] Old Chat Completions fan-out code path is deprecated (but not deleted — kept for 30 days)

---

## 18. Decision Log

| Date | Decision | Rationale | Decided by |
|---|---|---|---|
| 2026-05-28 | Phased migration (3 phases) over big-bang rewrite | Minimizes downtime risk; each phase independently reversible | Expert team |
| 2026-05-28 | Feature flag `USE_AGENTS_API` with 4 values | Instant rollback without redeploy; battle-tested pattern in CARI codebase | Azure AI Architect |
| 2026-05-28 | Stateless single-turn Responses calls for Phase 1-3 | Matches the installed `@azure/ai-projects` SDK and existing `foundryResponsesAgentRequest()` helper; avoids persistent state leakage | Azure AI Architect |
| 2026-05-28 | Treat Foundry portal agent version `7` as a runtime contract | The agent has model-router, File Search, Microsoft Learn MCP, and portal instructions that can differ from code prompts | Azure AI Architect |
| 2026-05-28 | Prompt/schema drift must be resolved before Phase 2 | Portal instructions currently differ from code in recommendation labels, scoring weights, Networking dimension, and visual evidence schema | Expert team |
| 2026-05-28 | Use File Search and Microsoft Learn MCP, defer Memory and custom Guardrails | Keeps solution quality grounded while preserving the $60/month budget target; Memory is preview and not needed for stateless reviews | Azure Cloud Architect |
| 2026-05-28 | Keep a $50 projected-cost warning threshold and $60 action threshold | Current MTD cost is ~₹3,734 (~$39), leaving limited headroom for agent/tool expansion | Senior PM / GitHub Expert |
| 2026-05-28 | Keep Chat Completions fallback in all phases | Review quality must never degrade; fallback ensures continuity | Senior Director |
| 2026-05-28 | Model MUST remain `model-router` | Per memory: fix 404s by recreating deployment, never switch models | Azure Cloud Architect |
| 2026-05-28 | Phase 3 requires shadow-run comparison before go-live | 7-domain fan-out is highest risk; must prove output equivalence before cutover | Senior PM |
| 2026-05-28 | Quality gates stay in runAgent.js (not moved) | Gates are outside arb-foundry-agent.js; no migration needed | Full-Stack Developer |
| 2026-05-28 | Do not delete Chat Completions code for 30 days post-Phase 3 | Emergency recovery path; deletion only after proven stability | Senior Director |
| 2026-05-28 | Use top-level Responses API `agent_reference` in SDK/REST examples | Aligns examples with the Foundry Responses request body and existing helper | Azure AI Architect |
| 2026-05-28 | Treat Phase 1 telemetry runs as non-review runs | Prevents telemetry pings from polluting review-quality dashboards | Senior PM / Azure AI Architect |
| 2026-05-28 | App-level MCP cache does not control native Foundry MCP calls | Native tools execute inside Foundry; app cache remains for fallback/manual grounding unless a proxy is added | Azure AI Architect |
| 2026-05-28 | Phase 3 activation requires projected month-end cost below `$50` | Keeps operating headroom under the `$60` hard cap | Senior Director |
| 2026-05-30 | TRK-022 closed Rolled Back — portal agent approach fails Section 28 gates 0/5 across 10 reviews | Second 5-run shadow test (2026-05-30): scoreDeltas maxDelta 30–48pt (threshold ≤5) every run; domainCoverage fails 4/5 runs; missingEvidence fails 5/5 runs. Root cause: portal agent holistic system prompt overrides per-domain scoring rules injected via user message — architectural incompatibility, not tunable | Expert team (unanimous — all roles) |
| 2026-05-30 | TRK-023 (Phase 3 full activation) Deferred | Phase 3 cannot be activated until a redesigned approach passes TRK-022. Two options for future session: (A) raw Responses API without agent_reference — domain-specific system prompt injected directly; (B) keep Phase 2 (Chat Completions) as the permanent production architecture | Senior Director |
| 2026-05-30 | `USE_AGENTS_API` changed from `shadow` → `synthesis` | Shadow overhead was adding up to 3 min to every production review (Durable activity awaited `_shadowPromise` with 3-min cap). Shadow code remains in codebase dormant (gated by `=== 'shadow'`). Phase 2 synthesis path is unaffected | Azure Cloud Architect + Senior PM |
| 2026-05-30 | Phase 2 (Chat Completions + synthesis via Agents API) designated as stable production path | TRK-020 soak continues through 2026-06-05. Phase 2 produces consistent, high-quality output. No migration to Phase 3 until TRK-022 can pass with a redesigned approach | Senior Director |

---

## 19. Migration Dependency Register

This register is the implementation dependency checklist for the Foundry agent migration. A phase cannot be enabled in production until every dependency marked for that phase is verified.

### 19.1 Runtime and package dependencies

| Dependency | Current state | Required action | Phase gate | Owner |
|---|---|---|---|---|
| Node.js runtime | API and frontend require Node `>=22.0.0`; `deploy-api.yml` uses `22.x` | Keep Node 22 as the validation target; do not document Node 20 as supported for this migration | Phase 1 | Full-Stack Developer |
| Azure Functions runtime | `@azure/functions@^4.14.0`, Azure Functions v4, Linux Flex Consumption | Keep deploy target as `func-arb-review-api-flex`; no slot-based dependency because Flex slots are unavailable | Phase 1 | Azure Cloud Architect |
| Durable Functions | `durable-functions@^3.3.1`; `runAgent` activity timeout is 25 minutes; orchestrator timeout is 30 minutes | Any timeout change must update `orchestratorAgentReview.js` and replay tests together | Phase 2+ | Full-Stack Developer |
| Azure identity SDK | `@azure/identity@^4.13.0` | Continue `DefaultAzureCredential`; no API keys or long-lived service principal secrets | Phase 1 | Azure Cloud Architect |
| Azure AI Projects SDK | `@azure/ai-projects@^2.1.1` already installed | No new package required. If switching from REST helper to SDK client, pin/test exact SDK behavior first | Phase 1 | Azure AI Architect |
| Native HTTP/fetch surface | `foundryResponsesAgentRequest()` uses REST via `fetchJsonWithTimeout()` | Extend the helper to accept `{ timeoutMs, maxOutputTokens }`; do not add a second client abstraction | Phase 2 | Full-Stack Developer |
| Storage SDKs | `@azure/storage-blob@^12.28.0`, `@azure/data-tables@^13.3.2` | Preserve existing Blob/Table state persistence for reviews, jobs, telemetry, and MCP cache | Phase 1 | Full-Stack Developer |
| Document parsing packages | `pdf-parse`, `docx`, `exceljs`, `pptxgenjs`, `jszip` | No migration change, but extraction output remains upstream input dependency for agent review | Phase 1 | Full-Stack Developer |

### 19.2 Azure resource dependencies

| Dependency | Current state | Required action | Phase gate | Owner |
|---|---|---|---|---|
| Azure subscription/resource group | `87cf2b93-5e52-4533-9e6b-7182cd7dbde6`, `rg-arb-review-prod` | Keep all migration changes inside this production boundary unless an explicit staging environment is created | Phase 1 | Senior PM |
| Function App | `func-arb-review-api-flex`, Linux Flex Consumption, system-assigned managed identity | Verify app settings and managed identity before enabling each phase flag | Phase 1 | Azure Cloud Architect |
| Static Web App | `stapp-arb-review-prod`, live host `thankful-pond-04383960f.7.azurestaticapps.net` | No frontend dependency for Phase 1-3 except existing health/status UX; keep live route stable | Phase 1 | UI/UX Specialist |
| Azure AI Foundry project endpoint | `https://ai-arb-review-prod.services.ai.azure.com/api/projects/arb-review-proj` | Must be present as `FOUNDRY_PROJECT_ENDPOINT`; verify `/openai/v1/responses` access with managed identity | Phase 1 | Azure AI Architect |
| Foundry agent | `cari-arb-review-agent`, version `7`, model `model-router` | Export or screenshot YAML/config before Phase 2; treat versioned configuration as runtime contract | Phase 2 | Azure AI Architect |
| Model deployments | `model-router` capacity 120; `gpt-5.4` 10; `arb-gpt41` 100; `arb-gpt41mini` 100 | Preserve three-tier fallback for Chat Completions path; do not replace `model-router` with a direct model | Phase 1 | Azure Cloud Architect |
| File Search vector store | `cari-knowledge-store` (~29.57 KB) | Use existing store only; do not create duplicate knowledge stores without budget approval | Phase 3 | Azure AI Architect |
| Microsoft Learn MCP tool | `microsoft_learn` at `https://learn.microsoft.com/api/mcp` | Validate tool-call traces before removing manual Microsoft Learn grounding | Phase 3 | Azure AI Architect |
| Memory | Preview, not enabled for this migration | Keep disabled in Phase 1-3; revisit only for future follow-up chat UX | Phase 1 | Senior Director |
| Guardrails | Inherits `Microsoft.DefaultV2`; no custom guardrail assigned | Keep inherited default during migration; custom guardrail requires separate FP validation and cost review | Phase 1 | Azure AI Architect |
| Storage account | Blob containers and tables back review state, artifacts, input/output files, jobs, telemetry | Preserve table/blob schemas; do not log customer evidence in telemetry pings | Phase 1 | Full-Stack Developer |
| Application Insights / Log Analytics | Used for health, traces, timeout/fallback monitoring | Add `agents-api` trace markers before enabling Phase 2 and Phase 3 | Phase 2 | Senior PM |
| Azure Cost Management | MTD baseline ~₹3,734 (~$39); hard budget $60/month | Run cost query before enabling Phase 2 and Phase 3; apply $50 warning / $60 action thresholds | Phase 2+ | Senior PM |

### 19.3 RBAC and identity dependencies

| Principal | Required access | Why it is required | Phase gate |
|---|---|---|---|
| Function App managed identity | Azure AI / Cognitive Services user access on `ai-arb-review-prod` and project-backed Responses endpoint | Chat Completions and Foundry Responses calls use bearer tokens, not API keys | Phase 1 |
| Function App managed identity | Ability to request token for `https://ai.azure.com/.default` | `foundryResponsesAgentRequest()` uses this scope for `/openai/v1/responses` | Phase 1 |
| Function App managed identity | Storage Blob Data Contributor on review storage | Read uploaded evidence and write output artifacts | Phase 1 |
| Function App managed identity | Storage Table Data Contributor on review storage | Read/write review records, jobs, telemetry, rule outputs, and persisted agent results | Phase 1 |
| Function App managed identity | Key Vault Secrets User on `kv-arb-review-prod` | Resolve `FOUNDRY_AGENT_ID` and other Key Vault-backed app settings | Phase 1 |
| Function App managed identity | Azure AI Search data-plane access, if search indexing/searchChunks remain enabled | Preserve existing search grounding before and during agent migration | Phase 1 |
| Function App managed identity | Cognitive Services User on Document Intelligence and Vision resources | Extraction and visual evidence generation remain upstream dependencies | Phase 1 |
| GitHub Actions OIDC service principal | Deploy rights for `func-arb-review-api-flex` and read/list validation permissions | `deploy-api.yml` deploys and verifies function registration with OIDC | Phase 1 |
| Foundry project/hub managed identity | Access to File Search knowledge assets as configured by Foundry | Agent-native File Search depends on portal-side tool configuration | Phase 3 |

### 19.4 Function App setting dependencies

| App setting | Required value/state | Dependency note | Phase gate |
|---|---|---|---|
| `USE_AGENTS_API` | Add explicit `off`; later `telemetry`, `synthesis`, `full` | Primary rollback and rollout control | Phase 1 |
| `USE_DURABLE_ORCHESTRATION` | `ON` | Agent review path assumes Durable orchestrator is the production route | Phase 1 |
| `FOUNDRY_PROJECT_ENDPOINT` | `https://ai-arb-review-prod.services.ai.azure.com/api/projects/arb-review-proj` | Used by both Chat Completions and Responses calls | Phase 1 |
| `FOUNDRY_AGENT_NAME` | `cari-arb-review-agent` | Required for `agent_reference` calls | Phase 1 |
| `FOUNDRY_AGENT_VERSION` | `7` initially | Pin version during migration; do not float to unpublished portal changes | Phase 1 |
| `FOUNDRY_AGENT_ID` | Key Vault reference | Existing portal reference; keep for health/config visibility even if Responses path uses name/version | Phase 1 |
| `FOUNDRY_ANALYSIS_MODEL` | `model-router` | Primary Chat Completions deployment and fallback path dependency | Phase 1 |
| `FOUNDRY_ANALYSIS_MODEL_2` | `gpt-5.4` | Secondary fallback for current path | Phase 1 |
| `FOUNDRY_AGENT_MODEL` | `arb-gpt41` or current production setting | Tertiary fallback and legacy agent model setting | Phase 1 |
| `FOUNDRY_VISION_MODEL` | `arb-gpt41` | Visual evidence descriptions remain upstream evidence dependency | Phase 1 |
| `FOUNDRY_FANOUT_ENABLED` | Not set in production; code default `true` | Keep default unless diagnosing fan-out failures | Phase 1 |
| Storage table/blob settings | Existing production values | Required for review lifecycle, artifacts, evidence, telemetry, and Durable state | Phase 1 |
| `AZURE_SEARCH_ENDPOINT` / `AZURE_SEARCH_INDEX_NAME` | Existing production values | Preserve searchChunks path during migration | Phase 1 |
| `AZURE_DOCINT_ENDPOINT` / `AZURE_VISION_ENDPOINT` | Existing production values | Extraction and visual evidence must continue working before agent review | Phase 1 |

### 19.5 Code and contract dependencies

| Dependency | Current state | Required action | Phase gate |
|---|---|---|---|
| `foundryResponsesAgentRequest()` | Exists but only accepts `input` and hard-codes 120s timeout | Add options for timeout/output tokens; export or inject for unit testing | Phase 2 |
| `extractResponsesText()` | Extracts `output_text` or text chunks from Responses output | Add tests for current and fallback response shapes before production use | Phase 1 |
| `runArbAgentReviewFanOut()` | Current 7-domain Chat Completions fan-out path | Keep as fallback for Phase 2 and Phase 3; do not delete for 30 days after Phase 3 | Phase 2+ |
| Synthesis call | Current Chat Completions synthesis uses `SYNTHESIS_SYSTEM_PROMPT` and 60s timeout | Create `runSynthesisViaAgentsApi()` and fallback to current synthesis on any error | Phase 2 |
| Domain calls | Current domain prompts inject evidence, rule findings, visual evidence, and manual Learn grounding | Create `buildDomainAgentInput()` with structured deterministic context and domain-scoped evidence | Phase 3 |
| `parseRecommendation()` | Already maps portal labels to runtime labels | Keep and add regression tests for `Approved`, `Approved with Conditions`, `Needs Revision` | Phase 2 |
| `parseAgentResponse()` / schema normalization | Current parser recovers JSON and normalizes fields | Reuse for Responses output; reject non-JSON or malformed outputs into fallback path | Phase 2 |
| `runAgent.js` quality gates | Applies suppression, duplicate rule exclusion, schema validation, orphan stripping, thin-evidence downgrade | Keep gates outside transport-specific code; add tests that gates run after Agents API path | Phase 1 |
| Visual evidence contract | Runtime supports `visualEvidenceIds` and strips orphan IDs | Portal prompt must include `visualEvidenceIds` before Phase 2/3 review output is trusted | Phase 2 |
| Scorecard contract | Runtime includes Networking dimension and internal recommendation labels | Reconcile portal prompt or code/test expectations before Phase 2 | Phase 2 |
| MCP cache and metadata | Current code has 6-hour Microsoft Learn cache and `mcpMetadata` | Keep app-level cache for Chat Completions/manual grounding fallback; document whether the Agents API path uses native MCP directly or a future app-owned MCP proxy | Phase 3 |

### 19.6 Testing, CI/CD, and release dependencies

| Dependency | Current state | Required action | Phase gate | Owner |
|---|---|---|---|---|
| API unit tests | `api && npm test` via Node test runner | Add mocked tests for telemetry, synthesis fallback, domain fallback, response parsing, label mapping | Phase 1+ | Full-Stack Developer |
| Durable replay tests | Existing `orchestratorAgentReview.test.js` asserts 30-minute timeout | Update only if timeout changes; otherwise keep passing unchanged | Phase 1 | Full-Stack Developer |
| CARI evaluation workflow | `.github/workflows/cari-evaluations.yml` runs API tests, frontend build, mock evals, export parity | Keep mock mode in CI; do not run live Foundry evals automatically on PRs | Phase 1 | GitHub Expert |
| E2E golden path | `frontend` script `test:e2e:golden-path` | Required before each production flag change | Phase 2+ | UI/UX Specialist |
| FP validation | `frontend` script `test:e2e:fp-validation` plus red-team eval cases | Required before Phase 3; custom guardrails cannot be enabled until this passes | Phase 3 | Azure AI Architect |
| Deployment workflow | `.github/workflows/deploy-api.yml` runs tests, npm audit, OIDC deploy, health check, function-count verification | No workflow bypass for migration PRs; all code deploys go through this path | Phase 1 | GitHub Expert |
| GitHub secrets | `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`; E2E login secrets for browser tests | Verify secrets exist before phase PRs; do not add Azure client secrets | Phase 1 | GitHub Expert |
| Production smoke test | `/api/health` returns healthy or protected-running signal | Run after deploy and before changing `USE_AGENTS_API` | Phase 1 | Senior PM |
| Foundry portal traces | Monitor/Traces tabs available for agent version `7` | Confirm token counts and tool traces after enabling telemetry/synthesis/full | Phase 1+ | Azure AI Architect |

### 19.7 Budget and product dependencies

| Dependency | Current state | Required action | Phase gate | Owner |
|---|---|---|---|---|
| Monthly budget | Hard target is `<= $60/month`; MTD ~`$39` on 2026-05-28 | Check projected cost before Phase 2 and Phase 3; halt if projected exceeds `$50` | Phase 2+ | Senior PM |
| Foundry Models cost | Largest current cost driver | Track prompt size, completion size, retry/fallback counts, and Phase 3 fan-out token growth | Phase 2+ | Azure AI Architect |
| Foundry Tools cost | Existing cost line ~₹221 MTD | Monitor after native MCP/File Search usage starts; investigate >20% week-over-week growth | Phase 3 | Azure AI Architect |
| Memory feature | Disabled | Keep disabled to avoid embedding/chat storage cost and cross-review context risk | Phase 1 | Senior Director |
| Custom guardrails | Disabled; inherited default only | Keep disabled until cost headroom and FP validation pass | Phase 1 | Senior Director |
| Reviewer UX | No new follow-up chat UX in this migration | Do not introduce persistent conversations or Memory until product explicitly adds follow-up review conversations | Future | UI/UX Specialist |

### 19.8 Dependency go/no-go checklist

- [ ] `USE_AGENTS_API=off` is present in Function App settings before Phase 1 code merge.
- [ ] Function App managed identity can acquire both `https://cognitiveservices.azure.com/.default` and `https://ai.azure.com/.default` tokens.
- [ ] Function App managed identity can call `POST {FOUNDRY_PROJECT_ENDPOINT}/openai/v1/responses` with `agent_reference`.
- [ ] Foundry agent version `7` export/screenshot is attached to the Phase 2 PR.
- [ ] Portal instructions are reconciled with runtime schema: recommendation labels, score weights, Networking dimension, and `visualEvidenceIds`.
- [ ] `foundryResponsesAgentRequest()` options and response parsing have unit coverage.
- [ ] Chat Completions fallback path remains intact and tested.
- [ ] `/api/health` smoke test passes after deployment and before flag activation.
- [ ] Azure Cost Management projection remains under `$50` before Phase 2 and Phase 3 activation, and under `$60` after Phase 3 activation.
- [ ] During Phase 3 shadow/go-live, Foundry traces prove File Search and `microsoft_learn` MCP are called only when needed before manual grounding is removed from the authoritative Agents API path.

---

## 20. Automated Browser Validation Plan

Every migration phase must be validated by an automated browser subagent before production flag activation. The browser subagent represents a real CARI reviewer using the live UI, not just API unit tests. It must verify that each change works end-to-end from upload through extraction, agent review, findings display, scorecard, decision, exports, and rollback behavior.

### 20.1 Browser subagent scope

| Area | Browser subagent responsibility | Phase gate |
|---|---|---|
| Navigation and auth | Open the live site, authenticate if required, land on `/arb`, and confirm no route/auth regression | Phase 1+ |
| Project/review creation | Create or reuse a controlled test project/review without disturbing production customer reviews | Phase 1+ |
| Evidence upload | Upload the Contoso ALZ fixture set and verify files render in the review workspace | Phase 1+ |
| Extraction status | Wait for extraction completion, detect timeout/error states, and capture screenshots on failure | Phase 1+ |
| Agent run start | Trigger ARB review through the same UI control a reviewer uses | Phase 1+ |
| Progress/status UX | Verify running, completed, failed, and timeout states are visible and understandable | Phase 1+ |
| Findings table | Validate findings render with severity, domain, title, owner, evidence references, and learn links | Phase 2+ |
| Scorecard UX | Validate scorecard dimensions, total score, recommendation, blockers, and missing evidence counts | Phase 2+ |
| Visual evidence UX | Validate diagram/image-backed findings show valid visual evidence references where applicable | Phase 2+ |
| False-positive suppression | Confirm known ownership/boundary-control false positives are not shown after quality gates | Phase 2+ |
| Export paths | Generate/export board-ready outputs and verify they include the same findings/scorecard as the UI | Phase 2+ |
| Rollback validation | Flip `USE_AGENTS_API=off` in a test window and confirm the UI still completes review via Chat Completions | Phase 2+ |
| Cost/trace validation | Cross-check browser run ID with App Insights/Foundry traces and Cost Management sampling | Phase 3 |

### 20.2 Required automated browser environments

| Environment | URL | Purpose | Required before |
|---|---|---|---|
| Local dev | `http://localhost:3000` with local API or configured production API | Fast UI regression checks while branch is under development | PR review |
| PR/branch validation | GitHub Actions Playwright environment | Repeatable browser test evidence attached to CI run | PR merge |
| Production smoke | `https://thankful-pond-04383960f.7.azurestaticapps.net/arb` | Validate deployed code before changing `USE_AGENTS_API` | Flag activation |
| Post-flag production | Same live URL after flag change | Validate the actual phase path is active and stable | Phase acceptance |

Production browser tests must use a dedicated test project/review name such as `agents-api-integration-test` or `gcp-test`. Do not run destructive cleanup against real customer review records. If cleanup is needed, delete only records created by the test user and test project prefix.

### 20.3 Browser subagent test suites

Use the existing frontend scripts as the first automation surface:

```bash
cd frontend
npm run test:e2e:golden-path
npm run test:e2e:fp-validation
npm run test:e2e:projects
npm run test:e2e:core
npm run test:e2e:a11y
npm run test:e2e:visual
```

Required additions for this migration:

| New suite | Purpose | Minimum scenarios |
|---|---|---|
| `agents-api-phase1.spec` | Validate telemetry-only rollout through the browser | Site opens, review run completes, findings unchanged, Foundry Monitor shows telemetry run |
| `agents-api-phase2-synthesis.spec` | Validate synthesis via agent-reference path | Review completes, recommendation normalized, scorecard dimensions valid, fallback banner/log absent on success |
| `agents-api-phase2-fallback.spec` | Validate synthesis fallback | Simulate or force Responses failure, confirm UI still completes via Chat Completions and logs fallback |
| `agents-api-phase3-fanout.spec` | Validate full fan-out via agent-reference path | Seven domain outputs render, no missing required domains, no duplicate deterministic findings |
| `agents-api-phase3-tool-traces.spec` | Validate native tools | For evidence naming Azure services, verify Foundry traces show File Search and `microsoft_learn` MCP calls |
| `agents-api-rollback.spec` | Validate rollback | Set `USE_AGENTS_API=off`, run review, confirm old path completes and UI remains stable |
| `agents-api-cost-guard.spec` | Validate budget guard process | Read latest cost query artifact or manual input and block Phase 3 if projected cost exceeds threshold |

The browser subagent must fail the phase if any required suite fails, if a screenshot shows unreadable/overlapping UI, or if the UI completes while backend logs show fallback that was not expected for that test.

### 20.4 Phase-specific browser validation matrix

| Phase | Feature flag during test | Required browser tests | Required backend/portal correlation |
|---|---|---|---|
| Baseline | `USE_AGENTS_API=off` | `golden-path`, `fp-validation`, `projects`, `core` | API health healthy; no Foundry agent run dependency |
| Phase 1 | `USE_AGENTS_API=telemetry` | Baseline tests + `agents-api-phase1.spec` | Telemetry-labeled Foundry Monitor run count increases; UI output matches baseline |
| Phase 2 pre-go-live | `USE_AGENTS_API=synthesis` in test window | Phase 1 tests + `agents-api-phase2-synthesis.spec` + fallback suite | Foundry run visible for synthesis; App Insights has no unexpected `agents-api` errors |
| Phase 2 soak | `USE_AGENTS_API=synthesis` | Daily golden-path smoke for 5 business days | P95 latency delta < 30s; cost projection < $50 |
| Phase 3 shadow | `USE_AGENTS_API=synthesis` with shadow-run code enabled | `agents-api-phase3-fanout.spec` in non-authoritative shadow mode | Shadow output compared with production output; no UI uses shadow result |
| Phase 3 go-live | `USE_AGENTS_API=full` | Full suite including tool traces, FP validation, visual evidence, export parity | Seven domain agent runs visible; File Search/MCP traces present when expected |
| Rollback | `USE_AGENTS_API=off` | `agents-api-rollback.spec` + golden path | New reviews complete through Chat Completions; no stuck Durable instances |

### 20.5 Golden-path browser scenario

The canonical browser flow for every phase is:

1. Open the live `/arb` workspace.
2. Create or select the test project `agents-api-integration-test`.
3. Create a new review with a unique timestamped name.
4. Upload the Contoso ALZ fixture package:
   - `Contoso_ALZ_High_Level_Design_v1.0.docx`
   - `Contoso_ALZ_Low_Level_Design_v1.0.xlsx`
   - `Contoso_ALZ_Hub_Spoke_Network_Topology.drawio`
   - `contoso-alz-hld.png`
5. Wait for extraction to complete.
6. Start ARB review.
7. Wait for review completion or controlled timeout.
8. Assert that findings, missing evidence, scorecard, recommendation, and next actions render.
9. Assert that every displayed finding has:
   - severity
   - domain
   - evidence reference or valid missing-evidence rationale
   - `learn.microsoft.com` URL
   - no duplicate deterministic `ruleId`
10. Generate board/export output and verify it matches the UI-visible decision data.
11. Capture browser screenshots and trace artifacts.
12. Record review ID, Durable instance ID if visible, feature flag value, and timestamp for App Insights/Foundry correlation.

### 20.6 UI/UX validation checks

The UI/UX Specialist must review automated browser artifacts before sign-off:

| Check | Pass criteria |
|---|---|
| Responsive layout | `/arb` review workspace remains usable at desktop and laptop widths used by reviewers |
| Progress clarity | Running/extracting/reviewing/completed states are visible without page reload confusion |
| Error clarity | Fallback, timeout, or failure states use actionable language and do not expose stack traces |
| Findings scanability | Severity, domain, title, evidence, and recommendation can be scanned without horizontal overflow |
| Scorecard consistency | Overall recommendation and scorecard dimensions are visually consistent with exported output |
| Evidence traceability | Evidence and visual evidence references are clickable or clearly inspectable |
| Accessibility | Critical controls have accessible names; keyboard navigation works for run/retry/export controls |
| No misleading telemetry | Phase 1 telemetry pings do not surface as fake ARB findings in reviewer-facing UI |

Any screenshot showing overlapping text, clipped buttons, unreadable table columns, missing loading state, or stale status after refresh blocks phase activation.

### 20.7 Automated browser artifacts

Every phase PR and production flag change must attach or link:

| Artifact | Required content |
|---|---|
| Playwright HTML report | Pass/fail status for required suites |
| Screenshots | Review list, upload/extraction state, completed findings, scorecard, export confirmation, error/fallback state if tested |
| Browser trace/video | At least one successful golden-path run and every failed run |
| Console/network log summary | No uncaught UI errors; API failures are expected only in explicit fallback tests |
| Review correlation file | Review ID, project ID, feature flag value, test timestamp, browser suite name |
| Backend correlation notes | App Insights query result, Foundry Monitor/Trace screenshot, cost query result when required |

Artifacts should be retained for at least 7 days in GitHub Actions. Phase 2 and Phase 3 sign-off artifacts should be copied to the PR or release notes before merge/activation.

### 20.8 Automated browser subagent operating rules

- Run browser validation after code deployment but before feature flag activation.
- Run browser validation again after feature flag activation.
- Use test-owned records only; never modify real customer review records.
- Use stable selectors or accessible roles; do not depend on fragile CSS class names.
- Wait on explicit UI state and API status, not fixed sleeps, except for bounded cold-start allowance.
- Treat unexpected Chat Completions fallback as a failure when testing `synthesis` or `full`.
- Treat expected fallback as a failure if the UI does not clearly complete and persist results.
- Capture screenshots before retrying any failed step.
- Do not disable browser screenshots, traces, or videos for migration PRs.
- Do not run live deployed-mode evals automatically on a schedule; they consume AI budget.

### 20.9 Browser validation commands

Recommended local/PR validation:

```bash
cd frontend
npm ci
npm run build
npm run test:e2e:golden-path
npm run test:e2e:fp-validation
```

Recommended production smoke after API deployment:

```powershell
Invoke-WebRequest -Uri https://func-arb-review-api-flex.azurewebsites.net/api/health -UseBasicParsing -TimeoutSec 30
cd frontend
npm run test:e2e:golden-path
```

Recommended Phase 3 pre-activation validation:

```bash
cd api && npm test
cd ../frontend && npm run build
npm run test:e2e:golden-path
npm run test:e2e:fp-validation
npm run test:e2e:visual
python ../evals/run_cari_eval.py
python ../evals/run_export_parity_eval.py
```

### 20.10 Browser validation acceptance gates

Phase activation is blocked unless all conditions are true:

- [ ] Required Playwright suites pass for the phase.
- [ ] Screenshots show no UI regression in review workspace, findings, scorecard, or export views.
- [ ] No uncaught browser console errors during the golden path.
- [ ] API health is healthy before and after the phase flag change.
- [ ] Durable review status reaches completed, failed-with-clear-error, or controlled timeout; no silent stuck state.
- [ ] Findings and scorecard in the UI match persisted/exported data.
- [ ] Foundry Monitor/Traces correlate with the browser review ID for Phases 1-3.
- [ ] Phase 2 and Phase 3 browser runs stay within the cost guardrails in Section 16.
- [ ] Rollback browser test passes before Phase 2 or Phase 3 is considered production-ready.

---

## 21. Critical Handling Plan and PDCA Execution Model

This migration must be run as a controlled quality program, not just a code change. The team will use **PDCA — Plan, Do, Check, Act** — for every phase so each release is planned, implemented, validated, corrected, and only then promoted.

### 21.1 Things to handle very carefully

| Critical item | Why it is risky | Most effective handling method | Owner |
|---|---|---|---|
| Prompt/schema drift between portal and code | The UI/export pipeline expects runtime labels, scorecard dimensions, evidence IDs, and `visualEvidenceIds`; the portal prompt currently differs | Freeze agent version `7`; reconcile prompt/schema before Phase 2; add parser/normalization tests for recommendation labels, score dimensions, and visual evidence | Azure AI Architect + Full-Stack Developer |
| Quality gates in `runAgent.js` | These gates prevent duplicate deterministic findings, false positives, invalid evidence IDs, invalid schema, and thin-evidence High findings | Keep gates outside transport code; test the same gates against Chat Completions output and Agents API output | Full-Stack Developer |
| Feature flag rollback | A bad agent path must be reversible without redeploy | Add `USE_AGENTS_API=off` before Phase 1; test rollback through browser automation before Phase 2 and Phase 3 activation | Senior PM + GitHub Expert |
| Foundry portal configuration drift | Portal prompt/tool edits can change behavior without code review | Export/screenshot version `7` config before Phase 2; require PR sign-off for any portal prompt/tool/version change | Azure AI Architect |
| Evidence grounding and hallucination control | ARB output must be evidence-grounded; native tools can supplement but not replace submitted evidence | Use structured deterministic context, exact `evidenceIds`, exact `visualEvidenceIds`, and post-output orphan stripping; keep missing items in `missingEvidence` | Azure AI Architect |
| 7-domain fan-out concurrency | Seven parallel agent-reference calls can spike TPM, latency, and fallback rates | Use 200ms stagger, per-domain timeouts, `Promise.allSettled`, partial fallback for 1-2 failures, full fallback for >2 failures | Full-Stack Developer |
| Native MCP and File Search use | Tool calls can improve quality but add token/tool cost and introduce trace complexity | Validate Foundry traces before removing manual grounding; keep existing `cari-knowledge-store`; monitor Foundry Tools cost | Azure AI Architect |
| Budget ceiling | Current run rate leaves only limited headroom under $60/month | Enforce $50 projected warning and $60 action threshold; freeze Phase 3 if cost trend is not safe | Senior PM |
| Telemetry bridge behavior | The ARB agent is optimized for JSON reviews, not telemetry messages | Keep telemetry payload tiny, evidence-free, and clearly marked; replace with a lightweight telemetry agent if traces become misleading | Azure AI Architect |
| Durable timeout boundaries | Agent latency can cause stuck or failed review workflows | Keep activity timeout below orchestrator timeout; any timeout change must update replay tests and browser validation | Azure Cloud Architect + Full-Stack Developer |
| UI/export consistency | Backend success is not enough if findings or scorecards render incorrectly | Use automated browser validation, screenshots, export parity, and review ID correlation for every phase | UI/UX Specialist |
| Production customer data safety | Test automation must not corrupt real review records | Use dedicated test project/review prefix; delete only test-owned records; never run broad cleanup on production | Senior PM + Full-Stack Developer |

### 21.2 Most efficient execution principles

1. Keep the migration transport-only until each phase proves stable. Do not mix agent migration with unrelated UI redesign, schema refactor, or infrastructure changes.
2. Deploy code with the new path dormant first, then activate by feature flag after smoke tests.
3. Use the existing `foundryResponsesAgentRequest()` helper first. Add options and tests; do not introduce a second client abstraction unless an ADR approves it.
4. Keep Chat Completions fallback intact through Phase 3 plus 30 days.
5. Do not enable Memory, duplicate Knowledge stores, or custom Guardrails during this migration.
6. Treat browser validation, App Insights traces, Foundry traces, and Cost Management as required release evidence.
7. Prefer small, reversible PRs: Phase 1 telemetry, Phase 2 synthesis, Phase 3 fan-out shadow, Phase 3 full activation.
8. Document every portal-side change in the PR because portal configuration becomes runtime behavior.

### 21.3 PDCA model for every phase

| PDCA step | Required activities | Required evidence | Exit criteria |
|---|---|---|---|
| **Plan** | Confirm scope, feature flag value, rollback path, cost headroom, agent version, test data, and owner sign-off | Phase checklist, exported agent config, cost query, test plan | Plan reviewed by Azure AI Architect, Full-Stack Developer, Senior PM, and Senior Director for Phase 3 |
| **Do** | Implement the smallest phase-specific code/config change behind the feature flag | PR, code diff, app setting commands, deployment run link | Code deployed with flag still safe (`off` or previous stable value) |
| **Check** | Run API tests, evals, browser subagent validation, health checks, App Insights queries, Foundry traces, cost check | Test logs, Playwright report, screenshots, trace IDs, Foundry Monitor screenshot, cost result | All phase gates pass; fallback behavior verified |
| **Act** | Promote, hold, rollback, or revise based on evidence; update decision log and plan | Decision record, rollback evidence if used, updated plan | Phase status is explicit: proceed, pause, rollback, or rework |

### 21.4 PDCA checklist by phase

#### Phase 1 — Telemetry Bridge

| Step | Checklist |
|---|---|
| Plan | Confirm `USE_AGENTS_API=off` exists; confirm agent version `7`; confirm telemetry payload excludes evidence; confirm cost is below warning threshold |
| Do | Add telemetry helper behind `USE_AGENTS_API=telemetry`; deploy with flag still `off`; then set `telemetry` only after health smoke |
| Check | API tests pass; browser golden path matches baseline; telemetry-labeled Foundry Monitor run count increases; no fake ARB findings are created by telemetry |
| Act | If telemetry is clean, keep for 24h and proceed to Phase 2 planning; if noisy, roll back to `off` and create a lightweight telemetry agent option |

#### Phase 2 — Synthesis Call Migration

| Step | Checklist |
|---|---|
| Plan | Reconcile portal prompt/schema; define synthesis input size limits; confirm fallback to Chat Completions; confirm cost projection below `$50` |
| Do | Extend `foundryResponsesAgentRequest()` options; add `runSynthesisViaAgentsApi()`; deploy with flag still `telemetry`; then activate `synthesis` in a controlled test window |
| Check | Unit tests, parser tests, golden path, FP validation, export parity, Foundry synthesis trace, recommendation normalization, scorecard dimensions, `visualEvidenceIds` |
| Act | If output quality and latency match baseline, soak for 5 business days; if not, revert to `telemetry` or `off` and tune prompt/schema before retry |

#### Phase 3 — Full Fan-Out Migration

| Step | Checklist |
|---|---|
| Plan | Confirm exported tool configuration from Phase 2; confirm fan-out fallback thresholds; confirm cost projection below `$50`; confirm no Memory/custom Guardrail/duplicate Knowledge changes |
| Do | Implement domain agent-reference calls in shadow mode first; keep authoritative output on Phase 2 path; compare outputs for 5 reviews |
| Check | Seven domain outputs compare to baseline; no duplicate deterministic findings; native MCP/File Search traces appear when expected; cost remains below `$60`; full browser suite passes |
| Act | Enable `USE_AGENTS_API=full` only after shadow results pass; monitor 10 business days; keep Chat Completions path for 30 days |

### 21.5 Stop/go decision rules

| Situation | Decision |
|---|---|
| Any production review returns empty findings where baseline returns findings | Stop and set `USE_AGENTS_API=off` |
| Portal prompt/schema drift is unresolved | Do not enable Phase 2 or Phase 3 |
| Browser golden path fails after deployment | Do not change feature flag |
| Browser golden path fails after feature flag activation | Roll back feature flag and investigate |
| Unexpected fallback occurs in Phase 2/3 success tests | Hold phase; treat as a defect |
| Cost projection exceeds `$50` before Phase 3 | Do not enable Phase 3 |
| Cost projection or actual cost reaches `$60` | Roll back to `USE_AGENTS_API=off` and reduce trace/tool usage |
| Foundry traces do not show expected File Search/MCP calls in Phase 3 tests | Do not remove manual grounding |
| More than 2 of 7 domain agent calls fail in Phase 3 | Full fallback to Chat Completions fan-out |
| One or two domain calls fail in Phase 3 | Use Chat Completions for failed domains only and log domain-level fallback |

### 21.6 Team operating model

| Role | Primary responsibility |
|---|---|
| Microsoft Expert Azure Cloud Architect | Validate Azure resource, identity, RBAC, timeout, deployment, cost, and rollback architecture |
| Senior Project Manager / GitHub Expert | Own phase gates, PR evidence, CI/CD checks, cost guardrails, decision log, and sign-off tracking |
| UI/UX Specialist | Own browser validation artifacts, reviewer workflow quality, accessibility, screenshots, and export/UI consistency |
| Azure AI Architect | Own Foundry agent configuration, prompt/schema alignment, tool traces, MCP/File Search behavior, model routing, and quality baselines |
| Full-Stack Developer | Own code changes, feature flags, tests, fallback implementation, parser/schema handling, and telemetry markers |
| Senior Director, Cloud Solutions Architecture | Own final go/no-go for Phase 3, quality risk acceptance, and 30-day fallback retention decision |

### 21.7 Required phase evidence pack

Each phase PR or activation record must include:

- [ ] PR link and commit SHA.
- [ ] Feature flag value before and after activation.
- [ ] Agent version/config screenshot or export.
- [ ] API unit test result.
- [ ] CARI eval result, when applicable.
- [ ] Browser validation report and screenshots.
- [ ] App Insights query result for errors/fallbacks/timeouts.
- [ ] Foundry Monitor/Trace screenshot showing expected agent activity.
- [ ] Cost Management query result.
- [ ] Rollback test result.
- [ ] Explicit PDCA outcome: proceed, pause, rollback, or rework.

---

## 22. Live Migration Tracker and Resume Log

This section is the live tracker for the migration. It is "live" as the operating source of truth, but it is manually updated by the active engineer after each completed, blocked, deferred, or rolled-back activity. Update it after every meaningful activity so a new session can resume from this file without reconstructing context from chat history.

**Tracker status legend:** `Not Started`, `In Progress`, `Blocked`, `Done`, `Deferred`, `Rolled Back`.

**Last tracker update:** 2026-05-30 IST (session 10)  
**Current working phase:** Phase 2 soak only — TRK-020 Day 3/5. Phase 3 shadow validation closed: TRK-022 Rolled Back, TRK-023 Deferred.  
**Current production flag:** `USE_AGENTS_API=synthesis` — Phase 2 Chat Completions authoritative; shadow overhead eliminated (changed from `shadow` → `synthesis` 2026-05-30).  
**Current resume point:** TRK-020 soak ends 2026-06-05. No Phase 3 action required until after soak. TRK-022 second 5-run shadow test (2026-05-30) confirmed 0/5 pass across 9 App Insights traces. Root cause: portal agent holistic system prompt overrides domain-specific scoring rules — architectural incompatibility, not a tuning issue. scoreDeltas FAIL 5/5 (maxDelta 30–48pt), domainCoverage FAIL 4/5 (different domain missing each run), missingEvidence FAIL 5/5. TRK-023 deferred — Phase 3 redesign required before resuming. Focus: complete TRK-020 soak through 2026-06-05.

### Claude AI Session Context

| Item | Value |
|---|---|
| Weekly limit at plan completion | 85% used |
| Weekly reset time | ~5 hours after 2026-05-28 evening IST (resets overnight) |
| Usage credits | Enabled — $40 monthly limit, $0 spent |
| Implementation start | 2026-05-29 10:00 AM IST (fresh weekly cycle) |
| Safety net | Usage credits auto-activate if weekly cap is hit mid-session |

**First actions on 2026-05-29 at 10:00 AM IST:**

1. Open this file in VS Code and keep it visible in the editor (IDE selection context speeds up Claude).
2. Open a terminal panel alongside.
3. Tell Claude: *"Start the migration. Begin with TRK-012 and TRK-013 — read Section 22 of the migration plan first."*
4. Claude will run TRK-012 (`az functionapp config appsettings set ... --settings "USE_AGENTS_API=off"`) and TRK-013 (backup tag + branch) before touching any code.
5. Only after TRK-012 and TRK-013 are marked `Done` in the tracker should Phase 1 code implementation (TRK-014) begin.

**Tool recommendation:** Use VS Code with Claude Code extension (not CLI only). Inline diagnostics, split terminal, and IDE file selection context are all active — no tool switching needed.

### 22.1 Current Activity Tracker

| ID | Activity | Phase | Owner | Status | Last updated | Evidence / link | Resume notes |
|---|---|---|---|---|---|---|---|
| TRK-001 | Create Azure Foundry Agents API migration plan baseline | Planning | Senior PM / GitHub Expert | Done | 2026-05-28 | This document | Baseline architecture, risks, phases, rollback, cost, and dependency register documented |
| TRK-002 | Add automated browser validation plan | Planning | UI/UX Specialist + Full-Stack Developer | Done | 2026-05-28 | Section 20 | Browser subagent scope, suites, artifacts, and acceptance gates documented |
| TRK-003 | Add PDCA execution model | Planning | Senior PM / GitHub Expert | Done | 2026-05-28 | Section 21 | PDCA, stop/go rules, team operating model, and evidence pack documented |
| TRK-004 | Add live tracker and resume log | Planning | Senior PM / GitHub Expert | Done | 2026-05-28 | Section 22 | Use this section as the resume anchor if session context is lost |
| TRK-005 | Add migration control dashboard | Planning | Senior PM / GitHub Expert | Done | 2026-05-28 | Section 23 | Dashboard gives current phase, flag, cost, validation, and rollback status |
| TRK-006 | Add production runbooks | Planning | Azure Cloud Architect + Full-Stack Developer | Done | 2026-05-28 | Section 24 | Operator-ready phase runbooks added |
| TRK-007 | Add RACI and approval matrix | Planning | Senior Director | Done | 2026-05-28 | Section 25 | Ownership model for decisions and execution added |
| TRK-008 | Add data protection and logging policy | Planning | Azure Cloud Architect + Senior Director | Done | 2026-05-28 | Section 26 | Defines allowed and prohibited telemetry/log content |
| TRK-009 | Add failure injection and recovery drills | Planning | Full-Stack Developer + Azure AI Architect | Done | 2026-05-28 | Section 27 | Drills cover Agents API failure, throttling, malformed JSON, portal drift, and stuck Durable instances |
| TRK-010 | Add shadow-run comparison method | Planning | Azure AI Architect | Done | 2026-05-28 | Section 28 | Phase 3 comparison math and acceptance rules documented |
| TRK-011 | Add change-freeze and roll-forward rules | Planning | Senior Director + Senior PM | Done | 2026-05-28 | Section 29 | Freeze boundaries and controlled roll-forward paths documented |
| TRK-024 | Apply audit fixes to migration plan | Planning | Full-Stack Developer + Azure AI Architect | Done | 2026-05-28 | Sections 4, 6, 8, 10, 16, 19, 20, 23, 24, Appendix B/C | Fixed SDK sample, MCP/cache, telemetry, cost, and runbook inconsistencies |
| TRK-012 | Add `USE_AGENTS_API=off` to production Function App settings | Phase 1 | Azure Cloud Architect | Done | 2026-05-29 | `az functionapp config appsettings set` confirmed — value `off` live | Verified via `appsettings list` query |
| TRK-013 | Create backup tag and migration branch | Phase 1 | GitHub Expert | Done | 2026-05-29 | Tag `backup/pre-agents-api-migration-20260529` pushed; branch `feature/agents-api-phase1-telemetry` created | Permanent restore point in origin |
| TRK-014 | Implement Phase 1 telemetry helper | Phase 1 | Full-Stack Developer | Done | 2026-05-29 | `arb-foundry-agent.js` — `notifyAgentsApiTelemetry` added; `foundryResponsesAgentRequest` extended with options; exported; called from `runAgent.js` at review_started and review_completed | 291/291 tests pass |
| TRK-015 | Add Phase 1 tests and browser validation | Phase 1 | Full-Stack Developer + UI/UX Specialist | Done | 2026-05-29 | `arb-foundry-agent.telemetry.test.js` — 9 new tests: guard (flag/name), error swallowing, metadata shape | 291/291 pass; browser golden path validation pending post-deploy |
| TRK-016 | Activate Phase 1 telemetry in production | Phase 1 | Senior PM + Azure Cloud Architect | Done | 2026-05-29 | PR #46 merged; `USE_AGENTS_API=telemetry` set via `az` CLI; `/api/health` returns Healthy | 24-hour monitoring window open — watch Foundry Monitor + Log Analytics |
| TRK-017 | Export/screenshot Foundry agent version `7` config | Phase 2 | Azure AI Architect | Done | 2026-05-29 | YAML exported by user in session 2 (model-router, File Search, microsoft_learn MCP, no max_completion_tokens cap) | Confirm Foundry Monitor shows agent runs > 0 ✅ |
| TRK-018 | Reconcile portal prompt/schema drift | Phase 2 | Azure AI Architect + Full-Stack Developer | Done | 2026-05-29 | Code: `ARB_SYSTEM_PROMPT` + `buildUserMessage()` updated; `arb-foundry-agent.schema.test.js` (15 tests); 310/310 pass. Portal: v7-r3 pasted → agent version 9 live 2026-05-29. SOW traceability rules, scoring formula, designArtifacts, PPTX slide, UI chips all implemented. | TRK-018 complete — all schema drift gates closed |
| TRK-019 | Implement Phase 2 synthesis path and fallback | Phase 2 | Full-Stack Developer | Done | 2026-05-29 | `arb-foundry-agent.js` — `buildSynthesisAgentInput()`, `runSynthesisViaChatCompletions()`, `runSynthesisViaAgentsApi()` added; synthesis block in `runArbAgentReviewFanOut()` is feature-flag-gated; `arb-foundry-agent.synthesis.test.js` — 21 new tests; 331/331 pass | Code deployed with flag still `telemetry`; activate `synthesis` only after cost check < $50 |
| TRK-020 | Soak Phase 2 for 5 business days | Phase 2 | Senior PM | In Progress | 2026-05-29 | Cost query: MTD ₹3,806 (~$40 USD), projected ₹4,069 (~$43 USD) — gate PASS; `USE_AGENTS_API=synthesis` set 2026-05-29; `/api/health` 200 OK | Soak day 1 of 5. Run 10+ reviews on live site. Monitor Foundry Traces for synthesis agent-reference runs and Log Analytics for fallback/error markers. Close after 5 business days AND 10+ reviews with no regressions. Soak end target: 2026-06-05. |
| TRK-021 | Implement Phase 3 shadow fan-out | Phase 3 | Full-Stack Developer + Azure AI Architect | Done | 2026-05-29 | `arb-foundry-agent.js` — `buildDomainAgentInput()`, `runDomainFanOutViaAgentsApi()` added; 200ms stagger, `Promise.allSettled`, per-domain Chat Completions fallback (1-2 failures), full fallback (>2 failures); `USE_AGENTS_API=full` gate in `runArbAgentReviewFanOut()`; `arb-foundry-agent.fanout.test.js` — 10 new tests; 341/341 pass | Code deployed with flag still `synthesis` — dormant. Phase 3 runs only when `USE_AGENTS_API=full`. |
| TRK-022 | Compare Phase 3 shadow results | Phase 3 | Azure AI Architect + Senior Director | Rolled Back | 2026-05-30 | Second 5-run validation 2026-05-30: 0/5 pass across 9 App Insights traces. scoreDeltas FAIL 5/5 (maxDelta 30–48pt, threshold ≤5). domainCoverage FAIL 4/5 (Reliability/Governance/Operations/Security each disappeared in one run — non-deterministic Responses API timeout). missingEvidence FAIL 5/5. critHighDelta FAIL 4/5 (delta 4–9, threshold ≤2). ruleRetention PASS 5/5 ✅. learnLinks PASS 5/5 ✅. Root cause: portal agent holistic system prompt overrides domain-specific scoring rules embedded in user message — architectural incompatibility. `USE_AGENTS_API` rolled back to `synthesis` (2026-05-30) to eliminate 3-min shadow overhead from production reviews. | Phase 3 portal-agent approach cannot pass Section 28 gates. TRK-023 Deferred. Durable shadow infrastructure (commit `ee32978`) and `compareShadowResults()` remain in code, dormant. |
| TRK-023 | Activate Phase 3 full mode | Phase 3 | Senior Director + Azure Cloud Architect | Deferred | 2026-05-30 | TRK-022 closed Rolled Back — Section 28 gates failed 0/5 across 10 controlled reviews. Portal agent produces 30–48pt score divergence and loses 1 domain per run non-deterministically. | Phase 3 redesign required before resuming. Option A: raw Responses API without `agent_reference` (inject domain-specific system prompt directly, use Responses transport only). Option B: close permanently, keep Phase 2 as the final architecture. Decision after TRK-020 soak ends 2026-06-05. |

### 22.2 Session Resume Checklist

If a session limit is reached, resume by checking these items in order:

1. Open this file and read Section 22 first.
2. Find the first tracker row whose status is not `Done` or `Deferred`.
3. Read the `Resume notes` for that row.
4. Check the current production value of `USE_AGENTS_API`.
5. Confirm no newer decision was added to Section 18 or Section 21.5.
6. Continue only from the next pending tracker activity.
7. Update Section 22 immediately after completing, blocking, deferring, or rolling back any activity.

### 22.3 Tracker Update Rules

- Update `Last tracker update` whenever any tracker row changes.
- Update exactly one row to `In Progress` when active work begins.
- Change `In Progress` to `Done`, `Blocked`, `Deferred`, or `Rolled Back` before ending the session.
- Add evidence links as soon as they exist: PR, commit SHA, test log, Playwright report, App Insights query result, Foundry trace screenshot, cost query, or rollback record.
- Never mark a phase activation `Done` until the required evidence pack in Section 21.7 is complete.
- If a rollback occurs, add a new tracker row for the rollback and keep the original failed activity as `Rolled Back`.

---

## 23. Migration Control Dashboard

This dashboard is the first page to use during standups, deployment windows, and go/no-go reviews.

| Control | Current value | Required action |
|---|---|---|
| Overall migration status | Phase 2 soak active — TRK-020 Day 3/5. Phase 3 deferred. | Complete TRK-020 soak through 2026-06-05 |
| Current production feature flag | `USE_AGENTS_API=synthesis` (set 2026-05-30) | No change until after TRK-020 soak completes |
| Active migration phase | Phase 2 (Chat Completions fan-out + Agents API synthesis call) | Monitor soak; 10+ reviews; P95 latency; cost projection |
| Last completed milestone | TRK-022 shadow validation — 10 controlled reviews, 9 App Insights traces, 0/5 pass | Closed Rolled Back 2026-05-30 |
| Current blocker | TRK-023 Deferred — Phase 3 redesign required before resuming | Option A (raw Responses API) or Option B (close permanently) — decide after TRK-020 |
| Immediate next activity | TRK-020: complete Phase 2 soak (ends 2026-06-05) | Verify 10+ reviews on live site; P95 latency; cost < $50 |
| Rollback command | `az functionapp config appsettings set ... --settings "USE_AGENTS_API=off"` | Keep ready for every phase |
| Cost guardrail | `$50` projected warning, `$60` action | Current MTD ~$40; Phase 3 not activatable until redesigned approach passes TRK-022 |
| Required browser evidence | Playwright report, screenshots, trace/video, correlation file | Required before every phase flag activation |
| Required Foundry evidence | Monitor/Trace screenshot for agent version `9` (synthesis) | Confirm synthesis agent runs appear in Foundry Monitor during soak |

### 23.1 Phase Dashboard

| Phase | Target flag | Code status | Flag status | Browser validation | Foundry validation | Cost status | Go/no-go |
|---|---|---|---|---|---|---|---|
| Baseline | `off` | ✅ Deployed | ✅ Done (TRK-012) | ✅ Done | N/A | ✅ Under $60 | ✅ Done |
| Phase 1 | `telemetry` | ✅ Deployed | ✅ Done (TRK-016) | ✅ Done | ✅ Foundry Monitor confirmed | ✅ Negligible impact | ✅ Done |
| Phase 2 | `synthesis` | ✅ Deployed | ✅ Active (TRK-020 soak) | ✅ Validated | ✅ Synthesis trace confirmed | ✅ MTD ~$40 projected | ✅ Active soak — ends 2026-06-05 |
| Phase 3 shadow | `synthesis` + shadow code | ✅ Deployed (dormant) | ❌ Disabled (rolled back from `shadow` 2026-05-30) | ✅ 10 E2E runs | ✅ 9 traces in App Insights | — | ❌ Section 28 gates failed 0/5 — TRK-022 Rolled Back |
| Phase 3 full | `full` | ✅ Dormant in code | ❌ Not activated | ❌ Blocked | ❌ Blocked | ❌ Blocked | ❌ TRK-023 Deferred — redesign required |

---

## 24. Production Runbooks

These runbooks are operator-ready. During execution, copy the output links and observations into Section 22.

### 24.1 Universal Pre-Deployment Runbook

1. Confirm working branch and PR scope match exactly one phase.
2. Confirm `USE_AGENTS_API=off` or the previous stable phase value is active in production.
3. Confirm no unrelated prompt, UI, export, Durable timeout, or model deployment changes are included.
4. Run API unit tests and required frontend/browser tests.
5. Run production health smoke:

```powershell
Invoke-WebRequest -Uri https://func-arb-review-api-flex.azurewebsites.net/api/health -UseBasicParsing -TimeoutSec 30
```

6. Confirm current cost projection is under the phase threshold.
7. Confirm rollback command and owner are available.
8. Update Section 22 row status to `In Progress`.

### 24.2 Phase 1 Telemetry Runbook

1. Deploy telemetry code with production flag still `off`.
2. Run `/api/health` smoke test.
3. Run browser golden path against live `/arb`.
4. Set `USE_AGENTS_API=telemetry`.
5. Run browser golden path again.
6. Confirm Foundry Monitor shows agent run count increase.
7. Confirm telemetry payloads contain no customer evidence.
8. Watch Log Analytics for `agents-api-telemetry` errors for 24 hours.
9. If noisy or misleading traces appear, set `USE_AGENTS_API=off` and mark Phase 1 as `Rolled Back`.

### 24.3 Phase 2 Synthesis Runbook

1. Confirm Foundry agent version `7` config is exported or screenshotted.
2. Confirm prompt/schema drift gates are closed.
3. Deploy synthesis code with flag still `telemetry`.
4. Run API tests, parser tests, browser golden path, FP validation, and export parity.
5. Set `USE_AGENTS_API=synthesis` in a controlled test window.
6. Run browser golden path and capture review correlation file.
7. Confirm Foundry trace shows one synthesis agent-reference run for the browser review.
8. Confirm no unexpected Chat Completions fallback occurred.
9. Soak for 5 business days before Phase 3 planning.

### 24.4 Phase 3 Shadow Runbook

1. Deploy shadow fan-out code with production output still controlled by Phase 2 path.
2. Keep `USE_AGENTS_API=synthesis`.
3. Run five controlled reviews using the same evidence corpus.
4. Store authoritative Phase 2 output and shadow Phase 3 output separately.
5. Compare using Section 28 thresholds.
6. Confirm UI never displays shadow output.
7. Confirm Foundry traces show expected domain/tool behavior.
8. Do not proceed to `full` until all shadow comparisons pass.

### 24.5 Phase 3 Full Activation Runbook

1. Confirm Phase 3 shadow comparison passed.
2. Confirm projected month-end cost is below `$50` before activation.
3. Confirm rollback browser test has passed.
4. Set `USE_AGENTS_API=full`.
5. Run full browser suite, FP validation, visual evidence validation, and export parity.
6. Confirm seven domain agent runs are visible in Foundry.
7. Confirm File Search and `microsoft_learn` traces appear when expected.
8. Monitor for 10 business days; roll back if projected or actual cost reaches `$60`.
9. Keep Chat Completions fallback code for 30 days after stable operation.

---

## 25. RACI and Approval Matrix

`R = Responsible`, `A = Accountable`, `C = Consulted`, `I = Informed`.

| Activity | Azure Cloud Architect | Senior PM / GitHub Expert | UI/UX Specialist | Azure AI Architect | Full-Stack Developer | Senior Director |
|---|---|---|---|---|---|---|
| Backup tag and branch creation | I | A/R | I | I | C | I |
| Function App setting changes | A/R | C | I | C | C | I |
| Foundry agent config export | C | I | I | A/R | C | I |
| Portal prompt/schema reconciliation | C | C | C | A/R | R | C |
| Phase 1 telemetry implementation | C | C | I | C | A/R | I |
| Phase 2 synthesis implementation | C | C | I | A/C | R | I |
| Phase 3 fan-out implementation | C | C | I | A/C | R | C |
| Quality gate preservation | I | C | I | C | A/R | C |
| Automated browser validation | I | C | A/R | C | R | I |
| Cost guardrail review | A/C | R | I | C | I | I |
| Production go/no-go Phase 1 | C | A/R | C | C | C | I |
| Production go/no-go Phase 2 | C | A/R | C | A/C | C | I |
| Production go/no-go Phase 3 | C | R | C | C | C | A |
| Emergency rollback | A/R | R | I | C | C | I |
| 30-day fallback retirement | C | R | I | C | C | A |

---

## 26. Data Protection and Logging Policy

The migration must improve observability without exposing customer evidence, architecture documents, diagrams, or prompt contents in logs.

### 26.1 Allowed Telemetry Fields

| Data | Allowed? | Notes |
|---|---|---|
| Review ID / job ID / Durable instance ID | Yes | Required for correlation |
| Feature flag value | Yes | Required for path attribution |
| Phase name | Yes | `telemetry`, `synthesis`, `full`, `off` |
| File count / evidence count | Yes | Counts only |
| Rule finding count | Yes | Counts only |
| Domain name | Yes | No evidence text |
| Duration / latency / timeout status | Yes | Required for monitoring |
| Fallback reason class | Yes | Example: timeout, 429, malformed JSON |
| Token counts | Yes | If available from Foundry or model response |
| Cost query totals | Yes | Aggregate only |

### 26.2 Prohibited Log Content

| Data | Decision |
|---|---|
| Uploaded file contents | Never log |
| Raw customer evidence text | Never log |
| Raw diagrams, screenshots, or extracted OCR text | Never log |
| Full prompts containing customer content | Never log |
| Full model responses with customer evidence snippets | Do not log; persist only through existing secured review output path |
| Key Vault values, bearer tokens, API keys, SAS tokens | Never log |
| User personal data beyond existing authenticated identity handling | Do not add |

### 26.3 Logging Pattern

Use structured, evidence-free trace markers:

```text
[agents-api] phase=synthesis reviewId=<id> path=responses-agent status=completed durationMs=<n> fallback=false
[agents-api] phase=full reviewId=<id> domain=Security status=fallback reason=timeout durationMs=<n>
[agents-api-telemetry] reviewId=<id> event=review_started fileCount=<n> ruleCount=<n>
```

If debugging requires prompt or evidence inspection, use a controlled local/test fixture only. Do not enable production raw prompt logging.

---

## 27. Failure Injection and Recovery Drills

Run these drills before Phase 2 and Phase 3 go-live. Each drill must update Section 22 and attach evidence to the PR or activation record.

| Drill | How to simulate | Expected behavior | Pass criteria |
|---|---|---|---|
| Agents API timeout | Mock `foundryResponsesAgentRequest()` timeout or use test-only failure flag | Fallback to Chat Completions; UI completes | No stuck Durable instance; fallback log present |
| Agents API 500/502 | Mock non-2xx Responses result | Fallback path runs | Review completes with persisted result |
| model-router 429 | Mock throttling response | Retry/fallback behavior triggers without hot loop | No repeated uncontrolled retries; clear log marker |
| Malformed JSON response | Mock non-JSON or incomplete JSON output | Parser rejects and fallback runs | No invalid finding reaches quality gates |
| Portal prompt/schema drift | Use fixture with portal labels and missing Networking field | Normalization or gate catches issue | Recommendation maps correctly; scorecard contract preserved |
| One domain failure | Force one domain to fail in Phase 3 | Failed domain uses Chat Completions only | Other agent domain outputs retained |
| Three domain failures | Force three domains to fail in Phase 3 | Full fan-out fallback to Chat Completions | All domains use fallback path |
| Stuck Durable status | Simulate activity timeout | User sees controlled timeout/failure state | No silent spinner; status is inspectable |
| Export mismatch | Inject fixture where persisted result differs from UI | Browser test fails | Export parity blocks phase |
| Rollback | Set `USE_AGENTS_API=off` after a phase activation | New review uses Chat Completions path | Browser golden path passes after rollback |

---

## 28. Shadow-Run Comparison Method

Phase 3 must prove output equivalence before `USE_AGENTS_API=full` becomes authoritative.

### 28.1 Shadow-Run Rules

- Shadow runs must use the same uploaded evidence and deterministic rule findings as the authoritative Phase 2 run.
- Shadow output must be stored separately and clearly marked as non-authoritative.
- Shadow output must never be shown in the reviewer UI or export.
- Shadow comparison must run on at least five controlled reviews before Phase 3 go-live.
- Any review with extraction failure, missing fixture file, or unrelated API failure must be rerun and not counted.

### 28.2 Comparison Thresholds

| Metric | Required result |
|---|---|
| Recommendation | Exact match |
| Total score | Difference <= 5 points |
| Critical + High findings | Difference <= 2 findings |
| Deterministic rule findings | 100% retained; no duplicates |
| Known false positives | Zero returned |
| Evidence IDs | No orphan IDs |
| Visual evidence IDs | No orphan IDs; present when visual finding depends on image/diagram evidence |
| Required scorecard dimensions | All runtime dimensions present, including Networking unless intentionally retired |
| Learn links | Valid `learn.microsoft.com` links where guidance is provided |
| Missing evidence | No loss of required missing-evidence categories |

### 28.3 Shadow Comparison Outcome

| Outcome | Decision |
|---|---|
| All five reviews pass thresholds | Eligible for Phase 3 go-live review |
| One review fails with explainable low-risk variance | Senior Director decides whether to add more shadow samples or hold |
| Any review fails recommendation exact match | Hold Phase 3 |
| Any review loses deterministic rule findings | Hold Phase 3 |
| Any known false positive returns | Hold Phase 3 |
| Any cost projection exceeds threshold | Hold Phase 3 |

---

## 29. Change Freeze and Roll-Forward Rules

### 29.1 Change Freeze Scope

During Phase 2 soak, Phase 3 shadow, and the first 10 business days of Phase 3 full mode, freeze unrelated changes to:

- Foundry portal prompt, tools, model, Memory, Guardrails, or agent version.
- `ARB_SYSTEM_PROMPT`, synthesis prompt, parser schema, scorecard dimensions, or recommendation enums.
- Findings table, scorecard, export format, or review status UX.
- Durable orchestrator timeout and activity timeout.
- Model deployment names, capacity, or fallback order.
- Storage table/blob schema used by review lifecycle or persisted results.
- CI/CD workflow gates, unless the change fixes a failed migration gate.

Emergency security fixes are allowed, but the migration phase must be paused and Section 22 must show the pause reason.

### 29.2 Roll-Forward Strategy

Rollback is the default for user-facing correctness failures. Roll-forward is allowed only when the blast radius is narrow, the fix is obvious, and the stable fallback remains available.

| Situation | Preferred action |
|---|---|
| Parser rejects a harmless new field | Roll forward with parser tolerance if tests pass quickly |
| Portal label maps incorrectly | Roll forward with normalization fix if browser and unit tests pass |
| One domain frequently times out | Roll forward with per-domain fallback or timeout adjustment; keep `synthesis` if needed |
| Tool traces missing in Phase 3 | Hold or roll back; do not remove manual grounding |
| Empty findings or wrong recommendation | Roll back immediately |
| Cost spike from tool calls | Roll back to `synthesis` or `off`; reduce tool usage before retry |
| UI/export mismatch | Roll back or hold activation until export parity passes |

### 29.3 Rollback Ladder

Use the least disruptive rollback that restores correctness:

1. `full` -> `synthesis` if only domain fan-out is affected.
2. `synthesis` -> `telemetry` if synthesis agent output is affected but telemetry is safe.
3. `telemetry` -> `off` if telemetry creates misleading traces, cost, or errors.
4. Redeploy from `main` or backup tag only if feature flag rollback is insufficient.

## 30. Future Roadmap: Multi-Cloud MCP Integration (AWS and GCP)

> **Status:** Not started — future feature. Do not implement until TRK-020 soak closes (2026-06-05) and Phase 3 (TRK-023) is validated with the thin-portal-agent redesign.

### 30.1 Objective

Extend CARI from an Azure-only ARB review tool to a multi-cloud Architecture Review Board platform by integrating AWS Knowledge and GCP documentation MCP servers alongside the existing `microsoft_learn` MCP tool.

### 30.2 Architecture Decision: Single Agent + Multi-Cloud MCP Tools

**Decision (2026-05-30, expert team unanimous): Single agent architecture. Separate per-cloud agents were evaluated and rejected.**

| Option | Decision | Reason |
| --- | --- | --- |
| Separate agents per cloud (azure-agent, aws-agent, gcp-agent + orchestrator) | **Rejected** | Multiplies agent call latency (sequential = 3x, parallel = 21 domain calls); merge problem unsolved; 4x operational overhead; TRK-022 proved 7 parallel agent calls already cause domain dropout |
| Single `cari-arb-review-agent` + 3 cloud MCP tools | **Chosen** | CARI's 7 domains are cloud-agnostic; cloud-specific content delivered via MCP tools at inference time; zero schema change |

### 30.3 Target Architecture

```text
cari-arb-review-agent (single agent)
├── file_search tools
│     ├── azure-knowledge-store  (CAF, WAF, ALZ rules — current 29.57 KB)
│     ├── aws-knowledge-store    (AWS WAF, CDK patterns, service docs)     ← NEW
│     └── gcp-knowledge-store    (GCP AF, GKE patterns, service docs)     ← NEW
│
└── MCP tools
      ├── microsoft_learn  (https://learn.microsoft.com/api/mcp)          ← existing
      ├── aws_knowledge    (AWS Knowledge MCP endpoint)                   ← NEW
      └── gcp_docs         (GCP documentation MCP endpoint)               ← NEW
```

Cloud-specific MCP tools activate **only when evidence contains the relevant cloud's services** — zero latency impact on pure Azure reviews.

### 30.4 Cloud Framework Mapping to CARI Domains

| CARI Domain | Azure WAF | AWS WAF | GCP Architecture Framework |
| --- | --- | --- | --- |
| Security | WAF:Security | Security (IAM, GuardDuty, KMS, SCPs) | Security (IAM, VPC Service Controls, CMEK) |
| Networking | WAF:Networking / ALZ | VPC, Transit Gateway, Direct Connect | VPC, Cloud Armor, Cloud CDN, Cloud Interconnect |
| Reliability | WAF:Reliability | Reliability (AZs, Route 53, Auto Scaling) | Reliability (Global LB, multi-region, Cloud Armor) |
| Operations | WAF:Operational Excellence | Operational Excellence | Operational Excellence |
| Cost | WAF:Cost Optimization | Cost Optimization | Cost Optimization |
| Performance | WAF:Performance Efficiency | Performance Efficiency | Performance Efficiency |
| Governance | CAF:Govern | AWS Organizations + SCPs + Config | Resource hierarchy + Org Policy + Security Command Center |

### 30.5 Changes Required

#### Portal agent (`cari-arb-review-agent`)

- Add `aws_knowledge` MCP tool (AWS Knowledge MCP server endpoint)
- Add `gcp_docs` MCP tool (GCP documentation MCP server endpoint)
- Add `aws-knowledge-store` and `gcp-knowledge-store` file_search vector stores
- Update agent instructions to invoke cloud-specific tools when evidence contains those cloud's services

#### Code (`api/src/shared/arb-foundry-agent.js`)

1. **`detectCloudProviders(requirements, evidence)`** — scan evidence text for AWS/GCP service names; returns `{ hasAws, hasGcp }` to gate grounding calls
2. **`fetchAwsGrounding(review, requirements, evidence)`** — mirrors `fetchMicrosoftLearnGrounding()`; calls AWS Knowledge MCP; uses same blob cache pattern; gated by `hasAws`
3. **`fetchGcpGrounding(review, requirements, evidence)`** — same pattern for GCP docs MCP; gated by `hasGcp`
4. **Fan-out entry point** — run all three grounding fetches in parallel, pass `awsDocs` + `gcpDocs` into `buildDomainMessage()` alongside existing `learnDocs`
5. **`buildDomainMessage()`** — add `## AWS Reference Documentation` and `## GCP Reference Documentation` sections (same pattern as existing `## Microsoft Learn Reference Documentation`)

#### Rules engine (new files)

- `api/data/arb-rules/aws-waf-rules.json` — AWS Well-Architected Framework 6-pillar rules mapped to CARI domain model
- `api/data/arb-rules/gcp-af-rules.json` — GCP Architecture Framework 6-pillar rules mapped to CARI domain model

#### System prompt (`ARB_SYSTEM_PROMPT`)

- Replace Azure-only scope line with multi-cloud framework assessment instructions
- Add per-cloud decision band guidance for cross-cloud integration risk findings

#### Knowledge stores

- Populate `aws-knowledge-store`: AWS WAF pillar summaries, CDK patterns, key service best practices
- Populate `gcp-knowledge-store`: GCP AF pillar summaries, GKE patterns, key service best practices

### 30.6 New App Settings Required

```bash
AWS_KNOWLEDGE_MCP_ENDPOINT=<aws-knowledge-mcp-server-url>
GCP_DOCS_MCP_ENDPOINT=<gcp-docs-mcp-server-url>
```

These can be added to Function App settings immediately (feature-flagged off by empty value). No infrastructure change required.

### 30.7 Cost Impact

Multi-cloud grounding only runs when `hasAws` or `hasGcp` is true. Pure Azure reviews: zero cost change. Multi-cloud reviews: at most 2 additional MCP grounding calls (AWS + GCP) per review, estimated +₹10–50/month at current review volumes. Stays well within $60/month cap.

### 30.8 Prerequisite Gates

This feature must not start until:

- [ ] TRK-020 Phase 2 soak complete (2026-06-05)
- [ ] TRK-023 Phase 3 validated (thin portal agent approach passes Section 28 gates)
- [ ] Projected month-end cost < $50 (multi-cloud MCP adds incremental spend)
- [ ] AWS Knowledge MCP server endpoint confirmed and accessible from Function App managed identity
- [ ] GCP documentation MCP server endpoint confirmed and accessible

### 30.9 Estimated Effort (when prerequisites met)

| Task | Owner | Hours |
| --- | --- | --- |
| Portal agent: add AWS + GCP MCP tools + knowledge stores | Azure AI Architect | 3h |
| `detectCloudProviders()` + `fetchAwsGrounding()` + `fetchGcpGrounding()` | Full-Stack Developer | 8h |
| `buildDomainMessage()` AWS/GCP section injection | Full-Stack Developer | 3h |
| `aws-waf-rules.json` + `gcp-af-rules.json` rules authoring | Azure Cloud Architect | 6h |
| `ARB_SYSTEM_PROMPT` multi-cloud update | Azure AI Architect | 2h |
| Knowledge store population (AWS + GCP) | Azure AI Architect | 4h |
| Unit tests + eval framework baseline comparison | Full-Stack Developer | 6h |
| 5-review multi-cloud validation (mixed Azure+AWS evidence) | Azure AI Architect + Senior PM | 4h |
| **Total** | | **~36 hours** |

---

## Appendix A: Quick Reference — Feature Flag Commands

```bash
# Check current value
az functionapp config appsettings list \
  --subscription 87cf2b93-5e52-4533-9e6b-7182cd7dbde6 \
  --resource-group rg-arb-review-prod \
  --name func-arb-review-api-flex \
  --query "[?name=='USE_AGENTS_API'].value" --output tsv

# Set to specific phase
az functionapp config appsettings set \
  --subscription 87cf2b93-5e52-4533-9e6b-7182cd7dbde6 \
  --resource-group rg-arb-review-prod \
  --name func-arb-review-api-flex \
  --settings "USE_AGENTS_API=off|telemetry|synthesis|full"
```

## Appendix B: Backup Tag Commands

```powershell
# Create backup before migration starts
$backupTag = "backup/pre-agents-api-migration-$(Get-Date -Format yyyyMMdd)"
git tag $backupTag HEAD
git push origin $backupTag

# List all backup tags
git tag -l "backup/*"

# Restore from backup tag (emergency only)
git checkout backup/pre-agents-api-migration-YYYYMMDD
git checkout -b hotfix/restore-from-pre-migration
# Then raise PR from hotfix branch to main
```

For bash shells, create `backupTag="backup/pre-agents-api-migration-$(date +%Y%m%d)"` and pass `$backupTag` to `git tag` and `git push`.

## Appendix C: Agents API SDK Reference

```javascript
// Package already installed in api/package.json: @azure/ai-projects ^2.1.1
// Official SDK surface for this package uses AIProjectClient and an OpenAI client.
const { AIProjectClient } = require('@azure/ai-projects');
const { DefaultAzureCredential } = require('@azure/identity');

const project = new AIProjectClient(
  process.env.FOUNDRY_PROJECT_ENDPOINT,
  new DefaultAzureCredential()
);

const openai = project.getOpenAIClient();

// Stateless single-turn agent-reference call, aligned with current repo helper.
const response = await openai.responses.create({
  input: 'Summarize this CARI review context as JSON.',
  agent_reference: {
    name: process.env.FOUNDRY_AGENT_NAME,
    type: 'agent_reference',
    version: process.env.FOUNDRY_AGENT_VERSION
  }
});

console.log(response.output_text);
```

Current repo note: `api/src/shared/arb-foundry-agent.js` already has a REST-based `foundryResponsesAgentRequest()` using `POST {FOUNDRY_PROJECT_ENDPOINT}/openai/v1/responses` with `agent_reference`. Phase 1 should extend and test that helper instead of adding a second client abstraction.

---

*Document maintained by the CARI Engineering Team. Update this document when phases are completed or decisions change.*
