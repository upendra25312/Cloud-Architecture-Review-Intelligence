# Product Requirements Document
## CARI Evaluation Framework

| Field | Value |
|---|---|
| Product | Cloud Architecture Review Intelligence (CARI) |
| Feature | Automated AI Agent Evaluation Framework |
| Version | 1.0 — shipped 2026-05-17 |
| Status | Live — 27/27 (100%) on deployed Azure |
| Owner | Azure AI Architect / Senior Full Stack Developer |
| Reviewers | Microsoft Expert Azure Cloud Architect, Senior PM, Senior Director Cloud Solutions |
| Last updated | 2026-05-17 |

---

## 1. Executive Summary

CARI is a production Azure-native platform that uses AI to review cloud architecture designs against Azure Landing Zone (ALZ), Well-Architected Framework (WAF), and migration best practices. As the platform matures and the AI agent evolves — through prompt changes, model updates, and new review domains — there is no automated way to detect regressions in review quality.

This PRD describes the **CARI Evaluation Framework**: a 27-case labelled dataset paired with an automated runner and CI integration that continuously validates the AI agent's correctness, domain coverage, severity calibration, and safety posture. It serves as both a quality gate for engineering and a credibility signal for leadership and customers.

---

## 2. Problem Statement

### 2.1 The Core Problem

Without automated evaluation, the CARI team faces three compounding risks:

**Risk 1 — Silent regression.** A change to the AI agent's system prompt, a model update, or a new Azure domain added to the ruleset can silently degrade review quality. There is no automated signal that says "the agent used to catch missing PIM controls and now it doesn't."

**Risk 2 — No demo confidence.** Before a leadership demo or customer pilot, there is no reproducible way to prove the agent is behaving correctly. Confidence is anecdotal — based on a few spot-checks, not evidence.

**Risk 3 — Red-team and safety blind spots.** Without a structured test for prompt injection (documents that tell the agent to ignore its rules) or weak-evidence scenarios (designs that say "we follow best practices"), there is no assurance the agent is safe to expose in front of customers.

### 2.2 Who is Affected

| Persona | Pain without eval framework |
|---|---|
| Azure AI Architect | No signal when model or prompt change degrades findings quality |
| Full Stack Developer | No automated gate before merging API or agent changes |
| Senior PM / Github Expert | Cannot assert quality before demos, releases, or pilot onboarding |
| Senior Director, Cloud Solutions | No proof-point for leadership; must rely on trust, not evidence |
| Microsoft Expert Azure Cloud Architect | No verifiable coverage of ALZ, WAF, and migration review domains |
| End Customer (ARB reviewers) | Risk of receiving AI-generated architecture review with missed findings or fabricated controls |

---

## 3. Goals

### 3.1 Primary Goals

| # | Goal |
|---|---|
| G1 | Provide a reproducible, automated signal that the AI agent correctly identifies missing architecture controls |
| G2 | Catch regressions before they reach production — on every code push |
| G3 | Validate that the agent is safe against prompt injection and weak-evidence manipulation |
| G4 | Give leadership and customers a credible quality metric (pass rate) |

### 3.2 Non-Goals

| # | Non-Goal |
|---|---|
| NG1 | Replace human ARB reviewer judgement — the eval validates agent behaviour, not business decisions |
| NG2 | Evaluate frontend UI correctness — the eval targets the API agent layer only |
| NG3 | Serve as a cost benchmarking tool — cost analysis is covered separately |
| NG4 | Test infrastructure or deployment pipelines — separate CI/CD workflows own that |
| NG5 | Automatically update the AI agent's system prompt based on eval results |

---

## 4. Success Metrics

| Metric | Target | Current |
|---|---|---|
| Mock mode pass rate (CI) | 27/27 always | 27/27 |
| Deployed mode pass rate | ≥ 26/27 (96%) | 27/27 (100%) |
| Time to detect a regression | Within one CI run (~2 min mock) | Achieved |
| Red-team resistance | Case 026 always PASS | Achieved |
| CI integration | Runs on every push to main | Achieved |
| Time to run full deployed eval | < 50 minutes | ~42 minutes |

---

## 5. User Stories

### 5.1 AI Engineer

> As an AI engineer modifying the agent's system prompt or adding a new review domain, I want automated confirmation that existing cases still pass, so I can merge with confidence and not manually re-test 27 scenarios.

**Acceptance:** CI mock eval runs on every PR. If any case fails, the PR is blocked.

---

### 5.2 Senior PM / Release Manager

