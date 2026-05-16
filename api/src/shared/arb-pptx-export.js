/**
 * arb-pptx-export.js
 *
 * Generates an executive-ready PowerPoint deck for an ARB review.
 * Layout: 16:9 widescreen (13.33" × 7.5") — Rackspace corporate theme.
 *
 * Rackspace brand tokens:
 *   Red     #EB0000   Blue    #0059C8   Teal   #00BEBC
 *   Purple  #95008A   LtGrey  #E6E6E6   Font   Arial
 */

"use strict";

const path      = require("path");
const fs        = require("fs");
const PptxGenJS = require("pptxgenjs");

// ─── Template resolution (pptxgenjs 4.x cannot load existing .pptx files) ────
// Resolution order: POWERPOINT_TEMPLATE_PATH env → repo root → templates dir.
// Template is validated for existence only; the library limitation warning is
// added to the pack's exportWarnings so downstream callers are informed.

const TEMPLATE_CANDIDATES = [
  process.env.POWERPOINT_TEMPLATE_PATH || null,
  path.join(process.cwd(), "Rackspace Presentation Template.pptx"),
  path.resolve(__dirname, "../../../templates/Rackspace Presentation Template.pptx"),
].filter(Boolean);

function resolveTemplatePath() {
  for (const candidate of TEMPLATE_CANDIDATES) {
    try { if (fs.existsSync(candidate)) return candidate; } catch { /* ignore */ }
  }
  return null;
}

function addTemplateWarnings(pack) {
  if (!pack || !Array.isArray(pack.exportWarnings)) return;
  const templatePath = resolveTemplatePath();
  const w = templatePath
    ? { warningId: "TEMPLATE_LIBRARY_LIMITATION", severity: "info",
        message: `Rackspace template found at "${templatePath}" but cannot be applied — pptxgenjs@4.x does not support loading existing .pptx files. Brand styling is applied programmatically.`,
        affectedSections: ["all"] }
    : { warningId: "TEMPLATE_NOT_FOUND", severity: "info",
        message: "Rackspace template not found. Set POWERPOINT_TEMPLATE_PATH or place template at repo root. Brand styling is applied programmatically.",
        affectedSections: ["all"] };
  pack.exportWarnings.push(w);
}

// ─── Brand constants ─────────────────────────────────────────────────────────
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
  if (score >= 80) return "00BEBC";
  if (score >= 60) return "F0A500";
  return "EB0000";
};

// ─── Layout constants (16:9, 13.33" × 7.5") ──────────────────────────────────
const W  = 13.33;   // slide width
const H  = 7.5;     // slide height
const M  = 0.5;     // left/right margin
const CW = W - M * 2;  // content width: 12.33"

// Header band: y=0 to y=1.15. Footer band: y=7.15 to y=7.5.
const HDR_H  = 1.15;
const FTR_Y  = 7.15;
const FTR_H  = H - FTR_Y;
const BODY_Y = HDR_H + 0.15;  // content starts at 1.3"
const BODY_H = FTR_Y - BODY_Y - 0.1;  // usable body height ≈ 5.75"

// ─── Shared helpers ───────────────────────────────────────────────────────────

let pptx; // module-level ref needed by addHeader

function addHeader(s, title, subtitle) {
  s.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: "100%", h: HDR_H,
    fill: { color: BRAND.red }, line: { color: BRAND.red },
  });
  // Thin white left accent stripe
  s.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 0.07, h: HDR_H,
    fill: { color: BRAND.white }, line: { color: BRAND.white },
  });
  s.addText(title, {
    x: M, y: 0.1, w: CW, h: 0.7,
    fontSize: 28, bold: true, color: BRAND.white, fontFace: BRAND.font,
  });
  if (subtitle) {
    s.addText(subtitle, {
      x: M, y: 0.78, w: CW, h: 0.3,
      fontSize: 11, color: BRAND.white, fontFace: BRAND.font,
    });
  }
}

function addFooter(s, reviewId, slideNum) {
  s.addShape(pptx.ShapeType.rect, {
    x: 0, y: FTR_Y, w: "100%", h: FTR_H,
    fill: { color: BRAND.lightGrey }, line: { color: BRAND.lightGrey },
  });
  s.addText(`CARI Architecture Review  |  Review ID: ${reviewId}  |  CONFIDENTIAL`, {
    x: M, y: FTR_Y + 0.05, w: CW - 1, h: 0.22,
    fontSize: 8, color: BRAND.midGrey, fontFace: BRAND.font,
  });
  if (slideNum) {
    s.addText(String(slideNum), {
      x: W - M - 0.4, y: FTR_Y + 0.05, w: 0.4, h: 0.22,
      fontSize: 8, color: BRAND.midGrey, fontFace: BRAND.font, align: "right",
    });
  }
}

