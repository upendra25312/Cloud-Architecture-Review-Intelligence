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

  const isPendingSignOff = !dc.reviewerDecision || dc.reviewerDecision === "Not Recorded";
  const items = [];

  if (isPendingSignOff) {
    items.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing:   { before: 240, after: 120 },
      children:  [new TextRun({ text: "DRAFT — AWAITING REVIEWER SIGN-OFF", bold: true, size: 24, color: BRAND.red, allCaps: true })],
      border: { top: { style: "single", size: 6, color: BRAND.red }, bottom: { style: "single", size: 6, color: BRAND.red } },
    }));
  }

  return [
    ...items,
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

  const meta = pack.metadata || {};
  const items = [
    pageBreak(),
    new Paragraph({ text: "Executive Summary", heading: HeadingLevel.HEADING_1, spacing: { after: 120 } }),
    spacer(),
    labelValue("Overall Score",       es.overallScore != null ? `${es.overallScore} / 100 (${es.scoreBand || ""})` : "—"),
    labelValue("Recommendation",      es.recommendation   || "—"),
    labelValue("Governance Posture",  dc.governancePosture || "—"),
    labelValue("Reviewer Decision",   dc.reviewerDecision  || "Not recorded"),
    labelValue("Evidence Readiness",  `${er.status || "—"}${er.reason ? ` — ${er.reason}` : ""}`),
    ...(meta.reviewDuration ? [labelValue("Assessment Duration", meta.reviewDuration)] : []),
    spacer(),
  ];

  if (es.narrative) {
    items.push(p(es.narrative));
    items.push(spacer());
  }

  const strengths = pack.strengths || es.topStrengths || [];
  if (strengths.length) {
    items.push(new Paragraph({ text: "Architecture Strengths", heading: HeadingLevel.HEADING_2, spacing: { after: 80 } }));
    for (const s of strengths) items.push(bullet(`✓  ${s}`));
    items.push(spacer());
  }

  // Score progression across multiple reviews of the same project
  const reviewHistory = (meta.reviewHistory || []).filter(Boolean);
  if (reviewHistory.length > 1) {
    items.push(new Paragraph({ text: "Score Progression", heading: HeadingLevel.HEADING_2, spacing: { after: 80 } }));
    items.push(p(`This project has been reviewed ${reviewHistory.length} times. Score trend across reviews:`));
    items.push(spacer());
    const histRows = reviewHistory.map((r, i) => {
      const prev  = i > 0 ? (reviewHistory[i - 1].overallScore || 0) : null;
      const delta = prev !== null ? (r.overallScore || 0) - prev : null;
      return [
        r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-GB") : `Review ${i + 1}`,
        `${r.overallScore ?? "—"} / 100`,
        delta !== null ? (delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : "━ 0") : "—",
        r.recommendation || "—",
      ];
    });
    items.push(buildTable(["Date", "Score", "Change", "Recommendation"], histRows, BRAND.blue));
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

function buildDomainAssessmentSection(pack) {
  const sc       = pack.scorecard || {};
  const domains  = sc.domains    || [];
  const strengths = pack.strengths || pack.executiveSummary?.topStrengths || [];

  const header = [
    pageBreak(),
    new Paragraph({ text: "Domain Assessment", heading: HeadingLevel.HEADING_1, spacing: { after: 120 } }),
    labelValue("Compliant Domains (≥70%)",    domains.filter((d) => (d.percentage ?? 0) >= 70).map((d) => d.domain).join(", ") || "None"),
    labelValue("Domains Requiring Action (<70%)", domains.filter((d) => (d.percentage ?? 0) < 70).map((d) => d.domain).join(", ") || "None"),
    spacer(),
  ];

  const STATUS_COLOR = { Strong: "065F46", Moderate: "78350F", "Needs Work": "7F1D1D", Critical: "9B1C1C" };

  const findingsByDomain = {};
  for (const f of pack.findings || []) {
    const d = f.domain || "Other";
    findingsByDomain[d] = (findingsByDomain[d] || 0) + (f.status !== "Closed" ? 1 : 0);
  }

  const rows = domains.map((d) => {
    const pct    = d.percentage ?? 0;
    const status = d.status || (pct >= 85 ? "Strong" : pct >= 70 ? "Moderate" : pct >= 50 ? "Needs Work" : "Critical");
    const openF  = findingsByDomain[d.domain] ?? 0;
    return [
      { text: d.domain || "—" },
      { text: status, opts: { color: STATUS_COLOR[status] || "374151", bold: true } },
      { text: `${pct}%` },
      { text: openF > 0 ? `${openF} open` : "None", opts: { color: openF > 0 ? "D92B2B" : "065F46" } },
      { text: d.rationale || "—" },
    ];
  });

  const table = rows.length
    ? buildTable(["Domain", "Status", "Score%", "Open Findings", "Assessment Notes"], rows, BRAND.blue)
    : p("No domain scores available.");

  const sections = [...header, table, spacer()];

  if (strengths.length > 0) {
    sections.push(new Paragraph({ text: "Architecture Strengths", heading: HeadingLevel.HEADING_2, spacing: { after: 80 } }));
    for (const str of strengths) sections.push(bullet(`✓  ${str}`));
    sections.push(spacer());
  }

  return sections;
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

function buildApprovalConditionsSection(pack) {
  const findings = pack.findings || [];
  const blockers = findings.filter(
    (f) => ["Critical", "High"].includes(f.severity) && f.status !== "Closed",
  );

  const dc = pack.decision || {};
  const isApproved = dc.reviewerDecision === "Approved";

  const items = [
    pageBreak(),
    new Paragraph({ text: "Approval Conditions", heading: HeadingLevel.HEADING_1, spacing: { after: 120 } }),
    spacer(),
  ];

  if (isApproved) {
    items.push(p("All conditions have been met. This review has been approved.", { color: "065F46" }));
    items.push(spacer());
    return items;
  }

  if (!blockers.length) {
    items.push(p("No Critical or High severity open findings. Review is eligible for approval pending sign-off."));
    items.push(spacer());
    return items;
  }

  items.push(p(`The following ${blockers.length} condition(s) must be resolved before this review can be approved:`, { bold: true }));
  items.push(spacer());

  for (const f of blockers) {
    items.push(
      new Paragraph({
        children: [
          new TextRun({ text: `☐  [${f.severity}] `, bold: true, size: 20,
            color: f.severity === "Critical" ? "D92B2B" : "C85000" }),
          new TextRun({ text: f.title || "—", size: 20 }),
          f.recommendation
            ? new TextRun({ text: `  —  ${f.recommendation}`, size: 18, color: "475569" })
            : new TextRun({ text: "" }),
        ],
        spacing: { after: 80 },
      }),
    );
  }

  items.push(spacer());
  return items;
}

function buildSignOffSection(pack) {
  const dc  = pack.decision  || {};
  const es  = pack.executiveSummary || {};
  const meta = pack.metadata || {};

  const decisionColor = dc.reviewerDecision === "Approved"    ? "065F46"
    : dc.reviewerDecision === "Conditionally Approved"         ? "78350F"
    : dc.reviewerDecision === "Needs Revision"                 ? "1E3A5F"
    : dc.reviewerDecision === "Needs Remediation"              ? "7F1D1D"
    : "374151";

  return [
    pageBreak(),
    new Paragraph({ text: "Sign-off", heading: HeadingLevel.HEADING_1, spacing: { after: 120 } }),
    spacer(),
    labelValue("Review Decision",      dc.reviewerDecision  || "Not Recorded"),
    labelValue("Governance Posture",   dc.governancePosture || "—"),
    labelValue("Risk Acceptance",      dc.riskAcceptanceRequired ? "Required" : "Not Required"),
    labelValue("Overall Score",        es.overallScore != null ? `${es.overallScore} / 100 (${es.scoreBand || ""})` : "—"),
    labelValue("Recommendation",       es.recommendation    || "—"),
    labelValue("Review ID",            meta.reviewId        || "—"),
    labelValue("Generated At",         meta.generatedAt
      ? new Date(meta.generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })),
    spacer(),

    ...(dc.rationale ? [
      new Paragraph({ text: "Decision Rationale", heading: HeadingLevel.HEADING_2, spacing: { after: 80 } }),
      new Paragraph({
        children: [new TextRun({ text: dc.rationale, size: 20, italics: true, color: decisionColor })],
        spacing: { after: 120 },
      }),
      spacer(),
    ] : []),

    new Paragraph({ text: "Reviewer Sign-off", heading: HeadingLevel.HEADING_2, spacing: { after: 80 } }),
    buildTable(
      ["Role", "Name", "Decision", "Date", "Signature"],
      [
        [
          "Principal Reviewer",
          dc.reviewerName || "                              ",
          dc.reviewerDecision || "                    ",
          dc.recordedAt
            ? new Date(dc.recordedAt).toLocaleDateString("en-GB")
            : "                    ",
          "                              ",
        ],
        ["Customer / Project Sponsor", "                              ", "", "                    ", "                              "],
        ["ARB Chair",                  "                              ", "", "                    ", "                              "],
      ],
      BRAND.dark,
    ),
    spacer(),
    p("By signing above, the reviewer confirms that this architecture review was conducted in accordance with the Cloud Architecture Review Board process and that the findings and recommendation reflect an accurate assessment of the submitted evidence.", { italics: true, color: "64748B", size: 18 }),
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
    ...buildDomainAssessmentSection(pack),
    ...buildFindingsSection(pack),
    ...buildActionsSection(pack),
    ...buildRequirementsSection(pack),
    ...buildApprovalConditionsSection(pack),
    ...buildSignOffSection(pack),
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
