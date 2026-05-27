const { app } = require("@azure/functions");
const { jsonResponse, requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { getArbFindings, getArbFiles } = require("../shared/arb-review-store");

// ── Read-time false-positive suppression ────────────────────────────────────
//
// These patterns mirror the write-time suppression in runAgent.js and
// arbRunAgentReview.js but are applied at READ TIME so that findings stored
// from any previous assessment run (before write-time suppression was in
// place) are also filtered out before reaching the UI.
//
// Rule: NEVER suppress rules-engine findings (source === 'rules-engine').
// Rule: OPS operational ownership is ALWAYS out of scope for PS design reviews.
// Rule: Boundary control finding is suppressed when file names evidence hub-spoke / firewall.

const OPS_OWNERSHIP_PATTERNS = [
  /runbook\s+ownership/i,
  /runbook\s+accountab/i,
  /runbook\s+owner/i,
  /operational\s+ownership/i,
  /incident\s+ownership/i,
  /incident\s+owner/i,
  /deployment\s+ownership/i,
  /day.?2\s+owner/i,
  /managed\s+services\s+owner/i,
  /ownership\s+needs\s+clarif/i,
  /ownership\s+not\s+(clear|defined|explicit|document)/i,
];

const BOUNDARY_CONTROL_EVIDENCE_TERMS = [
  "hub-spoke", "hub spoke", "hub and spoke", "azure firewall", "azfw", "az fw",
  "application gateway", "front door", "waf", "nsg", "network security group",
  "forced tunnel", "forced tunneling", "forced tunnelling", "egress control",
  "boundary control", "perimeter", "dmz", "connectivity hub", "hub subscription",
  "hub vnet", "hub virtual network", "firewall", "apim",
];

/**
 * Suppresses LLM-generated findings that are contradicted by the uploaded
 * file set. Applied at read time so stale findings stored before write-time
 * suppression was deployed are also filtered.
 *
 * @param {object[]} findings - raw findings from Azure Table Storage
 * @param {object[]} files    - uploaded file records (fileName property used)
 * @returns {object[]} filtered findings
 */
function suppressReadTimeFalsePositives(findings, files) {
  if (!Array.isArray(findings) || findings.length === 0) return findings;

  // Build a searchable corpus from uploaded file names only.
  // Underscores, hyphens, and dots become spaces so "Hub_Spoke" → "hub spoke".
  const fileNameCorpus = (Array.isArray(files) ? files : [])
    .map((f) => String(f.fileName ?? "").replace(/[_\-.]/g, " "))
    .join(" ")
    .toLowerCase();

  return findings.filter((finding) => {
    // Deterministic rule findings are always authoritative — never suppress.
    if (finding.source === "rules-engine") return true;

    const findingText = [
      finding.title ?? "",
      finding.findingStatement ?? "",
      finding.evidenceBasis ?? "",
    ].join(" ").toLowerCase();

    // 1. OPS operational ownership is always out of scope for PS landing-zone
    //    design reviews — Managed Services / Operations owns this, not the
    //    architecture design package.
    if (OPS_OWNERSHIP_PATTERNS.some((re) => re.test(findingText))) return false;

    // 2. ALZ boundary-control: hub-spoke + Azure Firewall IS the boundary
    //    control pattern. If any uploaded file name evidences it, suppress.
    if (/boundary.control|boundary control|not yet explicit/i.test(findingText)) {
      if (
        fileNameCorpus.length > 0 &&
        BOUNDARY_CONTROL_EVIDENCE_TERMS.some((t) => fileNameCorpus.includes(t))
      ) {
        return false;
      }
    }

    return true;
  });
}

async function handleArbGetFindings(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) {
    return auth.response;
  }

  try {
    const reviewId = request.params?.reviewId || "demo-review";

    // Load findings and files in parallel; files are needed for read-time
    // false-positive suppression. If getArbFiles fails (e.g. race condition),
    // fall back to an empty list — suppression degrades gracefully.
    const [findings, files] = await Promise.all([
      getArbFindings(auth.principal, reviewId),
      getArbFiles(auth.principal, reviewId).catch(() => []),
    ]);

    return jsonResponse(200, {
      reviewId,
      findings: suppressReadTimeFalsePositives(findings, files),
    });
  } catch (error) {
    return safeErrorResponse(error, "Unable to load ARB findings.", context);
  }
}

app.http("arbGetFindings", {
  route: "arb/reviews/{reviewId}/findings",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: handleArbGetFindings,
});

module.exports = {
  handleArbGetFindings,
  suppressReadTimeFalsePositives,
};