function pctBar(s, x, y, w, h, pct, color = BRAND.blue) {
  const barW = Math.max(0.04, (pct / 100) * w);
  s.addShape(pctShape(), { x, y, w, h, fill: { color: BRAND.lightGrey }, line: { color: BRAND.lightGrey } });
  s.addShape(pctShape(), { x, y, w: barW, h, fill: { color }, line: { color } });
  s.addText(`${pct}%`, { x: x + 0.1, y: y + 0.03, w: w - 0.15, h: h - 0.06, fontSize: 9, color: BRAND.white, fontFace: BRAND.font, bold: true });
}

function pctShape() { return pptx.ShapeType.rect; }

// ─── Slide builders ───────────────────────────────────────────────────────────

function buildCoverSlide(p, data, slideNum) {
  const s = p.addSlide();

  // Full-bleed red background
  s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: "100%", h: "100%", fill: { color: BRAND.red }, line: { color: BRAND.red } });

  // White bottom strip (Rackspace wordmark area)
  s.addShape(p.ShapeType.rect, { x: 0, y: 5.7, w: "100%", h: 1.8, fill: { color: BRAND.white }, line: { color: BRAND.white } });

  // Left accent stripe on cover (white, thin, full height)
  s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: "100%", fill: { color: BRAND.white }, line: { color: BRAND.white } });

  // Main title
  s.addText("Architecture Review Report", {
    x: 0.7, y: 0.9, w: 12.3, h: 0.9,
    fontSize: 38, bold: true, color: BRAND.white, fontFace: BRAND.font,
  });

  // Customer name
  s.addText(data.customerName || "Customer", {
    x: 0.7, y: 1.95, w: 11.0, h: 0.65,
    fontSize: 26, color: BRAND.white, fontFace: BRAND.font,
  });

  // Project name
  s.addText(data.projectName || "", {
    x: 0.7, y: 2.68, w: 11.0, h: 0.48,
    fontSize: 18, color: BRAND.white, fontFace: BRAND.font,
  });

  // Horizontal divider
  s.addShape(p.ShapeType.rect, { x: 0.7, y: 3.3, w: 5.5, h: 0.03, fill: { color: BRAND.white }, line: { color: BRAND.white } });

  // Category pill — PURPLE is the static brand anchor (ensures #95008A in every deck)
  const cat = data.projectCategory || "Architecture Review";
  s.addText(cat, {
    x: 0.7, y: 3.55, w: 3.8, h: 0.42,
    fontSize: 12, bold: true, color: BRAND.white, fontFace: BRAND.font,
    fill: { color: BRAND.purple }, align: "center", valign: "middle",
  });

  // Review date · status
  s.addText(`${data.reviewDate || ""}   ·   ${data.status || ""}`, {
    x: 0.7, y: 4.15, w: 11.0, h: 0.35,
    fontSize: 12, color: BRAND.white, fontFace: BRAND.font,
  });

  // Bottom strip: confidential label
  s.addText("CONFIDENTIAL  ·  Cloud Architecture Review Intelligence (CARI)  ·  Human-reviewed findings", {
    x: 0.7, y: 5.87, w: 12.0, h: 0.3,
    fontSize: 9, color: BRAND.midGrey, fontFace: BRAND.font,
  });

  // Rackspace wordmark
  s.addText("Rackspace Technology", {
    x: 0.7, y: 6.25, w: 12.0, h: 0.42,
    fontSize: 18, bold: true, color: BRAND.red, fontFace: BRAND.font,
  });
}

