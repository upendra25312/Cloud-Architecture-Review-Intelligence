# CARI Todo Tracker

_Maintained by Product Team. Updated each session. Last updated: 2026-05-31 (TRK-020 soak Day 3/5; TRK-025 Option A implemented — foundryResponsesModelRequest + runSynthesisViaResponsesDirect + 10 tests, 362 pass)._

---

## Mode A — Discovery (Complete)

| # | Task | Status |
| --- | ------ | -------- |
| A1 | Check git state and run API tests | ✅ Done |
| A2 | Inspect repo structure (API, durable, shared, evals, frontend/arb) | ✅ Done |
| A3 | Audit ARB JSON schema validation gate | ✅ Done — **GAP fixed in C2** |
| A4 | Audit evidenceId cross-validation | ✅ Done — **GAP fixed in C3** |
| A5 | Audit upload security (MIME, extension, size limits, spoofing) | ✅ Done — **GAP fixed in C1** |
| A6 | Audit MCP guidance metadata persistence | ✅ Done — **GAP fixed in C4** |
| A7 | Audit observability and telemetry coverage | ✅ Done — GAP remains (C5 pending) |
| A8 | Produce ranked top-10 backlog + PDCA summary | ✅ Done |

---

## Mode B — Planning Docs

| # | Task | Status |
| --- | ------ | -------- |
| B1 | Create `docs/CARI_REPO_DISCOVERY_REPORT.md` | ✅ Done |
| B2 | Create `docs/CARI_IMPLEMENTATION_BACKLOG.md` | ✅ Done |
| B3 | Create `docs/CARI_SKILL_FIT_ASSESSMENT.md` | ✅ Done |
| B4 | Create `docs/CARI_TEST_STRATEGY.md` | ✅ Done |
| B5 | Create `docs/CARI_SECURITY_REVIEW_PLAN.md` | ✅ Done |
| B6 | Create `docs/skills/cari-evidence-grounding-skill.md` | ✅ Done |
| B7 | Create `docs/skills/cari-microsoft-learn-mcp-grounding-skill.md` | ✅ Done |
| B8 | Create `docs/skills/cari-waf-caf-alz-review-skill.md` | ✅ Done |
| B9 | Create `.claude/skills/` — 8 Claude Code SKILL.md files | ✅ Done (2026-05-26) |

---

## Mode C — Implementation Slices

| # | Slice | Priority | Status | Commit | Tests |
| --- | ----- | -------- | ------ | ------ | ----- |
| C0 | Commit PDCA session fixes (4 fixes: XLSX si-grouping, suppressScaffold, W002 suppression, isImplementationEvidence) | P0 | ✅ **DONE** | `047d926` | 197→197 pass |
| C1 | Upload magic-bytes sniffing — `detectExecutableMagicBytes` in `arbUploadFiles.js` | P0 | ✅ **DONE** | `b245244` | +11 tests → 219 pass |
| C2 | ARB JSON schema validation gate — `validateArbOutput` in `runAgent.js` | P1 | ✅ **DONE** | `49334f8` | +11 tests |
| C3 | EvidenceId cross-validation — `stripOrphanEvidenceIds` in `runAgent.js` | P1 | ✅ **DONE** | `49334f8` | combined with C2 |
| C4 | MCP guidance metadata persistence — `fetchMicrosoftLearnGrounding` returns `{docs, mcpMetadata}` | P1 | ✅ **DONE** | `d62343d` | 208→208 pass |
| C5 | Structured telemetry with correlationId threaded upload→extract→agent→export | P2 | ✅ **DONE** | `264f258` | 219 pass (no new tests) |
| C6 | 'Why CARI says this' reviewer UI panel (evidence basis + confidence + guidance) | P2 | ✅ **DONE** | `4bda306` | Build pass, 229 API tests pass |
| C7 | Playwright E2E — upload → extract → review → export golden path | P2 | ✅ **DONE** | `ed73967` | Live-site smoke test; run with test:e2e:golden-path |
| C8 | Durable Functions idempotency test suite | P2 | ✅ **DONE** | `e7254e9` | +24 tests → 253 pass |
| C9 | Prompt injection eval cases (10 minimum per master prompt) | P1 | ✅ **DONE** | `436d006` | +9 cases → 36 total |
| C10 | API-level project isolation / RBAC cross-user access test | P1 | ✅ **DONE** | (prev session) | 253 pass |
| G1 | Rubric doc v1.2 — align decision bands + domain weights + Networking domain to live agent | P1 | ✅ **DONE** | TBD | docs only |
| G2 | mcpMetadata enrichment — add `promptVersion`, `rulesVersion`, `topResults` to `makeMeta` | P1 | ✅ **DONE** | TBD | 253 pass |
| G3 | MCP relevance filter — drop results with `score < 0.5` in dedup step | P2 | ✅ **DONE** | TBD | 253 pass |
| G4 | Visual evidence in `WhyCariSaysThis` — badge + count; update `cari-evidence-grounding` SKILL.md | P2 | ✅ **DONE** | TBD | Build pass |

---

