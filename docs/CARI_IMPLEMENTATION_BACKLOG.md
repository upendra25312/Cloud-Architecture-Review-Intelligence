# CARI Implementation Backlog

_Mode B output — generated 2026-05-26. Updated after completing Mode C slices C0–C10._

---

## Completed Slices (C0–C10)

| Slice | Description | Priority | Commit | Tests |
|---|---|---|---|---|
| C0 | PDCA session fixes: XLSX si-grouping, suppressScaffold, W002 suppression, isImplementationEvidence | P0 | `047d926` | 197 pass |
| C1 | Upload magic-bytes sniffing — `detectExecutableMagicBytes` in `arbUploadFiles.js` | P0 | `b245244` | +11 → 219 |
| C2 | ARB JSON schema validation gate — `validateArbOutput` in `runAgent.js` | P1 | `49334f8` | +11 |
| C3 | EvidenceId cross-validation — `stripOrphanEvidenceIds` in `runAgent.js` | P1 | `49334f8` | combined C2 |
| C4 | MCP guidance metadata persistence — `fetchMicrosoftLearnGrounding` returns `{docs, mcpMetadata}` | P1 | `d62343d` | 208 pass |
| C5 | Structured telemetry — correlationId threaded upload→extract→agent→export | P2 | `264f258` | 219 pass |
| C6 | 'Why CARI says this' reviewer UI panel | P2 | `4bda306` | build pass, 229 pass |
| C7 | Playwright E2E — upload → extract → review → export golden path | P2 | `ed73967` | live-site smoke |
| C8 | Durable Functions idempotency test suite (24 tests, 8 suites) | P2 | `e7254e9` | +24 → 253 pass |
| C9 | Prompt injection eval cases (9 cases added, 36 total) | P1 | `436d006` | 36 eval cases |
| C10 | API-level RBAC cross-user access tests (10 tests) | P1 | included in C6 | +10 → 229 pass |

---

## Next Sprint Backlog (Unstarted)

### P1 Items

| # | Item | Area | Files | Acceptance Criteria |
|---|---|---|---|---|
| N1 | Add Playwright E2E to CI pipeline | `.github/` | `.github/workflows/test-e2e.yml` | Golden path runs on PR; failure blocks merge |
| N2 | Board-pack PPTX export validation tests | `api/src/shared/` | `arb-pptx-export.test.js` | Slide count, required slides, brand colours asserted |
| N3 | MCP query sanitization for customer-sensitive terms | `api/src/shared/` | `fetchMicrosoftLearnGrounding.js` | No customer project names in persisted query text |

### P2 Items

| # | Item | Area | Files | Acceptance Criteria |
|---|---|---|---|---|
| N4 | Malware scanning design document + stub | `api/src/shared/` | `arbUploadFiles.js`, runbook | Design reviewed; scan hook point identified |
| N5 | Extend eval dataset to 50 cases | `evals/` | `cari_arb_baseline_extended.jsonl` | +14 cases covering conflicting evidence, partial extractions |
| N6 | Scorecard backend validation | `api/src/shared/` | `arb-scoring.js` | Score recalculated in backend; frontend reads computed value |
| N7 | Reviewer accept/edit/reject audit log | `api/src/functions/` | `arbFindingActions.js` | Each action logged with userId, findingId, timestamp, action |
| N8 | Decision governance export (XLSX) validation | `api/src/shared/` | `arb-xlsx-export.js` | Required columns present; empty-state guard |

### P3 Items

| # | Item | Area | Notes |
|---|---|---|---|
| N9 | FinOps review findings category | `api/data/arb-rules/` | New rule file; requires WAF Cost pillar mapping |
| N10 | Azure Service Explorer integration | `frontend/app/` | Scoped design only; no infra changes |
| N11 | Foundry agent multi-model fallback | `api/src/shared/` | model-router only; fallback to same deployment |
| N12 | Document Intelligence confidence threshold tuning | `api/src/durable/` | Eval-driven; no code change until calibrated |

---

## Backlog Priority Model

| Priority | Definition |
|---|---|
| P0 | Security, data leakage, broken upload/review/export, cross-user access |
| P1 | Evidence quality, schema validation, grounding persistence, RBAC |
| P2 | Reviewer UX, Playwright/E2E, board-pack quality, observability |
| P3 | Documentation polish, optional MCP extensions, visual enhancements |

---

## Mapping to Runtime Product Controls

Every backlog item maps to at least one runtime control:

| Backlog Item | Runtime Control |
|---|---|
| N1 CI Playwright | CI gate — prevents broken E2E from reaching main |
| N2 PPTX tests | Export quality — prevents blank or malformed board-packs |
| N3 MCP sanitization | Data classification — prevents customer term leakage in audit logs |
| N4 Malware scan | Upload security — defence-in-depth beyond magic bytes |
| N5 Eval dataset | Agent quality — detects regressions in ARB agent calibration |
| N6 Scorecard backend | Score integrity — prevents frontend scorecard manipulation |
| N7 Audit log | Reviewer accountability — GDPR and governance audit trail |
| N8 XLSX validation | Export correctness — ensures decision register integrity |

---

_This backlog is not frozen. Re-prioritize after each sprint based on live site and eval findings._
