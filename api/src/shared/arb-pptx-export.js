/**
 * arb-pptx-export.js
 *
 * Generates an executive-ready PowerPoint deck for an ARB review using the
 * Rackspace corporate colour scheme and Arial typography.
 *
 * Rackspace theme (extracted from Rackspace Presentation Template.pptx):
 *   Primary Red  #EB0000   Accent Blue  #0059C8
 *   Teal         #00BEBC   Purple       #95008A
 *   Light Grey   #E6E6E6   Dark         #000000
 *   Font: Arial (major + minor)
 *
 * Requires: pptxgenjs
 */

"use strict";

const PptxGenJS = require("pptxgenjs");

// ─── Rackspace brand tokens ──────────────────────────────────────────────────
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

const SEVERITY_COLOUR = {
  Critical: "EB0000",
  High:     "C85000",
  Medium:   "F0A500",
  Low:      "0059C8",
};

const SCORE_COLOUR = (score) => {
  if (score >= 80) return "00BEBC";  // teal — good
  if (score >= 60) return "F0A500";  // amber — needs attention
  return "EB0000";                   // red — critical
};

// ─── Layout helpers ──────────────────────────────────────────────────────────

function slide(pptx, layout = "LAYOUT_WIDE") {
  return pptx.addSlide({ masterName: layout });
}

function addHeader(s, title, subtitle) {
  // Red header band
  s.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: "100%", h: 1.1,
    fill: { color: BRAND.red },
    line: { color: BRAND.red },
  });
  s.addText(title, {
    x: 0.3, y: 0.1, w: 9.4, h: 0.65,
    fontSize: 24, bold: true,
    color: BRAND.white, fontFace: BRAND.font,
  });
  if (subtitle) {
    s.addText(subtitle, {
      x: 0.3, y: 0.72, w: 9.4, h: 0.35,
      fontSize: 11, color: BRAND.white, fontFace: BRAND.font,
    });
  }
}

function addFooter(s, reviewId) {
  s.addShape(pptx.ShapeType.rect, {
    x: 0, y: 7.0, w: "100%", h: 0.3,
    fill: { color: BRAND.lightGrey },
    line: { color: BRAND.lightGrey },
  });
  s.addText(`CARI Architecture Review  |  Review ID: ${reviewId}  |  CONFIDENTIAL`, {
    x: 0.3, y: 7.02, w: 9.4, h: 0.25,
    fontSize: 8, color: BRAND.midGrey, fontFace: BRAND.font,
  });
}

function pctBar(s, x, y, w, h, pct, label, color = BRAND.blue) {
  const barW = Math.max(0.02, (pct / 100) * w);
  s.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: BRAND.lightGrey }, line: { color: BRAND.lightGrey } });
  s.addShape(pptx.ShapeType.rect, { x, y, w: barW, h, fill: { color }, line: { color } });
  s.addText(`${label}  ${pct}%`, { x: x + 0.05, y: y + 0.02, w: w, h: h - 0.04, fontSize: 8, color: BRAND.white, fontFace: BRAND.font, bold: true });
}

// ─── Slide builders ──────────────────────────────────────────────────────────

let pptx; // module-level ref needed by addHeader helper

