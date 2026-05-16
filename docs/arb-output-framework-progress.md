# ARB Output Framework — Session Progress Tracker

**Branch:** `feature/generic-arb-output-framework`
**Started:** 2026-05-16
**Status:** In progress — Phase 3-7 next

---

## Mission

Redesign CARI review output pipeline so all exports (MD, HTML, PPTX, CSV, Excel) share one canonical `ArbReviewOutputPack` schema and normalization pipeline. No exporter may independently calculate findings, actions, scores, or decisions.

---

## Phase Completion Status

| Phase | Description | Status |
|---|---|---|
| 1 | Audit current export pipeline | ✅ Done |
| 2 | Create branch + backup | ✅ Done |
| 3-7 | Create canonical schema + normalization pipeline (arb-normalize-review.js) | ⏳ Next |
| 8-10 | Refactor all exporters to consume canonical pack | ⏳ Pending |
| 11 | Export validation gate | ⏳ Pending |
| 12 | Cross-exporter parity tests | ⏳ Pending |
| 13 | Regenerate sample outputs | ⏳ Pending |
| 14 | Build + test (must pass 140+ existing tests) | ⏳ Pending |
| 15 | Create 4 documentation files | ⏳ Pending |
| 16 | Final output summary | ⏳ Pending |

---

## Key Architecture Decisions (from audit)

### Current state
- No canonical intermediate representation — each renderer independently interprets raw entities
- `renderMarkdownExportBody(review, files, requirements, evidence, findings, scorecard, actions, summaryText)` — in arb-review-store.js:1669
- `renderCsvExportBody(...)` — in arb-review-store.js:1752
- `renderHtmlExportBody(...)` — in arb-review-store.js:1882
- `shapeReviewDataForPptx(...)` — in arb-pptx-export.js:646 (partial normalizer)
- `generateArbPptx(reviewData)` — in arb-pptx-export.js:607
- `writeArbOutputArtifact({...})` — in arb-review-store.js:2257 (calls all renderers)
- `createArbExport(principal, reviewId, input)` — in arb-review-store.js:4509 (public API)
- `arbCreatePptxExport.js` — separate PPTX endpoint, calls shapeReviewDataForPptx + generateArbPptx

### PPTX Library Limitation
- `pptxgenjs@4.0.1` — **cannot load existing .pptx template files** (programmatic only)
- `exceljs@4.4.0` — exists in package.json but unused — can implement Excel export
- `jszip@3.10.1` — exists but not for template use
- Decision: Add template path validation, controlled failure if template missing, keep programmatic Rackspace brand styling

### Rackspace template path
- `C:\cari-repo\Rackspace Presentation Template.pptx` — EXISTS on disk
- Env var: `POWERPOINT_TEMPLATE_PATH`
- Fallback: `templates/Rackspace Presentation Template.pptx`

### Existing test constraints
- 140 tests currently passing — must all still pass after refactor
- Test at arb-review-store.test.js:942 verifies HTML export contains:
  - `/<html/i`
  - `/Reviewer Decision/i`
  - rationale text from decision entity
- Public API `createArbExport(principal, reviewId, {format})` must stay unchanged

---

## Files to Create (NEW)

| File | Purpose |
|---|---|
| `api/src/shared/arb-normalize-review.js` | Canonical normalization pipeline — ALL exporters must use this |
| `api/src/shared/arb-export-validator.js` | validateArbReviewOutputPack() |
| `api/src/shared/arb-excel-export.js` | Excel export using exceljs |
| `api/src/shared/arb-export-parity.test.js` | Cross-format parity regression tests |
| `docs/ARB-REVIEW-OUTPUT-SCHEMA.md` | Schema documentation |
| `docs/EXPORT-CONSISTENCY-GUARDRAILS.md` | Guardrails documentation |
| `docs/REVIEW-DECISION-GOVERNANCE.md` | Governance decision documentation |
| `docs/RACKSPACE-PPTX-TEMPLATE.md` | PPTX template documentation |

## Files to Modify (EXISTING)

| File | What Changes |
|---|---|
| `api/src/shared/arb-review-store.js` | Refactor 3 renderers to accept canonical pack; add xlsx; normalize in writeArbOutputArtifact |
| `api/src/shared/arb-pptx-export.js` | Add template validation; update generateArbPptx to accept canonical pack |
| `api/src/functions/arbCreatePptxExport.js` | Use normalizeReviewForExport before calling generateArbPptx |
| `api/src/functions/arbCreateExport.js` | Add xlsx to supported formats |
| `.env.example` | Add POWERPOINT_TEMPLATE_PATH |

---

## Canonical Pack Structure (ArbReviewOutputPack)

