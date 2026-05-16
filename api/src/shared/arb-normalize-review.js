/**
 * arb-normalize-review.js
 *
 * Canonical ARB Review Output Pack normalization pipeline.
 *
 * ALL exporters (Markdown, HTML, CSV, Excel, PPTX) must consume ArbReviewOutputPack.
 * No renderer may independently calculate findings, actions, scores, or decisions.
 *
 * Pipeline:
 *   Raw review data
 *   → normalizeReviewForExport()
 *   → deriveEvidenceReadiness()
 *   → classifyDomain() per finding/requirement
 *   → deriveGovernanceDecision()
 *   → calculateScorecard()
 *   → deriveRiskRegister()
 *   → generateRemediationActions()
 *   → buildTraceability()
 *   → collectExportWarnings()
 *   → ArbReviewOutputPack
 *   → validateArbReviewOutputPack() (see arb-export-validator.js)
 *   → render exports
 */

"use strict";

const path = require("path");
const fs   = require("fs");
const { validateArbReviewOutputPack } = require("./arb-export-validator");

// ─── PPTX Template resolution ─────────────────────────────────────────────────
// Lookup order:
//   1. POWERPOINT_TEMPLATE_PATH env var
//   2. C:\cari-repo\Rackspace Presentation Template.pptx
//   3. templates/Rackspace Presentation Template.pptx (repo root)

const TEMPLATE_NAME = "Rackspace Presentation Template.pptx";
const TEMPLATE_CANDIDATES = [
  process.env.POWERPOINT_TEMPLATE_PATH || null,
  path.join("C:\\cari-repo", TEMPLATE_NAME),
  path.resolve(__dirname, "../../../templates", TEMPLATE_NAME),
].filter(Boolean);

function resolveTemplatePath() {
  for (const candidate of TEMPLATE_CANDIDATES) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch { /* ignore */ }
  }
  return null;
}

// ─── Domain classification ─────────────────────────────────────────────────────
// Deterministic keyword matching runs first; AI-provided domain used as fallback.

const DOMAIN_RULES = [
  {
    domain: "Identity",
    patterns: [
      /entra\s*(id)?/i, /\brbac\b/i, /\bpim\b/i, /break[- ]?glass/i,
      /managed\s+identity/i, /service\s+principal/i, /\baad\b/i,
      /active\s+directory/i, /\bmfa\b/i, /privileged\s+identity/i,
      /conditional\s+access/i, /identity\s+governance/i,
    ],
  },
  {
    domain: "Networking",
    patterns: [
      /hub[- ]?spoke/i, /\bfirewall\b/i, /\bnsg\b/i, /\budr\b/i,
      /route\s+table/i, /private\s+endpoint/i, /private\s+dns/i,
      /\bwaf\b/i, /application\s+gateway/i, /front\s+door/i,
      /\bvnet\b/i, /virtual\s+network/i, /\bvpn\b/i, /express\s*route/i,
      /\bddos\b/i, /network\s+security\s+group/i, /traffic\s+manager/i,
      /\bapim\b/i, /api\s+management/i, /load\s+balanc/i,
    ],
  },
  {
    domain: "Governance",
    patterns: [
      /azure\s+policy/i, /management\s+group/i, /subscription\s+placement/i,
      /\btagging\b/i, /guardrail/i, /policy\s+initiative/i,
      /policy\s+exemption/i, /\bcompliance\b/i, /\blanding\s+zone\b/i,
      /caf\b/i, /\bwaf\s+framework\b/i, /governance\s+framework/i,
    ],
  },
  {
    domain: "Operational Excellence",
    patterns: [
      /azure\s+monitor/i, /log\s+analytics/i, /app\s*insights/i,
      /diagnostic\s+setting/i, /\brunbook/i, /\bterraform\b/i,
      /\bbicep\b/i, /\barm\s+template/i, /ci[\/ ]?cd/i,
      /deployment\s+pipeline/i, /github\s+action/i, /\bdevops\b/i,
      /automation\s+account/i, /observabilit/i, /\bsre\b/i,
    ],
  },
  {
    domain: "Reliability",
    patterns: [
      /availability\s+zone/i, /\bbackup\b/i, /disaster\s+recovery/i,
      /\b(dr|ha)\b/, /\brto\b/i, /\brpo\b/i, /failover/i,
      /health\s+probe/i, /retry\s+polic/i, /resilienc/i,
      /fault\s+toleran/i, /redundan/i, /geo[\s-]?replication/i,
      /site\s+recovery/i, /always\s+on/i,
    ],
  },
  {
    domain: "Cost Optimization",
    patterns: [
      /\bsku\b/i, /\bbudget\b/i, /reservation/i, /right[- ]?siz/i,
      /autoscale/i, /\bpricing\b/i, /savings\s+plan/i,
      /cost\s+optim/i, /azure\s+advisor/i, /\bspot\s+instance/i,
    ],
  },
  {
    domain: "Security",
    patterns: [
      /\bencrypt/i, /key\s+vault/i, /\bsecret\b/i, /certificate/i,
      /\btls\b/i, /\bssl\b/i, /vulnerability/i, /penetration/i,
      /security\s+center/i, /defender/i, /sentinel/i,
      /\bsiem\b/i, /\bsoar\b/i, /zero\s+trust/i, /\biam\b/i,
      /access\s+control/i, /just[- ]?in[- ]?time/i, /\bjit\b/i,
    ],
  },
];

const VALID_DOMAINS = new Set([
  "Security", "Identity", "Governance", "Networking", "Reliability",
  "Operational Excellence", "Cost Optimization", "Documentation",
  "Architecture", "Other",
]);