function buildCoverSlide(p, data) {
  const s = p.addSlide();
  // Full red background
  s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: "100%", h: "100%", fill: { color: BRAND.red }, line: { color: BRAND.red } });
  // White Rackspace wordmark strip
  s.addShape(p.ShapeType.rect, { x: 0, y: 5.8, w: "100%", h: 1.5, fill: { color: BRAND.white }, line: { color: BRAND.white } });
  // Title
  s.addText("Architecture Review Report", {
    x: 0.5, y: 1.2, w: 9, h: 0.8,
    fontSize: 32, bold: true, color: BRAND.white, fontFace: BRAND.font,
  });
  s.addText(data.customerName || "Customer", {
    x: 0.5, y: 2.1, w: 9, h: 0.55,
    fontSize: 22, color: BRAND.white, fontFace: BRAND.font,
  });
  s.addText(data.projectName || "", {
    x: 0.5, y: 2.7, w: 9, h: 0.45,
    fontSize: 16, color: BRAND.white, fontFace: BRAND.font,
  });
  // Category pill
  const cat = data.projectCategory || "Architecture Review";
  s.addText(cat, {
    x: 0.5, y: 3.3, w: 3, h: 0.38,
    fontSize: 12, bold: true, color: BRAND.white, fontFace: BRAND.font,
    fill: { color: BRAND.blue }, align: "center",
  });
  // Date / status
  s.addText(`${data.reviewDate || ""}  ·  ${data.status || ""}`, {
    x: 0.5, y: 3.85, w: 9, h: 0.3,
    fontSize: 11, color: BRAND.white, fontFace: BRAND.font,
  });
  // Bottom strip text
  s.addText("CONFIDENTIAL  ·  Architecture Review Intelligence (CARI)  ·  Human-reviewed findings", {
    x: 0.5, y: 6.0, w: 9, h: 0.25,
    fontSize: 9, color: BRAND.midGrey, fontFace: BRAND.font,
  });
  s.addText("Rackspace Technology", {
    x: 0.5, y: 6.3, w: 9, h: 0.35,
    fontSize: 14, bold: true, color: BRAND.red, fontFace: BRAND.font,
  });
}

function buildExecutiveSummarySlide(p, data) {
  const s = p.addSlide();
  addHeader(s, "Executive Summary", data.projectCategory);
  addFooter(s, data.reviewId);

  const score = data.overallScore ?? 0;
  const rec = data.recommendation || "Pending";
  const recColor = rec === "Recommended for Approval" ? BRAND.teal : rec === "Needs Revision" ? "C85000" : BRAND.red;

  // Score circle (text approximation)
  s.addShape(p.ShapeType.ellipse, { x: 7.8, y: 1.3, w: 1.6, h: 1.6, fill: { color: SCORE_COLOUR(score) }, line: { color: SCORE_COLOUR(score) } });
  s.addText(`${score}`, { x: 7.8, y: 1.75, w: 1.6, h: 0.7, fontSize: 32, bold: true, color: BRAND.white, fontFace: BRAND.font, align: "center" });
  s.addText("Overall Score", { x: 7.6, y: 2.8, w: 2, h: 0.25, fontSize: 8, color: BRAND.midGrey, fontFace: BRAND.font, align: "center" });

  // Recommendation badge
  s.addText(rec, {
    x: 0.3, y: 1.3, w: 4.5, h: 0.4,
    fontSize: 13, bold: true, color: BRAND.white, fontFace: BRAND.font,
    fill: { color: recColor }, align: "center",
  });

  // Stats row
  const stats = [
    ["Files Reviewed", String(data.fileCount ?? 0)],
    ["Findings", String(data.findingCount ?? 0)],
    ["Critical Blockers", String(data.criticalBlockerCount ?? 0)],
    ["Actions", String(data.actionCount ?? 0)],
  ];
  stats.forEach(([label, val], i) => {
    const x = 0.3 + i * 1.8;
    s.addShape(p.ShapeType.rect, { x, y: 1.85, w: 1.6, h: 0.8, fill: { color: BRAND.lightGrey }, line: { color: BRAND.lightGrey } });
    s.addText(val, { x, y: 1.9, w: 1.6, h: 0.4, fontSize: 22, bold: true, color: BRAND.red, fontFace: BRAND.font, align: "center" });
    s.addText(label, { x, y: 2.3, w: 1.6, h: 0.25, fontSize: 8, color: BRAND.midGrey, fontFace: BRAND.font, align: "center" });
  });

  // Summary text
  const summaryText = (data.executiveSummary || "Assessment complete. Review findings and remediation actions below.").slice(0, 800);
  s.addText(summaryText, {
    x: 0.3, y: 2.85, w: 9.4, h: 2.5,
    fontSize: 10, color: BRAND.darkGrey, fontFace: BRAND.font,
    wrap: true,
  });

  // Human sign-off note
  s.addText("⚠  These are AI-assisted findings. Final decisions require human reviewer sign-off.", {
    x: 0.3, y: 6.55, w: 9.4, h: 0.3,
    fontSize: 8, italic: true, color: BRAND.midGrey, fontFace: BRAND.font,
  });
}

