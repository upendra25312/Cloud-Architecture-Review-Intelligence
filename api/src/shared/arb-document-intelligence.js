/**
 * arb-document-intelligence.js
 *
 * Azure AI Document Intelligence (Form Recognizer v4) integration for the ARB pipeline.
 * Extracts rich text from PDF, DOCX, DOC, PPTX, PPT, ODP and other binary document
 * formats that cannot be read as plain text.
 *
 * Supported model: prebuilt-layout — extracts text, tables, key-value pairs, and
 * structure (headings, paragraphs, page numbers) from any supported document format.
 *
 * Configuration:
 *   AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT  (required)
 *   AZURE_DOCUMENT_INTELLIGENCE_KEY       (required, or use managed identity)
 *
 * Graceful degradation: if not configured, returns null so the caller can fall back
 * to the existing Limited Evidence path — no hard dependency on this service.
 */

const { AzureKeyCredential, DocumentAnalysisClient } = require("@azure/ai-form-recognizer");
const { DefaultAzureCredential } = require("@azure/identity");

const DI_ENDPOINT = (process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT || "").replace(/\/+$/, "");
const DI_KEY = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY || "";

// File extensions that Document Intelligence can analyse natively.
// PDF and Office formats produce the richest findings via layout model.
const DI_EXTRACTABLE_EXTENSIONS = new Set([
  ".pdf",
  ".docx", ".doc",
  ".pptx", ".ppt", ".odp",
  ".xlsx", ".xls", ".ods" // fallback only — SheetJS is preferred for spreadsheets
]);

function getDocumentIntelligenceConfiguration() {
  return {
    configured: Boolean(DI_ENDPOINT),
    endpoint: DI_ENDPOINT
  };
}

function supportsDocumentIntelligenceExtraction(fileName) {
  const ext = fileName.includes(".")
    ? "." + fileName.split(".").pop().toLowerCase()
    : "";
  return DI_EXTRACTABLE_EXTENSIONS.has(ext);
}

function getDocumentAnalysisClient() {
  if (!DI_ENDPOINT) return null;

  // Prefer API key when provided; fall back to managed identity (Entra ID)
  const credential = DI_KEY
    ? new AzureKeyCredential(DI_KEY)
    : new DefaultAzureCredential();

  return new DocumentAnalysisClient(DI_ENDPOINT, credential);
}

/**
 * Extracts text from a binary document buffer using Azure AI Document Intelligence.
 *
 * Returns structured plain text with:
 * - Page separators
 * - Table content (rows as pipe-delimited lines)
 * - Key-value pairs (labelled)
 * - Paragraph text in reading order
 *
 * Returns null if Document Intelligence is not configured or the extraction fails,
 * allowing the caller to fall back gracefully.
 *
 * @param {Buffer} buffer  Raw file bytes
 * @param {string} contentType  MIME type (e.g. "application/pdf")
 * @param {string} fileName  Original filename for logging
 * @returns {Promise<string|null>}
 */
async function extractDocumentText(buffer, contentType, fileName) {
  const config = getDocumentIntelligenceConfiguration();
  if (!config.configured) return null;

  const client = getDocumentAnalysisClient();
  if (!client) return null;

  try {
    // Upload buffer as a readable stream
    const { Readable } = require("stream");
    const stream = Readable.from(buffer);

    const poller = await client.beginAnalyzeDocument("prebuilt-layout", stream, {
      contentType: contentType || "application/octet-stream"
    });

    const result = await poller.pollUntilDone();

    if (!result || !result.content) {
      return null;
    }

    return buildTextFromAnalysisResult(result, fileName);
  } catch (err) {
    // Log but do not throw — caller decides whether to fall back
    console.error(`[DocumentIntelligence] extraction failed for ${fileName}: ${err?.message ?? err}`);
    return null;
  }
}

/**
 * Converts a Document Intelligence AnalyzeResult into structured plain text
 * that can be chunked and indexed by the ARB search pipeline.
 */
function buildTextFromAnalysisResult(result, fileName) {
  const parts = [];

  // Document title / header
  parts.push(`[Document: ${fileName}]`);

  // Iterate pages
  for (const page of result.pages ?? []) {
    parts.push(`\n--- Page ${page.pageNumber} ---`);

    // Lines of text in reading order
    for (const line of page.lines ?? []) {
      const text = (line.content ?? "").trim();
      if (text.length >= 3) parts.push(text);
    }
  }

  // Tables — render as pipe-delimited rows for readability
  for (const table of result.tables ?? []) {
    parts.push("\n[Table]");
    // Group cells by row index
    const rows = new Map();
    for (const cell of table.cells ?? []) {
      if (!rows.has(cell.rowIndex)) rows.set(cell.rowIndex, []);
      rows.get(cell.rowIndex).push({ col: cell.columnIndex, text: (cell.content ?? "").trim() });
    }
    for (const [, cells] of [...rows.entries()].sort(([a], [b]) => a - b)) {
      const sorted = cells.sort((a, b) => a.col - b.col).map((c) => c.text);
      parts.push("| " + sorted.join(" | ") + " |");
    }
  }

  // Key-value pairs (form fields, document properties)
  const kvParts = [];
  for (const kv of result.keyValuePairs ?? []) {
    const key = (kv.key?.content ?? "").trim();
    const value = (kv.value?.content ?? "").trim();
    if (key && value) kvParts.push(`${key}: ${value}`);
  }
  if (kvParts.length > 0) {
    parts.push("\n[Key-Value Pairs]");
    parts.push(...kvParts);
  }

  return parts.join("\n").trim();
}

module.exports = {
  getDocumentIntelligenceConfiguration,
  supportsDocumentIntelligenceExtraction,
  extractDocumentText,
  DI_EXTRACTABLE_EXTENSIONS
};
