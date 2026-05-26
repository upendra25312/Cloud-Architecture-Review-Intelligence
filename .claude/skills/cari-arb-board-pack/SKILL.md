# cari-arb-board-pack

## Purpose

Improve CARI ARB board-pack export quality. Ensure PPTX, XLSX, and DOCX exports are complete, correctly formatted, and production-ready for senior architecture review boards. Enforce brand compliance, empty-state guards, and SOW traceability rules.

## When to Use

- Reviewing or modifying `api/src/shared/arb-pptx-export.js`
- Investigating blank or malformed board-pack slides
- Adding new slides or export sections
- Debugging XLSX decision register column issues
- Reviewing board-pack output against `standards/pptx-export-standard.md`

## When Not to Use

- Replacing the board-pack generation logic with a different templating engine without architectural review
- Modifying PPTX templates without reading `standards/pptx-export-standard.md` first
- Adding new product categories without updating `CATEGORY_NEXT_STEPS` map first

## Critical Board-Pack Rules (must not regress)

1. **`nextSteps: null` not `[]`:** An empty array is truthy. `data.nextSteps || [defaults]` will not fall through to defaults if `nextSteps: []`. Always use `null` in `shapeReviewDataForPptx`.
2. **Empty-state guard on every slide:** Every slide rendering a table or list must have an explicit empty guard. Never let a slide render with only a header row and no body.
3. **`wrap: true` on all multi-line text:** Every `addText` call that could receive more than one line must have `wrap: true`. Applies to Next Steps items and Action summaries.
4. **Brand colours:** Purple `#95008A` is the cover slide brand anchor — never change. Teal appears conditionally (score ≥80, "Recommended for Approval", action "Closed", SOW "In scope").
5. **SOW traceability data source:** Build `sowTraceability` from the `files` array (filter `logicalCategory === "sow"`), cross-referenced against `requirements`. Never filter `evidence` for SOW — it returns empty.
6. **Category Next Steps:** `CATEGORY_NEXT_STEPS` map contains 6 steps per category. Adding a new project category anywhere requires updating this map first.
7. **`text.slice(n)` always with `wrap: true`:** Never truncate without wrap.

## Required Slides

| Slide | Required content |
|---|---|
| Cover | Title, category pill (purple), reviewer name, date |
| Executive Summary | Recommendation band, score, critical blockers |
| Scope | SOW in-scope services list |
| Evidence Inventory | Source files with type and page count |
| Findings | Domain, severity, recommendation, evidence basis |
| Risk Register | Risk, likelihood, impact, owner |
| Decisions | Decision required, outcome, approver |
| Exceptions | Exception request, justification, expiry |
| Scorecard | WAF pillar scores, overall score |
| Next Steps | Category-specific 6-step action list |
| References | MS Learn URLs from mcpMetadata |

## Inputs

- ARB review JSON from Table Storage
- Evidence inventory (source files + page counts)
- Findings array (post-validation)
- `mcpMetadata` (for references slide)
- `CATEGORY_NEXT_STEPS` map

## Outputs

- PPTX file served via short-lived SAS URL from `/api/arb/export`
- XLSX decision register
- All slides populated (no empty slides)

## CARI Runtime Mapping

| Component | File |
|---|---|
| PPTX export engine | `api/src/shared/arb-pptx-export.js` |
| Export standard | `standards/pptx-export-standard.md` |
| Export tests | `api/src/` → `arb-pptx-export.test.js` (~140 tests) |
| Export HTTP handler | `api/src/functions/arbExport.js` |
| Office renderer | `services/office-renderer/` |

## Guardrails

- NEVER commit a change to `arb-pptx-export.js` without running `npm --prefix api test` (253 tests must pass)
- NEVER use `nextSteps: []` — always `nextSteps: null`
- NEVER let a slide render with only a header row — empty-state guard is mandatory
- NEVER add a new project category without updating `CATEGORY_NEXT_STEPS` first
- NEVER use a purple other than `#95008A` for the cover category pill
- NEVER use `text.slice(n)` without `wrap: true`

## Acceptance Criteria

- All ~140 PPTX export tests pass (part of 253-test suite)
- Every slide has content even when all data arrays are empty
- Cover slide category pill uses `#95008A` purple
- `nextSteps` is non-empty on every generated board-pack
- References slide shows at least one MS Learn URL per finding domain
- XLSX decision register has all required columns and no empty rows for recorded decisions
