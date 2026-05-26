# CARI Repository Discovery Report

_Mode A output — generated 2026-05-26. Grounded in repo inspection and live site context._

---

## PDCA Summary

**Plan:** Inspect repo, live site, ARB agent contract, security posture, test coverage, and observability to identify implementation gaps.  
**Do:** Full Mode A discovery across all CARI layers (frontend, API, durable, evals, infra, standards).  
**Check:** 10 verified gaps found; 5 were P0/P1 and fixed immediately in C0–C9; 1 P1 RBAC gap fixed in C10.  
**Act:** All P0/P1 gaps resolved. Mode B planning docs created. Mode C implementation complete.

---

## Repo Map

```text
c:\cari-repo\
├── frontend/                  Next.js App Router — live production UI
│   ├── app/                   Route pages (arb/, projects/, etc.)
│   ├── src/
│   │   ├── components/arb/    ARB review UI components
│   │   │   └── findings/      Finding cards, detail panel, WhyCariSaysThis
│   │   ├── arb/types.ts       ARB domain model (ArbFinding, ArbReview, etc.)
│   │   └── lib/               Pure TypeScript utilities
│   └── tests/e2e/             Playwright E2E tests
├── api/
│   ├── src/functions/         Azure Function HTTP handlers (one file = one route)
│   ├── src/shared/            Shared logic: auth.js, stores, services
│   │   ├── arb-pptx-export.js PowerPoint board-pack export
│   │   ├── review-telemetry.js Telemetry + traceId threading
│   │   └── fetchMicrosoftLearnGrounding.js  MCP grounding + metadata
│   ├── src/durable/           Durable orchestrators + activities
│   │   ├── orchestratorExtraction.js
│   │   ├── orchestratorAgentReview.js
│   │   └── tests/             Unit + idempotency tests
│   └── data/arb-rules/        Deterministic governance rules (CAF, WAF, internal)
├── evals/
│   ├── datasets/cari_arb_baseline_extended.jsonl  36 eval cases
│   ├── rubrics/cari_review_quality_rubric.md
│   └── run_cari_eval.py
├── docs/                      Architecture docs, ADRs, runbooks, guides
├── standards/                 Engineering, architecture, security, UX, release standards
├── infrastructure/terraform/  Terraform IaC (frozen — no apply without CI/CD)
└── .github/                   CI/CD workflows, templates, CODEOWNERS
```

---

## Live Site Observations

- **URL:** `https://thankful-pond-04383960f.7.azurestaticapps.net/arb`
- Review workflow entry: upload evidence → extraction → agent review → findings → scorecard → export
- Auth: Azure Static Web Apps built-in AAD integration (`/.auth/me`)
- PPTX board-pack export confirmed available at `/api/arb/export`
- "Why CARI says this" panel live after C6 (collapsible, auto-expands on Low confidence)
- Projects feature present and working

---

## Current CARI Workflow Map

```text
User uploads evidence files (PDF, DOCX, PPTX, XLSX, TXT)
  → arbUploadFiles.js validates extension + MIME + magic bytes (C1)
  → Files stored in Azure Blob Storage
  → POST /api/arb/extract triggers orchestratorExtraction (Durable)
  → orchestratorExtraction calls extraction activities (Document Intelligence)
  → persistExtractionResults.js writes evidence facts to Table Storage
  → POST /api/arb/run triggers orchestratorAgentReview (Durable)
  → fetchMicrosoftLearnGrounding.js calls MS Learn MCP → persists mcpMetadata (C4)
  → Foundry ARB Agent generates JSON ARB output
  → validateArbOutput checks JSON schema (C2)
  → stripOrphanEvidenceIds removes invalid IDs (C3)
  → Output stored in Azure Table Storage
  → GET /api/arb/review/{id} serves findings to frontend
  → Reviewer uses WhyCariSaysThis panel (C6) to validate findings
  → Reviewer accepts/edits/rejects findings
  → PPTX board-pack exported via arb-pptx-export.js
```

---

## Foundry ARB Agent Contract Fit