function classifyDomain(text, existingDomain) {
  const combined = String(text || "");
  for (const { domain, patterns } of DOMAIN_RULES) {
    if (patterns.some((p) => p.test(combined))) return domain;
  }
  if (existingDomain && VALID_DOMAINS.has(existingDomain)) return existingDomain;
  return "Other";
}

// ─── Requirement filtering ────────────────────────────────────────────────────
// Headings, empty bullets, and non-actionable lines are excluded.

const HEADING_RE         = /^#{1,6}\s+/;
const NUMBER_ONLY_RE     = /^\d+\.?\s*$/;
const EMPTY_BULLET_RE    = /^[-*•]\s*$/;
const ACTIONABLE_KW_RE   = /\b(must|shall|should|requires?|needs?|provide|defines?|documents?|implements?|includes?|supports?|establishes?|delivers?|ensures?)\b/i;

function isActionableRequirement(text) {
  const t = String(text || "").trim();
  if (!t || t.length < 20) return false;
  if (HEADING_RE.test(t) || NUMBER_ONLY_RE.test(t) || EMPTY_BULLET_RE.test(t)) return false;
  return ACTIONABLE_KW_RE.test(t);
}

// ─── Due date helpers ─────────────────────────────────────────────────────────

const DUE_DAYS_BY_SEVERITY = { Critical: 7, High: 14, Medium: 30, Low: 60 };

