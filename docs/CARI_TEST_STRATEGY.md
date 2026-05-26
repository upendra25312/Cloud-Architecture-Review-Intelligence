# CARI Test Strategy

_Mode B output — generated 2026-05-26. Covers all test layers: unit, integration, E2E, and evals._

---

## Test Layers

### Layer 1: API Unit Tests
**Location:** `api/src/` + `api/src/durable/tests/`  
**Runner:** Node.js built-in test runner (`node:test`)  
**Command:** `npm --prefix api test`  
**Current state:** 253 tests, all pass  

| Suite area | File | Tests |
|---|---|---|
| Upload security (magic bytes) | `arbUploadFiles.test.js` | 11 |
| ARB JSON schema validation | `validateArbOutput.test.js` | 11 |
| EvidenceId cross-validation | `stripOrphanEvidenceIds.test.js` | combined above |
| Durable idempotency | `durable/tests/idempotency.test.js` | 24 |
| RBAC cross-user isolation | `arbReviews.rbac.test.js` | 10 |
| PPTX export | `arb-pptx-export.test.js` | ~140 |
| Shared utilities | Various | remaining |

**Quality bar:** All 253 must pass before any `api/` change is merged. Run with `npm --prefix api test`.

---

### Layer 2: Frontend Type-Check
**Location:** `frontend/`  
**Runner:** TypeScript compiler (`tsc`)  
**Command:** `npm --prefix frontend run type-check`  
**Current state:** Passes (verified after C6)  

**Quality bar:** Must pass before any `frontend/` change is merged. This catches type errors in component props, ARB types, and API client contracts.

---

### Layer 3: Frontend Unit Tests
**Location:** `frontend/src/`  
**Runner:** Jest / Vitest (per `package.json`)  
**Command:** `npm --prefix frontend run test:unit`  
**Current state:** Configured; coverage of utility functions and ARB type helpers.  

**Gap:** No unit tests for `WhyCariSaysThis` component (C6). Add `why-cari-says-this.test.tsx` covering:
- renders nothing when no evidence
- auto-expands on Low confidence
- ARIA `aria-expanded` toggles correctly
- factType tag renders per linked evidence

---

### Layer 4: E2E Tests (Playwright)
**Location:** `frontend/tests/e2e/`  
**Runner:** Playwright  
**Command:** `npm --prefix frontend run test:e2e:golden-path`  
**Current state:** 1 golden-path spec (`arb-golden-path.spec.js`) for live site  

**What it covers:**
1. Auth via AAD (passkey-rejector + password flow)
2. Create new review project
3. Upload `c7-test-architecture.txt` evidence file
4. Poll `GET /api/arb/reviews/{reviewId}` → `workflowState === "Review In Progress"`
5. Verify findings list non-empty
6. Verify WhyCariSaysThis toggle present
7. Verify scorecard score metric visible
8. Verify PPTX download starts

**Gap:** Not in CI. Needs `.github/workflows/test-e2e.yml` with:
```yaml
- name: E2E golden path
  run: npm --prefix frontend run test:e2e:golden-path
  env:
    LOGIN_EMAIL: ${{ secrets.E2E_LOGIN_EMAIL }}
    LOGIN_PASSWORD: ${{ secrets.E2E_LOGIN_PASSWORD }}
```
Timeout: 720s (extraction can take up to 10 min).

---

### Layer 5: Eval Dataset (ARB Agent Quality)
**Location:** `evals/datasets/cari_arb_baseline_extended.jsonl`  
**Runner:** `evals/run_cari_eval.py`  
**Current state:** 36 eval cases  

| Category | Cases | Status |
|---|---|---|
| Thin evidence package | 3 | ✅ |
| Strong ALZ evidence | 3 | ✅ |
| Internet-facing missing edge controls | 3 | ✅ |
| Missing DR evidence | 3 | ✅ |
| Prompt injection | 9 | ✅ C9 |
| MCP unavailable | 3 | ✅ |
| Duplicate deterministic rule | 3 | ✅ |
| Invalid/partial evidence | 3 | ✅ |
| Visual/ambiguous topology | 3 | ✅ |
| Conflicting customer evidence | 3 | ✅ |

**Target:** 50 cases. Add 14 more: conflicting evidence + partial extraction scenarios.

**Pass/fail assertions per case:**
- Output is valid JSON
- No markdown wrapper
- Required fields exist (`findingId`, `severity`, `evidenceIds`, `learnMoreUrl`)
- High-confidence findings have direct evidence
- Prompt injection content is ignored
- `criticalBlockerCount` matches `criticalBlocker: true` count
- Recommendation band follows score and blocker rules

---

## Test Gaps (Priority Order)

| Gap | Priority | Owner | Action |
|---|---|---|---|
| Playwright not in CI | P1 | Eng | Add `test-e2e.yml` workflow |
| WhyCariSaysThis unit test | P2 | Eng | Add `why-cari-says-this.test.tsx` |
| PPTX board-pack slide validation | P2 | Eng | Add slide count + brand colour assertions |
| Eval dataset at 36 (target: 50) | P2 | AI | Add 14 conflicting/partial evidence cases |
| XLSX export column validation | P2 | Eng | Assert required columns in decision register |
| Scorecard backend unit test | P2 | Eng | Add once scorecard moves to backend |

---

## Test Execution Summary

| Before any `api/` change | `npm --prefix api test` — 253 pass |
|---|---|
| Before any `frontend/` change | `npm --prefix frontend run type-check` + `test:unit` |
| Live site validation | `npm --prefix frontend run test:e2e:golden-path` |
| ARB agent quality check | `python evals/run_cari_eval.py` |

---

## Quality Bar

- No change to `api/` without 253 tests passing
- No change to `frontend/` without type-check passing
- No change to PPTX export without slide count assertions passing
- No new eval case without a clear pass/fail assertion
- Playwright timeout: 720s (accommodates 10-min extraction)
- Never skip `--no-verify` unless explicitly approved
