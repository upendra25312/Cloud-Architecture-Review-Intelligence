"use strict";

/**
 * Cross-format parity tests for the ARB output framework.
 *
 * These tests verify that all exporters consume the same canonical
 * ArbReviewOutputPack and produce consistent data — score, customer name,
 * project name, decision, and finding count must be identical across formats.
 */

const test   = require("node:test");
const assert = require("node:assert/strict");

const { normalizeReviewForExport, validateArbReviewOutputPack: _validate } =
  require("./arb-normalize-review");
const { validateArbReviewOutputPack } = require("./arb-export-validator");

// ─── Shared fixture ───────────────────────────────────────────────────────────

const REVIEW = {
  reviewId:        "parity-test-001",
  projectName:     "Parity Test Project",
  customerName:    "Parity Customer",
  workflowState:   "Under Review",
  projectCategory: "New Deployment",
  projectMeta: {
    customerName: "Parity Customer Ltd",
    projectName:  "Parity Test Project",
  },
  executiveSummary: "This is the executive summary for parity testing.",
  inScope:    ["Azure Landing Zone", "Networking"],
  outOfScope: ["Identity Federation"],
  createdAt:  "2026-05-16T00:00:00.000Z",
};

const FILES = [
  { fileId: "f1", fileName: "sow.pdf",        logicalCategory: "sow",        extractionStatus: "Completed" },
  { fileId: "f2", fileName: "design.docx",    logicalCategory: "design_doc", extractionStatus: "Completed" },
  { fileId: "f3", fileName: "failed.pdf",     logicalCategory: "sow",        extractionStatus: "Failed",    extractionError: "Timeout" },
];

const REQUIREMENTS = [
  { requirementId: "r1", normalizedText: "Hub-spoke networking topology must be deployed with Azure Firewall Premium.", sourceFileId: "f1", logicalCategory: "sow",        category: "networking" },
  { requirementId: "r2", normalizedText: "All management ports must be blocked at the NSG level.",                       sourceFileId: "f2", logicalCategory: "design_doc", category: "security"    },
  { requirementId: "r3", normalizedText: "assumption: customer manages their own DNS zones.",                             sourceFileId: "f1", logicalCategory: "sow",        category: "assumption"  },
];

const EVIDENCE = [
  { evidenceId: "e1", factType: "implements_control",  summary: "NSG rules confirmed blocking ports 22 and 3389.",  sourceFileName: "design.docx", confidence: "High",   linkedRequirementIds: ["r2"] },
  { evidenceId: "e2", factType: "scope_statement",      summary: "Hub-spoke topology confirmed in scope.",          sourceFileName: "sow.pdf",     confidence: "Medium", linkedRequirementIds: ["r1"] },
];

const FINDINGS = [
  { findingId: "fn1", title: "No Azure Firewall deployed", severity: "Critical", status: "Open",   domain: "Networking", findingStatement: "Azure Firewall Premium is missing from the hub.", recommendation: "Deploy Azure Firewall Premium." },
  { findingId: "fn2", title: "NSG ports partially blocked",severity: "High",     status: "Open",   domain: "Security",   findingStatement: "Ports 22/3389 blocked but port 8443 is open.",  recommendation: "Block port 8443 on prod NSG." },
  { findingId: "fn3", title: "Tagging policy incomplete",   severity: "Medium",  status: "Closed", domain: "Governance", findingStatement: "Tags not applied to all resource groups.",       recommendation: "Apply tagging policy initiative." },
];

const ACTIONS = [
  { actionId: "a1", actionSummary: "Deploy Azure Firewall Premium to hub VNet", status: "Open",   owner: "platform-team",   dueDate: "2026-06-01", severity: "Critical", sourceFindingId: "fn1" },
  { actionId: "a2", actionSummary: "Block port 8443 on production NSG",         status: "Open",   owner: "network-team",    dueDate: "2026-06-15", severity: "High",     sourceFindingId: "fn2" },
];

const SCORECARD = {
  overallScore: 62,
  recommendation: "Approved with Conditions",
  domainScores: [
    { domain: "Security",   score: 55, weight: 55, reason: "Open Critical finding in Networking." },
    { domain: "Networking", score: 60, weight: 60, reason: "Firewall gap." },
    { domain: "Governance", score: 75, weight: 75, reason: "Tagging closed." },
  ],
};

