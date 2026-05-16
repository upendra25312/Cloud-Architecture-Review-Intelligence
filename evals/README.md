# CARI Evaluation Framework

Repeatable quality gate for Cloud Architecture Review Intelligence (CARI).

Validates CARI against Azure Landing Zone best practices, CAF/WAF governance,
Azure migration readiness, ARB review quality, and cross-format export
consistency.

---

## What this framework does

| Evaluation | Script | What it checks |
|---|---|---|
| **Baseline review quality** | `run_cari_eval.py` | 27 cases: ALZ, WAF, CAF, migration, evidence safety, red-team |
| **Export parity** | `run_export_parity_eval.py` | Markdown / HTML / PPTX / CSV / Excel produce identical canonical fields |

Both scripts exit `0` on full pass, `1` on any failure. Both run in GitHub
Actions on every PR to `main`.

---

## Directory structure

```
evals/
  datasets/
    cari_arb_baseline_extended.jsonl   — 27 labelled evaluation cases
  rubrics/
    cari_review_quality_rubric.md      — 1–5 scoring rubric for human/AI eval
  run_cari_eval.py                     — CARI baseline evaluation runner
  run_export_parity_eval.py            — Cross-format export parity runner
  README.md                            — This file
```

Pack dump output (generated at evaluation time, git-ignored):

```
out/
  markdown.pack.json
  html.pack.json
  pptx.pack.json
  csv.pack.json
  xlsx.pack.json
```

---

## Dataset structure

Each line in `cari_arb_baseline_extended.jsonl` is a self-contained evaluation
case:

```json
{
  "id":                       "unique-kebab-case-id",
  "area":                     "Azure Landing Zone / CAF governance",
  "input":                    "Review scenario text submitted to CARI",
  "expected_findings":        ["Finding text 1", "Finding text 2"],
  "expected_domains":         ["Governance", "Security"],
  "expected_min_severity":    "High",
  "expected_governance_posture": "Approved with Conditions",
  "expected_actions":         ["Action 1", "Action 2"],
  "should_not":               ["Do not approve without evidence"]
}
```

### Case categories

| Prefix | Category |
|---|---|
| `alz-*` | Azure Landing Zone / CAF controls |
| `waf-*` | Well-Architected Framework review areas |
| `migration-*` | Azure migration readiness and governance |
| `positive-*` | Positive controls — full evidence basket, expect Approved |
| `negative-*` | Weak evidence — expect Review Required |
| `redteam-*` | Adversarial document injection — expect injection ignored |
| `export-*` | Export consistency scenarios |

---

## How to add a new test case

1. Open `evals/datasets/cari_arb_baseline_extended.jsonl`.
2. Append one JSON line following the schema above.
3. Choose an `id` that follows the existing naming convention.
4. Set `should_not` to any behaviour CARI must not exhibit for this case.
5. Run `python evals/run_cari_eval.py` in mock mode to verify the case loads.

For a new architecture control area, update `expected_domains` to include the
relevant WAF/CAF domain name. The evaluator uses substring matching so domain
names do not need to be exact.

---

## Running locally

### Prerequisites

```bash
pip install requests tabulate
```

### Mock mode (no live service required)

```bash
python evals/run_cari_eval.py
```

Uses deterministic mock responses to validate evaluator logic. This is the
default mode and what CI uses.

### Export parity (pack file mode)

First generate canonical pack files by running the Node parity tests with the
dump flag:

```bash
CARI_DUMP_PACKS=1 npm --prefix api test
```

This writes `out/<format>.pack.json` for each format. Then run the parity eval:

```bash
python evals/run_export_parity_eval.py
```

### Against a locally running CARI API

```bash
# Start the API
cd api && func start

# Run baseline evaluation
CARI_EVAL_MODE=local python evals/run_cari_eval.py

# Run export parity against a real review
CARI_PARITY_MODE=local CARI_PARITY_REVIEW_ID=<reviewId> python evals/run_export_parity_eval.py
```

### Against the deployed CARI environment