function buildAssessmentScopeSlide(p, data) {
  const s = p.addSlide();
  addHeader(s, "Assessment Scope", "Derived from uploaded SOW and project category");
  addFooter(s, data.reviewId);

  const rows = [
    ["Project Category", data.projectCategory || "Not specified"],
    ["Customer", data.customerName || "Not specified"],
    ["Project", data.projectName || "Not specified"],
    ["In-Scope Areas", (data.inScope || []).join(", ") || "See uploaded SOW"],
    ["Out-of-Scope", (data.outOfScope || []).join(", ") || "See uploaded SOW"],
    ["Assumptions", (data.assumptions || []).slice(0, 3).join("; ") || "Not provided"],
  ];

  rows.forEach(([label, value], i) => {
    const y = 1.25 + i * 0.85;
    s.addShape(p.ShapeType.rect, { x: 0.3, y, w: 2.2, h: 0.65, fill: { color: BRAND.red }, line: { color: BRAND.red } });
    s.addText(label, { x: 0.35, y: y + 0.1, w: 2.1, h: 0.45, fontSize: 10, bold: true, color: BRAND.white, fontFace: BRAND.font });
    s.addShape(p.ShapeType.rect, { x: 2.55, y, w: 7.1, h: 0.65, fill: { color: BRAND.lightGrey }, line: { color: BRAND.lightGrey } });
    s.addText(value, { x: 2.65, y: y + 0.1, w: 6.9, h: 0.45, fontSize: 9.5, color: BRAND.darkGrey, fontFace: BRAND.font, wrap: true });
  });
}

function buildScorecardSlide(p, data) {
  const s = p.addSlide();
  addHeader(s, "Scorecard", "WAF / CAF domain alignment");
  addFooter(s, data.reviewId);

  const domains = data.domainScores || [];
  if (domains.length === 0) {
    s.addText("No domain scores available.", { x: 0.3, y: 2, w: 9.4, h: 0.4, fontSize: 12, color: BRAND.midGrey, fontFace: BRAND.font });
    return;
  }

  domains.slice(0, 6).forEach((d, i) => {
    const y = 1.25 + i * 0.9;
    const score = Math.round(d.score ?? 0);
    s.addText(d.domain || d.name || `Domain ${i + 1}`, {
      x: 0.3, y: y + 0.05, w: 2.8, h: 0.5,
      fontSize: 10, fontFace: BRAND.font, color: BRAND.darkGrey,
    });
    pctBar(s, 3.3, y + 0.12, 5.5, 0.35, score, "", SCORE_COLOUR(score));
    s.addText(String(score), {
      x: 9.0, y: y + 0.05, w: 0.7, h: 0.5,
      fontSize: 13, bold: true, color: SCORE_COLOUR(score), fontFace: BRAND.font, align: "right",
    });
    if (d.reason) {
      s.addText(d.reason.slice(0, 200), {
        x: 0.3, y: y + 0.52, w: 9.4, h: 0.32,
        fontSize: 7.5, color: BRAND.midGrey, fontFace: BRAND.font, italic: true, wrap: true,
      });
    }
  });
}

