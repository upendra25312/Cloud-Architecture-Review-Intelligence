/**
 * arb-docx-export.js
 *
 * Word (.docx) export for ARB reviews using the docx package.
 * Accepts a canonical ArbReviewOutputPack — never raw review data.
 *
 * Sections:
 *   Cover | Executive Summary | Scorecard | Findings | Actions Register | Requirements
 */

"use strict";

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  WidthType,
  PageBreak,
  VerticalAlign,
} = require("docx");

// ─── Brand colours ─────────────────────────────────────────────────────────────

const BRAND = {
  red:    "EB0000",
  blue:   "0059C8",
  teal:   "00BEBC",
  purple: "95008A",
  grey:   "E6E6E6",
  white:  "FFFFFF",
  dark:   "1A1A2E",
};

const SEV_HEADER = {
  Critical: "D92B2B",
  High:     "C85000",
  Medium:   "B45309",
  Low:      "0059C8",
};

// ─── Primitive helpers ─────────────────────────────────────────────────────────

function p(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text: String(text ?? ""), size: 22, ...opts })],
    spacing: { after: 80 },
  });
}

function labelValue(label, value) {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 22 }),
      new TextRun({ text: String(value ?? "—"), size: 22 }),
    ],
    spacing: { after: 60 },
  });
}

function bullet(text) {
  return new Paragraph({
    children: [new TextRun({ text: String(text ?? ""), size: 22 })],
    bullet: { level: 0 },
    spacing: { after: 60 },
  });
}

function spacer() {
  return new Paragraph({ text: "", spacing: { after: 140 } });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

// ─── Table helpers ─────────────────────────────────────────────────────────────

function hCell(text, fill = BRAND.red) {
  return new TableCell({
    shading: { fill, color: fill },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [new TextRun({ text: String(text ?? ""), bold: true, color: BRAND.white, size: 18 })],
      }),
    ],
  });
}

function dCell(text, opts = {}) {
  return new TableCell({
    verticalAlign: VerticalAlign.TOP,
    children: [
      new Paragraph({
        children: [new TextRun({ text: String(text ?? "—"), size: 18, ...opts })],
        spacing: { after: 40 },
      }),
    ],
  });
}

function buildTable(headers, rows, headerFill = BRAND.red) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h) => hCell(h, headerFill)),
      }),
      ...rows.map((cells) =>
        new TableRow({
          children: cells.map((c) =>
            typeof c === "object" && c !== null && "text" in c
              ? dCell(c.text, c.opts ?? {})
              : dCell(c),
          ),
        }),
      ),
    ],
  });
}

// ─── Section builders ──────────────────────────────────────────────────────────

function buildCoverSection(pack) {
  const meta  = pack.metadata  || {};
  const cust  = pack.customer  || {};
  const proj  = pack.project   || {};
  const es    = pack.executiveSummary || {};
  const dc    = pack.decision  || {};
  const wf    = pack.workflow  || {};

  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing:   { before: 600, after: 200 },
      children:  [new TextRun({ text: "Cloud Architecture Review Board Pack", bold: true, size: 52, color: BRAND.red })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing:   { after: 120 },
      children:  [new TextRun({ text: proj.name || "—", bold: true, size: 40 })],
    }),
    spacer(),
    labelValue("Customer",           cust.name      || "—"),
    labelValue("Review ID",          meta.reviewId  || "—"),
    labelValue("Generated",          meta.generatedAt
      ? new Date(meta.generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })),
    labelValue("Reviewer",           dc.reviewerName     || "—"),
    labelValue("Workflow State",     wf.currentState     || "—"),
    labelValue("Overall Score",      es.overallScore != null ? `${es.overallScore} / 100` : "—"),
    labelValue("Score Band",         es.scoreBand        || "—"),
    labelValue("Recommendation",     es.recommendation   || dc.governancePosture || "—"),
    labelValue("Governance Posture", dc.governancePosture || "—"),
    spacer(),
  ];
}

function buildExecutiveSummarySection(pack) {
  const es = pack.executiveSummary || {};
  const dc = pack.decision         || {};
  const er = pack.evidenceReadiness|| {};

  const items = [
    pageBreak(),
    new Paragraph({ text: "Executive Summary", heading: HeadingLevel.HEADING_1, spacing: { after: 120 } }),
    spacer(),
    labelValue("Overall Score",       es.overallScore != null ? `${es.overallScore} / 100 (${es.scoreBand || ""})` : "—"),
    labelValue("Recommendation",      es.recommendation   || "—"),
    labelValue("Governance Posture",  dc.governancePosture || "—"),
    labelValue("Reviewer Decision",   dc.reviewerDecision  || "Not recorded"),
    labelValue("Evidence Readiness",  `${er.status || "—"}${er.reason ? ` — ${er.reason}` : ""}`),
    spacer(),
  ];

  if (es.narrative) {
    items.push(p(es.narrative));
    items.push(spacer());
  }

  const strengths = pack.strengths || es.strengths || [];
  if (strengths.length) {
    items.push(new Paragraph({ text: "Strengths", heading: HeadingLevel.HEADING_2, spacing: { after: 80 } }));
    for (const s of strengths) items.push(bullet(s));
    items.push(spacer());
  }

  const nextSteps = pack._pptx?.nextSteps || [];
  if (nextSteps.length) {
    items.push(new Paragraph({ text: "Next Steps", heading: HeadingLevel.HEADING_2, spacing: { after: 80 } }));
    for (const ns of nextSteps) items.push(bullet(typeof ns === "object" ? (ns.step || ns.text || String(ns)) : String(ns)));
    items.push(spacer());
  }

  return items;
}