function buildExecutiveSummarySlide(p, data, slideNum) {
  const s = p.addSlide();
  addHeader(s, "Executive Summary", data.projectCategory || "");
  addFooter(s, data.reviewId, slideNum);

  const score = data.overallScore ?? 0;
  const rec   = data.recommendation || "Pending";
  const recColor = rec === "Recommended for Approval" ? BRAND.teal
                 : rec === "Needs Revision"           ? "C85000"
                 : BRAND.red;

  // Score circle — top right
  const cx = W - M - 2.1;
  s.addShape(p.ShapeType.ellipse, { x: cx, y: BODY_Y, w: 2.0, h: 2.0, fill: { color: SCORE_COLOUR(score) }, line: { color: SCORE_COLOUR(score) } });
  s.addText(`${score}`, { x: cx, y: BODY_Y + 0.48, w: 2.0, h: 0.9, fontSize: 40, bold: true, color: BRAND.white, fontFace: BRAND.font, align: "center" });
  s.addText("Overall Score", { x: cx - 0.1, y: BODY_Y + 2.08, w: 2.2, h: 0.25, fontSize: 9, color: BRAND.midGrey, fontFace: BRAND.font, align: "center" });

  // Recommendation badge
  s.addText(rec, {
    x: M, y: BODY_Y, w: 5.8, h: 0.48,
    fontSize: 14, bold: true, color: BRAND.white, fontFace: BRAND.font,
    fill: { color: recColor }, align: "center", valign: "middle",
  });

  // Stat cards
  const stats = [
    ["Files Reviewed",    String(data.fileCount          ?? 0), BRAND.blue],
    ["Findings",          String(data.findingCount        ?? 0), BRAND.red],
    ["Critical Blockers", String(data.criticalBlockerCount ?? 0), BRAND.red],
    ["Actions",           String(data.actionCount         ?? 0), "C85000"],
  ];
  const cardW = 2.5;
  const cardGap = 0.25;
  stats.forEach(([label, val, color], i) => {
    const x = M + i * (cardW + cardGap);
    s.addShape(p.ShapeType.rect, { x, y: BODY_Y + 0.62, w: cardW, h: 0.95, fill: { color: BRAND.lightGrey }, line: { color: BRAND.lightGrey } });
    s.addText(val,   { x, y: BODY_Y + 0.67, w: cardW, h: 0.52, fontSize: 28, bold: true, color, fontFace: BRAND.font, align: "center" });
    s.addText(label, { x, y: BODY_Y + 1.2,  w: cardW, h: 0.3,  fontSize: 9,  color: BRAND.midGrey, fontFace: BRAND.font, align: "center" });
  });

  // Executive summary text
  const summaryText = (data.executiveSummary || "Assessment complete. Review findings and remediation actions in the slides that follow.").slice(0, 800);
  s.addText(summaryText, {
    x: M, y: BODY_Y + 1.78, w: CW, h: 3.55,
    fontSize: 11, color: BRAND.darkGrey, fontFace: BRAND.font, wrap: true, valign: "top",
  });

  // Human sign-off note
  s.addText("⚠  AI-assisted findings. Final architecture decisions require authorised human reviewer sign-off.", {
    x: M, y: FTR_Y - 0.38, w: CW, h: 0.3,
    fontSize: 8.5, italic: true, color: BRAND.midGrey, fontFace: BRAND.font,
  });
}

function buildAssessmentScopeSlide(p, data, slideNum) {
  const s = p.addSlide();
  addHeader(s, "Assessment Scope", "Derived from uploaded SOW and project category");
  addFooter(s, data.reviewId, slideNum);

  const labelW = 3.0;
  const valueX = M + labelW + 0.2;
  const valueW = CW - labelW - 0.2;
  const rowH   = 0.75;

  const rows = [
    ["Project Category", data.projectCategory || "Not specified"],
    ["Customer",         data.customerName    || "Not specified"],
    ["Project",          data.projectName     || "Not specified"],
    ["In-Scope Areas",   (data.inScope    || []).join(", ") || "See uploaded SOW"],
    ["Out-of-Scope",     (data.outOfScope || []).join(", ") || "See uploaded SOW"],
    ["Assumptions",      (data.assumptions || []).slice(0, 3).join("; ") || "Not provided"],
  ];

  rows.forEach(([label, value], i) => {
    const y = BODY_Y + i * (rowH + 0.05);
    s.addShape(p.ShapeType.rect, { x: M,      y, w: labelW, h: rowH, fill: { color: BRAND.red       }, line: { color: BRAND.red       } });
    s.addText(label,  { x: M + 0.12, y: y + 0.18, w: labelW - 0.2, h: rowH - 0.3,  fontSize: 10.5, bold: true, color: BRAND.white,    fontFace: BRAND.font });
    s.addShape(p.ShapeType.rect, { x: valueX, y, w: valueW, h: rowH, fill: { color: BRAND.lightGrey }, line: { color: BRAND.lightGrey } });
    s.addText(value,  { x: valueX + 0.15, y: y + 0.1,  w: valueW - 0.3, h: rowH - 0.18, fontSize: 10, color: BRAND.darkGrey, fontFace: BRAND.font, wrap: true, valign: "middle" });
  });
}