function buildFindingsSlide(p, data, pageIndex) {
  const s = p.addSlide();
  const total = data.totalFindingPages || 1;
  addHeader(s, `Key Findings`, `Page ${pageIndex + 1} of ${total}`);
  addFooter(s, data.reviewId);

  const findings = data.findings || [];
  const startIdx = pageIndex * 4;
  const batch = findings.slice(startIdx, startIdx + 4);

  if (batch.length === 0) {
    s.addText("No findings recorded.", { x: 0.3, y: 2, w: 9.4, h: 0.4, fontSize: 12, color: BRAND.midGrey, fontFace: BRAND.font });
    return;
  }

  batch.forEach((f, i) => {
    const y = 1.2 + i * 1.35;
    const sevColor = SEVERITY_COLOUR[f.severity] || BRAND.midGrey;
    // Severity pill
    s.addShape(p.ShapeType.rect, { x: 0.3, y, w: 1.0, h: 0.28, fill: { color: sevColor }, line: { color: sevColor } });
    s.addText(f.severity || "Info", { x: 0.3, y: y + 0.03, w: 1.0, h: 0.22, fontSize: 8, bold: true, color: BRAND.white, fontFace: BRAND.font, align: "center" });
    // Title
    s.addText(f.title || "Untitled finding", { x: 1.4, y, w: 8.2, h: 0.3, fontSize: 10, bold: true, color: BRAND.darkGrey, fontFace: BRAND.font });
    // Statement
    s.addText((f.findingStatement || "").slice(0, 200), { x: 0.3, y: y + 0.32, w: 9.4, h: 0.48, fontSize: 8.5, color: BRAND.darkGrey, fontFace: BRAND.font, wrap: true });
    // Recommendation
    s.addText(`→  ${(f.recommendation || "").slice(0, 180)}`, { x: 0.3, y: y + 0.82, w: 9.4, h: 0.38, fontSize: 8, color: BRAND.blue, fontFace: BRAND.font, italic: true, wrap: true });
    // Divider
    if (i < batch.length - 1) {
      s.addShape(p.ShapeType.line, { x: 0.3, y: y + 1.28, w: 9.4, h: 0, line: { color: BRAND.lightGrey, width: 0.5 } });
    }
  });
}

function buildRiskRegisterSlide(p, data) {
  const s = p.addSlide();
  addHeader(s, "Risk Register", "Open findings requiring remediation");
  addFooter(s, data.reviewId);

  const findings = (data.findings || []).filter((f) => f.status !== "Closed").slice(0, 10);

  if (findings.length === 0) {
    s.addShape(p.ShapeType.rect, { x: 0.3, y: 2.2, w: 9.4, h: 0.7, fill: { color: BRAND.lightGrey }, line: { color: BRAND.lightGrey } });
    s.addText("No open risk items. All findings are closed or no findings have been recorded.", {
      x: 0.5, y: 2.35, w: 9.0, h: 0.4, fontSize: 11, color: BRAND.midGrey, fontFace: BRAND.font, italic: true,
    });
    return;
  }

  const headers = ["#", "Severity", "Domain", "Title", "Owner", "Due Date", "Status"];
  const colWidths = [0.35, 0.9, 1.1, 3.8, 1.3, 1.0, 0.95];

  const tableData = [
    headers.map((h) => ({ text: h, options: { bold: true, color: BRAND.white, fill: { color: BRAND.red }, fontSize: 8, fontFace: BRAND.font } })),
    ...findings.map((f, i) => [
      { text: String(i + 1) },
      { text: f.severity || "?", options: { color: SEVERITY_COLOUR[f.severity] || BRAND.midGrey, bold: true } },
      { text: f.domain || "" },
      { text: (f.title || "").slice(0, 60) },
      { text: f.owner || "TBC" },
      { text: f.dueDate ? new Date(f.dueDate).toLocaleDateString("en-GB") : "TBC" },
      { text: f.status || "Open" },
    ].map((cell) => typeof cell === "string" ? { text: cell } : cell)),
  ];

  s.addTable(tableData, {
    x: 0.3, y: 1.25, w: 9.4,
    rowH: 0.3,
    fontSize: 8,
    fontFace: BRAND.font,
    color: BRAND.darkGrey,
    border: { type: "solid", pt: 0.3, color: BRAND.lightGrey },
    colW: colWidths,
  });
}