function buildScorecardSection(pack) {
  const sc = pack.scorecard || {};
  const domains = sc.domains || [];

  const header = [
    pageBreak(),
    new Paragraph({ text: "Scorecard", heading: HeadingLevel.HEADING_1, spacing: { after: 120 } }),
    labelValue("Overall Score", sc.totalScore != null ? `${sc.totalScore} / ${sc.maxScore || 100} (${sc.percentage || 0}%)` : "—"),
    spacer(),
  ];

  if (!domains.length) {
    return [...header, p("No domain scores available.")];
  }

  const rows = domains.map((d) => [
    d.domain || "—",
    `${d.score || 0} / ${d.maxScore || 0}`,
    `${d.percentage || 0}%`,
    d.rationale || "—",
  ]);

  return [
    ...header,
    buildTable(["Domain", "Score", "Percentage", "Rationale"], rows, BRAND.red),
    spacer(),
  ];
}

function buildFindingsSection(pack) {
  const findings = pack.findings || [];

  const header = [
    pageBreak(),
    new Paragraph({ text: "Findings", heading: HeadingLevel.HEADING_1, spacing: { after: 120 } }),
    labelValue("Total findings", findings.length),
    spacer(),
  ];

  if (!findings.length) {
    return [...header, p("No findings available.")];
  }

  const severityOrder = ["Critical", "High", "Medium", "Low"];
  const bySeverity = {};
  for (const sev of severityOrder) bySeverity[sev] = [];
  for (const f of findings) {
    const sev = f.severity || "Low";
    (bySeverity[sev] = bySeverity[sev] || []).push(f);
  }

  const sections = [...header];
  for (const sev of severityOrder) {
    const group = bySeverity[sev];
    if (!group?.length) continue;

    sections.push(
      new Paragraph({
        text: `${sev} (${group.length})`,
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 80 },
      }),
    );

    const rows = group.map((f) => [
      f.domain || "—",
      f.title || "—",
      f.status || "—",
      f.owner || "Unassigned",
      f.description || f.findingStatement || "—",
      f.recommendation || "—",
    ]);

    sections.push(
      buildTable(
        ["Domain", "Finding", "Status", "Owner", "Description", "Recommendation"],
        rows,
        SEV_HEADER[sev] || BRAND.blue,
      ),
    );
    sections.push(spacer());
  }

  return sections;
}

function buildActionsSection(pack) {
  const actions = pack.remediationActions || [];

  const header = [
    pageBreak(),
    new Paragraph({ text: "Actions Register", heading: HeadingLevel.HEADING_1, spacing: { after: 120 } }),
    spacer(),
  ];

  if (!actions.length) {
    return [...header, p("No actions recorded.")];
  }

  const rows = actions.map((a) => [
    a.title || "—",
    a.domain || "—",
    a.severity || "—",
    a.owner || "Unassigned",
    a.dueDate ? new Date(a.dueDate).toLocaleDateString("en-GB") : "—",
    a.status || "—",
  ]);

  return [
    ...header,
    buildTable(["Action", "Domain", "Severity", "Owner", "Due Date", "Status"], rows, BRAND.blue),
    spacer(),
  ];
}

function buildRequirementsSection(pack) {
  const reqs = pack.requirements || [];
  if (!reqs.length) return [];

  const rows = reqs.map((r) => [
    r.domain || r.category || "—",
    r.text || r.requirementText || r.title || "—",
    r.priority || r.criticality || "—",
    r.evidenceStatus || r.status || "—",
  ]);

  return [
    pageBreak(),
    new Paragraph({ text: "Requirements", heading: HeadingLevel.HEADING_1, spacing: { after: 120 } }),
    spacer(),
    buildTable(["Domain", "Requirement", "Priority", "Evidence Status"], rows, BRAND.purple),
    spacer(),
  ];
}

// ─── Main export ───────────────────────────────────────────────────────────────

async function generateArbDocx(pack) {
  const proj = pack.project || {};

  const children = [
    ...buildCoverSection(pack),
    ...buildExecutiveSummarySection(pack),
    ...buildScorecardSection(pack),
    ...buildFindingsSection(pack),
    ...buildActionsSection(pack),
    ...buildRequirementsSection(pack),
  ];

  const doc = new Document({
    creator:     "CARI — Cloud Architecture Review Intelligence",
    title:       `ARB Review — ${proj.name || ""}`,
    description: "Architecture Review Board pack generated by CARI",
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}

module.exports = { generateArbDocx };