function addDays(isoDate, n) {
  const d = new Date(isoDate || Date.now());
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function deriveDueStatus(dueDate) {
  if (!dueDate) return "No Due Date";
  const due = new Date(dueDate);
  if (isNaN(due.getTime())) return "No Due Date";
  const diffDays = Math.ceil((due - Date.now()) / 86_400_000);
  if (diffDays < 0)  return "Overdue";
  if (diffDays <= 7) return "Due Soon";
  return "Not Due";
}

// ─── Decision canonicalization ────────────────────────────────────────────────

const DECISION_CANON = {
  "Approved":                "Approved",
  "Conditionally Approved":  "Approved with Conditions",
  "Approved with Conditions":"Approved with Conditions",
  "Needs Revision":          "Needs Remediation",
  "Needs Remediation":       "Needs Remediation",
  "Rejected":                "Rejected",
  "Deferred":                "Deferred",
};

function canonicalizeDecision(raw) {
  if (!raw) return "Not Recorded";
  return DECISION_CANON[raw] || raw;
}

// ─── Evidence readiness derivation ───────────────────────────────────────────

const REQUIRED_CATEGORIES    = new Set(["sow", "design_doc"]);

function deriveEvidenceReadiness(files) {
  const all = files || [];
  const completed = [];
  const partial   = [];
  const failed    = [];

  for (const f of all) {
    const norm = normalizeExtractionStatus(f.extractionStatus);
    const input = mapUploadedInput(f);
    if (norm === "Completed") completed.push(input);
    else if (norm === "Failed") failed.push(input);
    else partial.push(input);
  }

  const required        = all.filter((f) => REQUIRED_CATEGORIES.has((f.logicalCategory || "").toLowerCase()));
  const requiredFailed  = required.filter((f) => normalizeExtractionStatus(f.extractionStatus) === "Failed");
  const requiredPartial = required.filter((f) => {
    const s = normalizeExtractionStatus(f.extractionStatus);
    return s !== "Completed" && s !== "Failed";
  });

  let status, confidence, reason;

  if (all.length === 0) {
    status = "Not Ready"; confidence = "Low";
    reason = "No files were uploaded.";
  } else if (failed.length === all.length) {
    status = "Not Ready"; confidence = "Low";
    reason = "All uploaded inputs failed extraction. Review results cannot be generated.";
  } else if (requiredFailed.length > 0) {
    status = "Partial"; confidence = "Low";
    reason = `${requiredFailed.length} required input(s) failed extraction: ${requiredFailed.map((f) => f.fileName).join(", ")}.`;
  } else if (requiredPartial.length > 0 || partial.length > 0) {
    status = "Partial"; confidence = "Medium";
    reason = "Some inputs were only partially extracted. Results may be incomplete.";
  } else if (required.length > 0 && requiredFailed.length === 0 && requiredPartial.length === 0) {
    if (failed.length > 0) {
      status = "Partial"; confidence = "Medium";
      reason = `${failed.length} optional input(s) failed extraction. Core evidence is available.`;
    } else {
      status = "Ready"; confidence = "High";
      reason = "All uploaded inputs were successfully extracted.";
    }
  } else {
    status = failed.length > 0 ? "Partial" : "Ready";
    confidence = failed.length > 0 ? "Medium" : "High";
    reason = failed.length > 0
      ? `${failed.length} input(s) failed extraction.`
      : "All uploaded inputs were successfully extracted.";
  }

  return { status, reason, failedInputs: failed, partialInputs: partial, completedInputs: completed, confidence };
}

function mapUploadedInput(f) {
  return {
    inputId:               f.fileId,
    fileName:              f.fileName,
    documentType:          mapDocumentType(f.logicalCategory),
    extractionStatus:      normalizeExtractionStatus(f.extractionStatus),
    textAvailable:         normalizeExtractionStatus(f.extractionStatus) === "Completed",
    visualContentAvailable:Boolean(f.visualContentAvailable),
    extractionSummary:     f.extractionError || f.extractionSummary || null,
    extractionWarnings:    f.extractionWarnings || [],
  };
}

function mapDocumentType(logicalCategory) {
  const map = {
    sow:                  "SOW",
    design_doc:           "Design Document",
    cost_assumptions:     "Cost Model",
    dr_ha_note:           "Other",
    ops_monitoring_note:  "Other",
  };
  return map[(logicalCategory || "").toLowerCase()] || "Other";
}

function normalizeExtractionStatus(raw) {
  const s = String(raw || "").toLowerCase();
  if (s === "completed") return "Completed";
  if (s === "failed")    return "Failed";
  if (s === "skipped")   return "Skipped";
  return "Partial";
}

// ─── Governance decision derivation ──────────────────────────────────────────

function deriveGovernanceDecision(findings, scorecard, decision) {
  const open = (findings || []).filter((f) => {
    const s = String(f.status || "").toLowerCase();
    return s === "open" || s === "in progress";
  });

  const openCritical = open.filter((f) => String(f.severity || "").toLowerCase() === "critical");
  const openHigh     = open.filter((f) => String(f.severity || "").toLowerCase() === "high");
  const openMedium   = open.filter((f) => String(f.severity || "").toLowerCase() === "medium");

  // Reviewer decision — prefer canonical decision entity, fall back to scorecard override
  const rawDecision = decision?.reviewerDecision
    || scorecard?.reviewerOverride?.overrideDecision
    || null;
  const reviewerDecision = canonicalizeDecision(rawDecision);

  let governancePosture;
  let riskAcceptanceRequired = false;

  if (openCritical.length > 0) {
    governancePosture       = "Needs Remediation";
    riskAcceptanceRequired  = true;
  } else if (openHigh.length > 0) {
    governancePosture       = "Approved with Conditions";
    riskAcceptanceRequired  = true;
  } else if (openMedium.length > 0) {
    governancePosture = "Approved with Conditions";
  } else {
    const rec = String(scorecard?.recommendation || "").toLowerCase();
    if (rec.includes("needs remediation") || rec.includes("needs revision")) {
      governancePosture = "Review Required";
    } else {
      governancePosture = reviewerDecision !== "Not Recorded" ? reviewerDecision : "Review Required";
    }
  }

  // Warning: reviewer approved but governance requires more
  let governanceWarning = null;
  if (reviewerDecision === "Approved" && governancePosture !== "Approved") {
    governanceWarning = "Reviewer approval exists, but open findings require remediation, conditional approval, or formal risk acceptance before architecture closure.";
  }

  // Warning: rationale only mentions customer sign-off with open High/Critical findings
  const rationale = String(
    decision?.rationale || scorecard?.reviewerOverride?.overrideRationale || ""
  ).toLowerCase();
  if (
    rationale &&
    (rationale.includes("customer signed") || rationale.includes("customer sign-off") || rationale.includes("customer approved")) &&
    !rationale.includes("risk acceptance") &&
    !rationale.includes("conditions") &&
    (openHigh.length + openCritical.length) > 0
  ) {
    const suffix = "Customer sign-off is not sufficient architecture risk acceptance unless an authorised risk owner, accepted residual risk, and approval conditions are recorded.";
    governanceWarning = governanceWarning ? `${governanceWarning} ${suffix}` : suffix;
  }

  return {
    reviewerDecision,
    reviewerName: decision?.reviewerName || scorecard?.reviewerOverride?.reviewerName || null,
    reviewerRole: decision?.reviewerRole || null,
    recordedAt:   decision?.recordedAt  || scorecard?.reviewerOverride?.overriddenAt || null,
    rationale:    decision?.rationale   || scorecard?.reviewerOverride?.overrideRationale || null,
    governancePosture,
    governanceWarning,
    riskAcceptanceRequired,
  };
}

// ─── Risk register derivation ─────────────────────────────────────────────────
// Critical and High open findings always appear unless Closed/Accepted Risk.

function deriveRiskRegister(findings) {
  return (findings || [])
    .filter((f) => {
      const sev    = String(f.severity || "").toLowerCase();
      const status = String(f.status   || "").toLowerCase();
      return (sev === "critical" || sev === "high") &&
             (status === "open" || status === "in progress");
    })
    .map((f, i) => ({
      riskId:          `RISK-${String(i + 1).padStart(3, "0")}`,
      linkedFindingId: f.findingId,
      riskTitle:       f.title,
      severity:        f.severity,
      impact:          f.description || f.findingStatement || "",
      likelihood:      String(f.severity || "").toLowerCase() === "critical" ? "High" : "High",
      riskOwner:       normalizeOwner(f.owner || f.suggestedOwner),
      mitigation:      f.recommendation || "",
      status:          normalizeRiskStatus(f.status),
      dueDate:         f.dueDate || f.suggestedDueDate || null,
    }));
}

function normalizeRiskStatus(raw) {
  const s = String(raw || "").toLowerCase();
  if (s === "closed")        return "Closed";
  if (s === "in progress")   return "In Progress";
  if (s.includes("accept"))  return "Accepted Risk";
  return "Open";
}

// ─── Remediation action normalization + generation ────────────────────────────
// Every open Critical/High/Medium finding must have at least one action.

function generateRemediationActions(findings, existingActions, baseDate) {
  const base = new Date(baseDate || Date.now());
  const result = [];
  const coveredFindingIds = new Set();

  // Normalize existing actions
  for (const a of existingActions || []) {
    const dueDate = a.dueDate || null;
    result.push({
      actionId:        a.actionId,
      linkedFindingId: a.sourceFindingId || null,
      title:           a.actionSummary || a.title || "",
      action:          a.actionSummary || a.title || "",
      severity:        a.severity     || "Medium",
      domain:          a.domain       || classifyDomain(a.actionSummary || "", null),
      owner:           normalizeOwner(a.owner || a.suggestedOwner),
      dueDate,
      dueStatus:       deriveDueStatus(dueDate),
      status:          normalizeActionStatus(a.status),
      source:          "generated",
    });
    if (a.sourceFindingId) coveredFindingIds.add(a.sourceFindingId);
  }

  // Generate actions for open Critical/High/Medium findings that have none
  for (const f of findings || []) {
    if (coveredFindingIds.has(f.findingId)) continue;
    const sev    = String(f.severity || "").toLowerCase();
    const status = String(f.status   || "").toLowerCase();
    if (status === "closed" || status.includes("accept") || status === "deferred") continue;
    if (sev !== "critical" && sev !== "high" && sev !== "medium") continue;

    const dueDays = DUE_DAYS_BY_SEVERITY[f.severity] || 30;
    const dueDate = addDays(base.toISOString(), dueDays);
    result.push({
      actionId:        `gen-${f.findingId}`,
      linkedFindingId: f.findingId,
      title:           `Remediate: ${f.title}`,
      action:          f.recommendation || `Address ${f.severity.toLowerCase()} finding: ${f.title}`,
      severity:        f.severity,
      domain:          f.domain || "Other",
      owner:           normalizeOwner(f.owner || f.suggestedOwner),
      dueDate,
      dueStatus:       deriveDueStatus(dueDate),
      status:          "Open",
      source:          "generated",
    });
  }

  return result;
}

function normalizeActionStatus(raw) {
  const s = String(raw || "").toLowerCase();
  if (s === "closed")        return "Closed";
  if (s === "in progress")   return "In Progress";
  if (s.includes("accept"))  return "Accepted Risk";
  if (s === "deferred")      return "Deferred";
  return "Open";
}

function normalizeOwner(raw) {
  if (!raw) return "Unassigned";
  return String(raw).trim().replace(/\s+/g, " ");
}

// ─── Score calculation ────────────────────────────────────────────────────────

function calculateScorecard(scorecard) {
  const totalScore = Number(scorecard?.overallScore ?? 0);
  const maxScore   = 100;
  const percentage = Math.round(Math.min(100, Math.max(0, totalScore)));

  const domains = (scorecard?.domainScores || []).map((d) => {
    const score     = Number(d.score  ?? 0);
    const maxDomain = Number(d.weight ?? d.maxScore ?? 10);
    const pct       = maxDomain > 0 ? Math.round((score / maxDomain) * 100) : 0;
    return {
      domain:           d.domain || d.name || "Other",
      score,
      maxScore:         maxDomain,
      percentage:       pct,
      rationale:        d.reason || d.rationale || "",
      blockingFindings: d.linkedFindings || [],
    };
  });

  return { totalScore, maxScore, percentage, domains };
}

function deriveScoreBand(percentage) {
  if (percentage >= 85) return "Strong";
  if (percentage >= 70) return "Moderate";
  if (percentage >= 50) return "Needs Remediation";
  if (percentage >= 30) return "High Risk";
  return "Review Required";
}

// ─── Traceability builder ─────────────────────────────────────────────────────

function buildTraceability(requirements, evidence, findings, actions) {
  return (requirements || []).map((req) => {
    const linkedEvidence = (evidence || []).filter(
      (e) =>
        (e.linkedRequirementIds || []).includes(req.requirementId) ||
        (e.sourceFile && req.sourceFile && e.sourceFile === req.sourceFile)
    );
    const linkedFindings = (findings || []).filter((f) =>
      (f.sourceFiles || []).some((sf) =>
        linkedEvidence.some((e) => e.sourceFile === sf)
      )
    );
    const linkedActions = (actions || []).filter((a) =>
      linkedFindings.some((f) => f.findingId === a.linkedFindingId)
    );

    const hasImpl = linkedEvidence.some((e) => e.provesImplementation === true);
    let evidenceStatus;
    if (linkedEvidence.length === 0) evidenceStatus = "Not Evidenced";
    else if (hasImpl)                evidenceStatus = "Evidenced";
    else                             evidenceStatus = "Partially Evidenced";

    return {
      requirementId:   req.requirementId,
      requirementText: req.text || "",
      domain:          req.domain || "Other",
      evidenceStatus,
      evidenceIds:     linkedEvidence.map((e) => e.evidenceId),
      findingIds:      linkedFindings.map((f) => f.findingId),
      actionIds:       linkedActions.map((a)  => a.actionId),
      sourceFiles:     [...new Set([req.sourceFile, ...linkedEvidence.map((e) => e.sourceFile)].filter(Boolean))],
    };
  });
}

// ─── Export warnings collector ────────────────────────────────────────────────

function collectExportWarnings(pack) {
  const warnings = [];
  let id = 1;
  const warn = (severity, message, sections) =>
    warnings.push({ warningId: `W${String(id++).padStart(3, "0")}`, severity, message, affectedSections: sections });

  // Evidence readiness
  if (pack.evidenceReadiness.status !== "Ready") {
    warn("High",
      `Evidence readiness is ${pack.evidenceReadiness.status}. ${pack.evidenceReadiness.reason} Review results may be incomplete.`,
      ["Evidence Readiness", "Executive Summary"]);
  }

  // Decision / governance conflict
  if (pack.decision.governanceWarning) {
    warn("High", pack.decision.governanceWarning, ["Architecture Decision Summary", "Executive Summary"]);
  }

  // Open High/Critical/Medium findings without actions
  const openSignificant = (pack.findings || []).filter((f) => {
    const sev    = String(f.severity || "").toLowerCase();
    const status = String(f.status   || "").toLowerCase();
    return (sev === "critical" || sev === "high" || sev === "medium") &&
           (status === "open" || status === "in progress");
  });
  const coveredIds = new Set((pack.remediationActions || []).map((a) => a.linkedFindingId));
  const missingActions = openSignificant.filter((f) => !coveredIds.has(f.findingId));
  if (missingActions.length > 0) {
    warn("Medium",
      `${missingActions.length} open High/Medium/Critical finding(s) have no associated remediation action.`,
      ["Remediation Plan"]);
  }

  // Unowned actions
  const unowned = (pack.remediationActions || []).filter((a) => !a.owner || a.owner === "Unassigned");
  if (unowned.length > 0) {
    warn("Low", `${unowned.length} action(s) have no assigned owner.`, ["Remediation Plan"]);
  }

  // SOW-only evidence — no implemented control evidence
  const implEvidence = (pack.evidence || []).filter((e) => e.provesImplementation === true);
  if ((pack.evidence || []).length > 0 && implEvidence.length === 0) {
    warn("Medium",
      "All evidence appears to be scope statements or SOW references. No implemented technical control evidence was detected. Design evidence should confirm what is built, not only what is planned.",
      ["Evidence Register", "Executive Summary"]);
  }

  // Failed extraction
  if ((pack.uploadedInputs || []).some((u) => u.extractionStatus === "Failed")) {
    warn("High",
      "One or more uploaded inputs failed text extraction. Findings and evidence may be incomplete.",
      ["Evidence Readiness", "Uploaded Inputs"]);
  }

  // Risk acceptance required but none recorded
  if (pack.decision.riskAcceptanceRequired && (pack.riskAcceptances || []).length === 0) {
    warn("High",
      "Risk acceptance is required for open High or Critical findings, but no formal risk acceptance record exists.",
      ["Architecture Decision Summary", "Risk Register"]);
  }

  // PPTX template availability
  const templatePath = resolveTemplatePath();
  if (!templatePath) {
    warn("Medium",
      "Rackspace PowerPoint template was not found at any configured path. PPTX exports use programmatic Rackspace brand styling. True template-based generation requires the Rackspace Presentation Template.pptx file configured via POWERPOINT_TEMPLATE_PATH.",
      ["PowerPoint Export"]);
  }

  return warnings;
}

// ─── Evidence helpers ─────────────────────────────────────────────────────────

function classifyEvidenceType(factType) {
  const t = String(factType || "").toLowerCase();
  if (t.includes("visual") || t.includes("diagram") || t.includes("image")) return "Visual Evidence";
  if (t.includes("scope") || t.includes("sow"))                             return "Scope Statement";
  if (t.includes("cost"))                                                    return "Cost Evidence";
  if (t.includes("risk"))                                                    return "Risk Evidence";
  if (t.includes("implemented") || t.includes("control"))                   return "Implemented Control Evidence";
  if (t.includes("decision"))                                                return "Decision Evidence";
  if (t.includes("operational"))                                             return "Operational Evidence";
  return "Design Claim";
}

function isImplementationEvidence(factType) {
  const t = String(factType || "").toLowerCase();
  return t.includes("implemented") || t.includes("control") || t.includes("operational");
}

function normalizeRecommendation(raw, governancePosture) {
  if (!raw) return governancePosture || "Review Required";
  const r = String(raw).toLowerCase();
  if (r.includes("recommended for approval") || r === "approved") return "Approved";
  if (r.includes("condition") || r.includes("conditional"))        return "Approved with Conditions";
  if (r.includes("needs remediation") || r.includes("needs revision")) return "Needs Remediation";
  if (r.includes("reject"))                                        return "Rejected";
  return raw;
}

function mapSourceType(logicalCategory) {
  const s = String(logicalCategory || "").toLowerCase();
  if (s === "sow")        return "SOW";
  if (s === "design_doc") return "Design Document";
  return "Other";
}

// ─── State-aware next steps builder ──────────────────────────────────────────
// Generates context-specific next steps based on the actual review state so
// the PPTX slide is actionable rather than generic boilerplate.

function buildStateAwareNextSteps(canonicalDecision, canonicalFindings, files) {
  const steps = [];
  const hasSow = (files || []).some((f) => (f.logicalCategory || "").toLowerCase() === "sow");
  const open = (canonicalFindings || []).filter((f) => {
    const s = String(f.status || "").toLowerCase();
    return s === "open" || s === "in progress";
  });
  const openCrit = open.filter((f) => String(f.severity || "").toLowerCase() === "critical");
  const openHigh = open.filter((f) => String(f.severity || "").toLowerCase() === "high");
  const openMed  = open.filter((f) => String(f.severity || "").toLowerCase() === "medium");
  const { reviewerDecision, governanceWarning } = canonicalDecision;

  if (openCrit.length > 0) {
    steps.push(`Immediately remediate ${openCrit.length} Critical finding${openCrit.length !== 1 ? "s" : ""} — no deployment or approval is permitted while Critical blockers remain open.`);
  }
  if (openHigh.length > 0) {
    steps.push(`Assign owners and set firm remediation timelines for ${openHigh.length} High severity finding${openHigh.length !== 1 ? "s" : ""} within 14 days.`);
  }
  if (openMed.length > 0) {
    steps.push(`Track and resolve ${openMed.length} Medium finding${openMed.length !== 1 ? "s" : ""} through the remediation action register before the next review cycle.`);
  }
  if (governanceWarning) {
    steps.push("Record formal risk acceptance — document the risk owner, accepted residual risk, and approval conditions to align the governance record with the reviewer decision.");
  }
  if (!hasSow) {
    steps.push("Upload a Statement of Work to enable full scope traceability and acceptance criteria tracking.");
  }
  if (open.length === 0 && reviewerDecision === "Approved") {
    steps.push("Architecture approved — proceed to implementation against the reviewed and signed-off design baseline.");
    steps.push("Schedule a 30-day post-deployment health check to confirm the architecture performs as designed in production.");
  } else if (reviewerDecision === "Not Recorded") {
    steps.push("Obtain formal reviewer sign-off on the Architecture Decision record before closing this review.");
  }
  steps.push("Distribute this review report to the customer architecture team, delivery lead, and relevant stakeholders.");
  if (open.length > 0) {
    steps.push("Schedule a follow-up architecture review after remediation actions are completed to validate progress and update the scorecard.");
  } else {
    steps.push("Update the project architecture decision register with this review as the approved design baseline.");
  }
  return steps.slice(0, 6);
}

// ─── Executive narrative builder ──────────────────────────────────────────────
// Generates a meaningful summary paragraph when no stored executiveSummary exists.

function buildExecutiveNarrative(customerName, projectName, fileCount, canonicalFindings, canonicalDecision, scorePct) {
  const open     = (canonicalFindings || []).filter((f) => String(f.status || "").toLowerCase() !== "closed");
  const openCrit = open.filter((f) => String(f.severity || "").toLowerCase() === "critical");
  const openHigh = open.filter((f) => String(f.severity || "").toLowerCase() === "high");

  let s = `${projectName} architecture review assessed ${fileCount} uploaded input${fileCount !== 1 ? "s" : ""} for ${customerName}.`;
  if (scorePct >= 80) {
    s += ` The architecture scored ${scorePct}/100, indicating strong alignment with WAF/CAF requirements.`;
  } else if (scorePct >= 60) {
    s += ` The architecture scored ${scorePct}/100, indicating moderate alignment with WAF/CAF requirements — some areas require attention before full approval.`;
  } else {
    s += ` The architecture scored ${scorePct}/100, indicating significant gaps against WAF/CAF requirements that must be addressed.`;
  }
  if (open.length === 0) {
    s += " No open findings are recorded.";
  } else if (openCrit.length > 0) {
    s += ` ${openCrit.length} Critical finding${openCrit.length !== 1 ? "s" : ""} must be remediated before any approval or deployment.`;
  } else if (openHigh.length > 0) {
    s += ` ${openHigh.length} High severity finding${openHigh.length !== 1 ? "s" : ""} require remediation before unconditional approval.`;
  } else {
    s += ` ${open.length} finding${open.length !== 1 ? "s" : ""} have been identified for remediation.`;
  }
  const { reviewerDecision, governanceWarning } = canonicalDecision;
  if (reviewerDecision === "Approved" && governanceWarning) {
    s += " Note: The reviewer has approved this architecture. Formal risk acceptance is required to align the governance record.";
  } else if (reviewerDecision === "Approved") {
    s += " The architecture has been approved by the reviewer.";
  } else if (reviewerDecision === "Needs Remediation") {
    s += " Remediation is required before this architecture can be approved.";
  }
  return s;
}

// ─── Main normalization entry point ───────────────────────────────────────────

/**
 * Normalizes raw ARB review store data into a canonical ArbReviewOutputPack.
 *
 * ALL exporters must consume this pack. No renderer may independently
 * calculate findings, actions, scores, or decisions.
 *
 * @param {object}  review        Raw ArbReview entity
 * @param {Array}   files         Raw ArbUploadedFile entities
 * @param {Array}   requirements  Raw ArbRequirement entities
 * @param {Array}   evidence      Raw ArbEvidenceFact entities (visual + text merged)
 * @param {Array}   findings      Raw ArbFinding entities
 * @param {Array}   actionsInput  Raw ArbAction entities
 * @param {object}  scorecard     Raw ArbScorecard entity
 * @param {object}  decision      Raw ArbDecision entity
 * @param {string}  [exportFormat] Target format (for metadata)
 * @returns {object} ArbReviewOutputPack
 */
function normalizeReviewForExport(
  review, files, requirements, evidence, findings, actionsInput, scorecard, decision, exportFormat
) {
  const generatedAt = new Date().toISOString();

  // ── Uploaded inputs ──────────────────────────────────────────────────────────
  const uploadedInputs = (files || []).map(mapUploadedInput);

  // ── Evidence readiness ───────────────────────────────────────────────────────
  const evidenceReadiness = deriveEvidenceReadiness(files || []);

  // ── Canonical findings (with deterministic domain classification) ────────────
  const canonicalFindings = (findings || []).map((f) => ({
    findingId:    f.findingId,
    title:        f.title || "",
    description:  f.findingStatement || f.description || "",
    severity:     f.severity || "Medium",
    status:       f.status   || "Open",
    domain:       classifyDomain(
      `${f.title || ""} ${f.findingStatement || ""} ${f.recommendation || ""}`,
      f.domain
    ),
    evidenceGap:  (f.evidenceFound && (Array.isArray(f.evidenceFound) ? f.evidenceFound.length : 0) > 0)
      ? "" : "No evidence linked to this finding",
    impact:       f.findingStatement || f.description || "",
    recommendation: f.recommendation || "",
    source:       f.source    || "agent",
    sourceFiles:  Array.isArray(f.evidenceFound)
      ? f.evidenceFound.map(String)
      : [],
    references:   [],
    confidence:   f.confidence || "Medium",
  }));

  // ── Scorecard ─────────────────────────────────────────────────────────────────
  const canonicalScorecard = calculateScorecard(scorecard);
  const scoreBand          = deriveScoreBand(canonicalScorecard.percentage);

  // ── Governance decision ───────────────────────────────────────────────────────
  const canonicalDecision = deriveGovernanceDecision(canonicalFindings, scorecard, decision);

  // ── Risk register ─────────────────────────────────────────────────────────────
  const riskRegister = deriveRiskRegister(canonicalFindings);

  // ── Remediation actions ───────────────────────────────────────────────────────
  const remediationActions = generateRemediationActions(
    canonicalFindings, actionsInput || [], review?.createdAt
  );

  // ── Requirements (filtered — no headings, no empty bullets) ──────────────────
  const canonicalRequirements = (requirements || [])
    .filter((r) => isActionableRequirement(r.normalizedText || r.text || ""))
    .map((r) => ({
      requirementId: r.requirementId,
      text:          r.normalizedText || r.text || "",
      domain:        classifyDomain(r.normalizedText || "", r.category),
      priority:      r.criticality || "Medium",
      sourceFile:    r.sourceFileName || "",
      sourceType:    mapSourceType(r.logicalCategory || r.sourceType),
      evidenceStatus:r.reviewerStatus || "Partially Evidenced",
    }));

  // ── Evidence ──────────────────────────────────────────────────────────────────
  const canonicalEvidence = (evidence || []).map((e) => ({
    evidenceId:            e.evidenceId || e.visualEvidenceId || "",
    evidenceType:          classifyEvidenceType(e.factType),
    text:                  e.summary || e.sourceExcerpt || "",
    sourceFile:            e.sourceFileName || "",
    sourcePage:            e.sourcePage || null,
    confidence:            e.confidence || "Medium",
    provesImplementation:  isImplementationEvidence(e.factType),
    linkedRequirementIds:  e.linkedRequirementIds || [],
    linkedFindingIds:      e.linkedFindingIds || [],
  }));

  // ── Traceability ──────────────────────────────────────────────────────────────
  const traceability = buildTraceability(
    canonicalRequirements, canonicalEvidence, canonicalFindings, remediationActions
  );

  // ── Recommendation (canonical) ────────────────────────────────────────────────
  const recommendation = normalizeRecommendation(
    scorecard?.recommendation, canonicalDecision.governancePosture
  );

  // ── SOW traceability (for PPTX backward compat) ───────────────────────────────
  const sowFiles   = (files || []).filter((f) => (f.logicalCategory || "").toLowerCase() === "sow");
  const sowFileIds = new Set(sowFiles.map((f) => f.fileId));
  const sowReqs    = (requirements || []).filter((r) => sowFileIds.has(r.sourceFileId)).slice(0, 12);
  const sowTraceability = sowReqs.length > 0
    ? sowReqs.map((r) => ({
        area:           classifyDomain(r.normalizedText || r.text || "", r.category) || "Architecture",
        sowRef:         (r.normalizedText || r.text || r.sourceFileName || "").slice(0, 90),
        evidenceSource: r.sourceFileName || "SOW",
        status:         "In scope",
      }))
    : sowFiles.slice(0, 12).map((f) => ({
        area:           "Scope",
        sowRef:         f.fileName,
        evidenceSource: f.fileName,
        status:         "In scope",
      }));

  // ── Build the pack (warnings computed after pack is assembled) ────────────────
  const pack = {
    metadata: {
      reviewId:       review?.reviewId || "unknown",
      reviewTitle:    `${review?.projectName || "Architecture Review"} — ARB Review Report`,
      generatedAt,
      generatedBy:    "CARI — Cloud Architecture Review Intelligence",
      toolName:       "CARI",
      toolVersion:    "2.0",
      confidentiality:"Confidential",
      exportFormat:   exportFormat || "unknown",
    },
    customer: {
      name:         review?.projectMeta?.customerName || review?.customerName || "Unknown Customer",
      businessUnit: review?.projectMeta?.businessUnit || null,
      industry:     review?.projectMeta?.industry     || null,
      region:       review?.projectMeta?.region       || null,
    },
    project: {
      name:          review?.projectMeta?.projectName || review?.projectName || review?.reviewName || "Unknown Project",
      category:      review?.projectCategory          || null,
      cloudProvider: "Azure",
      primaryRegion: review?.projectMeta?.primaryRegion || null,
      drRegion:      review?.projectMeta?.drRegion      || null,
      workloadType:  review?.projectMeta?.workloadType  || null,
      environment:   review?.projectMeta?.environment   || "Production",
    },
    workflow: {
      currentState: review?.workflowState       || "Draft",
      stateReason:  review?.workflowStateReason || null,
    },
    uploadedInputs,
    evidenceReadiness,
    executiveSummary: {
      overallScore:      canonicalScorecard.percentage,
      scoreBand,
      recommendation,
      summaryNarrative:  review?.executiveSummary || scorecard?.executiveSummary || "",
      topStrengths:      [],
      topRisks:          canonicalFindings
        .filter((f) => ["Critical", "High"].includes(f.severity) && f.status !== "Closed")
        .slice(0, 5).map((f) => f.title),
      keyGaps:           canonicalFindings
        .filter((f) => f.status === "Open" || f.status === "In Progress")
        .slice(0, 5).map((f) => f.title),
      nextBestActions:   remediationActions
        .filter((a) => a.status === "Open")
        .slice(0, 5).map((a) => a.title),
    },
    scope: {
      inScope:          (review?.inScope    || []).map((s) => ({ itemId: s, description: s, evidenced: false })),
      outOfScope:       (review?.outOfScope || []).map((s) => ({ itemId: s, description: s })),
      unknownScopeItems:[],
      sourceReferences: sowFiles.map((f) => f.fileName),
    },
    assumptions: (requirements || [])
      .filter((r) => r.category === "assumption")
      .map((r) => ({ text: r.normalizedText || "" })),
    dependencies: [],
    constraints:  [],
    scorecard:    canonicalScorecard,
    findings:     canonicalFindings,
    riskRegister,
    remediationActions,
    decision:     canonicalDecision,
    approvalConditions: [],
    riskAcceptances:    [],
    requirements:  canonicalRequirements,
    evidence:      canonicalEvidence,
    traceability,
    exportWarnings: [],  // populated below
    appendices:     [],

    // ── PPTX backward-compat fields (used by slide builders) ──────────────────
    _pptx: {
      reviewId:             review?.reviewId ?? "unknown",
      customerName:         review?.projectMeta?.customerName || review?.customerName || "",
      projectName:          review?.projectMeta?.projectName  || review?.projectName  || review?.reviewName || "",
      projectCategory:      review?.projectCategory ?? "",
      reviewDate:           review?.createdAt
        ? new Date(review.createdAt).toLocaleDateString("en-GB")
        : new Date().toLocaleDateString("en-GB"),
      status:               review?.status ?? "Review Complete",
      overallScore:         canonicalScorecard.totalScore,
      recommendation:       recommendation,
      executiveSummary:     review?.executiveSummary || scorecard?.executiveSummary ||
        buildExecutiveNarrative(
          review?.projectMeta?.customerName || review?.customerName || "the customer",
          review?.projectMeta?.projectName  || review?.projectName  || "this project",
          (files || []).length,
          canonicalFindings,
          canonicalDecision,
          canonicalScorecard.percentage,
        ),
      fileCount:            (files    || []).length,
      findingCount:         canonicalFindings.length,
      criticalBlockerCount: scorecard?.criticalBlockers
        ?? canonicalFindings.filter((f) => f.severity === "Critical" && f.status !== "Closed").length,
      actionCount:          remediationActions.length,
      domainScores:         canonicalScorecard.domains.map((d) => {
        const openForDomain = canonicalFindings.filter(
          (f) => f.domain === d.domain &&
                 String(f.status || "").toLowerCase() !== "closed"
        );
        const reason = openForDomain.length > 0
          ? `${openForDomain.length} active finding${openForDomain.length !== 1 ? "s" : ""} currently influence this domain.`
          : (d.rationale && !/\d+\s+active\s+finding/i.test(d.rationale))
            ? d.rationale
            : "No active blockers. Domain remains capped below full score until reviewer sign-off confirms control evidence.";
        return {
          domain:     d.domain,
          score:      d.score,
          maxScore:   d.maxScore,
          percentage: d.percentage,
          reason,
        };
      }),
      findings: canonicalFindings.map((f) => ({
        title:            f.title,
        severity:         f.severity,
        domain:           f.domain,
        findingStatement: f.description,
        recommendation:   f.recommendation,
        owner:            f.owner || "Unassigned",
        dueDate:          null,
        status:           f.status,
        criticalBlocker:  f.severity === "Critical",
      })),
      actions: remediationActions.map((a) => ({
        actionSummary: a.title,
        status:        a.status,
        owner:         a.owner,
        dueDate:       a.dueDate,
        severity:      a.severity,
      })),
      decision:      { ...canonicalDecision, aiRecommendation: recommendation },
      sowTraceability,
      inScope: (review?.inScope || []).length > 0
        ? review.inScope
        : [...new Set(sowReqs.map((r) =>
            classifyDomain(r.normalizedText || r.text || "", r.category) || "Architecture"
          ))],
      outOfScope:    review?.outOfScope ?? [],
      assumptions:   (requirements || [])
        .filter((r) => r.category === "assumption")
        .map((r) => r.normalizedText ?? r.sourceText ?? ""),
      nextSteps:     buildStateAwareNextSteps(canonicalDecision, canonicalFindings, files),
    },
  };

  // ── Export warnings (computed last, needs full pack) ──────────────────────────
  pack.exportWarnings = collectExportWarnings(pack);

  // ── Validation gate ───────────────────────────────────────────────────────────
  // Hard errors surface as error-severity export warnings rather than throwing,
  // so draft/partial reviews can still generate a document with visible callouts.
  const { errors, warnings: valWarnings } = validateArbReviewOutputPack(pack);
  for (const msg of errors) {
    pack.exportWarnings.push({ warningId: "VALIDATION_ERROR", severity: "error",   message: msg, affectedSections: ["all"] });
  }
  for (const msg of valWarnings) {
    pack.exportWarnings.push({ warningId: "VALIDATION_WARN",  severity: "warning", message: msg, affectedSections: ["all"] });
  }

  return pack;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  normalizeReviewForExport,
  classifyDomain,
  isActionableRequirement,
  deriveEvidenceReadiness,
  deriveGovernanceDecision,
  deriveRiskRegister,
  generateRemediationActions,
  calculateScorecard,
  deriveScoreBand,
  buildTraceability,
  collectExportWarnings,
  resolveTemplatePath,
  normalizeExtractionStatus,
  canonicalizeDecision,
  deriveDueStatus,
  normalizeOwner,
  TEMPLATE_CANDIDATES,
};
