# Export Consistency Guardrails

**Applies to:** All CARI export formats — Markdown, HTML, CSV, Excel, PPTX  
**Enforced by:** `arb-normalize-review.js` + `arb-export-validator.js`

---

## The Rule: One Pack, All Exports

All export renderers must consume a single canonical `ArbReviewOutputPack`. No renderer may independently calculate or re-derive:

- Overall score or scorecard percentages
- Governance posture or risk acceptance requirements  
- Finding severity, domain, or status  
- Evidence readiness status  
- Remediation action due dates or due status

Violation of this rule causes format drift — two exports from the same review showing different scores, different finding counts, or conflicting decisions.

---

## Guardrail Checklist — Before Adding/Modifying Any Renderer

| Check | How |
|---|---|
| Does the renderer accept a canonical pack? | Function signature takes `pack` (not raw `review, files, findings, ...`) |
| Does it call `normalizeReviewForExport()`? | Either directly or via `writeArbOutputArtifact` |
| Does it read score from `pack.scorecard.percentage`? | Not from `scorecard.overallScore` or any other field |
| Does it read decision from `pack.decision.reviewerDecision`? | Not from `scorecard.reviewerOverride.overrideDecision` |
| Does it read finding description from `pack.findings[].description`? | Not `findingStatement` (raw field, only in `_pptx` section) |
| Does it read action title from `pack.remediationActions[].title`? | Not `actionSummary` (raw field, only in `_pptx` section) |
| Does it surface `pack.exportWarnings`? | Warnings should appear in the output (banner, footnote, etc.) |

---

## Known Field Name Traps

These raw field names exist in storage entities but are NOT present in the canonical pack. Only the `_pptx` backward-compat section retains them for PPTX slide builders.

| Raw field | Canonical pack field | Where the old name still lives |
|---|---|---|
| `findingStatement` | `findings[].description` | `_pptx.findings[].findingStatement` only |
| `actionSummary` | `remediationActions[].title` | `_pptx.actions[].actionSummary` only |
| `logicalCategory` | `uploadedInputs[].documentType` | Raw storage entity |
| `extractionError` | `uploadedInputs[].extractionSummary` | Raw storage entity |
| `overrideDecision` | `decision.reviewerDecision` | `scorecard.reviewerOverride` (legacy) |
| `overriddenAt` | `decision.recordedAt` | `scorecard.reviewerOverride` (legacy) |
| `overrideRationale` | `decision.rationale` | `scorecard.reviewerOverride` (legacy) |
| `scorecard.overallScore` | `scorecard.percentage` | Raw scorecard entity |

---

## nextSteps — Computed Array, Never null or []

`_pptx.nextSteps` is **always a computed non-empty array** produced by `buildStateAwareNextSteps()` in `arb-normalize-review.js`. It is set at normalization time and reflects the current review state (open findings, reviewer decision, evidence readiness, etc.).

**Rules:**

- Never set `_pptx.nextSteps = null` — the PPTX slide builder expects a populated array.
- Never set `_pptx.nextSteps = []` — an empty array is truthy but will render a blank Next Steps slide.
- If review context is insufficient to derive meaningful steps, the normalizer inserts one safe default: `"Complete reviewer sign-off and validate evidence readiness before closing this architecture review."`
- The PPTX slide builder reads `_pptx.nextSteps` directly — it must never fall back to a hardcoded default list, because category-specific defaults are already applied by the normalizer via the `CATEGORY_NEXT_STEPS` map.

**Enforced by:** `arb-export-parity.test.js` — asserts `Array.isArray(_pptx.nextSteps) && nextSteps.length > 0`.

---

## Governance Posture vs Reviewer Decision

These are different:

| Field | Source | Meaning |
|---|---|---|
| `decision.reviewerDecision` | Reviewer input | What the reviewer said |
| `decision.governancePosture` | Derived from findings | What the architecture evidence supports |

When `reviewerDecision === "Approved"` but open Critical/High findings exist, `governancePosture` will be `"Needs Remediation"` or `"Approved with Conditions"`. A `governanceWarning` is set to surface this conflict.

Renderers **must** display both fields when they differ — never show only the reviewer decision.

---

## Export Warnings

`pack.exportWarnings` is an array of `{ warningId, severity, message, affectedSections }` items. Every renderer that generates a document must surface these — failing silently hides quality issues from reviewers.

Severity levels:
- `"error"` — validation failure (missing reviewId, invalid score range)  
- `"warning"` — quality concern (open Critical findings, partial evidence)  
- `"info"` — informational (template library limitation, optional fields absent)

---

## Adding a New Export Format

1. Add the format name to `createArbExport` supported formats in `arb-review-store.js`
2. Create a renderer that accepts `pack` (canonical)
3. Call `normalizeReviewForExport(..., "your-format")` before invoking the renderer
4. Add format to the parity test fixture in `arb-export-parity.test.js`
5. Verify `npm --prefix api test` passes 162+ tests

---

## Cross-Format Parity Test

`api/src/shared/arb-export-parity.test.js` asserts that all formats produce identical values for:
- `pack.customer.name` and `pack.project.name`
- `pack.findings.length`
- `pack.scorecard.percentage`
- `pack.decision.governancePosture`

Run on every PR that touches any file in `api/src/shared/arb-*.js`.