function buildRemediationActionsSlide(p, data) {
  const s = p.addSlide();
  addHeader(s, "Remediation Actions", "Tracked actions from review findings");
  addFooter(s, data.reviewId);

  const actions = (data.actions || []).filter((a) => a.status !== "Closed").slice(0, 8);

  if (actions.length === 0) {
    s.addText("No open remediation actions.", { x: 0.3, y: 2, w: 9.4, h: 0.4, fontSize: 12, color: BRAND.midGrey, fontFace: BRAND.font });
    return;
  }

  actions.forEach((a, i) => {
    const y = 1.25 + i * 0.65;
    const statusColor = a.status === "In Progress" ? BRAND.blue : a.status === "Closed" ? BRAND.teal : BRAND.red;
    s.addShape(p.ShapeType.rect, { x: 0.3, y, w: 0.85, h: 0.22, fill: { color: statusColor }, line: { color: statusColor } });
    s.addText(a.status || "Open", { x: 0.3, y: y + 0.02, w: 0.85, h: 0.18, fontSize: 7, bold: true, color: BRAND.white, fontFace: BRAND.font, align: "center" });
    s.addText(a.actionSummary || "Action summary not provided", { x: 1.25, y, w: 5.8, h: 0.28, fontSize: 9, color: BRAND.darkGrey, fontFace: BRAND.font });
    s.addText(`Owner: ${a.owner || "TBC"}  ·  Due: ${a.dueDate ? new Date(a.dueDate).toLocaleDateString("en-GB") : "TBC"}`, { x: 1.25, y: y + 0.3, w: 5.8, h: 0.22, fontSize: 7.5, color: BRAND.midGrey, fontFace: BRAND.font });
    const sev = a.severity || "";
    if (sev) {
      s.addShape(p.ShapeType.rect, { x: 7.2, y, w: 0.8, h: 0.22, fill: { color: SEVERITY_COLOUR[sev] || BRAND.midGrey }, line: { color: SEVERITY_COLOUR[sev] || BRAND.midGrey } });
      s.addText(sev, { x: 7.2, y: y + 0.02, w: 0.8, h: 0.18, fontSize: 7, color: BRAND.white, bold: true, fontFace: BRAND.font, align: "center" });
    }
    if (i < actions.length - 1) {
      s.addShape(p.ShapeType.line, { x: 0.3, y: y + 0.58, w: 9.4, h: 0, line: { color: BRAND.lightGrey, width: 0.5 } });
    }
  });
}

function buildDecisionSlide(p, data) {
  const s = p.addSlide();
  addHeader(s, "Architecture Decision", "Reviewer sign-off and governance record");
  addFooter(s, data.reviewId);

  const decision = data.decision || {};
  const fields = [
    ["AI Recommendation", decision.aiRecommendation || "Pending"],
    ["Reviewer Decision", decision.reviewerDecision || "Pending"],
    ["Reviewer", decision.reviewerName || "Not recorded"],
    ["Role", decision.reviewerRole || ""],
    ["Date", decision.recordedAt ? new Date(decision.recordedAt).toLocaleDateString("en-GB") : "Not recorded"],
    ["Rationale", (decision.rationale || "Not provided").slice(0, 300)],
  ];

  fields.forEach(([label, value], i) => {
    const y = 1.3 + i * 0.85;
    s.addShape(p.ShapeType.rect, { x: 0.3, y, w: 2.2, h: 0.65, fill: { color: BRAND.darkGrey }, line: { color: BRAND.darkGrey } });
    s.addText(label, { x: 0.35, y: y + 0.1, w: 2.1, h: 0.45, fontSize: 9.5, bold: true, color: BRAND.white, fontFace: BRAND.font });
    s.addShape(p.ShapeType.rect, { x: 2.6, y, w: 7.0, h: 0.65, fill: { color: BRAND.lightGrey }, line: { color: BRAND.lightGrey } });
    s.addText(value, { x: 2.7, y: y + 0.1, w: 6.8, h: 0.45, fontSize: 9.5, color: BRAND.darkGrey, fontFace: BRAND.font, wrap: true });
  });
}

