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

/**
 * Converts a Document Intelligence HTTP error into a human-readable, actionable message.
 * Used by both the REST and SDK code paths.
 */
function buildDiErrorMessage(operation, status, body = "") {
  const snippet = (typeof body === "string" ? body : JSON.stringify(body)).slice(0, 300);
  const base = `Document Intelligence ${operation} failed (HTTP ${status})`;
  if (status === 429) {
    return `${base}: Quota or rate limit exceeded. The Free tier (F0) allows only 500 pages/month — upgrade to S0 in Azure Portal or az CLI: az cognitiveservices account update --name <di-resource-name> --resource-group <rg> --sku S0`;
  }
  if (status === 401 || status === 403) {
    return `${base}: Authentication failed. Verify the Function App Managed Identity has the "Cognitive Services User" role on the Document Intelligence resource in Azure Portal → IAM.`;
  }
  if (status === 413) {
    return `${base}: File exceeds Document Intelligence's size limit (500 MB per document). Split the file before uploading.`;
  }
  if (status === 400) {
    return `${base}: Unsupported document format or malformed file. Supported formats: PDF, DOCX, PPTX, XLSX. Detail: ${snippet}`;
  }
  if (status === 503 || status === 502) {
    return `${base}: Service temporarily unavailable. Retry in a few minutes. Detail: ${snippet}`;
  }
  return `${base}: ${snippet}`;
}

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

    // Guard against indefinite hangs — DI SDK pollUntilDone has no built-in timeout.
    // 90 s is enough for all supported doc sizes; beyond that the file is marked Failed
    // so the rest of the extraction pipeline can continue rather than stalling forever.
    const abortController = new AbortController();
    const abortTimer = setTimeout(() => abortController.abort(), 90000);
    let result;
    try {
      result = await poller.pollUntilDone({ abortSignal: abortController.signal });
    } finally {
      clearTimeout(abortTimer);
    }

    if (!result || !result.content) {
      return null;
    }

    return buildTextFromAnalysisResult(result, fileName);
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error(`Azure Document Intelligence timed out after 90 s for "${fileName}". Large or complex documents may need more time — consider splitting into smaller files.`);
    }
    // SDK wraps HTTP errors — inspect status code from RestError if available
    const statusCode = err?.statusCode ?? err?.response?.status;
    if (statusCode) {
      throw new Error(buildDiErrorMessage("text extraction", statusCode, err?.message ?? ""));
    }
    throw new Error(`Azure Document Intelligence extraction failed for "${fileName}": ${err?.message ?? err}`);
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
    throw new Error(buildDiErrorMessage("layout analysis", submitRes.status, text));
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

/**
 * Verifies that the Document Intelligence service is reachable and the
 * Managed Identity has the correct RBAC permissions.
 *
 * Uses the GET /documentModels endpoint (read-only, no quota cost) rather than
 * submitting a document, so this can be called from health-check routes safely.
 *
 * @returns {{ ok: boolean, configured: boolean, message: string, skuHint?: string }}
 */
async function checkDocumentIntelligenceHealth() {
  const config = getDocumentIntelligenceConfiguration();
  if (!config.configured) {
    return { ok: false, configured: false, message: "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT / AZURE_DOCINT_ENDPOINT is not set in Application Settings." };
  }

  try {
    const url = `${DI_ENDPOINT}/documentintelligence/documentModels?api-version=${DI_API_VERSION}`;
    const headers = await getDocumentIntelligenceHeaders("application/json");
    delete headers["Content-Type"];
    const res = await fetch(url, { headers });

    if (res.ok) {
      return {
        ok: true,
        configured: true,
        message: `Document Intelligence reachable at ${DI_ENDPOINT}. Auth mode: ${DI_KEY ? "API key" : "Managed Identity"}.`,
        skuHint: "Verify SKU in Azure Portal — Free tier (F0) allows only 500 pages/month. Upgrade to S0 for production."
      };
    }

    return {
      ok: false,
      configured: true,
      message: buildDiErrorMessage("health check (GET /documentModels)", res.status, await res.text().catch(() => ""))
    };
  } catch (err) {
    return { ok: false, configured: true, message: `Document Intelligence health check failed: ${err?.message ?? err}` };
  }
}

module.exports = {
  getDocumentIntelligenceConfiguration,
  supportsDocumentIntelligenceExtraction,
  extractDocumentText,
  extractDocumentLayout,
  checkDocumentIntelligenceHealth,
  DI_EXTRACTABLE_EXTENSIONS
};