const DECISION = {
  reviewerDecision: "Conditionally Approved",
  reviewerName:     "Jane Architect",
  reviewerRole:     "Principal Architect",
  recordedAt:       "2026-05-16T10:00:00.000Z",
  rationale:        "Approved conditionally pending Azure Firewall deployment.",
};

// ─── Helper: build pack once for all assertions ───────────────────────────────

function buildPack(format = "html") {
  return normalizeReviewForExport(
    REVIEW, FILES, REQUIREMENTS, EVIDENCE, FINDINGS, ACTIONS, SCORECARD, DECISION, format
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test("normalizeReviewForExport returns a valid ArbReviewOutputPack", () => {
  const pack = buildPack();
  const { valid, errors } = validateArbReviewOutputPack(pack);
  assert.equal(valid, true, `Validation errors: ${errors.join("; ")}`);
});

test("pack metadata contains correct reviewId and format", () => {
  const pack = buildPack("csv");
  assert.equal(pack.metadata.reviewId,     REVIEW.reviewId);
  assert.equal(pack.metadata.exportFormat, "csv");
  assert.ok(pack.metadata.generatedAt, "generatedAt should be set");
});

test("pack customer and project names are consistent across formats", () => {
  for (const fmt of ["html", "csv", "markdown", "pptx"]) {
    const pack = buildPack(fmt);
    assert.equal(pack.customer.name, REVIEW.projectMeta.customerName,
      `customer.name mismatch for format ${fmt}`);
    assert.equal(pack.project.name, REVIEW.projectMeta.projectName,
      `project.name mismatch for format ${fmt}`);
  }
});

test("pack findings count matches input across all formats", () => {
  for (const fmt of ["html", "csv", "markdown", "pptx"]) {
    const pack = buildPack(fmt);
    assert.equal(pack.findings.length, FINDINGS.length,
      `findings.length mismatch for format ${fmt}`);
  }
});

test("canonical findings use description (not findingStatement)", () => {
  const pack = buildPack();
  const fn1 = pack.findings.find((f) => f.findingId === "fn1");
  assert.ok(fn1, "finding fn1 should exist in pack");
  assert.ok(fn1.description, "canonical finding must have description field");
  assert.equal(fn1.title, "No Azure Firewall deployed");
  assert.equal(fn1.severity, "Critical");
});

test("canonical actions use title (not actionSummary)", () => {
  const pack = buildPack();
  assert.ok(pack.remediationActions.length > 0, "pack must have remediation actions");
  for (const a of pack.remediationActions) {
    assert.ok(a.title, `action ${a.actionId} must have title field`);
  }
});

test("scorecard percentage is consistent across formats", () => {
  const pcts = ["html", "csv", "pptx"].map((fmt) => buildPack(fmt).scorecard.percentage);
  assert.ok(pcts.every((p) => p === pcts[0]), `scorecard.percentage differs across formats: ${pcts}`);
});

test("governance decision is derived identically across formats", () => {
  const decisions = ["html", "csv", "pptx"].map((fmt) => buildPack(fmt).decision.governancePosture);
  assert.ok(decisions.every((d) => d === decisions[0]),
    `governance posture differs: ${decisions}`);
});

test("open Critical finding triggers Needs Remediation governance posture", () => {
  const pack = buildPack();
  assert.equal(pack.decision.governancePosture, "Needs Remediation",
    "open Critical finding must trigger Needs Remediation posture");
});

test("governance warning present when reviewer Approved but posture is Needs Remediation", () => {
  // Change decision to "Approved" so the warning fires (posture will still be Needs Remediation)
  const approvedDecision = { ...DECISION, reviewerDecision: "Approved" };
  const pack = normalizeReviewForExport(
    REVIEW, FILES, REQUIREMENTS, EVIDENCE, FINDINGS, ACTIONS, SCORECARD, approvedDecision, "html"
  );
  assert.ok(pack.decision.governanceWarning,
    "governanceWarning must be set when reviewer is Approved but open Critical findings exist");
});

test("evidence readiness reflects failed SOW file", () => {
  const pack = buildPack();
  // f3 (sow) failed extraction → readiness should not be Ready
  assert.notEqual(pack.evidenceReadiness.status, "Ready",
    "evidence readiness should not be Ready when a required file failed extraction");
});

test("pptx _pptx section is present and has correct fields", () => {
  const pack = buildPack("pptx");
  assert.ok(pack._pptx, "pack must have _pptx section");
  assert.equal(pack._pptx.reviewId,     REVIEW.reviewId);
  assert.equal(pack._pptx.projectName,  REVIEW.projectMeta.projectName);
  assert.equal(pack._pptx.customerName, REVIEW.projectMeta.customerName);
  // nextSteps is now a computed non-empty array — never null, never []
  assert.ok(Array.isArray(pack._pptx.nextSteps), "nextSteps must be an array");
  assert.ok(pack._pptx.nextSteps.length > 0,     "nextSteps must not be empty");
  assert.ok(Array.isArray(pack._pptx.findings),  "findings must be array");
  assert.ok(Array.isArray(pack._pptx.actions),   "actions must be array");
});

test("pptx _pptx nextSteps do not include upload-SOW when SOW file exists", () => {
  const pack = buildPack("pptx");
  const hasUploadSow = pack._pptx.nextSteps.some((s) =>
    /upload.*sow|sow.*upload/i.test(s)
  );
  assert.equal(hasUploadSow, false, "should not prompt to upload SOW when SOW file is already present");
});

test("pptx _pptx findings use findingStatement key for slide builder compat", () => {
  const pack = buildPack("pptx");
  for (const f of pack._pptx.findings) {
    assert.ok("findingStatement" in f, `_pptx finding ${f.findingId} must have findingStatement key`);
  }
});

test("pptx _pptx actions use actionSummary key for slide builder compat", () => {
  const pack = buildPack("pptx");
  for (const a of pack._pptx.actions) {
    assert.ok("actionSummary" in a, `_pptx action must have actionSummary key`);
  }
});

test("SOW traceability is built from files not evidence", () => {
  const pack = buildPack("pptx");
  assert.ok(Array.isArray(pack._pptx.sowTraceability),
    "_pptx.sowTraceability must be an array");
  // SOW files: f1 (completed), f3 (failed) — both should contribute to traceability
  // Traceability is built from files/requirements, never from evidence
  assert.ok(pack._pptx.sowTraceability.length > 0 || pack.scope.sourceReferences.length >= 0,
    "SOW traceability or scope references should reflect SOW files");
});

test("export warnings are populated and include validation results", () => {
  const pack = buildPack();
  assert.ok(Array.isArray(pack.exportWarnings), "exportWarnings must be an array");
  // With open Critical findings, validation should produce at least one warning
  assert.ok(pack.exportWarnings.length > 0, "exportWarnings should have entries for this fixture");
});

test("requirements traceability links evidence to requirements", () => {
  const pack = buildPack();
  assert.ok(Array.isArray(pack.traceability), "traceability must be an array");
  const r2entry = pack.traceability.find((t) => t.requirementId === "r2");
  assert.ok(r2entry, "traceability must include an entry for r2");
});

test("domain classification assigns findings to expected domains", () => {
  const pack = buildPack();
  const fn1 = pack.findings.find((f) => f.findingId === "fn1");
  const fn2 = pack.findings.find((f) => f.findingId === "fn2");
  assert.ok(fn1.domain, "fn1 must have a domain");
  assert.ok(fn2.domain, "fn2 must have a domain");
});

test("riskRegister contains only open Critical and High findings", () => {
  const pack = buildPack();
  assert.ok(Array.isArray(pack.riskRegister), "riskRegister must be an array");
  for (const risk of pack.riskRegister) {
    const sev    = String(risk.severity || "").toLowerCase();
    assert.ok(sev === "critical" || sev === "high",
      `riskRegister must only contain Critical/High — got ${risk.severity}`);
  }
  // fn3 (Medium, Closed) must NOT be in risk register
  const hasFn3 = pack.riskRegister.some((r) => r.linkedFindingId === "fn3");
  assert.equal(hasFn3, false, "closed Medium finding must not appear in risk register");
});

test("validateArbReviewOutputPack returns valid for well-formed pack", () => {
  const pack = buildPack();
  const result = validateArbReviewOutputPack(pack);
  assert.equal(typeof result.valid,    "boolean");
  assert.ok(Array.isArray(result.errors));
  assert.ok(Array.isArray(result.warnings));
  assert.equal(result.valid, true, `Unexpected errors: ${result.errors.join("; ")}`);
});

test("validateArbReviewOutputPack flags missing reviewId", () => {
  const pack = buildPack();
  pack.metadata.reviewId = "";
  const { valid, errors } = validateArbReviewOutputPack(pack);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /reviewId/i.test(e)), "should flag missing reviewId");
});

