# ARB Review Output Schema — ArbReviewOutputPack

**Version:** 2.0  
**Owner:** Cloud Architecture Review Intelligence (CARI)  
**Status:** Active

---

## Overview

`ArbReviewOutputPack` is the canonical intermediate representation produced by `normalizeReviewForExport()` in `api/src/shared/arb-normalize-review.js`. Every export format (Markdown, HTML, CSV, Excel, PPTX) must consume this pack — no renderer may independently calculate findings, scores, decisions, or evidence readiness.

---

## Schema Reference

```js
{
  metadata: {
    reviewId:        string,   // e.g. "arb-review-abc123"
    reviewTitle:     string,   // "Project X — ARB Review Report"
    generatedAt:     string,   // ISO 8601 timestamp
    generatedBy:     string,   // "CARI — Cloud Architecture Review Intelligence"
    toolName:        string,   // "CARI"
    toolVersion:     string,   // "2.0"
    confidentiality: string,   // "Confidential"
    exportFormat:    string,   // "html" | "csv" | "markdown" | "pptx" | "xlsx"
  },

  customer: {
    name:         string,      // Preferred: projectMeta.customerName
    businessUnit: string|null,
    industry:     string|null,
    region:       string|null,
  },

  project: {
    name:          string,     // Preferred: projectMeta.projectName
    category:      string|null,// e.g. "New Deployment", "Migration"
    cloudProvider: string,     // Always "Azure"
    primaryRegion: string|null,
    drRegion:      string|null,
    workloadType:  string|null,
    environment:   string,     // "Production" default
  },

  workflow: {
    currentState: string,      // e.g. "Under Review", "Approved"
    stateReason:  string|null,
  },

  uploadedInputs: [{
    inputId:          string,
    fileName:         string,
    documentType:     string,  // Canonical: "SOW" | "Design Document" | "Architecture Diagram" | "Cost Estimate" | "DR/HA Plan" | "Ops/Monitoring Note" | "Other"
    extractionStatus: string,  // "Completed" | "Partial" | "Failed" | "Pending"
    extractionSummary:string|null,
    textAvailable:    boolean,
  }],

  evidenceReadiness: {
    status:           string,  // "Ready" | "Partial" | "Not Ready"
    reason:           string,
    confidence:       string,  // "High" | "Medium" | "Low"
    failedInputs:     string[],
    partialInputs:    string[],
    completedInputs:  string[],
  },

  executiveSummary: {
    overallScore:     number,  // 0–100 percentage
    scoreBand:        string,  // "Excellent" | "Good" | "Needs Improvement" | "Critical"
    recommendation:   string,
    summaryNarrative: string,
    topStrengths:     string[],
    topRisks:         string[],
    keyGaps:          string[],
    nextBestActions:  string[],
  },

  scope: {
    inScope:          { itemId, description, evidenced }[],
    outOfScope:       { itemId, description }[],
    unknownScopeItems:string[],
    sourceReferences: string[],  // SOW file names
  },

  assumptions: { text: string }[],
  dependencies: [],
  constraints:  [],

  scorecard: {
    totalScore: number,
    maxScore:   number,
    percentage: number,        // 0–100
    domains: [{
      domain:           string,
      score:            number,
      maxScore:         number,
      percentage:       number,
      rationale:        string,
      blockingFindings: string[],
    }],
  },

  findings: [{
    findingId:       string,
    title:           string,
    description:     string,   // Canonical field — was findingStatement in raw data
    severity:        string,   // "Critical" | "High" | "Medium" | "Low"
    status:          string,   // "Open" | "In Progress" | "Closed"
    domain:          string,   // Deterministic classification → AI fallback
    evidenceGap:     string,
    impact:          string,
    recommendation:  string,
    source:          string,
    sourceFiles:     string[],
    references:      string[],
    confidence:      string,
  }],

  riskRegister: [{
    riskId:          string,
    linkedFindingId: string,
    riskTitle:       string,
    severity:        string,
    impact:          string,
    likelihood:      string,
    riskOwner:       string,
    mitigation:      string,
    status:          string,
    dueDate:         string|null,
  }],

  remediationActions: [{
    actionId:        string,
    linkedFindingId: string,
    title:           string,   // Canonical field — was actionSummary in raw data
    action:          string,
    severity:        string,
    domain:          string,
    owner:           string,
    dueDate:         string|null,
    dueStatus:       string,   // "Overdue" | "Due Soon" | "On Track" | "No Date"
    status:          string,
    source:          string,
  }],

  decision: {
    reviewerDecision:       string,   // Canonical reviewer decision
    reviewerName:           string|null,
    reviewerRole:           string|null,
    recordedAt:             string|null,
    rationale:              string|null,
    governancePosture:      string,   // Derived: accounts for open findings
    governanceWarning:      string|null,
    riskAcceptanceRequired: boolean,
  },

  approvalConditions: [],
  riskAcceptances:    [],

  requirements: [{
    requirementId:  string,
    text:           string,
    domain:         string,
    priority:       string,
    sourceFile:     string,
    sourceType:     string,
    evidenceStatus: string,
  }],

  evidence: [{
    evidenceId:           string,
    evidenceType:         string,
    text:                 string,
    sourceFile:           string,
    sourcePage:           number|null,
    confidence:           string,
    provesImplementation: boolean,
    linkedRequirementIds: string[],
    linkedFindingIds:     string[],
  }],

  traceability: [{
    requirementId:   string,
    requirementText: string,
    domain:          string,
    evidenceStatus:  string,   // "Evidenced" | "Partially Evidenced" | "Not Evidenced"
    evidenceIds:     string[],
    findingIds:      string[],
    actionIds:       string[],
    sourceFiles:     string[],
  }],

  exportWarnings: [{
    warningId:        string,
    severity:         string,  // "error" | "warning" | "info"
    message:          string,
    affectedSections: string[],
  }],

  appendices: [],

  // PPTX backward-compat section — consumed by generateArbPptx slide builders
  _pptx: { /* legacy flat shape — see arb-pptx-export.js */ },
}
```