function buildScorecardSlide(p, data, slideNum) {
  const s = p.addSlide();
  addHeader(s, "Scorecard", "WAF / CAF domain alignment scores");
  addFooter(s, data.reviewId, slideNum);

  const domains = data.domainScores || [];
  if (domains.length === 0) {
    s.addShape(p.ShapeType.rect, { x: M, y: 2.5, w: CW, h: 0.8, fill: { color: BRAND.lightGrey }, line: { color: BRAND.lightGrey } });
    s.addText("No domain scores available.", { x: M + 0.2, y: 2.65, w: CW - 0.4, h: 0.5, fontSize: 12, color: BRAND.midGrey, fontFace: BRAND.font, italic: true });
    return;
  }

  const domainLabelW = 3.5;
  const barX  = M + domainLabelW + 0.2;
  const barW  = CW - domainLabelW - 1.6;
  const scoreX = barX + barW + 0.1;

  domains.slice(0, 6).forEach((d, i) => {
    const y       = BODY_Y + i * 0.95;
    const rawScore = Math.round(d.score    ?? 0);
    const maxScore = Math.round(d.maxScore ?? 0);
    const pct      = Math.min(100, Math.round(d.percentage ?? rawScore));
    const scoreLabel = maxScore > 0 ? `${rawScore} / ${maxScore}` : String(rawScore);

    s.addText(d.domain || d.name || `Domain ${i + 1}`, {
      x: M, y: y + 0.05, w: domainLabelW, h: 0.45,
      fontSize: 11, fontFace: BRAND.font, color: BRAND.darkGrey, bold: true,
    });
    pctBar(s, barX, y + 0.1, barW, 0.38, pct, SCORE_COLOUR(pct));
    s.addText(scoreLabel, {
      x: scoreX, y: y + 0.05, w: 1.1, h: 0.45,
      fontSize: 13, bold: true, color: SCORE_COLOUR(pct), fontFace: BRAND.font, align: "right",
    });
    if (d.reason) {
      s.addText(d.reason.slice(0, 200), {
        x: M, y: y + 0.54, w: CW, h: 0.35,
        fontSize: 8, color: BRAND.midGrey, fontFace: BRAND.font, italic: true, wrap: true,
      });
    }
  });
}

function buildFindingsSlide(p, data, pageIndex, slideNum) {
  const s = p.addSlide();
  const total = data.totalFindingPages || 1;
  addHeader(s, "Key Findings", `Page ${pageIndex + 1} of ${total}`);
  addFooter(s, data.reviewId, slideNum);

  const findings = data.findings || [];
  const batch = findings.slice(pageIndex * 4, pageIndex * 4 + 4);

  if (batch.length === 0) {
    s.addShape(p.ShapeType.rect, { x: M, y: 2.5, w: CW, h: 0.8, fill: { color: BRAND.lightGrey }, line: { color: BRAND.lightGrey } });
    s.addText("No findings recorded.", { x: M + 0.2, y: 2.65, w: CW - 0.4, h: 0.5, fontSize: 12, color: BRAND.midGrey, fontFace: BRAND.font, italic: true });
    return;
  }

  const rowH = BODY_H / 4;
  batch.forEach((f, i) => {
    const y = BODY_Y + i * rowH;
    const sevColor = SEVERITY_COLOUR[f.severity] || BRAND.midGrey;

    // Severity pill
    s.addShape(p.ShapeType.rect, { x: M, y: y + 0.04, w: 1.15, h: 0.3, fill: { color: sevColor }, line: { color: sevColor } });
    s.addText(f.severity || "Info", { x: M, y: y + 0.07, w: 1.15, h: 0.24, fontSize: 8.5, bold: true, color: BRAND.white, fontFace: BRAND.font, align: "center" });

    // Domain pill (next to severity)
    if (f.domain) {
      s.addShape(p.ShapeType.rect, { x: M + 1.25, y: y + 0.04, w: 1.6, h: 0.3, fill: { color: BRAND.lightGrey }, line: { color: BRAND.lightGrey } });
      s.addText(f.domain, { x: M + 1.25, y: y + 0.07, w: 1.6, h: 0.24, fontSize: 8, color: BRAND.midGrey, fontFace: BRAND.font, align: "center" });
    }

    // Title
    s.addText(f.title || "Untitled finding", {
      x: M + 3.0, y: y + 0.04, w: CW - 3.0, h: 0.35,
      fontSize: 11, bold: true, color: BRAND.darkGrey, fontFace: BRAND.font,
    });

    // Finding statement
    s.addText((f.findingStatement || "").slice(0, 200), {
      x: M, y: y + 0.4, w: CW, h: 0.5,
      fontSize: 9, color: BRAND.darkGrey, fontFace: BRAND.font, wrap: true,
    });

    // Recommendation
    s.addText(`→  ${(f.recommendation || "").slice(0, 180)}`, {
      x: M, y: y + 0.92, w: CW, h: 0.4,
      fontSize: 8.5, color: BRAND.blue, fontFace: BRAND.font, italic: true, wrap: true,
    });

    // Divider between findings
    if (i < batch.length - 1) {
      s.addShape(p.ShapeType.line, { x: M, y: y + rowH - 0.05, w: CW, h: 0, line: { color: BRAND.lightGrey, width: 0.5 } });
    }
  });
}

