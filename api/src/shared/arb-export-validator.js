/**
 * arb-export-validator.js
 *
 * Validation gate for ArbReviewOutputPack.
 * Must run before any export renderer receives the canonical pack.
 *
 * Hard fail conditions abort export generation.
 * Warning conditions allow generation but append visible warnings.
 */

"use strict";

/**
 * Validates an ArbReviewOutputPack before export rendering.
 *
 * @param {object} pack  Canonical ArbReviewOutputPack from normalizeReviewForExport()
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateArbReviewOutputPack(pack) {
  const errors   = [];
  const warnings = [];

  if (!pack || typeof pack !== "object") {
    return { valid: false, errors: ["ArbReviewOutputPack is null or not an object."], warnings: [] };
  }

  // ── Hard fail conditions ────────────────────────────────────────────────────

  if (!pack.metadata?.reviewId) {
    errors.push("metadata.reviewId is missing — export cannot be generated without a review identifier.");
  }
  if (!pack.customer?.name) {
    errors.push("customer.name is missing — export cannot be generated without a customer name.");
  }
  if (!pack.project?.name) {
    errors.push("project.name is missing — export cannot be generated without a project name.");
  }

  const pct = pack.scorecard?.percentage;
  if (pct !== undefined && (typeof pct !== "number" || isNaN(pct) || pct < 0 || pct > 100)) {
    errors.push(`scorecard.percentage is invalid (${pct}). Must be a number between 0 and 100.`);
  }

  // Check for exporter data integrity: findings and actions must be arrays
  if (!Array.isArray(pack.findings)) {
    errors.push("pack.findings must be an array.");
  }
  if (!Array.isArray(pack.remediationActions)) {
    errors.push("pack.remediationActions must be an array.");
  }

  // ── Warning conditions (allow export but surface warnings) ─────────────────

  // Decision conflict
  const { reviewerDecision, governancePosture } = pack.decision || {};
  if (reviewerDecision === "Approved" && governancePosture && governancePosture !== "Approved") {
    warnings.push(
      `Reviewer decision is Approved but computed governance posture is "${governancePosture}". ` +
      "Open findings require conditional approval or formal risk acceptance before architecture closure."
    );
  }

  // Open High/Critical findings
  const openHighCrit = (pack.findings || []).filter((f) => {
    const sev    = String(f.severity || "").toLowerCase();
    const status = String(f.status   || "").toLowerCase();
    return (sev === "critical" || sev === "high") && (status === "open" || status === "in progress");
  });
  if (openHighCrit.length > 0) {
    warnings.push(`${openHighCrit.length} open Critical/High finding(s) exist. Approval posture should reflect this.`);
  }

  // Evidence readiness not complete
  if (pack.evidenceReadiness?.status && pack.evidenceReadiness.status !== "Ready") {
    warnings.push(
      `Evidence readiness is "${pack.evidenceReadiness.status}": ${pack.evidenceReadiness.reason}`
    );
  }

  // Open High/Medium findings without actions
  const openSignificant = (pack.findings || []).filter((f) => {
    const sev    = String(f.severity || "").toLowerCase();
    const status = String(f.status   || "").toLowerCase();
    return (sev === "critical" || sev === "high" || sev === "medium") &&
           (status === "open" || status === "in progress");
  });
  const coveredIds = new Set((pack.remediationActions || []).map((a) => a.linkedFindingId));
  const missingActionFindings = openSignificant.filter((f) => !coveredIds.has(f.findingId));
  if (missingActionFindings.length > 0) {
    warnings.push(
      `${missingActionFindings.length} open High/Medium/Critical finding(s) have no remediation action. ` +
      "Action generation may be incomplete."
    );
  }

  // Unowned High/Medium actions
  const unowned = (pack.remediationActions || []).filter(
    (a) => (!a.owner || a.owner === "Unassigned") &&
    (String(a.severity || "").toLowerCase() === "high" || String(a.severity || "").toLowerCase() === "critical")
  );
  if (unowned.length > 0) {
    warnings.push(`${unowned.length} High/Critical action(s) have no assigned owner.`);
  }

  // Risk acceptance required but not recorded
  if (pack.decision?.riskAcceptanceRequired && (pack.riskAcceptances || []).length === 0) {
    warnings.push(
      "Risk acceptance is required for open High/Critical findings, but no formal risk acceptance record exists."
    );
  }

  // Only SOW/scope evidence — no design implementation evidence
  const implEvidence = (pack.evidence || []).filter((e) => e.provesImplementation === true);
  if ((pack.evidence || []).length > 0 && implEvidence.length === 0) {
    warnings.push(
      "All evidence items appear to be scope statements. No implemented technical control evidence was detected."
    );
  }

  // Incomplete requirements traceability
  const notEvidenced = (pack.traceability || []).filter((t) => t.evidenceStatus === "Not Evidenced");
  if (notEvidenced.length > 0 && (pack.requirements || []).length > 0) {
    const pctCovered = Math.round(
      ((pack.requirements.length - notEvidenced.length) / pack.requirements.length) * 100
    );
    if (pctCovered < 50) {
      warnings.push(
        `Traceability coverage is ${pctCovered}% — fewer than half of requirements have linked evidence.`
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

module.exports = { validateArbReviewOutputPack };