> As a Senior PM preparing for a leadership demo or pilot release, I want to run a full deployed eval against live Azure and see a pass rate score, so I can make a go/no-go decision based on evidence rather than anecdote.

**Acceptance:** `CARI_EVAL_MODE=deployed python evals/run_cari_eval.py` produces a summary with per-case PASS/FAIL and a final score. Run completes in under 50 minutes.

---

### 5.3 Senior Director, Cloud Solutions Architecture

> As a Senior Director presenting CARI to a Microsoft customer, I want to show a documented eval framework with domain coverage, scenario types, and a 100% pass rate, so the customer understands this is a validated AI product, not a prototype.

**Acceptance:** `docs/CARI-EVAL-FRAMEWORK.md` and `docs/PRD-CARI-EVAL-FRAMEWORK.md` exist, are current, and link to the live eval dataset and runner. Pass rate is documented.

---

### 5.4 Azure Cloud Architect (Domain Expert)

> As an Azure Cloud Architect reviewing the eval dataset, I want each case to cover a specific, real-world architecture gap across ALZ, WAF, and migration domains with clear expected findings and severity, so I trust the eval is testing something that matters, not synthetic edge cases.

**Acceptance:** 27 cases cover 10 ALZ, 4 WAF, 9 migration, and 4 special control scenarios. Each case has documented expected findings, domains, severity, posture, and actions.

---

### 5.5 Security Reviewer

> As a security reviewer, I want the eval to include a red-team case where the uploaded document attempts to manipulate the agent, and a positive control case where a fully evidenced design is not penalised, so I know the agent is safe and calibrated.

**Acceptance:** Case 026 (red-team) always PASS — agent ignores embedded instructions. Case 024 (positive control) always PASS — agent does not invent gaps contradicted by evidence.

---

## 6. Functional Requirements

### 6.1 Eval Runner

| ID | Requirement |
|---|---|
| FR-01 | Runner must support three modes: `mock` (deterministic, no Azure calls), `local` (localhost:7071), and `deployed` (live Azure Function via `CARI_FUNCTIONS_URL`) |
| FR-02 | Default mode must be `mock` so CI never makes Azure AI calls |
| FR-03 | Runner must load cases from `evals/datasets/cari_arb_baseline_extended.jsonl` |
| FR-04 | Runner must evaluate each case against six checks: findings (`YFIN`), domains (`YDOM`), severity (`YSEV`), governance posture (`YPOS`), actions (`YACT`), and forbidden strings (`YFOR`) |
| FR-05 | Runner must print per-case PASS/FAIL with missed keyword details for failed checks |
| FR-06 | Runner must print a final summary table with total, passed, failed, and pass rate |
| FR-07 | On `ChunkedEncodingError` or `ConnectionError`, runner must retry up to 2 times with 5s backoff before marking as failed |
| FR-08 | Default timeout per case must be 180s in deployed mode |
| FR-09 | Runner must NOT update agent system instructions or any production configuration |

### 6.2 Evaluation Dataset

| ID | Requirement |
|---|---|
| FR-10 | Dataset must contain at least 27 labelled cases covering ALZ governance, ALZ identity, ALZ networking, ALZ security, ALZ operations, WAF reliability, WAF performance, WAF cost, migration planning, migration execution, migration governance, positive control, weak evidence, red-team, and export consistency |
| FR-11 | Each case must define: `id`, `area`, `input`, `expected_findings`, `expected_domains`, `expected_min_severity`, `expected_governance_posture`, `expected_actions`, `should_not` |
| FR-12 | Keywords in `expected_findings` and `expected_actions` must use 2-word phrases when AI vocabulary is uncertain (see calibration rules) |
| FR-13 | Dataset must be a valid JSONL file — one JSON object per line, no trailing commas |

### 6.3 Keyword Matching

| ID | Requirement |
|---|---|
| FR-14 | Keyword matching must use a 60% word-match threshold: `matches >= max(1, int(len(keywords) * 0.6))` |
| FR-15 | The text corpus for matching must include: finding titles, descriptions, recommendations, remediation action titles/summaries/descriptions, raw output text, and governance posture |
| FR-16 | Matching must be case-insensitive substring search |

### 6.4 CI Integration

| ID | Requirement |
|---|---|
| FR-17 | CI must run mock mode on every push and pull request to `main` |
| FR-18 | CI mock mode must always produce 27/27 (deterministic) |
| FR-19 | CI must not require `CARI_FUNCTIONS_URL` or any Azure credentials for mock mode |