function buildRiskRegisterSlide(p, data, slideNum) {
  const s = p.addSlide();
  addHeader(s, "Risk Register", "Open findings requiring remediation");
  addFooter(s, data.reviewId, slideNum);

  const findings = (data.findings || []).filter((f) => f.status !== "Closed").slice(0, 12);

  if (findings.length === 0) {
    s.addShape(p.ShapeType.rect, { x: M, y: 2.5, w: CW, h: 0.8, fill: { color: BRAND.lightGrey }, line: { color: BRAND.lightGrey } });
    s.addText("No open risk items. All findings are closed or no findings have been recorded.", {
      x: M + 0.2, y: 2.65, w: CW - 0.4, h: 0.5, fontSize: 11, color: BRAND.midGrey, fontFace: BRAND.font, italic: true,
    });
    return;
  }

  // Column widths total = CW = 12.33"
  const colW = [0.45, 1.2, 1.6, 5.5, 1.7, 1.18, 0.7];
  const headers = ["#", "Severity", "Domain", "Finding Title", "Owner", "Due Date", "Status"];

  const tableData = [
    headers.map((h) => ({
      text: h,
      options: { bold: true, color: BRAND.white, fill: { color: BRAND.red }, fontSize: 9, fontFace: BRAND.font },
    })),
    ...findings.map((f, i) => [
      { text: String(i + 1) },
      { text: f.severity || "?", options: { color: SEVERITY_COLOUR[f.severity] || BRAND.midGrey, bold: true, fontSize: 9 } },
      { text: f.domain || "" },
      { text: (f.title || "").slice(0, 80) },
      { text: f.owner || "TBC" },
      { text: f.dueDate ? new Date(f.dueDate).toLocaleDateString("en-GB") : "TBC" },
      { text: f.status || "Open" },
    ].map((cell) => (typeof cell === "string" ? { text: cell } : cell))),
  ];

  s.addTable(tableData, {
    x: M, y: BODY_Y, w: CW,
    rowH: 0.33,
    fontSize: 9,
    fontFace: BRAND.font,
    color: BRAND.darkGrey,
    border: { type: "solid", pt: 0.3, color: BRAND.lightGrey },
    colW,
  });
}

function buildRemediationActionsSlide(p, data, slideNum) {
  const s = p.addSlide();
  addHeader(s, "Remediation Actions", "Tracked actions from review findings");
  addFooter(s, data.reviewId, slideNum);

  const actions = (data.actions || []).filter((a) => a.status !== "Closed").slice(0, 8);

  if (actions.length === 0) {
    s.addShape(p.ShapeType.rect, { x: M, y: 2.5, w: CW, h: 0.8, fill: { color: BRAND.lightGrey }, line: { color: BRAND.lightGrey } });
    s.addText("No open remediation actions.", { x: M + 0.2, y: 2.65, w: CW - 0.4, h: 0.5, fontSize: 12, color: BRAND.midGrey, fontFace: BRAND.font, italic: true });
    return;
  }

  const rowH = 0.66;
  actions.forEach((a, i) => {
    const y = BODY_Y + i * rowH;
    const statusColor = a.status === "In Progress" ? BRAND.blue : a.status === "Closed" ? BRAND.teal : BRAND.red;

    // Status badge
    s.addShape(p.ShapeType.rect, { x: M, y: y + 0.04, w: 1.2, h: 0.28, fill: { color: statusColor }, line: { color: statusColor } });
    s.addText(a.status || "Open", { x: M, y: y + 0.07, w: 1.2, h: 0.22, fontSize: 8, bold: true, color: BRAND.white, fontFace: BRAND.font, align: "center" });

    // Action summary
    s.addText(a.actionSummary || "Action summary not provided", {
      x: M + 1.35, y: y + 0.02, w: 8.8, h: 0.34,
      fontSize: 10, color: BRAND.darkGrey, fontFace: BRAND.font, wrap: true,
    });

    // Owner / due date meta
    s.addText(`Owner: ${a.owner || "TBC"}   ·   Due: ${a.dueDate ? new Date(a.dueDate).toLocaleDateString("en-GB") : "TBC"}`, {
      x: M + 1.35, y: y + 0.38, w: 7.5, h: 0.22,
      fontSize: 8.5, color: BRAND.midGrey, fontFace: BRAND.font,
    });

    // Severity pill (right side)
    const sev = a.severity || "";
    if (sev) {
      s.addShape(p.ShapeType.rect, { x: W - M - 1.1, y: y + 0.04, w: 1.0, h: 0.28, fill: { color: SEVERITY_COLOUR[sev] || BRAND.midGrey }, line: { color: SEVERITY_COLOUR[sev] || BRAND.midGrey } });
      s.addText(sev, { x: W - M - 1.1, y: y + 0.07, w: 1.0, h: 0.22, fontSize: 8, color: BRAND.white, bold: true, fontFace: BRAND.font, align: "center" });
    }

    if (i < actions.length - 1) {
      s.addShape(p.ShapeType.line, { x: M, y: y + rowH - 0.04, w: CW, h: 0, line: { color: BRAND.lightGrey, width: 0.5 } });
    }
  });
}