---

## Key Invariants

| Rule | Detail |
|---|---|
| `findings[].description` | Canonical name. Raw `findingStatement` is mapped here during normalization. |
| `remediationActions[].title` | Canonical name. Raw `actionSummary` is mapped here. |
| `_pptx.nextSteps` | Always `null` — never `[]`. An empty array is truthy and prevents category-default next steps from rendering. |
| `scorecard.percentage` | Derived value 0–100. Never independently re-calculated by renderers. |
| `decision.governancePosture` | Derived from finding severity/status — not the same as `reviewerDecision`. |
| `uploadedInputs[].documentType` | Canonical. Raw `logicalCategory` (e.g. "sow") is mapped to "SOW", "Design Document", etc. |
| `_pptx.findings[].findingStatement` | Backward-compat key in the `_pptx` section only — slide builders expect this name. |
| `_pptx.actions[].actionSummary` | Backward-compat key in the `_pptx` section only. |

---

## Normalization Pipeline

```
Raw review data (review, files, requirements, evidence, findings, actions, scorecard, decision)
  → mapUploadedInput()            uploadedInputs with canonical documentType
  → deriveEvidenceReadiness()     evidenceReadiness status + confidence
  → classifyDomain() per finding  deterministic keyword → AI fallback
  → deriveGovernanceDecision()    governance posture from finding severity
  → calculateScorecard()          canonical scorecard with percentage
  → deriveRiskRegister()          open Critical/High only
  → generateRemediationActions()  canonical actions with dueStatus
  → buildTraceability()           req → evidence → finding → action links
  → _pptx section built           legacy flat shape for slide builders
  → collectExportWarnings()       readiness/scope/score warnings
  → validateArbReviewOutputPack() validation errors/warnings appended
  → ArbReviewOutputPack
```

---

## Related Files

| File | Role |
|---|---|
| `api/src/shared/arb-normalize-review.js` | Normalization pipeline — produces the pack |
| `api/src/shared/arb-export-validator.js` | `validateArbReviewOutputPack()` — validation gate |
| `api/src/shared/arb-review-store.js` | `renderHtmlExportBody()`, `renderMarkdownExportBody()`, `renderCsvExportBody()` |
| `api/src/shared/arb-pptx-export.js` | `generateArbPptx()` — detects pack vs legacy shape |
| `api/src/shared/arb-excel-export.js` | `generateArbExcel()` |
| `api/src/shared/arb-export-parity.test.js` | Cross-format parity regression tests |
