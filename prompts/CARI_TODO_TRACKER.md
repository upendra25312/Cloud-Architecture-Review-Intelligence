# CARI Todo Tracker

_Maintained by Claude Code per Master Prompt V6. Updated each session. Last updated: 2026-05-25 (C9 complete)._

---

## Mode A — Discovery (Complete)

| # | Task | Status |
|---|------|--------|
| A1 | Check git state and run API tests | ✅ Done |
| A2 | Inspect repo structure (API, durable, shared, evals, frontend/arb) | ✅ Done |
| A3 | Audit ARB JSON schema validation gate | ✅ Done — **GAP fixed in C2** |
| A4 | Audit evidenceId cross-validation | ✅ Done — **GAP fixed in C3** |
| A5 | Audit upload security (MIME, extension, size limits, spoofing) | ✅ Done — **GAP fixed in C1** |
| A6 | Audit MCP guidance metadata persistence | ✅ Done — **GAP fixed in C4** |
| A7 | Audit observability and telemetry coverage | ✅ Done — GAP remains (C5 pending) |
| A8 | Produce ranked top-10 backlog + PDCA summary | ✅ Done |

---

## Mode B — Planning Docs (Awaiting User Approval)

| # | Task | Status |
|---|------|--------|
| B1 | Create `docs/CARI_REPO_DISCOVERY_REPORT.md` | ⏳ Pending approval |
| B2 | Create `docs/CARI_IMPLEMENTATION_BACKLOG.md` | ⏳ Pending approval |
| B3 | Create `docs/CARI_SKILL_FIT_ASSESSMENT.md` | ⏳ Pending approval |
| B4 | Create `docs/CARI_TEST_STRATEGY.md` | ⏳ Pending approval |
| B5 | Create `docs/CARI_SECURITY_REVIEW_PLAN.md` | ⏳ Pending approval |
| B6 | Create `docs/skills/cari-evidence-grounding-skill.md` | ⏳ Pending approval |
| B7 | Create `docs/skills/cari-microsoft-learn-mcp-grounding-skill.md` | ⏳ Pending approval |
| B8 | Create `docs/skills/cari-waf-caf-alz-review-skill.md` | ⏳ Pending approval |

---

## Mode C — Implementation Slices

| # | Slice | Priority | Status | Commit | Tests |
|---|-------|----------|--------|--------|-------|
| C0 | Commit PDCA session fixes (4 fixes: XLSX si-grouping, suppressScaffold, W002 suppression, isImplementationEvidence) | P0 | ✅ **DONE** | `047d926` | 197→197 pass |
| C1 | Upload magic-bytes sniffing — `detectExecutableMagicBytes` in `arbUploadFiles.js` | P0 | ✅ **DONE** | `b245244` | +11 tests → 219 pass |
| C2 | ARB JSON schema validation gate — `validateArbOutput` in `runAgent.js` | P1 | ✅ **DONE** | `49334f8` | +11 tests |
| C3 | EvidenceId cross-validation — `stripOrphanEvidenceIds` in `runAgent.js` | P1 | ✅ **DONE** | `49334f8` | combined with C2 |
| C4 | MCP guidance metadata persistence — `fetchMicrosoftLearnGrounding` returns `{docs, mcpMetadata}` | P1 | ✅ **DONE** | `d62343d` | 208→208 pass |
| C5 | Structured telemetry with correlationId threaded upload→extract→agent→export | P2 | ✅ **DONE** | `264f258` | 219 pass (no new tests) |
| C6 | 'Why CARI says this' reviewer UI panel (evidence basis + confidence + guidance) | P2 | ✅ **DONE** | `4bda306` | Build pass, 229 API tests pass |
| C7 | Playwright E2E — upload → extract → review → export golden path | P2 | ⏳ Pending |  | |
| C8 | Durable Functions idempotency test suite | P2 | ⏳ Pending |  | |
| C9 | Prompt injection eval cases (10 minimum per master prompt) | P1 | ✅ **DONE** | `436d006` | +9 cases → 36 total |
| C10 | API-level project isolation / RBAC cross-user access test | P1 | ⏳ Pending |  | |

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
2. Run `npm --prefix api test` — expect **219 pass, 0 fail**
3. Check `git log --oneline -8` — last commit should be `436d006`
4. Continue with **C7** (Playwright E2E golden path, P2) or ask user which slice to tackle
5. Prompt path: `c:\cari-repo\prompts\CARI_Claude_Code_Skills_Master_Prompt_V6.md`

---

_This file is updated each session. Do not delete. Managed by Claude Code._