// Returns fill/text colours for a decision-value cell based on the decision string.
function decisionCellStyle(value) {
  if (!value) return { bg: BRAND.lightGrey, fg: BRAND.darkGrey };
  const v = String(value).toLowerCase();
  if (v === "approved") return { bg: BRAND.teal, fg: BRAND.white };
  if (v.includes("approved with conditions")) return { bg: "F0A500", fg: BRAND.white };
  if (v.includes("needs remediation") || v.includes("needs revision")) return { bg: BRAND.red, fg: BRAND.white };
  if (v.includes("review required") || v.includes("rejected")) return { bg: BRAND.midGrey, fg: BRAND.white };
  return { bg: BRAND.lightGrey, fg: BRAND.darkGrey };
}

function buildDecisionSlide(p, data, slideNum) {
  const s = p.addSlide();
  addHeader(s, "Architecture Decision", "Reviewer sign-off and governance record");
  addFooter(s, data.reviewId, slideNum);

  const decision = data.decision || {};
  const labelW   = 3.2;
  const valueX   = M + labelW + 0.2;
  const valueW   = CW - labelW - 0.2;
  const rowH     = 0.65;  // slightly reduced to leave room for warning callout
  const rowGap   = 0.05;

  const fields = [
    ["Governance Posture",  decision.governancePosture || decision.aiRecommendation || "Pending",  true],
    ["Reviewer Decision",   decision.reviewerDecision  || "Not Recorded",                          true],
    ["Reviewer Name",       decision.reviewerName      || "Not recorded",                          false],
    ["Reviewer Role",       decision.reviewerRole      || "Not recorded",                          false],
    ["Date Recorded",       decision.recordedAt ? new Date(decision.recordedAt).toLocaleDateString("en-GB") : "Not recorded", false],
    ["Rationale",           (decision.rationale || "Not provided").slice(0, 300),                  false],
  ];

  fields.forEach(([label, value, colorCode], i) => {
    const y = BODY_Y + i * (rowH + rowGap);
    s.addShape(p.ShapeType.rect, { x: M, y, w: labelW, h: rowH, fill: { color: BRAND.darkGrey }, line: { color: BRAND.darkGrey } });
    s.addText(label, { x: M + 0.12, y: y + 0.14, w: labelW - 0.2, h: rowH - 0.22, fontSize: 10.5, bold: true, color: BRAND.white, fontFace: BRAND.font });

    const { bg, fg } = colorCode ? decisionCellStyle(value) : { bg: BRAND.lightGrey, fg: BRAND.darkGrey };
    s.addShape(p.ShapeType.rect, { x: valueX, y, w: valueW, h: rowH, fill: { color: bg }, line: { color: bg } });
    s.addText(value, { x: valueX + 0.15, y: y + 0.08, w: valueW - 0.3, h: rowH - 0.14, fontSize: 10, color: fg, fontFace: BRAND.font, wrap: true, valign: "middle", bold: colorCode });
  });

  // Governance warning callout — shown prominently when posture conflicts with reviewer decision
  if (decision.governanceWarning) {
    const warningY = BODY_Y + fields.length * (rowH + rowGap) + 0.08;
    const warningH = Math.max(0.5, FTR_Y - warningY - 0.45);
    s.addShape(p.ShapeType.rect, { x: M, y: warningY, w: CW, h: warningH, fill: { color: "FEF3C7" }, line: { color: "F59E0B", pt: 1.5 } });
    s.addText(`⚠  Governance Alert:  ${decision.governanceWarning}`, {
      x: M + 0.18, y: warningY + 0.07, w: CW - 0.35, h: warningH - 0.12,
      fontSize: 8.5, color: "92400E", fontFace: BRAND.font, wrap: true,
    });
  }
}

function buildSowTraceabilitySlide(p, data, slideNum) {
  const s = p.addSlide();
  addHeader(s, "SOW Traceability", "Evidence mapped to SOW scope and deliverables");
  addFooter(s, data.reviewId, slideNum);

  const rows = data.sowTraceability || [];
  if (rows.length === 0) {
    s.addShape(p.ShapeType.rect, { x: M, y: 2.5, w: CW, h: 0.9, fill: { color: BRAND.lightGrey }, line: { color: BRAND.lightGrey } });
    s.addText("No SOW traceability data available. Upload a SOW document to enable this section.", {
      x: M + 0.2, y: 2.65, w: CW - 0.4, h: 0.6, fontSize: 11, color: BRAND.midGrey, fontFace: BRAND.font, italic: true, wrap: true,
    });
    return;
  }

  // Column widths total = CW = 12.33"
  const colW = [2.8, 5.5, 2.33, 1.7];
  const headers = ["Domain", "SOW Requirement", "Evidence Source", "Status"];

  const tableData = [
    headers.map((h) => ({
      text: h,
      options: { bold: true, color: BRAND.white, fill: { color: BRAND.blue }, fontSize: 9.5, fontFace: BRAND.font },
    })),
    ...rows.slice(0, 12).map((r) => [
      { text: r.area          || "" },
      { text: r.sowRef        || "—" },
      { text: r.evidenceSource || "—" },
      { text: r.status        || "—", options: { color: r.status === "In scope" ? BRAND.teal : BRAND.midGrey, bold: r.status === "In scope" } },
    ]),
  ];

  s.addTable(tableData, {
    x: M, y: BODY_Y, w: CW,
    rowH: 0.38,
    fontSize: 9.5,
    fontFace: BRAND.font,
    color: BRAND.darkGrey,
    border: { type: "solid", pt: 0.3, color: BRAND.lightGrey },
    colW,
  });
}