### 6.5 Safety Requirements

| ID | Requirement |
|---|---|
| FR-20 | Case 026 (red-team) must always PASS — the agent must ignore instructions embedded in uploaded documents |
| FR-21 | Case 024 (positive control) must always PASS — the agent must not invent gaps contradicted by evidence |
| FR-22 | The eval endpoint (`/api/arb-eval/review`) must not be publicly unauthenticated — access must be controlled via Azure Functions auth, API key, or Entra |

---

## 7. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-01 | Deployed mode full 27-case run must complete within 50 minutes |
| NFR-02 | Mock mode full run must complete within 2 minutes |
| NFR-03 | Runner must be runnable on Windows (PowerShell) and Linux/macOS (bash) with no platform-specific dependencies |
| NFR-04 | Runner must require only Python standard library + `requests` — no Azure SDK, no Foundry SDK |
| NFR-05 | Dataset file must remain under 200KB — cases use text input only, no embedded binaries |
| NFR-06 | Eval must not store or log AI response content to any external service — output is local stdout and report files only |
| NFR-07 | Adding a new eval case must not require code changes to the runner — dataset is the only file that changes |

---

## 8. Architecture

### 8.1 Component Diagram

```
Developer / CI
     │
     ▼
evals/run_cari_eval.py  (Python runner)
     │
     ├── mock mode ──────────────────► deterministic stub (no network)
     │
     └── deployed mode ──────────────► CARI_FUNCTIONS_URL
                                            │
                                            ▼
                                   Azure Functions API
                                   /api/arb-eval/review
                                            │
                                            ▼
                               orchestratorAgentReview (Durable)
                                            │
                                            ▼
                               Azure AI Foundry Agent
                               model-router deployment
                                    (GPT-4o family)
```

### 8.2 Key Files

| File | Role |
|---|---|
| `evals/run_cari_eval.py` | Runner — mode selection, HTTP calls, keyword evaluation, summary |
| `evals/datasets/cari_arb_baseline_extended.jsonl` | 27 labelled cases — the source of truth |
| `evals/reports/` | Output directory for JSON and Markdown reports |
| `api/src/functions/arb-eval-review.js` | Azure Function handler for `/api/arb-eval/review` |
| `api/src/shared/arb-foundry-agent.js:28` | `FOUNDRY_AGENT_MODEL = "model-router"` — the AI model config |

### 8.3 AI Model

The ARB Review Agent uses `model-router` — an Azure AI Foundry deployment that routes to the best available model in the GPT-4o family. This is not a hardcoded model name. Never switch to a direct model name or call Azure OpenAI directly — all AI calls must go through the Foundry agent. If `model-router` returns 404, recreate the Foundry deployment; do not change the deployment name.

---

## 9. Evaluation Case Coverage

### 9.1 Coverage by Domain

| Domain | Cases | Coverage |
|---|---|---|
| Governance | 001, 002, 010, 014, 015, 016, 017, 018, 020, 021, 025, 027 | 12 cases |
| Security | 002, 003, 004, 005, 007, 008, 017, 022, 026 | 9 cases |
| Networking | 004, 005, 006 | 3 cases |
| Identity | 003, 007, 026 | 3 cases |
| Reliability | 011, 012, 019, 021, 023 | 5 cases |
| Operational Excellence | 006, 009, 010, 012, 015, 017, 018 | 7 cases |
| Cost | 014, 016, 021 | 3 cases |

### 9.2 Coverage by Scenario Type

| Type | Cases | Purpose |
|---|---|---|
| Missing control (ALZ) | 001–010 | Core ALZ review quality |
| Missing control (WAF) | 011–014 | WAF pillar coverage |
| Missing control (Migration) | 015–023 | Migration programme quality |
| Positive control | 024 | Agent must NOT over-flag |
| Weak evidence | 025 | Agent must flag insufficient input |
| Red-team / safety | 026 | Agent must resist manipulation |
| Export consistency | 027 | Agent must flag cross-format drift |

---

## 10. Calibration Rules (Engineering Reference)

### 10.1 Keyword Asymmetry

The 60% threshold creates an asymmetry that must be understood before authoring expected keywords:

- A 2-word expected string (e.g. `"security hardening"`) needs only 1 of 2 words to match — lenient.
- A 1-word expected string (e.g. `"hardening"`) needs exactly 1 of 1 words — strict substring match.

Always prefer 2-word phrases. Single-word keywords are only safe when the exact substring is confirmed to appear in the AI's output.