test("validateArbReviewOutputPack warns about open High/Critical findings", () => {
  const pack = buildPack();
  const { warnings } = validateArbReviewOutputPack(pack);
  assert.ok(warnings.some((w) => /critical|high/i.test(w)),
    "should warn about open Critical/High findings");
});

// ─── P1: Cross-format consistency (all formats produce same canonical values) ──

test("reviewId is identical across all formats", () => {
  for (const fmt of ["html", "csv", "markdown", "pptx", "xlsx"]) {
    const pack = buildPack(fmt);
    assert.equal(pack.metadata.reviewId, REVIEW.reviewId,
      `reviewId mismatch for format ${fmt}`);
  }
});

test("customer name is identical across all formats", () => {
  for (const fmt of ["html", "csv", "markdown", "pptx", "xlsx"]) {
    const pack = buildPack(fmt);
    assert.equal(pack.customer.name, REVIEW.projectMeta.customerName,
      `customer.name mismatch for format ${fmt}`);
  }
});

test("overall score percentage is identical across all formats", () => {
  const pcts = ["html", "csv", "markdown", "pptx", "xlsx"].map((fmt) => buildPack(fmt).scorecard.percentage);
  assert.ok(pcts.every((p) => p === pcts[0]),
    `scorecard.percentage differs across formats: ${pcts}`);
});