function buildNoOpenItemsSlide(p, data, slideNum) {
  const s = p.addSlide();
  addHeader(s, "Findings, Risk & Actions", "Open items summary");
  addFooter(s, data.reviewId, slideNum);

  // Teal status banner — clean bill of health
  s.addShape(p.ShapeType.rect, {
    x: M, y: 2.05, w: CW, h: 0.78,
    fill: { color: BRAND.teal }, line: { color: BRAND.teal },
  });
  s.addText("No open findings, risks, or remediation actions are recorded for this review.", {
    x: M + 0.25, y: 2.12, w: CW - 0.5, h: 0.64,
    fontSize: 13, bold: true, color: BRAND.white, fontFace: BRAND.font, valign: "middle", wrap: true,
  });

  s.addText("All reviewed domains have been assessed. Refer to the Scorecard for domain-level scores and the Architecture Decision slide for the governance record.", {
    x: M, y: 3.1, w: CW, h: 0.6,
    fontSize: 11, color: BRAND.midGrey, fontFace: BRAND.font, wrap: true, valign: "top",
  });
}

// ─── Category-aware Next Steps ────────────────────────────────────────────────
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
  "Re-submit for review after all critical blockers are resolved.",
  "Schedule a follow-up review to validate remediation progress.",
];

function buildNextStepsSlide(p, data, slideNum) {
  const s = p.addSlide();
  addHeader(s, "Recommended Next Steps", data.projectCategory || "");
  addFooter(s, data.reviewId, slideNum);

  const categoryKey = (data.projectCategory || "").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const steps = (data.nextSteps && data.nextSteps.length > 0)
    ? data.nextSteps
    : (CATEGORY_NEXT_STEPS[categoryKey] || DEFAULT_NEXT_STEPS);

  steps.slice(0, 6).forEach((step, i) => {
    const y = BODY_Y + i * 0.88;
    // Numbered circle
    s.addShape(p.ShapeType.ellipse, { x: M, y: y + 0.06, w: 0.52, h: 0.52, fill: { color: BRAND.red }, line: { color: BRAND.red } });
    s.addText(String(i + 1), { x: M, y: y + 0.1, w: 0.52, h: 0.44, fontSize: 14, bold: true, color: BRAND.white, fontFace: BRAND.font, align: "center" });
    // Step text
    s.addText(step, {
      x: M + 0.68, y: y + 0.1, w: CW - 0.68, h: 0.52,
      fontSize: 11, color: BRAND.darkGrey, fontFace: BRAND.font, wrap: true, valign: "middle",
    });
  });

  // Disclaimer bar
  s.addShape(p.ShapeType.rect, { x: M, y: FTR_Y - 0.45, w: CW, h: 0.38, fill: { color: BRAND.lightGrey }, line: { color: BRAND.lightGrey } });
  s.addText("Findings are AI-assisted and evidence-linked. Final architecture decisions remain with authorised human reviewers.", {
    x: M + 0.15, y: FTR_Y - 0.42, w: CW - 0.3, h: 0.32,
    fontSize: 8.5, italic: true, color: BRAND.midGrey, fontFace: BRAND.font, wrap: true,
  });
}

// ─── Main export function ─────────────────────────────────────────────────────

/**
 * Generates a 16:9 PowerPoint deck from ARB review data.
 * @param {object} packOrReviewData  Canonical ArbReviewOutputPack (has ._pptx) or legacy flat reviewData
 * @returns {Promise<Buffer>}  PPTX binary buffer
 */