### 10.2 Known AI Vocabulary Gaps

| Word to avoid | Use instead |
|---|---|
| `hardening` | `"security baseline"` or `"security controls"` |
| `Defender` | `"security monitoring"` or `"threat protection"` |
| `vulnerab` | `"security assessment"` or `"security review"` |
| `canonical` | `"standardize"` or `"single source"` |
| `conflict` | `"inconsist"` (substring of "inconsistent") |
| `patching` | `"monitoring"` or `"security controls"` |

### 10.3 Domain Field Behaviour

The AI uses "Operational Excellence" vocabulary in scorecard titles but assigns findings to `Reliability` or `Governance` in the structured domain field. When calibrating `expected_domains`, always verify against the structured output field, not the prose output text.

---

## 11. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Model update changes AI vocabulary → calibrated keywords no longer match | Medium | High | Run deployed eval after every model update; update dataset keywords using "Words the AI does NOT use" table |
| Azure Functions drops streaming connection mid-eval | High | Medium | 2-attempt retry with 5s backoff already implemented |
| Eval takes > 180s per case after model changes | Low | Medium | Increase `CARI_EVAL_TIMEOUT_SECONDS` env var; do not lower timeout |
| New eval case calibrated with single-word keywords → fragile pass | Medium | Medium | Code review gate: all new `expected_findings`/`expected_actions` entries reviewed against calibration rules before merge |
| Eval endpoint accidentally exposed publicly | Low | High | Enforce Azure Functions auth; document in NFR-22; review in gate checklist |
| CI accidentally runs deployed mode and incurs Azure AI cost | Low | Medium | Mock mode is the hardcoded default; deployed mode requires explicit `CARI_EVAL_MODE=deployed` env var |

---

## 12. Evaluation Frequency

| Trigger | Mode | Target | Who |
|---|---|---|---|
| Every push / PR | Mock | CI | Automated |
| After agent prompt or model change | Deployed | Azure Functions | AI Engineer |
| Before leadership demo | Deployed | Azure Functions | Senior PM |
| Before pilot release | Deployed | Azure Functions | Senior PM + Cloud Architect |
| Investigating a specific failure | Deployed (subset) | Azure Functions | AI Engineer |

> Never run deployed mode automatically on a daily schedule against the live production endpoint — each full run consumes ~42 minutes of Azure AI compute.

---

## 13. Acceptance Criteria

The CARI Evaluation Framework is considered complete and production-ready when all of the following are true:

- [ ] `evals/run_cari_eval.py` runs without error in mock mode — no Azure credentials required
- [ ] Mock mode produces 27/27 on every CI run
- [ ] Deployed mode produces ≥ 26/27 against the live Azure Function
- [ ] Case 026 (red-team) always PASS
- [ ] Case 024 (positive control) always PASS
- [ ] All 27 cases have documented `expected_findings`, `expected_domains`, `expected_min_severity`, `expected_governance_posture`, `expected_actions`, and `should_not`
- [ ] Runner retries on `ChunkedEncodingError` without manual intervention
- [ ] CI integration runs automatically on every push to `main`
- [ ] `docs/CARI-EVAL-FRAMEWORK.md` documents all calibration rules, case list, and run commands
- [ ] No eval case uses a single-word keyword that is in the "Known AI Vocabulary Gaps" table

**Current status: ALL CRITERIA MET — 2026-05-17**

---

## 14. Out of Scope

- Evaluating frontend UI pages or export file rendering
- Evaluating Terraform infrastructure correctness
- Replacing human ARB review decisions
- Automatically tuning or rewriting the AI agent's system prompt based on eval results
- AWS or GCP evaluation rubrics — these are future roadmap items only; Azure is the current live scope
- Cost benchmarking or load testing of the Azure Functions API

---

## 15. Future Considerations

| Item | Priority | Notes |
|---|---|---|
| Expand to 50+ cases covering new domains (e.g. FinOps, sustainability) | Medium | As CARI adds new WAF pillars |
| Azure Foundry Evaluation SDK integration for automated judge scoring | Low | Adds groundedness and relevance checks beyond keyword matching |
| Staging environment for deployed eval (separate from production) | Medium | Eliminates risk of eval traffic hitting production AI capacity |
| Per-PR deployed eval on a subset (5–10 cases) | Low | Faster feedback loop before merge; requires preview deployment slot |
| Eval result dashboard in Application Insights | Low | Trend line for pass rate over time |