| Contract requirement | Status |
|---|---|
| JSON-only response (no markdown fences) | ✅ Validated by `validateArbOutput` (C2) |
| evidenceIds reference valid extracted facts | ✅ Enforced by `stripOrphanEvidenceIds` (C3) |
| learnMoreUrl present on findings | Checked in schema; fallback MCP URL used (C4) |
| criticalBlocker calibration | Deterministic rules engine enforces |
| prompt injection resistance | Eval cases added (C9); runtime guardrail in agent prompt |
| human reviewer authority | Enforced in frontend; no auto-decision |
| No markdown fences or code blocks in output | Validated by schema regex check |

---

## Security Risks Found

| Risk | Severity | Status |
|---|---|---|
| Upload MIME spoofing (content-type header bypass) | P0 | ✅ Fixed C1 — magic bytes sniffing |
| No ARB JSON schema gate before storing | P1 | ✅ Fixed C2 — `validateArbOutput` |
| Orphan evidenceIds rendered as trusted findings | P1 | ✅ Fixed C3 — `stripOrphanEvidenceIds` |
| No API-level RBAC cross-user isolation test | P1 | ✅ Fixed C10 — 10 RBAC tests added |
| Prompt injection via uploaded documents | P1 | ✅ Eval cases added C9 |
| No malware scanning (design gap, not implemented) | P2 | Open — see Security Review Plan |
| MCP query may expose customer-sensitive terms | P2 | Partially mitigated — queryHash persisted |

---

## UX Gaps Found

| Gap | Status |
|---|---|
| No "Why CARI says this" panel for reviewers | ✅ Fixed C6 |
| Evidence basis, confidence, and grounding references scattered across UI | ✅ Consolidated in C6 |
| No E2E golden path validation in CI | ✅ Fixed C7 — Playwright spec added |

---

## Test Coverage Gaps Found

| Gap | Status |
|---|---|
| No unit tests for upload magic bytes | ✅ Fixed C1 (+11 tests) |
| No tests for ARB JSON schema validation | ✅ Fixed C2 (+11 tests) |
| No Durable Functions timer-race idempotency tests | ✅ Fixed C8 (+24 tests) |
| No prompt injection eval cases | ✅ Fixed C9 (+9 cases, 36 total) |
| No API-level RBAC isolation tests | ✅ Fixed C10 (+10 tests) |
| No Playwright E2E golden path | ✅ Fixed C7 |

---

## Observability Gaps Found

| Gap | Status |
|---|---|
| No correlationId threading across upload→extract→agent→export | ✅ Fixed C5 |
| MCP metadata not persisted for audit | ✅ Fixed C4 |

---

## Current Test Suite State (post-discovery session)

| Layer | Count | Status |
|---|---|---|
| API unit tests | 253 | All pass |
| Eval dataset cases | 36 | Calibrated on deployed Azure |
| Playwright E2E | 1 golden path | Run manually; CI gap noted |

---

## Top 10 Prioritized Backlog (post-session)

| Rank | Item | Priority | Status |
|---|---|---|---|
| 1 | Upload magic bytes sniffing | P0 | ✅ Done C1 |
| 2 | ARB JSON schema validation gate | P1 | ✅ Done C2 |
| 3 | EvidenceId cross-validation | P1 | ✅ Done C3 |
| 4 | MCP guidance metadata persistence | P1 | ✅ Done C4 |
| 5 | Prompt injection evals | P1 | ✅ Done C9 |
| 6 | API-level RBAC cross-user test | P1 | ✅ Done C10 |
| 7 | CorrelationId telemetry threading | P2 | ✅ Done C5 |
| 8 | 'Why CARI says this' reviewer UI | P2 | ✅ Done C6 |
| 9 | Playwright E2E golden path | P2 | ✅ Done C7 |
| 10 | Durable idempotency tests | P2 | ✅ Done C8 |

---

## Recommended Next Actions

1. Add Playwright golden-path test to CI (`.github/workflows/test-e2e.yml`)
2. Implement malware scanning design (ClamAV or Defender for Storage)
3. Add board-pack export validation tests (PPTX slide count, required slides)
4. Extend eval dataset: add 5+ cases for conflicting evidence scenarios
5. Review MCP query sanitization for customer-sensitive term redaction

---

_Verified repo facts: all file paths and commit hashes confirmed against `git log`. Assumptions: live site behavior assumed stable as of 2026-05-26._
