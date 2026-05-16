/**
 * arb-excel-export.js
 *
 * Excel (.xlsx) export for ARB reviews using ExcelJS.
 * Accepts a canonical ArbReviewOutputPack — never raw review data.
 *
 * Workbook tabs:
 *   Executive Summary | Findings | Risks | Actions | Scorecard |
 *   Evidence Readiness | Requirements | Evidence Register |
 *   Traceability | Decision | Export Warnings | Uploaded Inputs
 */

"use strict";

const ExcelJS = require("exceljs");

// ─── Style helpers ─────────────────────────────────────────────────────────────

const SEV_FILL = {
  Critical: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } },
  High:     { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3E0" } },
  Medium:   { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF8DC" } },
  Low:      { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F2FD" } },
};
const SEV_FONT_COLOR = {
  Critical: { argb: "FFD92B2B" },
  High:     { argb: "FFC85000" },
  Medium:   { argb: "FFF0A500" },
  Low:      { argb: "FF0059C8" },
};

const HEADER_FILL  = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEB0000" } };
const HEADER_FONT  = { color: { argb: "FFFFFFFF" }, bold: true, size: 10 };
const SECTION_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };

function setHeaderRow(ws, headers, rowNum = 1) {
  const row = ws.getRow(rowNum);
  headers.forEach((h, i) => {
    const cell = row.getCell(i + 1);
    cell.value = h;
    cell.font  = HEADER_FONT;
    cell.fill  = HEADER_FILL;
    cell.alignment = { wrapText: true, vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCCCCCC" } } };
  });
  row.height = 22;
  ws.views = [{ state: "frozen", ySplit: rowNum }];
  ws.autoFilter = { from: { row: rowNum, column: 1 }, to: { row: rowNum, column: headers.length } };
}

function addDataRow(ws, values, severity) {
  const row = ws.addRow(values);
  row.height = 18;
  if (severity && SEV_FILL[severity]) {
    row.eachCell((cell) => {
      cell.fill = SEV_FILL[severity];
    });
    // Severity cell gets colored font
    const sevIdx = values.findIndex((v) => v === severity);
    if (sevIdx >= 0) {
      row.getCell(sevIdx + 1).font = { color: SEV_FONT_COLOR[severity], bold: true };
    }
  }
  row.eachCell((cell) => {
    cell.alignment = { wrapText: true, vertical: "top" };
  });
  return row;
}

function setColWidths(ws, widths) {
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
}

// ─── Sheet builders ────────────────────────────────────────────────────────────

function buildExecutiveSummarySheet(wb, pack) {
  const ws = wb.addWorksheet("Executive Summary");
  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 55;

  const addKv = (label, value) => {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = { bold: true, color: { argb: "FF64748B" }, size: 10 };
    row.getCell(2).font = { size: 10 };
    row.height = 18;
  };

  const es = pack.executiveSummary || {};
  const wf = pack.workflow         || {};
  const dc = pack.decision         || {};
  const er = pack.evidenceReadiness|| {};

  addKv("Review ID",         pack.metadata?.reviewId || "");
  addKv("Customer",          pack.customer?.name || "");
  addKv("Project",           pack.project?.name  || "");
  addKv("Generated At",      pack.metadata?.generatedAt || "");
  addKv("Workflow State",    wf.currentState || "");
  addKv("Overall Score",     `${es.overallScore ?? 0} / 100`);
  addKv("Score Band",        es.scoreBand || "");
  addKv("Recommendation",    es.recommendation || "");
  addKv("Governance Posture",dc.governancePosture || "");
  addKv("Reviewer Decision", dc.reviewerDecision || "Not Recorded");
  addKv("Reviewer",          dc.reviewerName || "");
  addKv("Decision Date",     dc.recordedAt || "");
  addKv("Evidence Readiness",er.status || "");
  addKv("Evidence Reason",   er.reason  || "");
  addKv("Total Findings",    (pack.findings || []).length);
  addKv("Open High/Critical",(pack.findings || []).filter((f) => ["Critical","High"].includes(f.severity) && f.status !== "Closed").length);
  addKv("Open Actions",      (pack.remediationActions || []).filter((a) => a.status === "Open").length);
  addKv("Risk Acceptance Required", dc.riskAcceptanceRequired ? "Yes" : "No");
  if (dc.governanceWarning) addKv("Governance Warning", dc.governanceWarning);
}

function buildFindingsSheet(wb, pack) {
  const ws = wb.addWorksheet("Findings");
  const headers = ["Finding ID","Title","Severity","Status","Domain","Description","Recommendation","Source","Confidence","Evidence Gap"];
  setHeaderRow(ws, headers);
  setColWidths(ws, [14,32,10,12,16,40,40,12,12,24]);

  for (const f of pack.findings || []) {
    addDataRow(ws, [
      f.findingId, f.title, f.severity, f.status, f.domain,
      f.description, f.recommendation, f.source, f.confidence, f.evidenceGap,
    ], f.severity);
  }
}

function buildRisksSheet(wb, pack) {
  const ws = wb.addWorksheet("Risks");
  const headers = ["Risk ID","Linked Finding","Risk Title","Severity","Likelihood","Impact","Risk Owner","Mitigation","Status","Due Date"];
  setHeaderRow(ws, headers);
  setColWidths(ws, [10,14,28,10,10,36,18,36,12,12]);

  for (const r of pack.riskRegister || []) {
    addDataRow(ws, [
      r.riskId, r.linkedFindingId, r.riskTitle, r.severity,
      r.likelihood, r.impact, r.riskOwner, r.mitigation, r.status, r.dueDate || "",
    ], r.severity);
  }
}

function buildActionsSheet(wb, pack) {
  const ws = wb.addWorksheet("Actions");
  const headers = ["Action ID","Linked Finding","Title","Severity","Domain","Owner","Due Date","Due Status","Status","Source"];
  setHeaderRow(ws, headers);
  setColWidths(ws, [14,14,36,10,16,18,12,12,12,12]);

  for (const a of pack.remediationActions || []) {
    addDataRow(ws, [
      a.actionId, a.linkedFindingId, a.title, a.severity, a.domain,
      a.owner, a.dueDate || "", a.dueStatus, a.status, a.source,
    ], a.severity);
  }
}

function buildScorecardSheet(wb, pack) {
  const ws = wb.addWorksheet("Scorecard");
  setHeaderRow(ws, ["Domain","Score","Max Score","Percentage","Rationale"]);
  setColWidths(ws, [22,10,10,12,50]);

  // Overall row
  const sc = pack.scorecard || {};
  const ovRow = ws.addRow(["OVERALL", sc.totalScore || 0, sc.maxScore || 100, `${sc.percentage || 0}%`, "Overall architecture review score"]);
  ovRow.font  = { bold: true };
  ovRow.fill  = SECTION_FILL;
  ovRow.height = 20;

  for (const d of sc.domains || []) {
    const row = ws.addRow([d.domain, d.score, d.maxScore, `${d.percentage}%`, d.rationale]);
    row.height = 18;
    row.eachCell((cell) => { cell.alignment = { wrapText: true, vertical: "top" }; });
  }
}

function buildEvidenceReadinessSheet(wb, pack) {
  const ws = wb.addWorksheet("Evidence Readiness");
  const er = pack.evidenceReadiness || {};

  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 60;

  [
    ["Status",     er.status     || ""],
    ["Confidence", er.confidence || ""],
    ["Reason",     er.reason     || ""],
  ].forEach(([k, v]) => {
    const row = ws.addRow([k, v]);
    row.getCell(1).font = { bold: true };
    row.height = 18;
  });

  ws.addRow([]);
  setHeaderRow(ws, ["File Name","Document Type","Extraction Status","Warning"], ws.rowCount + 1);
  setColWidths(ws, [28,18,16,50]);

  for (const inp of [
    ...(er.failedInputs   || []),
    ...(er.partialInputs  || []),
    ...(er.completedInputs|| []),
  ]) {
    const row = ws.addRow([inp.fileName, inp.documentType, inp.extractionStatus, inp.extractionSummary || ""]);
    if (inp.extractionStatus === "Failed") {
      row.getCell(3).font = { color: { argb: "FFD92B2B" }, bold: true };
    }
    row.height = 18;
  }
}

function buildRequirementsSheet(wb, pack) {
  const ws = wb.addWorksheet("Requirements");
  setHeaderRow(ws, ["Requirement ID","Text","Domain","Priority","Source File","Source Type","Evidence Status"]);
  setColWidths(ws, [16,50,16,10,24,16,18]);

  for (const r of pack.requirements || []) {
    const row = ws.addRow([r.requirementId, r.text, r.domain, r.priority, r.sourceFile, r.sourceType, r.evidenceStatus]);
    row.height = 18;
    row.eachCell((cell) => { cell.alignment = { wrapText: true, vertical: "top" }; });
  }
}

function buildEvidenceRegisterSheet(wb, pack) {
  const ws = wb.addWorksheet("Evidence Register");
  setHeaderRow(ws, ["Evidence ID","Type","Text","Source File","Page","Confidence","Proves Implementation"]);
  setColWidths(ws, [16,22,50,24,8,12,18]);

  for (const e of pack.evidence || []) {
    const row = ws.addRow([
      e.evidenceId, e.evidenceType, e.text, e.sourceFile,
      e.sourcePage || "", e.confidence, e.provesImplementation ? "Yes" : "No",
    ]);
    row.height = 18;
    row.eachCell((cell) => { cell.alignment = { wrapText: true, vertical: "top" }; });
  }
}

function buildTraceabilitySheet(wb, pack) {
  const ws = wb.addWorksheet("Traceability");
  setHeaderRow(ws, ["Requirement ID","Requirement Text","Domain","Evidence Status","Evidence Count","Finding Count","Action Count","Source Files"]);
  setColWidths(ws, [16,40,16,18,12,12,12,30]);

  for (const t of pack.traceability || []) {
    const row = ws.addRow([
      t.requirementId, t.requirementText, t.domain, t.evidenceStatus,
      t.evidenceIds.length, t.findingIds.length, t.actionIds.length,
      t.sourceFiles.join("; "),
    ]);
    if (t.evidenceStatus === "Not Evidenced") {
      row.getCell(4).font = { color: { argb: "FFD92B2B" }, bold: true };
    }
    row.height = 18;
    row.eachCell((cell) => { cell.alignment = { wrapText: true, vertical: "top" }; });
  }
}

function buildDecisionSheet(wb, pack) {
  const ws = wb.addWorksheet("Decision");
  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 60;

  const dc = pack.decision || {};
  [
    ["Reviewer Decision",      dc.reviewerDecision   || "Not Recorded"],
    ["Governance Posture",     dc.governancePosture  || ""],
    ["Risk Acceptance Required",dc.riskAcceptanceRequired ? "Yes" : "No"],
    ["Reviewer Name",          dc.reviewerName       || ""],
    ["Reviewer Role",          dc.reviewerRole       || ""],
    ["Recorded At",            dc.recordedAt         || ""],
    ["Rationale",              dc.rationale          || ""],
    ["Governance Warning",     dc.governanceWarning  || ""],
  ].forEach(([k, v]) => {
    const row = ws.addRow([k, v]);
    row.getCell(1).font = { bold: true, color: { argb: "FF64748B" } };
    if (k === "Governance Warning" && v) {
      row.getCell(2).font = { color: { argb: "FFD92B2B" } };
    }
    row.height = 18;
    row.eachCell((cell) => { cell.alignment = { wrapText: true, vertical: "top" }; });
  });
}

function buildExportWarningsSheet(wb, pack) {
  const ws = wb.addWorksheet("Export Warnings");
  setHeaderRow(ws, ["Warning ID","Severity","Message","Affected Sections"]);
  setColWidths(ws, [12,10,60,30]);

  for (const w of pack.exportWarnings || []) {
    const row = ws.addRow([w.warningId, w.severity, w.message, (w.affectedSections || []).join(", ")]);
    if (w.severity === "High") {
      row.getCell(2).font = { color: { argb: "FFD92B2B" }, bold: true };
    } else if (w.severity === "Medium") {
      row.getCell(2).font = { color: { argb: "FFF0A500" }, bold: true };
    }
    row.height = 18;
    row.eachCell((cell) => { cell.alignment = { wrapText: true, vertical: "top" }; });
  }
}

function buildUploadedInputsSheet(wb, pack) {
  const ws = wb.addWorksheet("Uploaded Inputs");
  setHeaderRow(ws, ["Input ID","File Name","Document Type","Extraction Status","Text Available","Warning"]);
  setColWidths(ws, [14,32,18,16,14,40]);

  for (const inp of pack.uploadedInputs || []) {
    const row = ws.addRow([
      inp.inputId, inp.fileName, inp.documentType,
      inp.extractionStatus, inp.textAvailable ? "Yes" : "No",
      inp.extractionSummary || "",
    ]);
    if (inp.extractionStatus === "Failed") {
      row.getCell(4).font = { color: { argb: "FFD92B2B" }, bold: true };
    }
    row.height = 18;
    row.eachCell((cell) => { cell.alignment = { wrapText: true, vertical: "top" }; });
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Generates an Excel workbook from a canonical ArbReviewOutputPack.
 *
 * @param {object} pack  ArbReviewOutputPack from normalizeReviewForExport()
 * @returns {Promise<Buffer>}  .xlsx binary buffer
 */
async function generateArbExcel(pack) {
  const wb = new ExcelJS.Workbook();
  wb.creator  = "CARI — Cloud Architecture Review Intelligence";
  wb.created  = new Date();
  wb.modified = new Date();
  wb.properties.date1904 = false;

  buildExecutiveSummarySheet(wb, pack);
  buildFindingsSheet(wb, pack);
  buildRisksSheet(wb, pack);
  buildActionsSheet(wb, pack);
  buildScorecardSheet(wb, pack);
  buildEvidenceReadinessSheet(wb, pack);
  buildRequirementsSheet(wb, pack);
  buildEvidenceRegisterSheet(wb, pack);
  buildTraceabilitySheet(wb, pack);
  buildDecisionSheet(wb, pack);
  buildExportWarningsSheet(wb, pack);
  buildUploadedInputsSheet(wb, pack);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

module.exports = { generateArbExcel };