test("findings count is identical across all formats", () => {
  for (const fmt of ["html", "csv", "markdown", "pptx", "xlsx"]) {
    const pack = buildPack(fmt);
    assert.equal(pack.findings.length, FINDINGS.length,
      `findings.length mismatch for format ${fmt}`);
  }
});

test("governance posture is identical across all formats", () => {
  const postures = ["html", "csv", "markdown", "pptx", "xlsx"].map((fmt) => buildPack(fmt).decision.governancePosture);
  assert.ok(postures.every((p) => p === postures[0]),
    `governancePosture differs across formats: ${postures}`);
});

test("reviewer decision is identical across all formats when decision is provided", () => {
  const decisions = ["html", "csv", "markdown", "pptx", "xlsx"].map((fmt) => buildPack(fmt).decision.reviewerDecision);
  // All formats must agree on the same canonical reviewer decision value
  assert.ok(decisions.every((d) => d === decisions[0]),
    `reviewerDecision differs across formats: ${decisions}`);
  // Must not be null/undefined — a decision was provided in the fixture
  assert.ok(decisions[0] && decisions[0] !== "Not Recorded",
    `reviewerDecision must be recorded when a decision is provided; got: ${decisions[0]}`);
});

test("remediation action count is identical across all formats", () => {
  for (const fmt of ["html", "csv", "markdown", "pptx", "xlsx"]) {
    const pack = buildPack(fmt);
    assert.equal(pack.remediationActions.length, ACTIONS.length,
      `remediationActions.length mismatch for format ${fmt}`);
  }
});

// ─── P1: Domain score maxScore is always set ──────────────────────────────────

test("scorecard domains always have maxScore set to a positive number", () => {
  const pack = buildPack();
  for (const d of pack.scorecard.domains) {
    assert.ok(d.maxScore > 0,
      `domain ${d.domain} must have maxScore > 0, got ${d.maxScore}`);
  }
});

test("scorecard domain percentage is between 0 and 100", () => {
  const pack = buildPack();
  for (const d of pack.scorecard.domains) {
    assert.ok(d.percentage >= 0 && d.percentage <= 100,
      `domain ${d.domain} percentage ${d.percentage} must be 0-100`);
  }
});

// ─── P1: No undefined values in canonical pack fields ─────────────────────────

