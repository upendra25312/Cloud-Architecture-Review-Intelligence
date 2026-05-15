# CARI PowerPoint Export Standard

**Applies to:** `api/src/shared/arb-pptx-export.js` and any future report generation module.  
**Owner:** Cloud Solutions Architecture  
**Audience:** AI coding assistants, engineers, reviewers.

This standard defines the quality bar for CARI-generated PowerPoint decks. Every deck must be
worthy of direct presentation to senior Microsoft leadership without manual correction.

---

## 1. Rackspace Brand Compliance (non-negotiable)

| Token | Hex | Usage |
|---|---|---|
| Red | `#EB0000` | Header bands, cover background, numbered circles, severity Critical |
| Blue | `#0059C8` | Accent, Low severity, SOW table headers, recommendations |
| Teal | `#00BEBC` | Positive status ("Recommended for Approval"), In Scope |
| Purple | `#95008A` | Secondary accent — use for project category differentiation |
| Light Grey | `#E6E6E6` | Background fills, dividers, empty-state boxes |
| Mid Grey | `#666666` | Footer text, sub-labels |
| Dark Grey | `#333333` | Body copy |
| Font | Arial | All text — major and minor |

**Rules:**
- Every slide MUST have a red header band (via `addHeader`) and a grey footer (via `addFooter`).
- The cover slide MUST use a full-slide red background with a white bottom strip.
- Purple MUST appear at least once per deck. **The cover slide category pill is the static anchor** (`fill: { color: BRAND.purple }`) — do not change it to blue or any other colour.
- Teal appears conditionally (recommendation badge, scorecard ≥80, action "Closed", SOW status). If those conditions never fire in a given deck, teal will be absent — acceptable because purple is the static guarantee.
- Never change the cover category pill from purple to another colour — it is the brand compliance anchor.

---

## 2. Mandatory Empty-State Handling

Every data-driven slide MUST handle the zero-data case explicitly. **Never render a floating header row or a blank content area.**

| Slide | Zero-data rule |
|---|---|
| Key Findings | Show "No findings recorded." in mid-grey italic — already correct |
| Risk Register | Show a light-grey box with "No open risk items…" message |
| Remediation Actions | Show "No open remediation actions." — already correct |
| SOW Traceability | Show message + explicit instruction to upload SOW |
| Scorecard | Show "No domain scores available." — already correct |

Pattern to follow:
```js
if (items.length === 0) {
  s.addShape(p.ShapeType.rect, { x: 0.3, y: 2.2, w: 9.4, h: 0.7, fill: { color: BRAND.lightGrey }, ... });
  s.addText("No items. [What to do next].", { x: 0.5, y: 2.35, ... fontSize: 11, italic: true, color: BRAND.midGrey });
  return;
}
```

---

## 3. Text Truncation Rules

| Context | Max characters | Wrap |
|---|---|---|
| Finding statement | 200 | `wrap: true` |
| Finding recommendation | 180 | `wrap: true` |
| Scorecard domain reason | 200 | `wrap: true` |
| Decision rationale | 300 | `wrap: true` |
| Risk register title | 60 | no (table cell) |
| Executive summary | 800 | `wrap: true` |
| Action summary | unlimited (9 chars per line × box width) | `wrap: true` |
| Next steps item | unlimited | `wrap: true` |

**Never** use `.slice()` without `wrap: true` on the same text element. A slice without wrap still overflows.

---

## 4. Next Steps Slide — Category-Aware Content

The Next Steps slide is the most-read slide by senior leadership. It MUST contain 4–6 specific,
actionable items aligned to the project category.

**Rule:** `nextSteps` in `shapeReviewDataForPptx` MUST be `null` (not `[]`). An empty array `[]`
is truthy and silently suppresses the fallback defaults.

```js
// CORRECT
nextSteps: null,

// WRONG — empty array is truthy, defaults never fire
nextSteps: [],
```

Each project category has a dedicated step list in `CATEGORY_NEXT_STEPS`. When adding a new
category, add its steps to this map before wiring up the category elsewhere.

**Step quality bar (each step must):**
- Be a complete, imperative sentence (verb first)
- Reference a specific Azure service, framework, or deliverable
- Be actionable within the engagement — not generic advice
- Be ≤ 120 characters

---

## 5. Slide Structure Checklist

Before shipping any change to `arb-pptx-export.js`, verify every slide:

- [ ] Has a red header band with title + subtitle
- [ ] Has a grey footer with reviewId and CONFIDENTIAL label
- [ ] Has an explicit empty-state handler for all data arrays
- [ ] Uses `wrap: true` on all multi-line text elements
- [ ] Does not truncate text mid-word (check `.slice()` limits against box width)
- [ ] Uses brand colours from `BRAND` constants — no hardcoded hex strings elsewhere
- [ ] Teal and Purple appear at least once per deck

---

## 6. Data Shape Contract (`shapeReviewDataForPptx`)

| Field | Type | Default | Notes |
|---|---|---|---|
| `nextSteps` | `string[] \| null` | `null` | Never `[]` — null triggers category defaults |
| `projectCategory` | `string` | `""` | Must match a `CATEGORY_NEXT_STEPS` key when set |
| `domainScores` | `Array<{domain, score, reason}>` | `[]` | `reason` must be the full sentence, not truncated at source |
| `findings` | array | `[]` | All fields present even if empty string |
| `sowTraceability` | array | `[]` | Built from SOW-tagged evidence only |

---

## 7. Test Requirements

Any change to `arb-pptx-export.js` requires a corresponding test in `api/test/` that:

1. Calls `shapeReviewDataForPptx` with empty arrays for all data inputs
2. Calls `generateArbPptx` and confirms the returned buffer is non-empty
3. Asserts that `nextSteps: null` produces output (i.e. the function does not throw)
4. Asserts that a known `projectCategory` produces category-specific next steps

---

## 8. Microsoft Leadership Quality Bar

A deck is ready for Microsoft senior leadership when:

- [ ] No slide is blank or shows only a header
- [ ] No text is visibly cut off mid-word or mid-sentence
- [ ] All six Rackspace brand colours appear at least once
- [ ] The cover slide shows customer name, project name, and category
- [ ] The Next Steps slide has 4–6 specific, actionable items
- [ ] The Executive Summary score is consistent with the findings count
- [ ] The Architecture Decision slide shows the reviewer name, role, and rationale
- [ ] "CONFIDENTIAL" and the review ID appear in the footer of every non-cover slide
- [ ] The deck is 10 slides: Cover, Exec Summary, Scope, Scorecard, Findings, Risk Register, Actions, Decision, SOW Traceability, Next Steps