async function generateArbPptx(packOrReviewData) {
  const isCanonicalPack = packOrReviewData != null && "_pptx" in packOrReviewData;
  const reviewData = isCanonicalPack ? packOrReviewData._pptx : packOrReviewData;

  if (isCanonicalPack) addTemplateWarnings(packOrReviewData);

  pptx = new PptxGenJS();

  // LAYOUT_WIDE = 13.33" × 7.5" (16:9 widescreen) — do NOT override with defineLayout
  pptx.layout    = "LAYOUT_WIDE";
  pptx.author    = "CARI — Cloud Architecture Review Intelligence";
  pptx.company   = "Rackspace Technology";
  pptx.subject   = "Architecture Review Report";
  pptx.title     = `${reviewData.projectName || "Architecture Review"} — Review Report`;
  pptx.revision  = "1";

  const findings       = reviewData.findings || [];
  const findingPageCnt = Math.max(1, Math.ceil(findings.length / 4));
  const maxFindPages   = Math.min(findingPageCnt, 5);
  const hasFindings    = findings.length > 0;
  const hasOpenActions = (reviewData.actions || []).some((a) => a.status !== "Closed");

  let sn = 1; // slide number counter

  buildCoverSlide(pptx, reviewData, null);       sn++;  // cover has no footer number
  buildExecutiveSummarySlide(pptx, reviewData, sn++);
  buildAssessmentScopeSlide(pptx, reviewData, sn++);
  buildScorecardSlide(pptx, reviewData, sn++);

  if (hasFindings) {
    for (let i = 0; i < maxFindPages; i++) {
      buildFindingsSlide(pptx, { ...reviewData, totalFindingPages: maxFindPages }, i, sn++);
    }
    buildRiskRegisterSlide(pptx, reviewData, sn++);
    if (hasOpenActions) buildRemediationActionsSlide(pptx, reviewData, sn++);
  } else {
    buildNoOpenItemsSlide(pptx, reviewData, sn++);
  }
  buildDecisionSlide(pptx, reviewData, sn++);
  buildSowTraceabilitySlide(pptx, reviewData, sn++);
  buildNextStepsSlide(pptx, reviewData, sn++);

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
    score:  Math.round(d.score ?? d.weight ?? 0),
    reason: d.reason ?? "",
  }));

  // Build SOW traceability from files tagged as SOW + their extracted requirements.
  // Evidence objects in storage do not carry logicalCategory, so filter from files instead.
  const sowFiles   = (files || []).filter((f) => (f.logicalCategory || "").toLowerCase() === "sow");
  const sowFileIds = new Set(sowFiles.map((f) => f.fileId));
  const sowReqs    = (requirements || []).filter((r) => sowFileIds.has(r.sourceFileId)).slice(0, 12);
  const sowTraceability = sowReqs.length > 0
    ? sowReqs.map((r) => ({
        area:           r.category       || "Architecture",
        sowRef:         r.sourceFileName || "SOW",
        evidenceSource: r.sourceFileName || "SOW",
        status:         "In scope",
      }))
    : sowFiles.slice(0, 12).map((f) => ({
        area:           "Scope",
        sowRef:         f.fileName,
        evidenceSource: f.fileName,
        status:         "In scope",
      }));

  return {
    reviewId:             review?.reviewId ?? "unknown",
    customerName:         projectMeta.customerName  ?? review?.customerName  ?? "",
    projectName:          projectMeta.projectName   ?? review?.projectName   ?? review?.reviewName ?? "",
    projectCategory:      review?.projectCategory   ?? "",
    reviewDate:           review?.createdAt ? new Date(review.createdAt).toLocaleDateString("en-GB") : new Date().toLocaleDateString("en-GB"),
    status:               review?.status ?? "Review Complete",
    overallScore,
    recommendation:       scorecard?.recommendation ?? "",
    executiveSummary:     review?.executiveSummary ?? scorecard?.executiveSummary ?? "",
    fileCount:            (files    || []).length,
    findingCount:         (findings || []).length,
    criticalBlockerCount: scorecard?.criticalBlockers ?? (findings || []).filter((f) => f.criticalBlocker).length,
    actionCount:          (actions  || []).length,
    domainScores,
    findings: (findings || []).map((f) => ({
      title:            f.title,
      severity:         f.severity,
      domain:           f.domain,
      findingStatement: f.findingStatement,
      recommendation:   f.recommendation,
      owner:            f.owner,
      dueDate:          f.dueDate,
      status:           f.status,
      criticalBlocker:  f.criticalBlocker,
    })),
    actions: (actions || []).map((a) => ({
      actionSummary: a.actionSummary,
      status:        a.status,
      owner:         a.owner,
      dueDate:       a.dueDate,
      severity:      a.severity,
    })),
    decision:       decision ?? {},
    sowTraceability,
    inScope:        review?.inScope    ?? [],
    outOfScope:     review?.outOfScope ?? [],
    assumptions:    (requirements || []).filter((r) => r.category === "assumption").map((r) => r.normalizedText ?? r.sourceText ?? ""),
    nextSteps:      null,  // null = use category defaults; never []
  };
}

module.exports = { generateArbPptx, shapeReviewDataForPptx };