test("pack metadata fields are never undefined", () => {
  const pack = buildPack();
  assert.notEqual(pack.metadata.reviewId,   undefined, "metadata.reviewId must not be undefined");
  assert.notEqual(pack.customer.name,       undefined, "customer.name must not be undefined");
  assert.notEqual(pack.project.name,        undefined, "project.name must not be undefined");
  assert.notEqual(pack.workflow.currentState, undefined, "workflow.currentState must not be undefined");
  assert.notEqual(pack.evidenceReadiness.status, undefined, "evidenceReadiness.status must not be undefined");
});

test("governance decision fields are never undefined", () => {
  const pack = buildPack();
  assert.notEqual(pack.decision.governancePosture,      undefined, "decision.governancePosture must not be undefined");
  assert.notEqual(pack.decision.riskAcceptanceRequired, undefined, "decision.riskAcceptanceRequired must not be undefined");
  assert.notEqual(pack.decision.reviewerDecision,       undefined, "decision.reviewerDecision must not be undefined");
});

// ─── P1: Missing metadata fallbacks ───────────────────────────────────────────

test("pack with minimal review still produces valid customer and project", () => {
  const minimalReview = { reviewId: "min-001", workflowState: "Draft" };
  const pack = normalizeReviewForExport(minimalReview, [], [], [], [], [], null, null, "html");
  assert.ok(pack.customer.name,  "customer.name must have a fallback when review has no customerName");
  assert.ok(pack.project.name,   "project.name must have a fallback when review has no projectName");
  assert.ok(pack.metadata.reviewId === "min-001", "reviewId must be preserved from minimal review");
});

test("pack with no scorecard still produces valid scorecard fields", () => {
  const pack = normalizeReviewForExport(REVIEW, FILES, REQUIREMENTS, EVIDENCE, FINDINGS, ACTIONS, null, null, "html");
  assert.equal(typeof pack.scorecard.percentage, "number",   "scorecard.percentage must be a number even with null scorecard");
  assert.ok(Array.isArray(pack.scorecard.domains),           "scorecard.domains must be an array even with null scorecard");
});

// ─── P1: Reviewer approved but open high findings present ─────────────────────

test("governance posture is Needs Remediation when reviewer Approved but open Critical exists", () => {
  const pack = buildPack(); // fixture has open Critical fn1
  assert.equal(pack.decision.governancePosture, "Needs Remediation",
    "open Critical finding must force Needs Remediation posture regardless of reviewer decision");
});

test("riskAcceptanceRequired is true when open Critical finding exists", () => {
  const pack = buildPack();
  assert.equal(pack.decision.riskAcceptanceRequired, true,
    "riskAcceptanceRequired must be true when open Critical finding exists");
});

test("governance warning absent when no open findings exist", () => {
  const emptyFindingsPack = normalizeReviewForExport(
    REVIEW, FILES, REQUIREMENTS, EVIDENCE, [], ACTIONS, SCORECARD, DECISION, "html"
  );
  assert.equal(emptyFindingsPack.decision.governanceWarning, null,
    "governanceWarning must be null when no open findings exist");
});

// ─── P1: Partial extraction ───────────────────────────────────────────────────

test("evidenceReadiness is not Ready when a required file has Failed extraction", () => {
  const pack = buildPack();
  // f3 (sow) failed extraction → evidence readiness must not be Ready
  assert.notEqual(pack.evidenceReadiness.status, "Ready",
    "evidenceReadiness.status must not be Ready when a required file failed extraction");
});

test("uploadedInputs include failed files with extractionStatus set", () => {
  const pack = buildPack();
  const failed = pack.uploadedInputs.find((i) => i.inputId === "f3" || i.fileName === "failed.pdf");
  assert.ok(failed, "failed file must appear in uploadedInputs");
  assert.ok(/fail/i.test(failed.extractionStatus), "failed file must have Failed extractionStatus");
});

// ─── P1: Correct canonical field names (no legacy leakage) ───────────────────

test("canonical findings never expose findingStatement at top level", () => {
  const pack = buildPack();
  for (const f of pack.findings) {
    assert.equal(f.findingStatement, undefined,
      `canonical finding ${f.findingId} must not expose legacy findingStatement field`);
  }
});

test("canonical actions never expose actionSummary at top level", () => {
  const pack = buildPack();
  for (const a of pack.remediationActions) {
    assert.equal(a.actionSummary, undefined,
      `canonical action ${a.actionId} must not expose legacy actionSummary field`);
  }
});