function buildSowTraceabilitySlide(p, data) {
  const s = p.addSlide();
  addHeader(s, "SOW Traceability", "Evidence mapped to SOW scope and deliverables");
  addFooter(s, data.reviewId);

  const rows = data.sowTraceability || [];
  if (rows.length === 0) {
    s.addText("No SOW traceability data available. Upload a SOW document to enable this section.", {
      x: 0.3, y: 2.5, w: 9.4, h: 0.5, fontSize: 11, color: BRAND.midGrey, fontFace: BRAND.font, italic: true,
    });
    return;
  }

  const headers = ["Assessment Area", "SOW Reference", "Evidence Source", "Status"];
  const colWidths = [2.5, 2.2, 2.8, 1.9];

  const tableData = [
    headers.map((h) => ({ text: h, options: { bold: true, color: BRAND.white, fill: { color: BRAND.blue }, fontSize: 8.5, fontFace: BRAND.font } })),
    ...rows.slice(0, 10).map((r) => [
      { text: r.area || "" },
      { text: r.sowRef || "—" },
      { text: r.evidenceSource || "—" },
      { text: r.status || "—", options: { color: r.status === "In scope" ? BRAND.teal : BRAND.midGrey } },
    ]),
  ];

  s.addTable(tableData, {
    x: 0.3, y: 1.25, w: 9.4,
    rowH: 0.32,
    fontSize: 8.5,
    fontFace: BRAND.font,
    color: BRAND.darkGrey,
    border: { type: "solid", pt: 0.3, color: BRAND.lightGrey },
    colW: colWidths,
  });
}

const CATEGORY_NEXT_STEPS = {
  "landing-zone": [
    "Validate management group hierarchy and subscription design against ALZ reference architecture.",
    "Review Policy assignments and confirm compliance with organisational guardrails.",
    "Confirm hub-and-spoke network topology: Azure Firewall, Private DNS Resolver, peering.",
    "Verify Managed Identity is used for all platform service-to-service authentication.",
    "Obtain formal Landing Zone design sign-off from the Cloud Platform team.",
    "Schedule a 30-day post-deployment health review with operations.",
  ],
  "cloud-readiness": [
    "Complete Azure Migrate discovery for all in-scope workloads and export the readiness report.",
    "Resolve all blockers identified in the Cloud Readiness Assessment before migration begins.",
    "Define and agree the target landing zone design based on readiness findings.",
    "Produce a cost estimate and TCO model for board approval.",
    "Confirm operating model: cloud-native, hybrid, or managed service.",
    "Schedule a readiness gate review before migration wave planning starts.",
  ],
  "well-architected-review": [
    "Prioritise Critical and High severity WAF findings for immediate remediation.",
    "Assign owners and due dates for all open remediation actions.",
    "Re-run the Well-Architected Assessment after critical items are resolved to track improvement.",
    "Update the architecture decision log with reviewer sign-off on accepted risk items.",
    "Share the findings register with the customer architecture team for action tracking.",
    "Schedule a follow-up WAR in 90 days to validate remediation progress.",
  ],
  "migration-readiness": [
    "Resolve all migration blockers identified in the readiness assessment before wave 1.",
    "Confirm wave plan and dependency mapping with the customer workload owners.",
    "Validate landing zone readiness: networking, identity, and policy must be green.",
    "Complete Azure Migrate agent deployment and dependency visualisation.",
    "Agree cutover windows and rollback criteria with the customer operations team.",
    "Obtain migration readiness sign-off from the delivery architect.",
  ],
  "migration": [
    "Execute wave 1 migration per the agreed cutover plan with rollback criteria confirmed.",
    "Validate all migrated workloads against acceptance criteria before decommission.",
    "Run post-migration health checks: performance, connectivity, backup, and monitoring.",
    "Decommission source workloads only after customer sign-off on validation.",
    "Hand over operational runbooks and monitoring dashboards to the operations team.",
    "Conduct a hypercare review 30 days post-migration.",
  ],
  "presales-poc": [
    "Validate POC success criteria with the customer stakeholder before proceeding.",
    "Document assumptions and risks identified during the POC for the SOW.",
    "Produce an effort and cost estimate based on POC findings.",
    "Confirm technical feasibility sign-off before commercial proposal.",
    "Identify any mandatory pre-requisites the customer must complete before engagement starts.",
    "Schedule a technical win review with the sales and architecture team.",
  ],
};