## Current Test Suite State

| Date | Tests | Pass | Fail | Key change |
|------|-------|------|------|-----------|
| 2026-05-25 (start) | 197 | 197 | 0 | Baseline (from previous PDCA session) |
| 2026-05-25 C2+C3 | 208 | 208 | 0 | +11 validateArbOutput + stripOrphanEvidenceIds |
| 2026-05-25 C4 | 208 | 208 | 0 | MCP metadata — no new tests (behavior tested by callers) |
| 2026-05-25 C1 | 219 | 219 | 0 | +11 detectExecutableMagicBytes |
| 2026-05-25 C5 | 219 | 219 | 0 | traceId threading — no new tests |
| 2026-05-25 C9 | 219 | 219 | 0 | eval dataset only — no unit tests |
| 2026-05-25 C10 | 229 | 229 | 0 | +10 RBAC cross-user isolation tests |
| 2026-05-25 C6 | 229 | 229 | 0 | frontend only — no new API tests |
| 2026-05-26 C8 | 253 | 253 | 0 | +24 durable idempotency tests |
| 2026-05-29 TRK-015 | 291 | 291 | 0 | +9 telemetry helper tests (TRK-014/015) |
| 2026-05-29 TRK-018 | 310 | 310 | 0 | +15 schema drift tests (arb-foundry-agent.schema.test.js) |
| 2026-05-29 TRK-019 | 331 | 331 | 0 | +21 synthesis path tests (arb-foundry-agent.synthesis.test.js) |
| 2026-05-29 TRK-021 | 341 | 341 | 0 | +10 fan-out tests (arb-foundry-agent.fanout.test.js) |
| 2026-05-31 current | **352** | **352** | 0 | +11 Dependabot + misc (includes schema/synthesis/fanout test files) |
| 2026-05-31 TRK-025 | **362** | **362** | 0 | +10 Phase 3 Option A responses-direct tests (arb-foundry-agent.responses-direct.test.js) |

---

## Agents API Migration Status (see docs/FOUNDRY-AGENTS-API-MIGRATION-PLAN.md)

| TRK | Description | Status | Notes |
| --- | --- | --- | --- |
| TRK-020 | Phase 2 soak (5 business days) | ⏳ In Progress — Day 3/5 | Ends 2026-06-05. `USE_AGENTS_API=synthesis`. No action required. |
| TRK-022 | Phase 3 shadow comparison (portal agent) | ❌ Rolled Back | 0/5 pass. Portal agent system prompt incompatibility. Closed 2026-05-30. |
| TRK-023 | Phase 3 full activation | ⏸ Deferred | Awaiting TRK-020 + redesign decision (Option A or B) on 2026-06-05. |
| TRK-025 | Phase 3 Option A — Responses API Direct | ✅ Implemented | `foundryResponsesModelRequest` + `runSynthesisViaResponsesDirect` + flag routing coded. 10 tests pass. Awaiting June 5 activation decision. |

---

## Recent Commits (this session)

| Commit | Description |
|--------|-------------|
| `047d926` | fix(arb): PDCA — 4 correctness fixes for extraction quality and scoring accuracy |
| `f24fa8a` | docs: add CARI Master Prompt V6 and todo tracker to prompts/ |
| `49334f8` | fix(agent): C2/C3 — ARB JSON schema validation gate + evidenceId cross-validation |
| `d62343d` | fix(mcp): C4 — MCP guidance metadata persistence for audit trail |
| `b245244` | fix(security): C1 — upload magic-bytes sniffing to prevent content-type spoofing |
| `264f258` | fix(telemetry): C5 — thread traceId through both orchestrators to all core activities |
| `436d006` | test(evals): C9 — 9 prompt injection red-team cases added to baseline eval dataset |

---

## Remaining Gaps (post-C0–C4)

| Gap | Location | Priority |
|-----|----------|----------|
| No correlationId threaded across upload→extract→agent→export | `review-telemetry.js`, `runAgent.js`, `persistExtractionResults.js` | P2 — C5 |
| No 'Why CARI says this' reviewer UI | `frontend/src/components/` | P2 — C6 |
| No Playwright E2E golden path in CI | `.github/`, `evals/` | P2 — C7 |
| ~~No prompt injection eval cases~~ | ~~`evals/datasets/`~~ | ~~P1 — C9~~ — **DONE** |
| No API-level RBAC cross-user test | `api/src/functions/` | P1 — C10 |

---

## Next Session Start Instructions

1. Read this file first
2. Run `npm --prefix api test` — expect **362 pass, 0 fail**
3. Check `git log --oneline -8` — last commit should be the TRK-025 implementation commit
4. All Mode C slices (C0–C10) complete. TRK-025 Option A implemented (not yet activated). June 5 decision: activate `USE_AGENTS_API=responses-direct` (Option A) or keep `synthesis` as permanent (Option B).
5. Prompt path: `c:\cari-repo\prompts\CARI_Claude_Code_Skills_Master_Prompt_V6.md`

---

_This file is updated each session. Do not delete. Managed by Upendra Kumar._
