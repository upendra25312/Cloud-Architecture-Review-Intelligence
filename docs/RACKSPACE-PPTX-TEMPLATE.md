# Rackspace PPTX Template — Library Limitation & Workaround

**File:** `api/src/shared/arb-pptx-export.js`  
**Library:** `pptxgenjs@4.0.1`

---

## The Limitation

`pptxgenjs@4.x` **cannot load or modify existing .pptx template files**. It is a programmatic generation library only — it builds presentations from scratch in memory.

This means the Rackspace `.pptx` template at:

```
C:\cari-repo\Rackspace Presentation Template.pptx
```

...cannot be applied at runtime. The library has no API to open an existing file and inject content.

---

## What CARI Does Instead

Rackspace brand styling is applied entirely in code using the brand token constants in `arb-pptx-export.js`:

```js
const BRAND = {
  red:       "EB0000",
  black:     "000000",
  white:     "FFFFFF",
  blue:      "0059C8",
  teal:      "00BEBC",
  purple:    "95008A",
  lightGrey: "E6E6E6",
  midGrey:   "666666",
  darkGrey:  "333333",
  font:      "Arial",
};
```

Key brand rules enforced in code:

| Rule | Where |
|---|---|
| Cover slide category pill: always purple `#95008A` | `buildCoverSlide()` |
| Teal `#00BEBC` for score ≥80, "Recommended for Approval", "Closed", "In scope" | Conditional throughout |
| Font: Arial everywhere | All `addText()` calls |
| Layout: 16:9 LAYOUT_WIDE (13.33" × 7.5") | `generateArbPptx()` |

**Never generate an unbranded deck.** If brand styling logic is broken, fix the code — do not remove the brand tokens.

---

## Template Path Resolution

Even though the template cannot be applied, CARI resolves the path and adds an informational export warning to the pack. This:
- Documents that the template was found/not found
- Provides an audit trail in exports
- Makes it obvious when the env var is not configured

Resolution order (first existing path wins):

1. `POWERPOINT_TEMPLATE_PATH` environment variable
2. `{cwd}/Rackspace Presentation Template.pptx`
3. `{repo-root}/templates/Rackspace Presentation Template.pptx`

Configure via `.env.example`:
```
POWERPOINT_TEMPLATE_PATH=
```

---

## If pptxgenjs Adds Template Support in Future

If a future version of `pptxgenjs` adds template loading support:

1. Update `POWERPOINT_TEMPLATE_PATH` to point to the template file
2. In `generateArbPptx()`, call the new template-load API instead of `new PptxGenJS()`
3. Remove the `TEMPLATE_LIBRARY_LIMITATION` warning from `addTemplateWarnings()`
4. Keep all brand token constants as fallback in case template is unavailable
5. Run `npm --prefix api test` — all 162+ tests must pass

---

## Alternative: Convert Template to Image Backgrounds

A practical workaround for applying the template look without library template support:

1. Export template slides as high-res PNG images
2. Reference the images as slide backgrounds via `slide.addImage()`
3. Overlay content on top programmatically

This approach trades exact fidelity for reproducibility and works with `pptxgenjs@4.x`. Not currently implemented.