const DEFAULT_NEXT_STEPS = [
  "Review and validate all open findings with the architecture team.",
  "Assign owners and due dates for all Critical and High severity remediation actions.",
  "Obtain formal sign-off on the Architecture Decision record.",
  "Upload a SOW to enable scope traceability and acceptance criteria tracking.",
  "Re-submit for review after critical blockers are resolved.",
  "Schedule a follow-up review to validate remediation progress.",
];

function buildNextStepsSlide(p, data) {
  const s = p.addSlide();
  addHeader(s, "Recommended Next Steps", data.projectCategory || "");
  addFooter(s, data.reviewId);

  const categoryKey = (data.projectCategory || "").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const steps = (data.nextSteps && data.nextSteps.length > 0)
    ? data.nextSteps
    : (CATEGORY_NEXT_STEPS[categoryKey] || DEFAULT_NEXT_STEPS);

  steps.slice(0, 6).forEach((step, i) => {
    const y = 1.4 + i * 0.85;
    s.addShape(p.ShapeType.ellipse, { x: 0.3, y: y + 0.07, w: 0.4, h: 0.4, fill: { color: BRAND.red }, line: { color: BRAND.red } });
    s.addText(String(i + 1), { x: 0.3, y: y + 0.1, w: 0.4, h: 0.35, fontSize: 12, bold: true, color: BRAND.white, fontFace: BRAND.font, align: "center" });
    s.addText(step, { x: 0.85, y: y + 0.08, w: 8.8, h: 0.45, fontSize: 10, color: BRAND.darkGrey, fontFace: BRAND.font });
  });

  // Disclaimer
  s.addShape(p.ShapeType.rect, { x: 0.3, y: 6.5, w: 9.4, h: 0.35, fill: { color: BRAND.lightGrey }, line: { color: BRAND.lightGrey } });
  s.addText("Findings are AI-assisted and evidence-linked. Final architecture decisions remain with authorised human reviewers.", {
    x: 0.4, y: 6.55, w: 9.2, h: 0.25, fontSize: 8, italic: true, color: BRAND.midGrey, fontFace: BRAND.font,
  });
}

// ─── Main export function ─────────────────────────────────────────────────────

/**
 * Generates a PowerPoint deck from ARB review data.
 *
 * @param {object} reviewData  Shaped review payload (see getReviewDataForPptx)
 * @returns {Promise<Buffer>}  PPTX binary buffer
 */