```js
{
  metadata: { reviewId, reviewTitle, generatedAt, generatedBy, toolName, confidentiality, exportFormat },
  customer: { name, businessUnit, industry, region },
  project: { name, category, cloudProvider, primaryRegion, drRegion, workloadType, environment },
  workflow: { currentState, stateReason },
  uploadedInputs: [{ inputId, fileName, documentType, extractionStatus, textAvailable, ... }],
  evidenceReadiness: { status, reason, failedInputs, partialInputs, completedInputs, confidence },
  executiveSummary: { overallScore, scoreBand, recommendation, summaryNarrative, topStrengths, topRisks, keyGaps, nextBestActions },
  scope: { inScope, outOfScope, unknownScopeItems, sourceReferences },
  assumptions: [],
  dependencies: [],
  constraints: [],
  scorecard: { totalScore, maxScore, percentage, domains: [{ domain, score, maxScore, percentage, rationale, blockingFindings }] },
  findings: [{ findingId, title, description, severity, status, domain, evidenceGap, impact, recommendation, source, sourceFiles, references, confidence }],
  riskRegister: [{ riskId, linkedFindingId, riskTitle, severity, impact, likelihood, riskOwner, mitigation, status, dueDate }],
  remediationActions: [{ actionId, linkedFindingId, title, action, severity, domain, owner, dueDate, dueStatus, status, source }],
  decision: { reviewerDecision, reviewerName, reviewerRole, recordedAt, rationale, governancePosture, governanceWarning, riskAcceptanceRequired },
  approvalConditions: [],
  riskAcceptances: [],
  requirements: [{ requirementId, text, domain, priority, sourceFile, sourceType, evidenceStatus }],
  evidence: [{ evidenceId, evidenceType, text, sourceFile, sourcePage, confidence, provesImplementation, linkedRequirementIds, linkedFindingIds }],
  traceability: [{ requirementId, requirementText, domain, evidenceStatus, evidenceIds, findingIds, actionIds, sourceFiles }],
  exportWarnings: [{ warningId, severity, message, affectedSections }],
  appendices: [],
}
```

---

## Raw → Canonical Field Mapping

| Raw Field | Canonical Field |
|---|---|
| `review.reviewId` | `metadata.reviewId` |
| `review.projectName` | `project.name` |
| `review.customerName` | `customer.name` |
| `review.workflowState` | `workflow.currentState` |
| `review.projectMeta.customerName` | `customer.name` (preferred) |
| `scorecard.overallScore` (0-100) | `scorecard.totalScore` / `percentage` |
| `scorecard.domainScores[].score/.weight` | `scorecard.domains[].score/.maxScore` |
| `scorecard.recommendation` | `executiveSummary.recommendation` |
| `scorecard.reviewerOverride.overrideDecision` | `decision.reviewerDecision` (fallback) |
| `decision.reviewerDecision` | `decision.reviewerDecision` (primary) |
| `findings[].findingStatement` | `findings[].description` |
| `findings[].title` | `findings[].title` |
| `actions[].actionSummary` | `remediationActions[].title` |
| `actions[].sourceFindingId` | `remediationActions[].linkedFindingId` |
| `files[].extractionStatus` | `uploadedInputs[].extractionStatus` |

---

## Governance Posture Logic

```
Open Critical findings → Needs Remediation + riskAcceptanceRequired=true
Open High findings → Approved with Conditions + riskAcceptanceRequired=true
Open Medium findings → Approved with Conditions
recommendation includes "Needs Remediation" → Review Required
Otherwise → reviewerDecision or "Review Required"
```

Warning when: reviewerDecision=Approved but governancePosture != Approved

---

## Evidence Readiness Logic

Required categories: `sow`, `design_doc`
Recommended categories: `cost_assumptions`, `dr_ha_note`, `ops_monitoring_note`

```
All required completed → Ready (High confidence)
Required has failures → Partial (Low confidence)
Required has partial → Partial (Medium confidence)
All files failed → Not Ready (Low confidence)
Only optional failed → Partial (Medium confidence, lower severity warning)
```

---

## Domain Classification (Deterministic → AI fallback)

| Keywords | Domain |
|---|---|
| Entra ID, RBAC, PIM, break-glass, managed identity | Identity |
| Hub-spoke, firewall, NSG, UDR, private endpoint, WAF, Front Door | Networking |
| Azure Policy, management group, tagging, guardrails, initiative | Governance |
| Azure Monitor, Log Analytics, App Insights, Terraform, CI/CD | Operational Excellence |
| AZ, backup, DR, RTO, RPO, failover, resilience | Reliability |
| SKU, budget, reservation, right-sizing, autoscale, pricing | Cost Optimization |
| encrypt, Key Vault, TLS, vulnerability, Defender, zero trust | Security |

---

## CSV Schema (New — spec-required)

```
recordType,recordId,reviewId,customer,project,domain,severity,status,title,description,recommendation,source,sourceFile,linkedFindingId,owner,dueDate,dueStatus,createdAt,updatedAt,confidence,evidenceType
```

---

## PPTX Template Approach

Since `pptxgenjs@4.0.1` cannot load .pptx template files:
1. Resolve template path (env var → known paths)
2. If template exists: validate it's a valid .pptx file, add warning that template cannot be applied by current library
3. If template missing: add export warning, continue with programmatic Rackspace brand styling
4. Never generate a "generic" unbranded deck — always apply Rackspace brand colors
5. Document limitation in RACKSPACE-PPTX-TEMPLATE.md

---

## Resume Instructions

When resuming this session:
1. Switch to branch: `git checkout feature/generic-arb-output-framework`
2. Verify: `git branch --show-current` → should show `feature/generic-arb-output-framework`
3. All 140 tests should still pass: `npm --prefix api test`
4. Start implementing Phase 3-7: Create `api/src/shared/arb-normalize-review.js`
5. Then create `api/src/shared/arb-export-validator.js`
6. Then create `api/src/shared/arb-excel-export.js`
7. Then modify `api/src/shared/arb-review-store.js` (renderers)
8. Then modify `api/src/shared/arb-pptx-export.js` (template handling)
9. Then modify `api/src/functions/arbCreatePptxExport.js`
10. Then write tests: `api/src/shared/arb-export-parity.test.js`
11. Then write 4 docs in `docs/`
12. Run `npm --prefix api test` — all tests must pass (140+ original + new parity tests)
13. Commit to branch: `git add -A && git commit`
14. Open PR to main

See this file for all design decisions, field mappings, and schema details.
