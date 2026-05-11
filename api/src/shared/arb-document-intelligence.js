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
 *   AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT  (preferred)
 *   AZURE_DOCINT_ENDPOINT                 (production fallback)
 *   AZURE_DOCUMENT_INTELLIGENCE_KEY       (optional, or use managed identity)
 *   AZURE_DOCINT_KEY                      (optional fallback key name)
 *
 * Graceful degradation: if not configured, returns null so the caller can fall back
 * to the existing Limited Evidence path — no hard dependency on this service.
 */

const { AzureKeyCredential, DocumentAnalysisClient } = require("@azure/ai-form-recognizer");
const { DefaultAzureCredential } = require("@azure/identity");

const DI_ENDPOINT = (
  process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT ||
  process.env.AZURE_DOCINT_ENDPOINT ||
  ""
).replace(/\/+$/, "");
const DI_KEY = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY || process.env.AZURE_DOCINT_KEY || "";
const DI_API_VERSION = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_VERSION || "2024-11-30";

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
    endpoint: DI_ENDPOINT,
    endpointSource: process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT
      ? "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT"
      : process.env.AZURE_DOCINT_ENDPOINT
        ? "AZURE_DOCINT_ENDPOINT"
        : null,
    authMode: DI_KEY ? "key" : "managedIdentity"
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
  if (!config.configured) {
    throw new Error("Azure Document Intelligence is not configured. Set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT or AZURE_DOCINT_ENDPOINT.");
  }

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
    throw new Error(`Azure Document Intelligence extraction failed for ${fileName}: ${err?.message ?? err}`);
  }
}

let _diCredential = null;
function getDocumentIntelligenceCredential() {
  if (!_diCredential) _diCredential = new DefaultAzureCredential();
  return _diCredential;
}

async function getDocumentIntelligenceHeaders(contentType = "application/octet-stream") {
  const headers = { "Content-Type": contentType };
  if (DI_KEY) {
    headers["Ocp-Apim-Subscription-Key"] = DI_KEY;
    return headers;
  }

  const token = await getDocumentIntelligenceCredential().getToken("https://cognitiveservices.azure.com/.default");
  headers.Authorization = `Bearer ${token.token}`;
  return headers;
}

async function fetchDocumentIntelligenceJson(url) {
  const headers = await getDocumentIntelligenceHeaders("application/json");
  delete headers["Content-Type"];
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Document Intelligence request failed ${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchDocumentIntelligenceBinary(url) {
  const headers = await getDocumentIntelligenceHeaders("application/octet-stream");
  delete headers["Content-Type"];
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Document Intelligence figure request failed ${res.status}: ${text}`);
  }
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") || "image/png"
  };
}

function buildFigureUrl(operationLocation, figureId) {
  const url = new URL(operationLocation);
  const resultPath = url.pathname.replace(/\/analyzeResults\/([^/?]+).*$/i, "/analyzeResults/$1");
  return `${url.origin}${resultPath}/figures/${encodeURIComponent(figureId)}${url.search}`;
}

async function pollAnalyzeResult(operationLocation, maxMs = 180000) {
  const started = Date.now();
  let delay = 1500;

  while (Date.now() - started < maxMs) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 1.5, 7000);

    const data = await fetchDocumentIntelligenceJson(operationLocation);
    const status = String(data.status || "").toLowerCase();
    if (status === "succeeded") return data.analyzeResult || data;
    if (status === "failed") throw new Error(`Document Intelligence analysis failed: ${JSON.stringify(data.error || data).slice(0, 800)}`);
  }

  throw new Error("Document Intelligence analysis timed out.");
}

async function extractDocumentLayout(buffer, contentType, fileName, options = {}) {
  const config = getDocumentIntelligenceConfiguration();
  if (!config.configured) {
    throw new Error("Azure Document Intelligence is not configured. Set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT or AZURE_DOCINT_ENDPOINT.");
  }

  const query = new URLSearchParams({ "api-version": DI_API_VERSION });
  if (options.includeFigures) query.set("output", "figures");
  const analyzeUrl = `${DI_ENDPOINT}/documentintelligence/documentModels/prebuilt-layout:analyze?${query.toString()}`;

  const submitRes = await fetch(analyzeUrl, {
    method: "POST",
    headers: await getDocumentIntelligenceHeaders(contentType || "application/octet-stream"),
    body: buffer
  });

  if (!submitRes.ok) {
    const text = await submitRes.text().catch(() => `HTTP ${submitRes.status}`);
    throw new Error(`Document Intelligence layout analysis failed ${submitRes.status}: ${text}`);
  }

  const operationLocation = submitRes.headers.get("operation-location") || submitRes.headers.get("Operation-Location");
  if (!operationLocation) throw new Error("Document Intelligence did not return an Operation-Location header.");

  const result = await pollAnalyzeResult(operationLocation);
  const figures = [];

  if (options.includeFigures) {
    for (const figure of result.figures || []) {
      const figureId = String(figure.id || figure.figureId || "").trim();
      if (!figureId) continue;

      try {
        const image = await fetchDocumentIntelligenceBinary(buildFigureUrl(operationLocation, figureId));
        figures.push({
          figureId,
          pageNumber: figure.boundingRegions?.[0]?.pageNumber ?? null,
          buffer: image.buffer,
          contentType: image.contentType,
          extractionSource: "Document Intelligence figures + multimodal analysis"
        });
      } catch (error) {
        figures.push({
          figureId,
          pageNumber: figure.boundingRegions?.[0]?.pageNumber ?? null,
          error: error instanceof Error ? error.message : String(error),
          extractionSource: "Document Intelligence figure retrieval failed"
        });
      }
    }
  }

  return {
    text: buildTextFromAnalysisResult(result, fileName),
    result,
    figures
  };
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
  extractDocumentLayout,
  DI_EXTRACTABLE_EXTENSIONS
};