async function generateArbPptx(reviewData) {
  pptx = new PptxGenJS();

  pptx.layout = "LAYOUT_WIDE";  // 13.33" × 7.5"
  pptx.author = "CARI — Cloud Architecture Review Intelligence";
  pptx.company = "Rackspace Technology";
  pptx.subject = "Architecture Review Report";
  pptx.title = `${reviewData.projectName || "Architecture Review"} — Review Report`;
  pptx.revision = "1";

  // Define theme
  pptx.defineLayout({ name: "LAYOUT_WIDE", width: 10, height: 7.5 });

  const findings = reviewData.findings || [];
  const findingPageCount = Math.max(1, Math.ceil(findings.length / 4));

  // Slide 1: Cover
  buildCoverSlide(pptx, reviewData);

  // Slide 2: Executive Summary
  buildExecutiveSummarySlide(pptx, reviewData);

  // Slide 3: Assessment Scope (SOW-driven)
  buildAssessmentScopeSlide(pptx, reviewData);

  // Slide 4: Scorecard
  buildScorecardSlide(pptx, reviewData);

  // Slides 5+: Findings (max 5 pages = 20 findings displayed)
  const maxFindingPages = Math.min(findingPageCount, 5);
  for (let i = 0; i < maxFindingPages; i++) {
    buildFindingsSlide(pptx, { ...reviewData, totalFindingPages: maxFindingPages }, i);
  }

  // Risk Register
  buildRiskRegisterSlide(pptx, reviewData);

  // Remediation Actions
  buildRemediationActionsSlide(pptx, reviewData);

  // Decision Log
  buildDecisionSlide(pptx, reviewData);

  // SOW Traceability
  buildSowTraceabilitySlide(pptx, reviewData);

  // Next Steps
  buildNextStepsSlide(pptx, reviewData);

  // Return as Buffer
  const result = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.isBuffer(result) ? result : Buffer.from(result);
}

/**
 * Shapes the raw ARB review store data into the flat payload expected by generateArbPptx.
 */
function shapeReviewDataForPptx(review, files, requirements, evidence, findings, actions, scorecard, decision) {
  const projectMeta = review?.projectMeta ?? {};
  const overallScore = scorecard?.overallScore ?? 0;
  const domainScores = (scorecard?.domainScores ?? []).map((d) => ({
    domain: d.domain ?? d.name ?? "",
    score: Math.round(d.score ?? d.weight ?? 0),
    reason: d.reason ?? "",
  }));

  // Build SOW traceability from evidence tagged as sow
  const sowEvidence = (evidence || []).filter((e) => e.category === "sow" || e.logicalCategory === "sow");
  const sowTraceability = sowEvidence.slice(0, 10).map((e) => ({
    area: e.domain || e.factType || "Architecture",
    sowRef: e.sourceFile ? `${e.sourceFile} §${e.sourceChunk ?? ""}` : "—",
    evidenceSource: e.sourceFile || "—",
    status: "In scope",
  }));

  return {
    reviewId: review?.reviewId ?? "unknown",
    customerName: projectMeta.customerName ?? review?.customerName ?? "",
    projectName: projectMeta.projectName ?? review?.projectName ?? review?.reviewName ?? "",
    projectCategory: review?.projectCategory ?? "",
    reviewDate: review?.createdAt ? new Date(review.createdAt).toLocaleDateString("en-GB") : new Date().toLocaleDateString("en-GB"),
    status: review?.status ?? "Review Complete",
    overallScore,
    recommendation: scorecard?.recommendation ?? "",
    executiveSummary: review?.executiveSummary ?? scorecard?.executiveSummary ?? "",
    fileCount: (files || []).length,
    findingCount: (findings || []).length,
    criticalBlockerCount: scorecard?.criticalBlockers ?? (findings || []).filter((f) => f.criticalBlocker).length,
    actionCount: (actions || []).length,
    domainScores,
    findings: (findings || []).map((f) => ({
      title: f.title,
      severity: f.severity,
      domain: f.domain,
      findingStatement: f.findingStatement,
      recommendation: f.recommendation,
      owner: f.owner,
      dueDate: f.dueDate,
      status: f.status,
      criticalBlocker: f.criticalBlocker,
    })),
    actions: (actions || []).map((a) => ({
      actionSummary: a.actionSummary,
      status: a.status,
      owner: a.owner,
      dueDate: a.dueDate,
      severity: a.severity,
    })),
    decision: decision ?? {},
    sowTraceability,
    inScope: review?.inScope ?? [],
    outOfScope: review?.outOfScope ?? [],
    assumptions: (requirements || []).filter((r) => r.category === "assumption").map((r) => r.normalizedText ?? r.sourceText ?? ""),
    nextSteps: null,
  };
}

module.exports = { generateArbPptx, shapeReviewDataForPptx };
