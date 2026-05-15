# feat/cari-comprehensive-v2 — Task Tracker

Branch: `feat/cari-comprehensive-v2`
Demo-day freeze: **NO production deploy without explicit approval.**

---

## Status legend
- `[ ]` Not started
- `[~]` In progress
- `[x]` Done

---

## Phase 1 — API: PowerPoint Export

- [x] Install `pptxgenjs` in `api/`
- [x] Create `api/src/shared/arb-pptx-export.js` — PPTX generation with Rackspace theme (red `#EB0000`, blue `#0059C8`, teal `#00BEBC`, purple `#95008A`, font Arial)
- [x] Create `api/src/functions/arbCreatePptxExport.js` — `GET arb/reviews/{reviewId}/exports/pptx` endpoint
- [x] Fix import names to match `arb-review-store.js` exports (`getArbReview`, `getArbFiles`, `getArbRequirements`, `getArbEvidence`, `getArbFindings`, `getArbScorecard`, `getArbDecision`, `getArbActions`)

## Phase 2 — API: Project Category + SOW Support

- [x] Add `projectCategory`, `inScope`, `outOfScope` fields to `buildDefaultReview` in `arb-review-store.js`
- [x] Add `CUSTOMER_EVIDENCE_CATEGORIES` constant Set (`sow`, `security_note`, `cost_assumptions`, `dr_ha_note`, `ops_monitoring_note`)
- [x] Update `buildBlobPath` to accept `logicalCategory` and route SOW/sensitive files to `customer-evidence/` blob subfolder

## Phase 3 — API: Migration Rules

- [x] Create `api/data/arb-rules/migration-rules.json` — 11 rules based on Microsoft Azure Migrate guidance and MEG v0.96
  - MIG-001 to MIG-008 (migration execution)
  - CRA-001 to CRA-003 (cloud readiness assessment)
- [x] Update `loadArbRules()` in `arb-rules-engine.js` to load migration rules

## Phase 4 — Frontend: PPTX Download

- [x] Add `downloadArbPptxExport(reviewId)` to `frontend/src/arb/api.ts`
- [x] Add `onDownloadPptx` prop and "Export as PowerPoint" button to `evidence-export-section.tsx`
- [x] Wire `handleDownloadPptx` + `downloadingPptx` state into `arb-evidence-page.tsx`

## Phase 5 — Frontend: Homepage Copy

- [x] Extend workflow from 6 to 7 steps — step 01 is now "Select Project Category"
- [x] Add "Project Category Workflow" and "SOW-Aligned Assessment" to `platformValues` (now 5 items)
- [x] Correct `reportPack.formats` to `["PowerPoint (PPTX)", "Markdown", "CSV", "HTML"]` (remove unsupported PDF/Word/Excel claims)
- [x] Add `PROJECT_CATEGORIES` constant (6 categories) with `ProjectCategory` interface

## Phase 6 — Validation

- [x] Run API tests: `npm --prefix api test` — 140 pass, 0 fail
- [x] Run frontend build: `npm --prefix frontend run build` — 186 pages compiled, TypeScript clean
- Note: `type-check` script does not exist; TypeScript validation is part of `next build`

## Phase 7 — Commit

- [ ] Stage and commit all changes to `feat/cari-comprehensive-v2` (NOT main — demo-day freeze)
  - Files: `api/package.json`, `api/package-lock.json`, `api/src/shared/arb-pptx-export.js`, `api/src/functions/arbCreatePptxExport.js`, `api/src/shared/arb-review-store.js`, `api/src/shared/arb-rules-engine.js`, `api/data/arb-rules/migration-rules.json`, `frontend/src/arb/api.ts`, `frontend/src/components/arb/evidence/evidence-export-section.tsx`, `frontend/src/components/arb/evidence/arb-evidence-page.tsx`, `frontend/app/components/home/home-copy.ts`
  - **DO NOT stage:** `infrastructure/terraform/static_web.tf` (stale uncommitted Terraform — leave as-is)

---

## Post-Demo Deferred (do NOT do before demo)

- [ ] Change `cari.pilot@outlook.com` password — **CRITICAL: credential was exposed**
- [ ] Re-enable EasyAuth on Function App
- [ ] Apply Terraform rename (static_web.tf)
- [ ] Grant GitHub Actions SP `User Access Administrator` role
- [ ] Raise PR from `feat/cari-comprehensive-v2` → `main` and get approval before merging

---

## Hard Constraints (always active)

- NEVER run `terraform plan` (to apply), `terraform apply`, `terraform destroy`, `azd up`, `azd down`, `azd destroy`
- NEVER commit `api/local.settings.json`, `*.tfstate`, `*.tfstate.backup`, `tfplan`
- NEVER force-push to `main`
- Always use `model-router` as LLM deployment name
- All Azure changes via GitHub Actions CI/CD or targeted `az CLI` only