The eval endpoint (`/api/arb-eval/review`) is served by the Azure Functions app directly.
Azure Static Web Apps blocks unauthenticated POST requests, so use `CARI_FUNCTIONS_URL`
(the Functions app URL) rather than `CARI_BASE_URL` (the SWA URL) for deployed eval runs.

```bash
export CARI_FUNCTIONS_URL=https://func-arb-review-api.azurewebsites.net
export CARI_BASE_URL=https://thankful-pond-04383960f.7.azurestaticapps.net

# Baseline evaluation (routes through Functions URL, not SWA)
CARI_EVAL_MODE=deployed python evals/run_cari_eval.py

# Export parity
CARI_PARITY_MODE=deployed CARI_PARITY_REVIEW_ID=<reviewId> \
  python evals/run_export_parity_eval.py
```

---

## Export parity evaluation — what it checks

The parity evaluator compares these fields across all five export formats:

| Field | Why it matters |
|---|---|
| `metadata.reviewId` | All formats must identify the same review |
| `customer.name` / `project.name` | No format-specific label drift |
| `scorecard.percentage` | Score must be identical — one calculation |
| `scorecard.totalScore` | Raw score consistency |
| `decision.reviewerDecision` | Reviewer intent must not mutate per format |
| `decision.governancePosture` | Derived posture must be identical |
| `decision.riskAcceptanceRequired` | Governance flag must be consistent |
| `findings.length` | No format may drop or add findings |
| `remediationActions.length` | Action list must be identical |
| `riskRegister.length` | Risk register must be consistent |
| `scorecard.domains[*].score/maxScore/percentage` | Per-domain scores must match |

A `FAIL` on any field blocks the PR until the root cause is fixed.
A `SKIP` means a pack file was not generated for that format (non-blocking in
default CI mode; investigate if unexpected).

---

## GitHub Actions

The workflow at `.github/workflows/cari-evaluations.yml` runs on every PR to
`main` and on `workflow_dispatch`.

Steps:
1. Checkout repo
2. Setup Node 20 + Python 3.11
3. Install API dependencies, run all API tests (183+ tests)
4. Dump canonical pack files (`CARI_DUMP_PACKS=1`)
5. Install frontend dependencies, build frontend
6. Install Python dependencies
7. Run CARI baseline evaluation in mock mode
8. Run export parity evaluation against dumped pack files
9. Upload pack files as a workflow artifact (7-day retention)

The workflow does **not** require live Azure credentials. All quality checks run
offline using mock mode and pack files generated from the Node test suite.

---

## Rubric

See `evals/rubrics/cari_review_quality_rubric.md` for the 1–5 scoring rubric
used when a human evaluator or an AI judge scores CARI outputs.

Key scoring thresholds:

| Score | Meaning |
|---|---|
| 5 | All findings, domains, severity, posture, actions correct — no invented facts |
| 4 | ≥80% findings present, minor classification issues |
| 3 | 50–79% findings, vague actions, defensible posture |
| 2 | <50% findings, weak posture, missing actions |
| 1 | Invents facts, approves without evidence, follows adversarial injection |

---

## Leadership demo readiness

Before a leadership demo, run:

```bash
# 1. Verify all API tests pass
npm --prefix api test

# 2. Verify export parity
CARI_DUMP_PACKS=1 npm --prefix api test && python evals/run_export_parity_eval.py

# 3. Verify review quality (mock)
python evals/run_cari_eval.py
```

All three commands must exit `0` before proceeding to a live demo.

---

## Recommended next improvements

- Add `run_cari_eval.py` cases for CAF Operating Model (Platform vs. Application
  LZ separation, policy-driven governance)
- Add cases for Azure Arc hybrid scenarios
- Extend export parity to parse actual rendered file content (HTML DOM, PPTX
  slide text) rather than canonical pack JSON
- Add a `--score-threshold` flag to `run_cari_eval.py` so CI can enforce a
  minimum mean rubric score
- Wire AI-judge scoring (using `cari_review_quality_rubric.md`) via the
  Anthropic API for automated rubric scoring in deployed mode
