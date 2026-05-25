# CARI Todo Tracker

_Maintained by Claude Code per Master Prompt V6. Updated each session. Last updated: 2026-05-25._

---

## Mode A — Discovery (Run First, No File Changes)

| # | Task | Status |
|---|------|--------|
| A1 | Check git state and run API tests | ✅ Done |
| A2 | Inspect repo structure (API, durable, shared, evals, frontend/arb) | ✅ Done |
| A3 | Audit ARB JSON schema validation gate (AJV/Zod before storage) | ✅ Done — **GAP: no runtime schema gate exists** |
| A4 | Audit evidenceId cross-validation (agent IDs vs extracted facts) | ✅ Done — **GAP: no existence check before render** |
| A5 | Audit upload security (MIME, extension, size limits, spoofing) | ✅ Done — mostly strong; **GAP: no magic-bytes MIME sniff** |
| A6 | Audit MCP guidance metadata persistence | ✅ Done — **GAP: only `cachedAt + docs` stored; no query/hash/status/rank** |
| A7 | Audit observability and telemetry coverage | ✅ Done — basic `context.log`; **GAP: no structured correlationId pipeline** |
| A8 | Produce ranked top-10 backlog + PDCA summary | ✅ Done — see discovery report below |

---

## Mode B — Planning Docs (Requires User Approval)

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

## Mode C — Implementation Slices (Requires User Approval Per Slice)

| # | Task | Priority | Status |
|---|------|----------|--------|
| C0 | Commit unstaged fixes from previous session (4 PDCA fixes, 197 tests green) | P0 | ⏳ Pending approval |
| C1 | Upload MIME magic-bytes sniffing (content-type spoofing prevention) | P0 | ⏳ Pending |
| C2 | ARB JSON schema validation gate (AJV/Zod before storage and render) | P1 | ⏳ Pending |
| C3 | EvidenceId cross-validation — orphan IDs stripped before render | P1 | ⏳ Pending |
| C4 | MCP guidance metadata persistence (query, queryHash, mcpStatus, rank, usedForFindingId) | P1 | ⏳ Pending |
| C5 | Observability: structured telemetry with correlationId across upload → extract → agent → export | P2 | ⏳ Pending |
| C6 | 'Why CARI says this' reviewer UI panel | P2 | ⏳ Pending |
| C7 | Playwright E2E: upload → review → export golden path | P2 | ⏳ Pending |
| C8 | Durable Functions idempotency test suite | P2 | ⏳ Pending |
| C9 | Prompt injection eval cases (10 minimum per master prompt) | P1 | ⏳ Pending |
| C10 | API-level project isolation / RBAC cross-user access test | P1 | ⏳ Pending |

---

## Discovery Findings Summary (Mode A output — 2026-05-25)

### Git State
- Branch: `main` (up to date with origin)
- **Uncommitted**: 3 fix files from previous PDCA session (arb-review-store.js, arb-normalize-review.js, arb-review-store.test.js) + 8 `.claude/agents/kfc/` spec files + untracked `prompts/`
- Tests: **197 pass, 0 fail**

### Top 10 Prioritised Backlog

| Rank | Item | Priority | Repo Path | Validated |
|------|------|----------|-----------|-----------|
| 1 | **Commit PDCA session fixes** — 4 fixes unstaged, 197 tests green | P0 | `api/src/shared/` | ✅ verified |
| 2 | **ARB JSON schema validation gate** — `JSON.parse` only; no AJV/Zod structural check before persisting findings | P1 | `api/src/shared/arb-foundry-agent.js:898` | ✅ verified |
| 3 | **EvidenceId cross-validation** — agent output evidenceIds are stored without confirming they match extracted fact IDs | P1 | `api/src/shared/arb-review-store.js:1695` | ✅ verified |
| 4 | **MCP metadata persistence** — only `{cachedAt, docs}` cached; no `query`, `queryHash`, `mcpStatus`, `usedForFindingId`, `promptVersion` stored | P1 | `api/src/shared/arb-foundry-agent.js:573` | ✅ verified |
| 5 | **Upload MIME magic-bytes sniffing** — browser-supplied MIME only; `application/octet-stream` is accepted broadly; no file header check | P0 | `api/src/functions/arbUploadFiles.js:12` | ✅ verified |
| 6 | **Prompt injection evals** — system prompt has injection resistance text but no eval dataset with adversarial uploaded content cases | P1 | `evals/datasets/cari_arb_baseline_extended.jsonl` | ✅ gap confirmed |
| 7 | **Structured telemetry / correlationId** — `context.log` strings used; no correlationId threaded through upload → extract → agent → export | P2 | `api/src/shared/review-telemetry.js` | ✅ verified |
| 8 | **'Why CARI says this' UI panel** — finding cards exist but no customer evidence / Microsoft guidance / confidence breakdown panel | P2 | `frontend/src/components/` | needs frontend audit |
| 9 | **Playwright E2E golden-path test** — upload → extract → review → export workflow not covered end-to-end in CI | P2 | `.github/`, `evals/` | ✅ confirmed |
| 10 | **Durable Functions idempotency test** — orchestratorExtraction has fan-out but explicit replay-safety tests absent | P2 | `api/src/durable/tests/` | ✅ confirmed |

---

## PDCA Summary (5 lines max)

**Plan**: Inspected repo per Master Prompt V6 Mode A — git state, API tests, JSON schema, evidenceId, upload security, MCP persistence, observability, Durable reliability.
**Do**: Full read-only discovery across `api/`, `evals/`, `.github/`, Durable activities; no files changed.
**Check**: 197 tests green; 10 concrete gaps identified with exact file+line evidence; top priorities are unstaged commits, JSON schema gate, evidenceId validation, MCP metadata, and MIME sniffing.
**Act**: Recommend Mode C C0 first (commit PDCA fixes), then C2 (JSON schema gate) as highest-value runtime hardening.
**Next**: User approves Mode B (planning docs) or Mode C slice C0/C1/C2 — implement one approved slice per Mode C rules.

---

_This file is updated each session. Do not delete. Managed by Claude Code._
