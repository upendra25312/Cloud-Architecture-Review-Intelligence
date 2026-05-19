const crypto = require("node:crypto");
const path = require("node:path");
const zlib = require("node:zlib");
const ExcelJS = require("exceljs");
const JSZip = require("jszip");
const { normalizeReviewForExport } = require("./arb-normalize-review");
const { validateArbReviewOutputPack } = require("./arb-export-validator");
const { generateArbExcel } = require("./arb-excel-export");
const { generateArbDocx } = require("./arb-docx-export");
const {
  ARB_INPUT_CONTAINER_NAME,
  ARB_OUTPUT_CONTAINER_NAME,
  ARB_PROCESSING_CACHE_CONTAINER_NAME,
  getContainerClient,
  readBinaryBlob,
  readTextBlob,
  readJsonBlob,
  uploadJsonBlob,
  sanitizePathSegment,
  uploadBinaryBlob,
  uploadTextBlob
} = require("./storage");
const { getCopilotConfiguration, runCopilot } = require("./copilot");
const { ensureArbSearchIndex, indexArbDocumentChunks, getSearchConfiguration } = require("./arb-search");
const { describeImageForReview, getFoundryConfiguration, aiEnhanceRequirements } = require("./arb-foundry-agent");
const {
  getDocumentIntelligenceConfiguration,
  supportsDocumentIntelligenceExtraction,
  extractDocumentText,
  extractDocumentLayout
} = require("./arb-document-intelligence");
const {
  getVisionServiceConfiguration,
  supportsVisionExtraction,
  extractTextWithVision
} = require("./arb-vision-service");
const {
  ARB_REVIEW_TABLE_NAME,
  encodeTableKey,
  getTableClient
} = require("./table-storage");
const { checkAndReserveQuota } = require("./arb-extraction-quota");

// Visual analysis results are cached by image content hash (SHA-256).
// Same diagram uploaded to any review hits the same entry — no re-analysis needed.
// TTL: 30 days. Stored in arb-processing-cache blob container.
const VISUAL_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const SUMMARY_ROW_KEY = "SUMMARY";
const FINDINGS_ROW_KEY = "FINDINGS";
const SCORECARD_ROW_KEY = "SCORECARD";
const DECISION_ROW_KEY = "DECISION_LATEST";
const ACTIONS_ROW_KEY = "ACTIONS";
const FILES_ROW_KEY = "FILES";
const EXTRACTION_ROW_KEY = "EXTRACTION";
const REQUIREMENTS_ROW_KEY = "REQUIREMENTS";
const EVIDENCE_ROW_KEY = "EVIDENCE";
const EXPORTS_ROW_KEY = "EXPORTS";
const REQUIRED_LOGICAL_CATEGORIES = ["sow", "design_doc"];
const RECOMMENDED_LOGICAL_CATEGORIES = [
  "diagram",
  "security_note",
  "cost_assumptions",
  "dr_ha_note",
  "ops_monitoring_note"
];
const TEXT_EXTRACTABLE_EXTENSIONS = new Set([
  // Plain text
  ".txt", ".md", ".markdown",
  // Structured data
  ".csv", ".json", ".xml", ".yaml", ".yml",
  // IaC / config
  ".bicep", ".tf", ".hcl", ".toml",
  // Diagrams (XML-based, fully readable)
  ".drawio", ".draw.io",
  // Whiteboard / diagramming (text-based)
  ".excalidraw", ".mmd", ".mermaid", ".puml", ".plantuml",
  // Markup
  ".html", ".htm",
  // Scripts & automation
  ".ps1", ".psm1", ".sh", ".azcli",
  // API & schema definitions
  ".proto", ".graphql", ".gql", ".wsdl", ".xsd",
  // Notebooks (JSON-based)
  ".ipynb",
  // Rich text
  ".rtf",
  // Vector graphics (XML-based, fully readable as text)
  ".svg", ".svgz"
]);
const SPREADSHEET_EXTRACTABLE_EXTENSIONS = new Set([
  ".xlsx", ".xls", ".ods"
]);
const IMAGE_EXTRACTABLE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".svg", ".svgz"
]);
const DIAGRAM_EXTRACTABLE_EXTENSIONS = new Set([
  ".drawio", ".draw.io", ".vsdx"
]);
const DIAGRAM_TEXT_EXTENSIONS = new Set([
  ".mmd", ".mermaid", ".puml", ".plantuml", ".excalidraw"
]);
const OFFICE_VISUAL_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff", ".webp", ".svg",
  ".emf", ".wmf"
]);
const MULTIMODAL_IMAGE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff", ".webp", ".svg"
]);
const OFFICE_RENDERER_ENDPOINT = (process.env.OFFICE_RENDERER_ENDPOINT || "").replace(/\/+$/, "");
const OFFICE_RENDERER_SHARED_SECRET = process.env.OFFICE_RENDERER_SHARED_SECRET || "";
const OFFICE_RENDERER_MAX_FILE_BYTES = Number(process.env.OFFICE_RENDERER_MAX_FILE_BYTES || 50 * 1024 * 1024);
const OFFICE_RENDERER_MAX_PAGES = Number(process.env.OFFICE_RENDERER_MAX_PAGES || 70);
const DOCUMENT_MAX_TOTAL_RENDER_PAGES = Number(process.env.DOCUMENT_MAX_TOTAL_RENDER_PAGES || 200);
const OFFICE_RENDERER_TIMEOUT_MS = Number(process.env.OFFICE_RENDERER_TIMEOUT_MS || 120000);
const ZIP_MAX_FILES = Number(process.env.ARB_ZIP_MAX_FILES || 30);
const ZIP_MAX_EXTRACTED_BYTES = Number(process.env.ARB_ZIP_MAX_EXTRACTED_BYTES || 100 * 1024 * 1024);
const SUPPORTED_UPLOAD_EXTENSIONS = new Set([
  // Documents
  ".pdf", ".doc", ".docx", ".rtf", ".odt",
  // Presentations
  ".ppt", ".pptx", ".odp",
  // Spreadsheets & data
  ".xls", ".xlsx", ".csv", ".ods",
  // Diagrams
  ".drawio", ".draw.io", ".vsdx", ".svg", ".svgz",
  // Whiteboard / diagramming tools
  ".excalidraw", ".mmd", ".mermaid", ".puml", ".plantuml",
  // Images / screenshots
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff",
  // Text & markup
  ".txt", ".md", ".markdown", ".html", ".htm",
  // Structured / IaC
  ".json", ".xml", ".yaml", ".yml", ".bicep", ".tf", ".hcl", ".toml",
  // Scripts & automation (Azure PowerShell, Azure CLI, Bash)
  ".ps1", ".psm1", ".sh", ".azcli",
  // API & schema definitions
  ".proto", ".graphql", ".gql", ".wsdl", ".xsd",
  // Notebooks
  ".ipynb",
  // Evidence packages
  ".zip"
]);
const EXTRACTION_KEYWORD_MAP = [
  // Security
  ["security", "Security"],
  ["encryption", "Security"],
  ["tls", "Security"],
  ["ssl", "Security"],
  ["firewall", "Security"],
  ["nsg", "Security"],
  ["network security group", "Security"],
  ["private endpoint", "Security"],
  ["private link", "Security"],
  ["waf", "Security"],
  ["zero trust", "Security"],
  ["defender", "Security"],
  ["threat", "Security"],
  // Identity
  ["identity", "Identity"],
  ["authentication", "Identity"],
  ["authoris", "Identity"],
  ["authoriz", "Identity"],
  ["iam", "Identity"],
  ["rbac", "Identity"],
  ["role-based", "Identity"],
  ["entra", "Identity"],
  ["managed identity", "Identity"],
  ["service principal", "Identity"],
  ["pim", "Identity"],
  ["mfa", "Identity"],
  ["multi-factor", "Identity"],
  ["secret", "Identity"],
  ["credential", "Identity"],
  ["key vault", "Identity"],
  // Networking
  ["network", "Networking"],
  ["vnet", "Networking"],
  ["subnet", "Networking"],
  ["vpn", "Networking"],
  ["expressroute", "Networking"],
  ["dns", "Networking"],
  ["load balanc", "Networking"],
  ["traffic manager", "Networking"],
  ["front door", "Networking"],
  ["application gateway", "Networking"],
  ["api management", "Networking"],
  ["apim", "Networking"],
  // Cost
  ["cost", "Cost"],
  ["pricing", "Cost"],
  ["budget", "Cost"],
  ["reserved instance", "Cost"],
  ["savings plan", "Cost"],
  ["autoscale", "Cost"],
  ["auto-scale", "Cost"],
  ["right-siz", "Cost"],
  ["commercial", "Cost"],
  // Operations
  ["monitor", "Operations"],
  ["logging", "Operations"],
  ["log analytics", "Operations"],
  ["application insights", "Operations"],
  ["alerting", "Operations"],
  ["alert", "Operations"],
  ["dashboard", "Operations"],
  ["observability", "Operations"],
  ["telemetry", "Operations"],
  ["runbook", "Operations"],
  ["iac", "Operations"],
  ["terraform", "Operations"],
  ["bicep", "Operations"],
  ["pipeline", "Operations"],
  ["ci/cd", "Operations"],
  ["devops", "Operations"],
  ["tagging", "Operations"],
  // Reliability
  ["resilien", "Reliability"],
  ["recovery", "Reliability"],
  ["backup", "Reliability"],
  ["availability", "Reliability"],
  ["rto", "Reliability"],
  ["rpo", "Reliability"],
  ["failover", "Reliability"],
  ["geo-redundant", "Reliability"],
  ["geo redundant", "Reliability"],
  ["grs", "Reliability"],
  ["zrs", "Reliability"],
  ["multi-region", "Reliability"],
  ["sla", "Reliability"],
  ["uptime", "Reliability"],
  ["disaster recovery", "Reliability"],
  // Governance
  ["govern", "Governance"],
  ["policy", "Governance"],
  ["landing zone", "Governance"],
  ["subscription", "Governance"],
  ["management group", "Governance"],
  ["alz", "Governance"],
  ["compliance", "Governance"],
  ["regulatory", "Governance"],
  ["audit", "Governance"],
  ["gdpr", "Governance"],
  ["hipaa", "Governance"],
  ["pci", "Governance"],
  ["iso 27001", "Governance"],
  ["nist", "Governance"]
];

function encodePrincipalKey(userId) {
  return encodeTableKey(userId);
}

function getRowKey(baseRowKey, userId) {
  return `${baseRowKey}|${encodePrincipalKey(userId)}`;
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function sanitizeReviewSegment(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeReviewId(rawValue, fallback = "demo-review") {
  const normalized = sanitizeReviewSegment(rawValue);
  return normalized || fallback;
}

function sanitizeFilename(value) {
  return String(value ?? "upload.bin")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180) || "upload.bin";
}

function getFileExtension(value) {
  const fileName = String(value ?? "").toLowerCase();
  if (fileName.endsWith(".draw.io")) return ".draw.io";
  return path.extname(fileName);
}

function normalizeLogicalCategory(value, fallback = "supporting_artifact") {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || fallback;
}

function inferLogicalCategory(fileName) {
  const lowered = String(fileName ?? "").toLowerCase();
  const ext = lowered.slice(lowered.lastIndexOf("."));

  // Extension-based overrides
  if (ext === ".drawio" || ext === ".vsdx") return "diagram";
  if (ext === ".bicep" || ext === ".tf") return "design_doc";
  if (ext === ".yaml" || ext === ".yml") return "design_doc";
  if (ext === ".zip") return "supporting_artifact";

  // Filename keyword rules
  if (lowered.includes("sow") || lowered.includes("statement-of-work") || lowered.includes("statement_of_work")) {
    return "sow";
  }

  if (lowered.includes("diagram") || lowered.includes("drawio") || lowered.includes("topology") || lowered.includes("network-map")) {
    return "diagram";
  }

  if (lowered.includes("security") || lowered.includes("threat-model") || lowered.includes("pentest")) {
    return "security_note";
  }

  if (lowered.includes("cost") || lowered.includes("pricing") || lowered.includes("budget")) {
    return "cost_assumptions";
  }

  if (lowered.includes("dr") || lowered.includes("ha") || lowered.includes("resilien") || lowered.includes("disaster") || lowered.includes("recovery")) {
    return "dr_ha_note";
  }

  if (lowered.includes("ops") || lowered.includes("monitor") || lowered.includes("runbook") || lowered.includes("alerting") || lowered.includes("observ")) {
    return "ops_monitoring_note";
  }

  if (lowered.includes("design") || lowered.includes("hld") || lowered.includes("lld") || lowered.includes("architecture") || lowered.includes("landing-zone") || lowered.includes("landing_zone")) {
    return "design_doc";
  }

  return "supporting_artifact";
}

function inferSourceRole(logicalCategory) {
  switch (logicalCategory) {
    case "sow":
      return "Project Manager";
    case "security_note":
      return "Security Architect";
    case "cost_assumptions":
      return "Pre-sales Architect";
    case "ops_monitoring_note":
      return "Platform Lead";
    default:
      return "Architect";
  }
}

function supportsTextExtraction(fileName) {
  return TEXT_EXTRACTABLE_EXTENSIONS.has(getFileExtension(fileName));
}

function supportsSpreadsheetExtraction(fileName) {
  return SPREADSHEET_EXTRACTABLE_EXTENSIONS.has(getFileExtension(fileName));
}

function supportsImageExtraction(fileName) {
  return IMAGE_EXTRACTABLE_EXTENSIONS.has(getFileExtension(fileName));
}

function supportsDiagramExtraction(fileName) {
  return DIAGRAM_EXTRACTABLE_EXTENSIONS.has(getFileExtension(fileName));
}

const SPREADSHEET_MAX_BYTES = 10 * 1024 * 1024; // 10 MB hard cap before parse
const SPREADSHEET_MAX_SHEETS = 20;
const SPREADSHEET_MAX_CSV_CHARS = 500_000;
const DIAGRAM_MAX_BYTES = 20 * 1024 * 1024;

function decodeXmlEntities(value) {
  return String(value ?? "")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function cleanDiagramText(value) {
  return decodeXmlEntities(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractXmlAttributeValues(xml, attributeName) {
  const values = [];
  const pattern = new RegExp(`${attributeName}\\s*=\\s*["']([^"']+)["']`, "gi");
  for (const match of xml.matchAll(pattern)) {
    const text = cleanDiagramText(match[1]);
    if (text && text.length > 1) values.push(text);
  }
  return values;
}

function tryInflateDrawioDiagram(encoded) {
  try {
    const compressed = Buffer.from(encoded, "base64");
    const inflated = zlib.inflateRawSync(compressed).toString("utf8");
    return decodeURIComponent(inflated);
  } catch {
    return null;
  }
}

function extractDrawioCellTopology(xml) {
  const cellLabels = new Map();
  const edgeEntries = [];

  for (const match of xml.matchAll(/<mxCell\b([^>]*)\/?\s*>/gi)) {
    const attrs = match[1];
    const getAttr = (name) => {
      const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"));
      return m ? decodeXmlEntities(m[1]).trim() : null;
    };
    const id = getAttr("id");
    if (!id) continue;
    const value = getAttr("value") || "";
    const isEdge = /\bedge\s*=\s*"1"/i.test(attrs);
    const source = getAttr("source");
    const target = getAttr("target");
    if (value) cellLabels.set(id, value);
    if (isEdge && (source || target)) edgeEntries.push({ source, target, label: value });
  }

  const topology = edgeEntries
    .map(({ source, target, label }) => {
      const from = (source && cellLabels.get(source)) || source || "?";
      const to = (target && cellLabels.get(target)) || target || "?";
      const connector = label ? ` --[${label}]--> ` : " --> ";
      return `${from}${connector}${to}`;
    })
    .filter((line) => !line.startsWith("?") && !line.endsWith("?"));

  return topology;
}

function extractDrawioText(buffer, fileName) {
  const xml = buffer.toString("utf8");
  const parts = [`[Diagram file: ${fileName}] (Draw.io XML)`];
  const values = new Set();
  const allTopology = [];

  for (const value of extractXmlAttributeValues(xml, "value")) values.add(value);
  for (const value of extractXmlAttributeValues(xml, "label")) values.add(value);
  for (const line of extractDrawioCellTopology(xml)) allTopology.push(line);

  for (const match of xml.matchAll(/<diagram\b[^>]*>([\s\S]*?)<\/diagram>/gi)) {
    const body = match[1].trim();
    if (!body) continue;

    const nestedXml = body.startsWith("<") ? body : tryInflateDrawioDiagram(body);
    if (!nestedXml) continue;

    for (const value of extractXmlAttributeValues(nestedXml, "value")) values.add(value);
    for (const value of extractXmlAttributeValues(nestedXml, "label")) values.add(value);
    for (const line of extractDrawioCellTopology(nestedXml)) allTopology.push(line);
  }

  if (values.size === 0) {
    const stripped = cleanDiagramText(xml);
    if (stripped) values.add(stripped.slice(0, 8000));
  }

  parts.push(...[...values].slice(0, 200).map((value) => `- ${value}`));

  const uniqueTopology = [...new Set(allTopology)].slice(0, 100);
  if (uniqueTopology.length > 0) {
    parts.push("\n[Diagram Connections / Topology]");
    parts.push(...uniqueTopology);
  }

  return parts.join("\n");
}

function readZipEntries(buffer) {
  const entries = [];
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65558); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("VSDX archive central directory was not found.");

  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  let offset = centralOffset;

  for (let i = 0; i < entryCount; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + fileNameLength);

    if (buffer.readUInt32LE(localHeaderOffset) === 0x04034b50) {
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const data = buffer.subarray(dataStart, dataStart + compressedSize);
      let content = null;

      if (method === 0) content = data;
      if (method === 8) content = zlib.inflateRawSync(data);

      if (content) entries.push({ name, content });
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function extractVsdxConnections(entries) {
  const shapeTexts = new Map();
  const connections = [];

  for (const entry of entries) {
    if (!/^visio\/pages\//i.test(entry.name)) continue;
    if (!entry.name.toLowerCase().endsWith(".xml")) continue;

    const xml = entry.content.toString("utf8");

    for (const match of xml.matchAll(/<Shape\b[^>]*\bID="([^"]*)"[^>]*>([\s\S]*?)<\/Shape>/gi)) {
      const id = match[1];
      const shapeBody = match[2];
      const textMatch = shapeBody.match(/<Text\b[^>]*>([\s\S]*?)<\/Text>/i);
      if (textMatch) {
        const text = cleanDiagramText(textMatch[1]);
        if (text && text.length > 0) shapeTexts.set(id, text);
      }
    }

    for (const match of xml.matchAll(/<Connect\b[^>]*/gi)) {
      const fromM = match[0].match(/\bFromSheet\s*=\s*"([^"]*)"/i);
      const toM = match[0].match(/\bToSheet\s*=\s*"([^"]*)"/i);
      if (fromM && toM) connections.push({ from: fromM[1], to: toM[1] });
    }
  }

  return { shapeTexts, connections };
}

function extractVsdxText(buffer, fileName) {
  const parts = [`[Diagram file: ${fileName}] (Visio VSDX)`];
  const values = new Set();
  const entries = readZipEntries(buffer);

  for (const entry of entries) {
    if (!/^visio\/(pages|masters|document|_rels)\//i.test(entry.name) && !/^docProps\//i.test(entry.name)) {
      continue;
    }
    if (!entry.name.toLowerCase().endsWith(".xml")) continue;

    const xml = entry.content.toString("utf8");
    for (const match of xml.matchAll(/<Text\b[^>]*>([\s\S]*?)<\/Text>/gi)) {
      const text = cleanDiagramText(match[1]);
      if (text && text.length > 1) values.add(text);
    }
    for (const value of extractXmlAttributeValues(xml, "Name")) values.add(value);
    for (const value of extractXmlAttributeValues(xml, "Label")) values.add(value);
  }

  parts.push(...[...values].slice(0, 250).map((value) => `- ${value}`));

  const { shapeTexts, connections } = extractVsdxConnections(entries);
  if (connections.length > 0) {
    parts.push("\n[Diagram Connections / Topology]");
    const resolved = [...new Set(
      connections.slice(0, 100).map(({ from, to }) => {
        const fromLabel = shapeTexts.get(from) || from;
        const toLabel = shapeTexts.get(to) || to;
        return `${fromLabel} --> ${toLabel}`;
      })
    )];
    parts.push(...resolved);
  }

  return parts.join("\n");
}

async function extractDiagramText(buffer, fileName) {
  if (buffer.length > DIAGRAM_MAX_BYTES) {
    throw new Error(`Diagram exceeds the ${DIAGRAM_MAX_BYTES / (1024 * 1024)} MB extraction limit.`);
  }

  const ext = getFileExtension(fileName);
  if (ext === ".drawio" || ext === ".draw.io") return extractDrawioText(buffer, fileName);
  if (ext === ".vsdx") return extractVsdxText(buffer, fileName);
  return "";
}

function getExtensionFromPath(value) {
  return path.extname(String(value ?? "").toLowerCase());
}

function getVisualContentType(fileName) {
  const ext = getExtensionFromPath(fileName);
  const map = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".webp": "image/webp",
    ".svg": "image/svg+xml"
  };
  return map[ext] || "application/octet-stream";
}

function extractOfficeMediaArtifacts(buffer, fileName) {
  const ext = getFileExtension(fileName);
  const prefix =
    ext === ".docx" ? "word/media/" :
    ext === ".pptx" ? "ppt/media/" :
    ext === ".xlsx" ? "xl/media/" :
    null;

  if (!prefix) return { artifacts: [], warnings: [] };

  const artifacts = [];
  const warnings = [];

  for (const entry of readZipEntries(buffer)) {
    if (!entry.name.toLowerCase().startsWith(prefix)) continue;
    const mediaExt = getExtensionFromPath(entry.name);
    if (!OFFICE_VISUAL_EXTENSIONS.has(mediaExt)) continue;

    if (!MULTIMODAL_IMAGE_EXTENSIONS.has(mediaExt)) {
      warnings.push(`${fileName}: embedded media ${entry.name} is ${mediaExt}; EMF/WMF conversion is not available in this Functions runtime.`);
      continue;
    }

    artifacts.push({
      buffer: entry.content,
      contentType: getVisualContentType(entry.name),
      sourceName: entry.name,
      extension: mediaExt,
      extractionSource: "Office embedded media extraction + multimodal analysis"
    });
  }

  return { artifacts, warnings };
}

async function renderOfficeVisualArtifacts(buffer, fileName) {
  const ext = getFileExtension(fileName);
  if (![".docx", ".pptx", ".xlsx", ".pdf"].includes(ext)) {
    return { artifacts: [], warnings: [] };
  }

  if (!OFFICE_RENDERER_ENDPOINT) {
    return {
      artifacts: [],
      warnings: [`${fileName}: document renderer is not configured (OFFICE_RENDERER_ENDPOINT missing).`]
    };
  }

  if (buffer.length > OFFICE_RENDERER_MAX_FILE_BYTES) {
    return {
      artifacts: [],
      warnings: [`${fileName}: document renderer skipped because file exceeds ${OFFICE_RENDERER_MAX_FILE_BYTES} bytes.`]
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OFFICE_RENDERER_TIMEOUT_MS);

  try {
    const headers = { "Content-Type": "application/json" };
    if (OFFICE_RENDERER_SHARED_SECRET) {
      headers["x-cari-renderer-token"] = OFFICE_RENDERER_SHARED_SECRET;
    }

    const res = await fetch(`${OFFICE_RENDERER_ENDPOINT}/render`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        fileName,
        fileBase64: buffer.toString("base64"),
        maxPages: OFFICE_RENDERER_MAX_PAGES
      })
    });

    const payloadText = await res.text();
    let payload = null;
    try {
      payload = payloadText ? JSON.parse(payloadText) : null;
    } catch {
      payload = null;
    }

    if (!res.ok) {
      const detail = payload?.error || payloadText || `HTTP ${res.status}`;
      return { artifacts: [], warnings: [`${fileName}: Office renderer failed: ${detail}`] };
    }

    const artifacts = [];
    for (const image of Array.isArray(payload?.images) ? payload.images : []) {
      if (!image.base64) continue;
      artifacts.push({
        buffer: Buffer.from(image.base64, "base64"),
        contentType: image.contentType || "image/png",
        sourceName: image.fileName || `${fileName}-render-${image.index || artifacts.length + 1}.png`,
        extension: ".png",
        summaryText: ext === ".pdf"
          ? `Rendered PDF page ${image.sourcePage || image.index || artifacts.length + 1} from ${fileName}.`
          : `Rendered Office visual artifact ${image.index || artifacts.length + 1} from ${fileName}.`,
        sourcePage: image.sourcePage ?? null,
        sourceSlide: image.sourceSlide ?? null,
        sourceSheet: image.sourceSheet ?? null,
        sourceExcerpt: ext === ".pdf"
          ? `Rendered full-page PDF visual artifact from ${fileName}.`
          : `Rendered Office visual artifact from ${fileName}.`,
        extractionSource:
          ext === ".pdf"
            ? "PDF page render fallback + multimodal analysis"
            : ext === ".pptx"
            ? "Office slide render fallback + multimodal analysis"
            : ext === ".xlsx"
              ? "Office sheet render fallback + multimodal analysis"
              : "Office page render fallback + multimodal analysis"
      });
    }

    if (artifacts.length === 0) {
      return { artifacts: [], warnings: [`${fileName}: renderer completed but returned no images.`] };
    }

    return { artifacts, warnings: [] };
  } catch (error) {
    const message = error?.name === "AbortError"
      ? `Office renderer timed out after ${Math.round(OFFICE_RENDERER_TIMEOUT_MS / 1000)} seconds.`
      : (error instanceof Error ? error.message : String(error));
    return { artifacts: [], warnings: [`${fileName}: renderer failed: ${message}`] };
  } finally {
    clearTimeout(timeout);
  }
}

function extractOfficeRenderFallbackEvidence(buffer, fileName) {
  const ext = getFileExtension(fileName);
  const artifacts = [];
  const warnings = [];

  try {
    const entries = readZipEntries(buffer);
    const candidates = entries.filter((entry) => {
      const name = entry.name.toLowerCase();
      if (!name.endsWith(".xml")) return false;
      if (ext === ".pptx") return name.startsWith("ppt/slides/");
      if (ext === ".docx") return name.startsWith("word/document");
      if (ext === ".xlsx") return name.startsWith("xl/worksheets/") || name.startsWith("xl/charts/");
      return false;
    });

    for (const [index, entry] of candidates.slice(0, 12).entries()) {
      const xml = entry.content.toString("utf8");
      const textValues = [
        ...extractXmlAttributeValues(xml, "val"),
        ...extractXmlAttributeValues(xml, "name"),
        ...[...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/gi)].map((m) => cleanDiagramText(m[1])),
        ...[...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/gi)].map((m) => cleanDiagramText(m[1]))
      ].filter((value) => value && value.length > 1);

      const unique = [...new Set(textValues)].slice(0, 80);
      if (unique.length === 0 && !/(graphic|chart|smartart|diagram|shape|pic|cxnSp)/i.test(xml)) continue;

      artifacts.push({
        sourceName: entry.name,
        summaryText: `[Rendered visual fallback candidate: ${entry.name}]\n${unique.map((v) => `- ${v}`).join("\n")}`,
        sourceSlide: ext === ".pptx" ? index + 1 : null,
        sourceSheet: ext === ".xlsx" ? entry.name.replace(/^xl\/worksheets\//i, "") : null,
        extractionSource:
          ext === ".pptx"
            ? "Office slide render fallback + extracted slide XML evidence"
            : ext === ".xlsx"
              ? "Office sheet render fallback + extracted sheet XML evidence"
              : "Office page render fallback + extracted document XML evidence"
      });
    }
  } catch (error) {
    warnings.push(`${fileName}: Office render fallback metadata extraction failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (artifacts.length === 0) {
    warnings.push(`${fileName}: Office render fallback could not create image previews in the current Functions runtime.`);
  }

  return { artifacts, warnings };
}

// Keyword pattern for identifying architecture diagram pages in PDFs.
const PDF_DIAGRAM_KEYWORDS = /\b(architecture|diagram|figure|network|topology|landing\s*zone|hub|spoke|vnet|vwan|governance|management\s*group|subscription|failover|disaster\s*recovery|automation|operations|security|control\s*flow|platform|azure|infrastructure|identity|connectivity|monitoring|nsg|firewall|routing)\b/i;
const PDF_DIAGRAM_WORD_THRESHOLD = 150;
const PDF_FALLBACK_KEYWORDS = /\b(architecture|diagram|figure|network|topology|landing\s*zone|hub|spoke|vnet|governance|management\s*group|subscription|failover|disaster\s*recovery|automation|operations|security|control\s*flow|platform|azure)\b/i;

/**
 * Scans all pages of a PDF using pdf-parse and returns page numbers that are likely
 * architecture diagram pages (low word count + keyword match, or nearly image-only).
 * Fast, CPU-only — no external services required.
 */
async function identifyPdfDiagramCandidatePages(buffer) {
  try {
    const pdfParse = require("pdf-parse");
    const pageTexts = [];

    await pdfParse(buffer, {
      pagerender: async (pageData) => {
        try {
          const content = await pageData.getTextContent();
          const text = content.items.map((item) => item.str || "").join(" ").replace(/\s+/g, " ").trim();
          pageTexts[pageData.pageIndex] = { pageNumber: pageData.pageIndex + 1, text };
          return text;
        } catch {
          pageTexts[pageData.pageIndex] = { pageNumber: pageData.pageIndex + 1, text: "" };
          return "";
        }
      }
    });

    const candidatePages = [];
    const allPageData = [];
    for (const page of pageTexts) {
      if (!page) continue;
      const wordCount = page.text.split(/\s+/).filter(Boolean).length;
      const hasKeywords = PDF_DIAGRAM_KEYWORDS.test(page.text);
      const isLikelyDiagram = (wordCount < PDF_DIAGRAM_WORD_THRESHOLD && hasKeywords) || wordCount < 15;
      allPageData.push({ pageNumber: page.pageNumber, text: page.text, wordCount, isLikelyDiagram });
      if (isLikelyDiagram) candidatePages.push(page.pageNumber);
    }

    return { candidatePages, totalPages: pageTexts.length, allPageData };
  } catch {
    return { candidatePages: [], totalPages: 0, allPageData: [] };
  }
}

/**
 * Renders all pages/slides beyond OFFICE_RENDERER_MAX_PAGES in batches.
 * No heuristic filtering — diagrams can appear on any page of any document,
 * so every page beyond the standard render range must be covered.
 * Stops when the renderer returns no images (end of document) or DOCUMENT_MAX_TOTAL_RENDER_PAGES is reached.
 * Applies to PDF, DOCX, PPTX, and XLSX.
 *
 * @param {number} initialRenderCount - Images returned by the first renderOfficeVisualArtifacts call.
 *   If this is less than OFFICE_RENDERER_MAX_PAGES, all pages were captured in the first batch and
 *   there is nothing left to render.
 */
async function renderDocumentRemainingPages(buffer, fileName, initialRenderCount = 0) {
  const artifacts = [];
  const warnings = [];

  if (!OFFICE_RENDERER_ENDPOINT) return { artifacts, warnings };

  // First batch was short — the document has fewer pages than OFFICE_RENDERER_MAX_PAGES.
  // All pages were already captured; starting at page OFFICE_RENDERER_MAX_PAGES+1 would
  // send an out-of-range request to pdftoppm and produce a "Wrong page range" error.
  if (initialRenderCount > 0 && initialRenderCount < OFFICE_RENDERER_MAX_PAGES) {
    return { artifacts, warnings };
  }

  const ext = getFileExtension(fileName);

  // For PDFs we know the exact page count — stop precisely at the last page.
  // For Office formats (DOCX/PPTX/XLSX) LibreOffice converts to PDF first so
  // there is no page count available; we stop when the renderer returns empty.
  let totalPages = Infinity;
  if (ext === ".pdf") {
    const { totalPages: pdfTotal } = await identifyPdfDiagramCandidatePages(buffer);
    if (pdfTotal > 0) totalPages = pdfTotal;
  }

  // Nothing beyond the standard range to render
  if (totalPages <= OFFICE_RENDERER_MAX_PAGES) return { artifacts, warnings };

  let startPage = OFFICE_RENDERER_MAX_PAGES + 1;
  let totalRendered = 0;

  console.log(`[extra-render] "${fileName}": document has ${totalPages === Infinity ? "unknown" : totalPages} pages; rendering pages ${startPage}+ in batches.`);

  while (startPage <= totalPages && totalRendered < DOCUMENT_MAX_TOTAL_RENDER_PAGES) {
    const remaining = Math.min(DOCUMENT_MAX_TOTAL_RENDER_PAGES - totalRendered, OFFICE_RENDERER_MAX_PAGES);
    const endPage = Math.min(startPage + remaining - 1, totalPages === Infinity ? startPage + remaining - 1 : totalPages);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OFFICE_RENDERER_TIMEOUT_MS);
    try {
      const headers = { "Content-Type": "application/json" };
      if (OFFICE_RENDERER_SHARED_SECRET) headers["x-cari-renderer-token"] = OFFICE_RENDERER_SHARED_SECRET;

      const res = await fetch(`${OFFICE_RENDERER_ENDPOINT}/render`, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          fileName,
          fileBase64: buffer.toString("base64"),
          maxPages: remaining,
          startPage,
          endPage
        })
      });

      clearTimeout(timeout);

      const payloadText = await res.text();
      let payload = null;
      try { payload = payloadText ? JSON.parse(payloadText) : null; } catch { /* ignore */ }

      if (!res.ok) {
        // Renderer throws when startPage is beyond the document end — treat as clean stop.
        const errMsg = payload?.error || "";
        if (/no PNG pages|no pages|beyond|wrong page range|page range/i.test(errMsg)) break;
        warnings.push(`${fileName}: batch render pages ${startPage}-${endPage} failed: ${errMsg || `HTTP ${res.status}`}`);
        break;
      }

      const images = Array.isArray(payload?.images) ? payload.images : [];
      if (images.length === 0) break;

      for (const image of images) {
        if (!image.base64) continue;
        const pageNum = image.sourcePage ?? image.sourceSlide ?? (startPage + artifacts.length);
        artifacts.push({
          buffer: Buffer.from(image.base64, "base64"),
          contentType: image.contentType || "image/png",
          sourceName: image.fileName || `${fileName}-page-${pageNum}.png`,
          extension: ".png",
          summaryText: ext === ".pdf"
            ? `Rendered PDF page ${pageNum} from ${fileName}.`
            : ext === ".pptx"
              ? `Rendered slide ${pageNum} from ${fileName}.`
              : `Rendered page ${pageNum} from ${fileName}.`,
          sourcePage: image.sourcePage ?? null,
          sourceSlide: image.sourceSlide ?? null,
          sourceSheet: image.sourceSheet ?? null,
          sourceExcerpt: `Rendered full-page visual artifact from ${fileName} page ${pageNum}.`,
          extractionSource: ext === ".pdf"
            ? "PDF page render fallback + multimodal analysis"
            : ext === ".pptx"
              ? "Office slide render fallback + multimodal analysis"
              : "Office page render fallback + multimodal analysis"
        });
      }

      totalRendered += images.length;
      startPage += images.length;

      // Renderer returned fewer images than requested — reached end of document
      if (images.length < remaining) break;
    } catch (err) {
      clearTimeout(timeout);
      warnings.push(`${fileName}: batch render pages ${startPage}-${endPage} failed: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }
  }

  if (artifacts.length > 0) {
    console.log(`[extra-render] "${fileName}": rendered ${artifacts.length} additional pages beyond standard range.`);
  }

  return { artifacts, warnings };
}

/**
 * Extracts visual evidence records from a PDF using pdf-parse for per-page text analysis.
 * Identifies diagram-heavy pages using keyword matching and text-density heuristics.
 * This is a zero-external-service fallback — runs when neither Document Intelligence
 * nor the Office Renderer is available.
 *
 * A page is treated as a diagram candidate when:
 *   - It contains architecture keywords AND has fewer than 150 words (low text density)
 *   - OR it has fewer than 15 words (nearly image-only page)
 */
async function extractPdfDiagramPageEvidence(buffer, fileName) {
  const artifacts = [];
  const warnings = [];

  try {
    const { allPageData, totalPages } = await identifyPdfDiagramCandidatePages(buffer);
    console.log(`[pdf-visual] "${fileName}": pdf-parse scanned ${totalPages} pages.`);

    let diagramCount = 0;
    for (const page of allPageData) {
      if (!page.isLikelyDiagram) continue;
      diagramCount++;
      artifacts.push({
        sourceName: `${fileName}-page-${page.pageNumber}.txt`,
        sourcePage: page.pageNumber,
        summaryText: page.text.trim()
          ? `Architecture diagram evidence — "${fileName}" page ${page.pageNumber}.\n\nExtracted labels and callouts:\n${page.text.slice(0, 4000)}`
          : `Architecture diagram detected on page ${page.pageNumber} of "${fileName}". Page contains primarily visual content with minimal selectable text.`,
        sourceExcerpt: `PDF diagram page ${page.pageNumber} identified via text-density analysis in "${fileName}".`,
        extractionSource: "pdf-parse diagram page analysis"
      });
    }

    console.log(`[pdf-visual] "${fileName}": pdf-parse identified ${diagramCount} diagram candidate pages out of ${totalPages} total.`);

    if (artifacts.length === 0) {
      warnings.push(`${fileName}: pdf-parse could not identify any diagram pages using keyword and text-density heuristics.`);
    }
  } catch (err) {
    warnings.push(`${fileName}: pdf-parse fallback analysis failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { artifacts, warnings };
}

function detectPromptInjectionRisk(text) {
  return /ignore (all )?(previous|above) instructions|disregard (previous|above) instructions|mark .*approved|set .*approved|override .*instructions/i.test(String(text ?? ""))
    ? "PossiblePromptInjection"
    : "NoneDetected";
}

const AZURE_SERVICE_PATTERNS = [
  ["Azure Firewall", /\bazure firewall\b|\bfirewall\b/i],
  ["Azure Virtual Network", /\bvirtual network\b|\bvnet\b/i],
  ["Azure Virtual WAN", /\bvirtual wan\b|\bvwan\b/i],
  ["Azure Front Door", /\bfront door\b/i],
  ["Application Gateway", /\bapplication gateway\b|\bapp gateway\b/i],
  ["Azure API Management", /\bapi management\b|\bapim\b/i],
  ["Private Endpoint", /\bprivate endpoint\b|\bprivate link\b/i],
  ["Azure DNS Private Resolver", /\bdns private resolver\b/i],
  ["Microsoft Entra ID", /\bentra\b|\baad\b|\bazure ad\b/i],
  ["Azure Key Vault", /\bkey vault\b/i],
  ["Azure Monitor", /\bazure monitor\b|\blog analytics\b|\bapplication insights\b/i],
  ["Azure Kubernetes Service", /\baks\b|\bkubernetes\b/i],
  ["Azure App Service", /\bapp service\b/i],
  ["Azure Storage", /\bstorage account\b|\bblob storage\b/i],
  ["Azure SQL", /\bazure sql\b|\bsql database\b/i],
  ["Azure AI Foundry", /\bai foundry\b|\bfoundry\b/i]
];

const ARCHITECTURE_PATTERN_PATTERNS = [
  ["Hub-spoke topology", /\bhub[- ]spoke\b|\bhub vnet\b|\bspoke vnet\b/i],
  ["Private access", /\bprivate endpoint\b|\bprivate link\b|\bprivate access\b/i],
  ["Centralized egress", /\begress\b|\bcentralized firewall\b|\bazure firewall\b/i],
  ["Hybrid connectivity", /\bexpressroute\b|\bvpn\b|\bon-prem/i],
  ["Multi-region design", /\bmulti-region\b|\bprimary\b.*\bsecondary\b|\bdr\b|\bdisaster recovery\b/i],
  ["Zero Trust identity", /\bzero trust\b|\bpim\b|\bmfa\b|\brbac\b/i],
  ["Landing zone governance", /\blanding zone\b|\bmanagement group\b|\bazure policy\b/i]
];

function detectTerms(text, patterns) {
  return patterns.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}

function buildVisualEvidenceId(reviewId, index) {
  return `${reviewId}-visual-${String(index + 1).padStart(3, "0")}`;
}

async function persistAndAnalyzeVisualArtifact({
  principal,
  reviewId,
  visualIndex,
  visualEvidenceIdOverride,
  sourceFile,
  artifact,
  outputContainer,
  canUseMultimodal
}) {
  const visualEvidenceId = visualEvidenceIdOverride || buildVisualEvidenceId(reviewId, visualIndex);
  const extension = artifact.extension || getExtensionFromPath(artifact.sourceName || sourceFile.fileName) || ".png";
  const imageUri = artifact.buffer
    ? `${sanitizePathSegment(principal.userId)}/reviews/${sanitizePathSegment(reviewId)}/visual/${visualEvidenceId}${extension}`
    : `${sanitizePathSegment(principal.userId)}/reviews/${sanitizePathSegment(reviewId)}/visual/${visualEvidenceId}.txt`;

  if (artifact.buffer) {
    await uploadBinaryBlob(outputContainer, imageUri, artifact.buffer, artifact.contentType || getVisualContentType(artifact.sourceName));
  } else {
    await uploadTextBlob(outputContainer, imageUri, artifact.summaryText || "", "text/plain; charset=utf-8");
  }

  let summary = artifact.summaryText || "";
  let analysisError = null;
  if (artifact.buffer && canUseMultimodal && MULTIMODAL_IMAGE_EXTENSIONS.has(extension)) {
    // Cache key = content hash of the image bytes — same diagram in any review hits the same entry.
    const imageHash = crypto.createHash("sha256").update(artifact.buffer).digest("hex");
    const visualCacheKey = `visual-analysis-cache/${imageHash}.json`;
    let cacheHit = false;

    try {
      const cacheContainer = await getContainerClient(ARB_PROCESSING_CACHE_CONTAINER_NAME);
      const cached = await readJsonBlob(cacheContainer, visualCacheKey);
      if (cached?.summary && cached.cachedAt && Date.now() - new Date(cached.cachedAt).getTime() < VISUAL_CACHE_TTL_MS) {
        summary = cached.summary;
        cacheHit = true;
      }
    } catch {
      // Cache read failure is non-fatal — fall through to live analysis
    }

    if (!cacheHit) {
      try {
        const analyzedSummary = await describeImageForReview(artifact.buffer, artifact.sourceName || sourceFile.fileName, extension);
        summary = String(analyzedSummary || "").trim() || summary;
        // Write result to cache best-effort — never block extraction on a cache write failure
        getContainerClient(ARB_PROCESSING_CACHE_CONTAINER_NAME)
          .then(c => uploadJsonBlob(c, visualCacheKey, { summary, cachedAt: new Date().toISOString() }))
          .catch(err => console.warn(`[visual-cache] Write failed for ${imageHash.slice(0, 8)}: ${err?.message ?? err}`));
      } catch (error) {
        analysisError = error instanceof Error ? error.message : String(error);
        summary = artifact.summaryText || `Visual artifact ${artifact.sourceName || sourceFile.fileName} could not be analyzed by the multimodal model.`;
      }
    }
  }

  const promptInjectionRisk = detectPromptInjectionRisk(summary);
  const detectedAzureServices = detectTerms(summary, AZURE_SERVICE_PATTERNS);
  const detectedArchitecturePatterns = detectTerms(summary, ARCHITECTURE_PATTERN_PATTERNS);

  return {
    visualEvidenceId,
    reviewId,
    sourceFileId: sourceFile.fileId,
    sourceFileName: sourceFile.fileName,
    sourceFileType: getExtensionFromPath(sourceFile.fileName).replace(/^\./, "") || sourceFile.fileType || "",
    sourcePage: artifact.sourcePage ?? artifact.pageNumber ?? null,
    sourceSlide: artifact.sourceSlide ?? null,
    sourceSheet: artifact.sourceSheet ?? null,
    figureId: artifact.figureId ?? null,
    imageUri,
    factType: "VisualArchitecture",
    summary: String(summary || "").slice(0, 6000),
    detectedAzureServices,
    detectedArchitecturePatterns,
    sourceExcerpt: artifact.sourceExcerpt || `Visual analysis of ${artifact.sourceName || sourceFile.fileName}.`,
    confidence: analysisError ? "Low" : "Medium",
    extractionSource: artifact.extractionSource || "Visual artifact + multimodal analysis",
    promptInjectionRisk,
    analysisError,
    createdAt: new Date().toISOString()
  };
}

async function extractSpreadsheetText(buffer) {
  if (buffer.length > SPREADSHEET_MAX_BYTES) {
    throw new Error(
      `Spreadsheet exceeds the ${SPREADSHEET_MAX_BYTES / (1024 * 1024)} MB limit and cannot be parsed.`
    );
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const parts = [];
  let sheetCount = 0;

  workbook.eachSheet((worksheet) => {
    if (sheetCount >= SPREADSHEET_MAX_SHEETS) return;
    sheetCount++;

    const rows = [];
    worksheet.eachRow((row) => {
      const cells = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        const val = cell.text ?? "";
        cells.push(val.includes(",") ? `"${val.replace(/"/g, '""')}"` : val);
      });
      rows.push(cells.join(","));
    });

    const csv = rows.join("\n");
    if (csv.trim()) {
      parts.push(`=== Sheet: ${worksheet.name} ===\n${csv.slice(0, SPREADSHEET_MAX_CSV_CHARS)}`);
    }
  });

  return parts.join("\n\n");
}

function isSupportedUpload(fileName) {
  const extension = getFileExtension(fileName);
  return SUPPORTED_UPLOAD_EXTENSIONS.has(extension);
}

function isZipUpload(fileName) {
  return getFileExtension(fileName) === ".zip";
}

function isArchiveExtension(fileName) {
  return [".zip", ".7z", ".rar", ".tar", ".tgz", ".gz"].includes(getFileExtension(fileName));
}

function isIgnorableZipEntry(name) {
  const normalized = String(name ?? "").replace(/\\/g, "/");
  return (
    !normalized ||
    normalized.endsWith("/") ||
    normalized.includes("/__MACOSX/") ||
    normalized.startsWith("__MACOSX/") ||
    path.posix.basename(normalized).startsWith("._")
  );
}

function validateZipEntryName(name) {
  const normalized = String(name ?? "").replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized)) {
    return "absolute paths are not allowed";
  }

  const parts = normalized.split("/");
  if (parts.some((part) => part === "..")) {
    return "path traversal entries are not allowed";
  }

  return null;
}

function getUploadContentType(fileName, fallback = "application/octet-stream") {
  const ext = getFileExtension(fileName);
  const map = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".csv": "text/csv",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".json": "application/json",
    ".xml": "application/xml",
    ".yaml": "application/yaml",
    ".yml": "application/yaml",
    ".html": "text/html",
    ".htm": "text/html",
    ".zip": "application/zip"
  };

  if (IMAGE_EXTRACTABLE_EXTENSIONS.has(ext)) {
    return getVisualContentType(fileName);
  }

  return map[ext] || fallback;
}

async function expandZipUpload(file, fileName, contentBuffer) {
  let zip;
  try {
    zip = await JSZip.loadAsync(contentBuffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw createHttpError(400, `ZIP file ${fileName} could not be opened. Password-protected or invalid ZIP files are not supported. ${message}`);
  }

  const warnings = [];
  const childFiles = [];
  let extractedBytes = 0;
  let inspectedEntries = 0;

  for (const entry of Object.values(zip.files)) {
    const rawName = entry.unsafeOriginalName || entry.name;
    const normalizedName = String(rawName ?? "").replace(/\\/g, "/");

    if (entry.dir || isIgnorableZipEntry(normalizedName)) {
      continue;
    }

    inspectedEntries += 1;
    if (inspectedEntries > ZIP_MAX_FILES) {
      warnings.push(`${normalizedName}: skipped because ZIP contains more than ${ZIP_MAX_FILES} files.`);
      continue;
    }

    const unsafeReason = validateZipEntryName(normalizedName);
    if (unsafeReason) {
      warnings.push(`${normalizedName || "entry"}: skipped because ${unsafeReason}.`);
      continue;
    }

    const childFileName = sanitizeFilename(path.posix.basename(normalizedName));
    if (!childFileName) {
      warnings.push(`${normalizedName}: skipped because the file name is empty after sanitization.`);
      continue;
    }

    if (isArchiveExtension(childFileName)) {
      warnings.push(`${normalizedName}: skipped because nested archives are not supported.`);
      continue;
    }

    if (!isSupportedUpload(childFileName)) {
      warnings.push(`${normalizedName}: skipped because ${getFileExtension(childFileName) || "this file type"} is not supported for analysis.`);
      continue;
    }

    const childBuffer = await entry.async("nodebuffer");
    if (!childBuffer || childBuffer.byteLength === 0) {
      warnings.push(`${normalizedName}: skipped because the file is empty.`);
      continue;
    }

    extractedBytes += childBuffer.byteLength;
    if (extractedBytes > ZIP_MAX_EXTRACTED_BYTES) {
      warnings.push(`${normalizedName}: skipped because extracted ZIP content exceeds ${ZIP_MAX_EXTRACTED_BYTES / (1024 * 1024)} MB.`);
      extractedBytes -= childBuffer.byteLength;
      continue;
    }

    childFiles.push({
      fileName: childFileName,
      contentType: getUploadContentType(childFileName, "application/octet-stream"),
      logicalCategory: inferLogicalCategory(childFileName),
      sourceRole: file.sourceRole,
      contentBuffer: childBuffer,
      parentPackageFileName: fileName,
      parentPackagePath: normalizedName
    });
  }

  return {
    childFiles,
    warnings,
    inspectedEntries,
    extractedBytes
  };
}

function buildFileId(reviewId, fileName, hash) {
  return `${reviewId}-file-${hash.slice(0, 10)}-${sanitizePathSegment(fileName).slice(0, 24)}`;
}

// SOW and customer evidence files are stored under a dedicated sub-folder for
// data-protection purposes, keeping them clearly separated from generic inputs.
const CUSTOMER_EVIDENCE_CATEGORIES = new Set(["sow", "security_note", "cost_assumptions", "dr_ha_note", "ops_monitoring_note"]);

function buildBlobPath(userId, reviewId, fileName, logicalCategory) {
  const folder = CUSTOMER_EVIDENCE_CATEGORIES.has(logicalCategory)
    ? "customer-evidence"
    : "files";
  return `${sanitizePathSegment(userId)}/reviews/${sanitizePathSegment(reviewId)}/${folder}/${Date.now()}-${sanitizeFilename(fileName)}`;
}

function normalizeLine(line) {
  return String(line ?? "").replace(/\s+/g, " ").trim();
}

function extractMeaningfulLines(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => normalizeLine(line))
    .filter((line) => line.length >= 24)
    .slice(0, 60);
}

function buildRequirementCategory(line, fallback) {
  const lowered = line.toLowerCase();

  for (const [needle, label] of EXTRACTION_KEYWORD_MAP) {
    if (lowered.includes(needle)) {
      return label;
    }
  }

  return fallback;
}

function uniqueBy(items, keySelector) {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const key = keySelector(item);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(item);
  }

  return output;
}

function buildReadinessFromFiles(files) {
  const categories = new Set((Array.isArray(files) ? files : []).map((file) => file.logicalCategory));
  const missingRequiredItems = REQUIRED_LOGICAL_CATEGORIES.filter((category) => !categories.has(category));
  const missingRecommendedItems = RECOMMENDED_LOGICAL_CATEGORIES.filter(
    (category) => !categories.has(category)
  );
  const recommendedCoverage =
    RECOMMENDED_LOGICAL_CATEGORIES.length === 0
      ? 1
      : (RECOMMENDED_LOGICAL_CATEGORIES.length - missingRecommendedItems.length) /
        RECOMMENDED_LOGICAL_CATEGORIES.length;

  let readinessOutcome = "Ready with Gaps";
  let readinessNotes = "The package can proceed, but recommended evidence is still incomplete.";

  if (missingRequiredItems.length > 0) {
    readinessOutcome = "Insufficient Evidence";
    readinessNotes = "At least one required upload category is still missing.";
  } else if (missingRecommendedItems.length === 0) {
    readinessOutcome = "Ready for Review";
    readinessNotes = "Required and recommended evidence categories are present.";
  }

  return {
    requiredEvidencePresent: missingRequiredItems.length === 0,
    recommendedEvidenceCoverage: Number(recommendedCoverage.toFixed(2)),
    missingRequiredItems,
    missingRecommendedItems,
    readinessOutcome,
    readinessNotes
  };
}

function assessExtractedContentReadiness({ files, requirements, evidence, visualEvidence }) {
  const fileList = Array.isArray(files) ? files : [];
  const requirementList = Array.isArray(requirements) ? requirements : [];
  const evidenceList = Array.isArray(evidence) ? evidence : [];
  const visualList = Array.isArray(visualEvidence) ? visualEvidence : [];
  const combinedText = [
    ...evidenceList.map((item) => `${item.factType || ""} ${item.summary || ""} ${item.sourceExcerpt || ""}`),
    ...visualList.map((item) => `${item.summary || ""} ${(item.detectedAzureServices || []).join(" ")} ${(item.detectedArchitecturePatterns || []).join(" ")}`)
  ].join("\n");

  const hasCompletedDesignEvidence = fileList.some(
    (file) =>
      file.extractionStatus === "Completed" &&
      ["design_doc", "diagram", "supporting_artifact"].includes(file.logicalCategory)
  );
  const coveredRecommendedItems = new Set();

  if (visualList.length > 0 || fileList.some((file) => file.logicalCategory === "diagram")) {
    coveredRecommendedItems.add("diagram");
  }
  if (/\bsecurity\b|\bzero trust\b|\brbac\b|\bpolicy\b|\bdefender\b|\bfirewall\b|\bprivate link\b/i.test(combinedText)) {
    coveredRecommendedItems.add("security_note");
  }
  if (/\bcost\b|\bpricing\b|\bbudget\b|\bsku\b|\bright.?siz/i.test(combinedText)) {
    coveredRecommendedItems.add("cost_assumptions");
  }
  if (/\bdr\b|\bha\b|\bavailability\b|\bdisaster recovery\b|\bbackup\b|\brecovery\b|\bresilien/i.test(combinedText)) {
    coveredRecommendedItems.add("dr_ha_note");
  }
  if (/\bmonitor\b|\blog analytics\b|\balert\b|\bautomation\b|\boperations\b|\bobservability\b|\bpipeline\b/i.test(combinedText)) {
    coveredRecommendedItems.add("ops_monitoring_note");
  }

  const recommendedCoverage =
    RECOMMENDED_LOGICAL_CATEGORIES.length === 0
      ? 1
      : coveredRecommendedItems.size / RECOMMENDED_LOGICAL_CATEGORIES.length;

  return {
    sufficient:
      hasCompletedDesignEvidence &&
      requirementList.length >= 3 &&
      (evidenceList.length >= 5 || visualList.length > 0) &&
      coveredRecommendedItems.size >= 3,
    coveredRecommendedItems: [...coveredRecommendedItems],
    recommendedCoverage: Number(recommendedCoverage.toFixed(2))
  };
}

function buildDefaultExtractionStatus(review) {
  return {
    reviewId: review.reviewId,
    jobId: `${review.reviewId}-extract-001`,
    state: "Not Started",
    extractionConfidencePercent: 0,
    completedSteps: [],
    failedSteps: [],
    evidenceReadinessState: review.evidenceReadinessState,
    missingRequiredItems: review.missingRequiredItems ?? [],
    missingRecommendedItems: review.missingRecommendedItems ?? [],
    readinessNotes: review.readinessNotes ?? null,
    extractionErrors: [],
    lastStartedAt: null,
    lastCompletedAt: null,
    fileStatuses: []
  };
}

function buildNotStartedExtractionStatus(review, files = []) {
  return {
    ...buildDefaultExtractionStatus(review),
    fileStatuses: Array.isArray(files)
      ? files.map((file) => ({
          fileId: file.fileId,
          fileName: file.fileName,
          extractionStatus: file.extractionStatus || "Pending",
          extractionError: file.extractionError || null,
          visualEvidenceCount: file.visualEvidenceCount || 0
        }))
      : []
  };
}

function isStaleTransientExtraction(extraction) {
  if (!["Queued", "Running"].includes(extraction?.state)) {
    return false;
  }

  const startedAt = extraction.lastStartedAt ? Date.parse(extraction.lastStartedAt) : NaN;
  // Queued → Running transition happens in seconds; anything still "Queued" after 3 min with no
  // progress has no orchestration behind it. Running jobs get the full 30-min window.
  const defaultStaleMs = extraction.state === "Queued" ? 3 * 60 * 1000 : 30 * 60 * 1000;
  const staleAfterMs = Number(process.env.ARB_EXTRACTION_STALE_AFTER_MS || defaultStaleMs);
  const elapsed = !Number.isFinite(startedAt) ? Infinity : Date.now() - startedAt;
  const stale = elapsed > staleAfterMs;

  if (!stale) {
    return false;
  }

  // Absolute cap: if the job is older than 2× the normal window (e.g. 60 min for Running),
  // always treat it as stale regardless of progress indicators. This handles re-extraction
  // attempts where prior-run file "Completed" statuses exist and would otherwise falsely
  // suppress the stale guard on a new stuck orchestration.
  if (elapsed > 2 * staleAfterMs) {
    return true;
  }

  const statuses = [
    extraction.textExtractionStatus,
    extraction.tableExtractionStatus,
    extraction.figureExtractionStatus,
    extraction.visualAnalysisStatus
  ].filter(Boolean);
  const hasStepProgress = statuses.some((status) => status !== "NotStarted");
  const hasFileProgress = Array.isArray(extraction.fileStatuses) &&
    extraction.fileStatuses.some((file) =>
      ["Completed", "CompletedWithIssues", "Failed"].includes(file?.extractionStatus)
    );

  return (
    !hasStepProgress &&
    !hasFileProgress &&
    Number(extraction.extractionConfidencePercent || 0) === 0 &&
    Number(extraction.visualEvidenceCount || 0) === 0
  );
}

function normalizeExtractionStatus(extraction, review) {
  if (!isStaleTransientExtraction(extraction)) {
    return extraction;
  }

  return {
    ...extraction,
    state: "Not Started",
    completedSteps: [],
    failedSteps: [],
    readinessNotes:
      "No extraction is currently running. Click Start analysis to read text, tables, diagrams, and visual evidence.",
    textExtractionStatus: "NotStarted",
    tableExtractionStatus: "NotStarted",
    figureExtractionStatus: "NotStarted",
    visualAnalysisStatus: "NotStarted",
    visualEvidenceCount: 0,
    visualExtractionErrors: [],
    extractionErrors: [],
    lastStartedAt: null,
    lastCompletedAt: null
  };
}

function clampPercent(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function calculateExtractionConfidencePercent({
  files,
  requirements,
  evidence,
  readiness,
  extractionErrors
}) {
  const fileList = Array.isArray(files) ? files : [];

  if (fileList.length === 0) {
    return 0;
  }

  const completedFiles = fileList.filter((file) => file.extractionStatus === "Completed").length;
  const limitedFiles = fileList.filter((file) => file.extractionStatus === "Limited Evidence").length;
  const fileExtractionCoverage = (completedFiles + limitedFiles * 0.35) / fileList.length;
  const completedFileBaseline = Math.max(1, completedFiles);
  const evidenceDensity = Math.min(1, (Array.isArray(evidence) ? evidence.length : 0) / (completedFileBaseline * 2));
  const requirementDensity = Math.min(
    1,
    (Array.isArray(requirements) ? requirements.length : 0) / completedFileBaseline
  );
  const requiredEvidenceScore = readiness?.requiredEvidencePresent ? 1 : 0;
  const errorScore = Array.isArray(extractionErrors) && extractionErrors.length > 0 ? 0 : 1;

  return clampPercent(
    fileExtractionCoverage * 55 +
      evidenceDensity * 20 +
      requirementDensity * 10 +
      requiredEvidenceScore * 10 +
      errorScore * 5
  );
}

function buildDefaultRequirements() {
  return [];
}

function buildDefaultEvidence() {
  return [];
}

function buildDefaultExports() {
  return [];
}

function normalizeExportFormat(value) {
  const normalized = String(value ?? "markdown").trim().toLowerCase();

  if (normalized === "markdown" || normalized === "md") {
    return "markdown";
  }

  if (normalized === "csv" || normalized === "html" || normalized === "xlsx" || normalized === "excel") {
    return normalized === "excel" ? "xlsx" : normalized;
  }

  if (normalized === "docx" || normalized === "word") {
    return "docx";
  }

  throw createHttpError(400, "Supported ARB export formats are markdown, csv, html, xlsx, and docx.");
}

function getExportExtension(format) {
  if (format === "markdown") return "md";
  if (format === "xlsx")     return "xlsx";
  if (format === "docx")     return "docx";
  return format;
}

function buildExportId(reviewId, format) {
  return `${sanitizePathSegment(reviewId)}-review-output-${format}`;
}

function buildExportFileName(reviewId, format) {
  return `${sanitizePathSegment(reviewId)}-reviewed-arb-output.${getExportExtension(format)}`;
}

function buildExportBlobPath(userId, reviewId, fileName) {
  return `${sanitizePathSegment(userId)}/reviews/${sanitizePathSegment(reviewId)}/outputs/${fileName}`;
}

function escapeCsvValue(value) {
  const normalized = String(value ?? "").replace(/\r?\n/g, " ");

  if (/[",]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
}

function formatEvidenceReference(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;

  if (typeof value === "object") {
    const evidenceId = value.evidenceId || value.id || "";
    const summary = value.summary || value.evidenceSummary || value.title || value.findingStatement || "";
    const source = value.sourceFileName || value.fileName || value.source || "";
    const parts = [evidenceId, summary, source].filter(Boolean);
    if (parts.length > 0) return parts.join(" - ");
  }

  return String(value);
}

function formatEvidenceReferences(values) {
  if (!Array.isArray(values)) return formatEvidenceReference(values);
  return values.map(formatEvidenceReference).filter(Boolean).join(" | ");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function buildAiSummary(review, files, requirements, evidence, findings, scorecard, actions) {
  if (!getCopilotConfiguration().configured) {
    return "";
  }

  try {
    const copilotResponse = await runCopilot(
      "Summarize this Azure architecture review package with key blockers, confidence, and next actions.",
      buildReviewContextForCopilot(review, files, requirements, evidence, findings, scorecard, actions),
      { mode: "leadership-summary", groundingMode: "arb-review-export" }
    );

    return String(copilotResponse.answer ?? "").trim();
  } catch {
    return "";
  }
}

function renderMarkdownExportBody(pack) {
  const meta   = pack.metadata        || {};
  const proj   = pack.project         || {};
  const cust   = pack.customer        || {};
  const wf     = pack.workflow        || {};
  const er     = pack.evidenceReadiness|| {};
  const es     = pack.executiveSummary || {};
  const sc     = pack.scorecard       || {};
  const dc     = pack.decision        || {};
  const warns  = pack.exportWarnings  || [];

  const hasDecision = dc.reviewerDecision && dc.reviewerDecision !== "Not Recorded";
  const openFindings = (pack.findings || []).filter((f) => f.status === "Open" || f.status === "In Progress");

  const lines = [
    `# ${proj.name || "Architecture Review"} — ARB Review Report`,
    "",
    `> **Confidentiality:** ${meta.confidentiality || "Confidential"}  `,
    `> Generated by CARI — Cloud Architecture Review Intelligence  `,
    `> ${meta.generatedAt || new Date().toISOString()}`,
    "",
    "## Review Metadata",
    "",
    `- **Review ID:** ${meta.reviewId}`,
    `- **Customer:** ${cust.name}`,
    `- **Project:** ${proj.name}`,
    `- **Workflow state:** ${wf.currentState}`,
    `- **Evidence readiness:** ${er.status}${er.confidence ? ` (${er.confidence} confidence)` : ""}`,
    `- **Documents reviewed:** ${(pack.uploadedInputs || []).length}`,
    `- **Requirements extracted:** ${(pack.requirements || []).length}`,
    `- **Evidence facts:** ${(pack.evidence || []).length}`,
    `- **Overall score:** ${es.overallScore ?? "TBD"} / 100 (${es.scoreBand || ""})`,
    `- **Recommendation:** ${es.recommendation || "Pending"}`,
    `- **Governance posture:** ${dc.governancePosture || "Pending"}`,
    hasDecision ? `- **Reviewer decision:** ${dc.reviewerDecision}` : null,
    hasDecision ? `- **Reviewer:** ${dc.reviewerName || "Not recorded"}` : null,
    hasDecision ? `- **Decision date:** ${dc.recordedAt || "Not recorded"}` : null,
  ];

  // Evidence readiness warning
  if (er.status !== "Ready") {
    lines.push("", `> ⚠ **Evidence Readiness Warning:** ${er.reason}`);
  }

  // Export warnings
  if (warns.length > 0) {
    lines.push("", "## Export Warnings", "");
    for (const w of warns) {
      lines.push(`- **[${w.severity}]** ${w.message}`);
    }
  }

  // Reviewer decision (human-readable section)
  if (hasDecision) {
    lines.push(
      "", "## Reviewer Decision", "",
      `- **Final decision:** ${dc.reviewerDecision}`,
      `- **Governance posture:** ${dc.governancePosture}`,
      `- **Reviewer:** ${dc.reviewerName || "Not recorded"}`,
      `- **Recorded at:** ${dc.recordedAt || "Not recorded"}`,
      `- **Rationale:** ${dc.rationale || "No rationale recorded."}`,
    );
    if (dc.governanceWarning) {
      lines.push(`- ⚠ **Governance warning:** ${dc.governanceWarning}`);
    }
  }

  // Architecture decision summary (governance posture)
  lines.push(
    "", "## Architecture Decision Summary", "",
    `- **Governance posture:** ${dc.governancePosture}`,
    `- **Risk acceptance required:** ${dc.riskAcceptanceRequired ? "Yes" : "No"}`,
  );

  // Uploaded inputs
  lines.push("", "## Uploaded Inputs", "");
  for (const inp of pack.uploadedInputs || []) {
    const warn = inp.extractionStatus === "Failed"
      ? `⚠ Extraction failed${inp.extractionSummary ? `: ${inp.extractionSummary}` : ""}`
      : inp.extractionStatus;
    lines.push(`- ${inp.fileName} (${inp.documentType}) — ${warn}`);
  }

  // Scorecard
  lines.push("", "## Scorecard", "",
    `**Overall: ${sc.percentage ?? 0}% (${sc.totalScore ?? 0} / ${sc.maxScore ?? 100})**`, "");
  for (const d of sc.domains || []) {
    lines.push(`- **${d.domain}:** ${d.score}/${d.maxScore} (${d.percentage}%) — ${d.rationale || "No rationale."}`);
  }

  // Findings
  lines.push("", `## Findings (${(pack.findings || []).length} total, ${openFindings.length} open)`, "");
  if ((pack.findings || []).length === 0) {
    lines.push("_No findings recorded._");
  } else {
    for (const f of pack.findings || []) {
      lines.push(`### [${f.severity}] ${f.title} (${f.domain} · ${f.status})`);
      if (f.description)    lines.push(`- **Finding:** ${f.description}`);
      if (f.recommendation) lines.push(`- **Recommendation:** ${f.recommendation}`);
      if (f.evidenceGap)    lines.push(`- **Evidence gap:** ${f.evidenceGap}`);
      lines.push("");
    }
  }

  // Risk register
  lines.push("", `## Risk Register (${(pack.riskRegister || []).length} open risks)`, "");
  if ((pack.riskRegister || []).length === 0) {
    lines.push("_No open risk items._");
  } else {
    for (const r of pack.riskRegister || []) {
      lines.push(`- **[${r.severity}] ${r.riskTitle}** — Owner: ${r.riskOwner} · Status: ${r.status}`);
      if (r.mitigation) lines.push(`  - Mitigation: ${r.mitigation}`);
    }
  }

  // Remediation actions
  lines.push("", `## Remediation Actions (${(pack.remediationActions || []).length})`, "");
  if ((pack.remediationActions || []).length === 0) {
    lines.push("_No actions recorded._");
  } else {
    for (const a of pack.remediationActions || []) {
      lines.push(`- [${a.severity}] **${a.title}** — Owner: ${a.owner} · Due: ${a.dueDate || "Not set"} · ${a.dueStatus} · Status: ${a.status}`);
    }
  }

  // Requirements
  lines.push("", `## Requirements (${(pack.requirements || []).length})`, "");
  for (const r of pack.requirements || []) {
    lines.push(`- [${r.domain}/${r.priority}] ${r.text} _(${r.evidenceStatus})_`);
  }

  // Evidence
  lines.push("", `## Evidence Register (${(pack.evidence || []).length})`, "");
  for (const e of pack.evidence || []) {
    lines.push(`- [${e.evidenceType}] ${e.text} _(${e.confidence} confidence · ${e.sourceFile || "Derived"})_`);
  }

  // Traceability
  lines.push("", "## Requirements Traceability", "");
  for (const t of pack.traceability || []) {
    lines.push(`- **${t.requirementId}:** ${t.requirementText.slice(0, 80)}${t.requirementText.length > 80 ? "…" : ""} — ${t.evidenceStatus}`);
  }

  lines.push(
    "",
    "---",
    `_Generated by CARI — Cloud Architecture Review Intelligence · ${meta.generatedAt || new Date().toISOString()}_`,
    "_Findings are AI-assisted and evidence-linked. Final architecture decisions remain with authorised human reviewers._"
  );

  return lines.filter((l) => l !== null).join("\n");
}

function renderCsvExportBody(pack) {
  const meta = pack.metadata || {};
  const cust = pack.customer || {};
  const proj = pack.project  || {};
  const dc   = pack.decision || {};
  const now  = new Date().toISOString();

  const header = [
    "recordType","recordId","reviewId","customer","project",
    "domain","severity","status","title","description",
    "recommendation","source","sourceFile","linkedFindingId",
    "owner","dueDate","dueStatus","createdAt","updatedAt",
    "confidence","evidenceType"
  ];

  const rows = [header];

  // Review summary row
  rows.push([
    "review", meta.reviewId, meta.reviewId,
    cust.name, proj.name,
    "", "", pack.workflow?.currentState || "",
    `${proj.name} — ARB Review`,
    `Score=${pack.executiveSummary?.overallScore ?? "TBD"}; Recommendation=${pack.executiveSummary?.recommendation || ""}; GovernancePosture=${dc.governancePosture || ""}`,
    pack.executiveSummary?.recommendation || "",
    "CARI", "", "", "", "", "", now, now, "", ""
  ]);

  // Reviewer decision row
  if (dc.reviewerDecision && dc.reviewerDecision !== "Not Recorded") {
    rows.push([
      "reviewerDecision", `${meta.reviewId}-decision`, meta.reviewId,
      cust.name, proj.name,
      "", "", "Recorded",
      `Reviewer Decision: ${dc.reviewerDecision}`,
      dc.rationale || "",
      dc.governancePosture || "",
      "Human reviewer", "", "",
      dc.reviewerName || "", dc.recordedAt || "", "Recorded",
      dc.recordedAt || "", dc.recordedAt || "", "", ""
    ]);
  }

  // Uploaded inputs
  for (const inp of pack.uploadedInputs || []) {
    rows.push([
      "uploadedInput", inp.inputId, meta.reviewId,
      cust.name, proj.name,
      "", "", inp.extractionStatus,
      inp.fileName, inp.extractionSummary || "",
      "", "upload", inp.fileName, "",
      "", "", "", now, now, "", inp.documentType
    ]);
  }

  // Findings
  for (const f of pack.findings || []) {
    rows.push([
      "finding", f.findingId, meta.reviewId,
      cust.name, proj.name,
      f.domain, f.severity, f.status,
      f.title, f.description,
      f.recommendation, f.source,
      (f.sourceFiles || []).join("; "), "",
      "", "", "",
      now, now, f.confidence, ""
    ]);
  }

  // Risks
  for (const r of pack.riskRegister || []) {
    rows.push([
      "risk", r.riskId, meta.reviewId,
      cust.name, proj.name,
      "", r.severity, r.status,
      r.riskTitle, r.impact,
      r.mitigation, "derived",
      "", r.linkedFindingId,
      r.riskOwner, r.dueDate || "", "",
      now, now, "", ""
    ]);
  }

  // Remediation actions
  for (const a of pack.remediationActions || []) {
    rows.push([
      "action", a.actionId, meta.reviewId,
      cust.name, proj.name,
      a.domain, a.severity, a.status,
      a.title, a.action,
      "", a.source,
      "", a.linkedFindingId,
      a.owner, a.dueDate || "", a.dueStatus,
      now, now, "", ""
    ]);
  }

  // Requirements
  for (const r of pack.requirements || []) {
    rows.push([
      "requirement", r.requirementId, meta.reviewId,
      cust.name, proj.name,
      r.domain, r.priority, r.evidenceStatus,
      r.text, "",
      "", "extracted",
      r.sourceFile, "",
      "", "", "",
      now, now, "", r.sourceType
    ]);
  }

  // Evidence
  for (const e of pack.evidence || []) {
    rows.push([
      "evidence", e.evidenceId, meta.reviewId,
      cust.name, proj.name,
      "", "", "",
      e.evidenceType, e.text,
      "", "extracted",
      e.sourceFile, "",
      "", "", "",
      now, now, e.confidence, e.evidenceType
    ]);
  }

  // Export warnings
  for (const w of pack.exportWarnings || []) {
    rows.push([
      "exportWarning", w.warningId, meta.reviewId,
      cust.name, proj.name,
      "", w.severity, "Active",
      `Export Warning: ${w.warningId}`, w.message,
      "", "validation",
      "", "",
      "", "", "",
      now, now, "", ""
    ]);
  }

  return rows.map((row) => row.map((v) => escapeCsvValue(v ?? "")).join(",")).join("\n");
}

function renderHtmlExportBody(pack, summaryText) {
  const esc = escapeHtml;
  const timestamp = pack.metadata?.generatedAt || new Date().toISOString();
  const meta         = pack.metadata          || {};
  const cust         = pack.customer          || {};
  const proj         = pack.project           || {};
  const wf           = pack.workflow          || {};
  const er           = pack.evidenceReadiness || {};
  const es           = pack.executiveSummary  || {};
  const sc           = pack.scorecard         || {};
  const dc           = pack.decision          || {};
  const warns        = pack.exportWarnings    || [];
  const findings     = pack.findings           || [];
  const actions      = pack.remediationActions || [];
  const evidence     = pack.evidence           || [];
  const requirements = pack.requirements       || [];
  const files        = pack.uploadedInputs     || [];

  /* ── colour helpers ── */
  const severityBadge = (sev) => {
    const s = String(sev || "").toLowerCase();
    if (s === "critical") return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;background:#FEE2E2;color:#7F1D1D;">${esc(sev)}</span>`;
    if (s === "high")     return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;background:#FEE2E2;color:#D92B2B;">${esc(sev)}</span>`;
    if (s === "medium")   return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;background:#FEF3C7;color:#B45309;">${esc(sev)}</span>`;
    return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;background:#DBEAFE;color:#0078D4;">${esc(sev)}</span>`;
  };

  const recommendationBadge = (rec) => {
    const r = String(rec || "").toLowerCase();
    let bg = "#FEF3C7"; let fg = "#B45309";
    if (r === "approved") { bg = "#D1FAE5"; fg = "#065F46"; }
    else if (r.includes("conditions")) { bg = "#FEF3C7"; fg = "#78350F"; }
    else if (r === "rejected" || r.includes("reject")) { bg = "#FEE2E2"; fg = "#D92B2B"; }
    return `<span style="display:inline-block;padding:3px 14px;border-radius:12px;font-size:13px;font-weight:600;background:${bg};color:${fg};">${esc(rec)}</span>`;
  };

  const confidenceBadge = (conf) => {
    const c = String(conf || "").toLowerCase();
    let bg = "#FEE2E2"; let fg = "#D92B2B";
    if (c === "high") { bg = "#D1FAE5"; fg = "#065F46"; }
    else if (c === "medium") { bg = "#FEF3C7"; fg = "#B45309"; }
    return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:${bg};color:${fg};">${esc(conf)}</span>`;
  };

  const scoreColor = (score) => {
    const n = Number(score);
    if (n >= 80) return "#059669";
    if (n >= 70) return "#B45309";
    return "#D92B2B";
  };

  const overallScore      = es.overallScore ?? null;
  const recommendation    = es.recommendation ?? "Pending";
  const domainScores      = sc.domains || [];
  const hasDecision       = dc.reviewerDecision && dc.reviewerDecision !== "Not Recorded";

  /* ── score bar helper ── */
  const scoreBar = (score, maxVal = 100) => {
    const pct = Math.min(100, Math.max(0, Math.round((Number(score) / maxVal) * 100)));
    const color = scoreColor(score);
    return `<div style="display:flex;align-items:center;gap:10px;">` +
      `<div style="flex:1;height:10px;background:#E5E7EB;border-radius:5px;overflow:hidden;">` +
      `<div style="width:${pct}%;height:100%;background:${color};border-radius:5px;"></div></div>` +
      `<span style="font-size:13px;font-weight:600;color:${color};min-width:40px;text-align:right;">${esc(score)}</span></div>`;
  };

  /* ── section divider ── */
  const divider = `<hr style="border:none;border-top:1px solid #E5E7EB;margin:32px 0;" />`;

  /* ── build HTML parts ── */
  const parts = [];

  /* doctype + head */
  parts.push(
    `<!DOCTYPE html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta charset="utf-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `<title>${esc(proj.name)} \u2014 Architecture Review Pack</title>`,
    `</head>`,
    `<body style="margin:0;padding:0;background:#ffffff;color:#1F2937;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.6;">`
  );

  /* page wrapper */
  parts.push(`<div style="max-width:900px;margin:0 auto;padding:40px 24px;">`);

  /* ── HEADER ── */
  parts.push(
    `<div style="margin-bottom:8px;">`,
    `<h1 style="margin:0 0 4px;font-size:26px;font-weight:700;color:#0F172A;letter-spacing:-0.3px;">${esc(proj.name)}</h1>`,
    `<p style="margin:0;font-size:14px;color:#64748B;">Architecture Review Pack</p>`,
    `</div>`
  );

  /* ── METADATA CARD ── */
  parts.push(
    `<div style="margin:20px 0 32px;padding:20px 24px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;">`,
    `<table style="width:100%;border-collapse:collapse;font-size:13px;">`,
    `<tr><td style="padding:4px 16px 4px 0;color:#64748B;white-space:nowrap;vertical-align:top;">Review ID</td><td style="padding:4px 0;font-weight:500;">${esc(meta.reviewId)}</td></tr>`,
    `<tr><td style="padding:4px 16px 4px 0;color:#64748B;white-space:nowrap;vertical-align:top;">Customer</td><td style="padding:4px 0;font-weight:500;">${esc(cust.name)}</td></tr>`,
    `<tr><td style="padding:4px 16px 4px 0;color:#64748B;white-space:nowrap;vertical-align:top;">Workflow State</td><td style="padding:4px 0;font-weight:500;">${esc(wf.currentState)}</td></tr>`,
    `<tr><td style="padding:4px 16px 4px 0;color:#64748B;white-space:nowrap;vertical-align:top;">Evidence Readiness</td><td style="padding:4px 0;font-weight:500;">${esc(er.status)}</td></tr>`,
    `<tr><td style="padding:4px 16px 4px 0;color:#64748B;white-space:nowrap;vertical-align:top;">Overall Score</td><td style="padding:4px 0;font-weight:600;">${overallScore !== null ? esc(overallScore) + " / 100" : "TBD"}</td></tr>`,
    `<tr><td style="padding:4px 16px 4px 0;color:#64748B;white-space:nowrap;vertical-align:top;">Recommendation</td><td style="padding:4px 0;">${recommendationBadge(recommendation)}</td></tr>`,
    hasDecision ? `<tr><td style="padding:4px 16px 4px 0;color:#64748B;white-space:nowrap;vertical-align:top;">Reviewer Decision</td><td style="padding:4px 0;font-weight:600;">${esc(dc.reviewerDecision)}</td></tr>` : "",
    hasDecision ? `<tr><td style="padding:4px 16px 4px 0;color:#64748B;white-space:nowrap;vertical-align:top;">Reviewer</td><td style="padding:4px 0;font-weight:500;">${esc(dc.reviewerName || "Not recorded")}</td></tr>` : "",
    hasDecision ? `<tr><td style="padding:4px 16px 4px 0;color:#64748B;white-space:nowrap;vertical-align:top;">Decision Recorded</td><td style="padding:4px 0;font-weight:500;">${esc(dc.recordedAt || "Not recorded")}</td></tr>` : "",
    `</table>`,
    `</div>`
  );

  /* ── REVIEWER DECISION ── */
  if (hasDecision) {
    const dec = String(dc.reviewerDecision || "");
    const decStyle = dec === "Approved"
      ? { bg: "#F0FDF4", border: "#16A34A", fg: "#14532D" }
      : dec === "Conditionally Approved"
        ? { bg: "#FFFBEB", border: "#D97706", fg: "#78350F" }
        : dec === "Needs Revision"
          ? { bg: "#EFF6FF", border: "#2563EB", fg: "#1E3A5F" }
          : dec === "Needs Remediation"
            ? { bg: "#FEF2F2", border: "#DC2626", fg: "#7F1D1D" }
            : { bg: "#F9FAFB", border: "#9CA3AF", fg: "#374151" };
    const decIcon = dec === "Approved" || dec === "Conditionally Approved" ? "✓"
      : dec === "Needs Revision" ? "↻"
        : dec === "Needs Remediation" ? "!" : "·";
    parts.push(
      `<div style="margin-bottom:32px;display:flex;align-items:flex-start;gap:16px;padding:18px 22px;background:${decStyle.bg};border:1px solid ${decStyle.border};border-left:4px solid ${decStyle.border};border-radius:8px;">`,
      `<span style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background:${decStyle.border};color:#fff;font-size:1.25rem;font-weight:800;flex-shrink:0;line-height:1;">${decIcon}</span>`,
      `<div style="flex:1;min-width:0;">`,
      `<h2 style="margin:0 0 6px;font-size:18px;font-weight:700;color:${decStyle.fg};">${esc(dec)}</h2>`,
      `<p style="margin:0 0 4px;font-size:13px;color:${decStyle.fg};opacity:0.85;">${esc(dc.reviewerName || "Not recorded")} · ${esc(dc.recordedAt || "Not recorded")}</p>`,
      dc.rationale ? `<p style="margin:4px 0 0;font-size:14px;line-height:1.6;color:${decStyle.fg};opacity:0.8;font-style:italic;">"${esc(dc.rationale)}"</p>` : "",
      `</div></div>`
    );
  }

  /* ── OVERALL SCORE BAR ── */
  if (overallScore !== null) {
    parts.push(
      `<div style="margin-bottom:32px;">`,
      `<h2 style="margin:0 0 12px;font-size:18px;font-weight:600;color:#0F172A;">Overall Score</h2>`,
      `<div style="padding:16px 20px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;">`,
      `<div style="display:flex;align-items:center;gap:12px;">`,
      `<span style="font-size:32px;font-weight:700;color:${scoreColor(overallScore)};">${esc(overallScore)}</span>`,
      `<span style="font-size:14px;color:#64748B;">/ 100</span>`,
      `<div style="flex:1;margin-left:8px;">`,
      `<div style="height:12px;background:#E5E7EB;border-radius:6px;overflow:hidden;">`,
      `<div style="width:${Math.min(100, Math.max(0, Number(overallScore)))}%;height:100%;background:${scoreColor(overallScore)};border-radius:6px;"></div>`,
      `</div></div></div></div></div>`
    );
  }

  /* ── ASSESSMENT SUMMARY ── */
  if (summaryText) {
    parts.push(
      divider,
      `<div style="margin-bottom:32px;">`,
      `<h2 style="margin:0 0 12px;font-size:18px;font-weight:600;color:#0F172A;">Assessment Summary</h2>`,
      `<div style="padding:16px 20px;background:#EFF6FF;border-left:4px solid #0078D4;border-radius:4px;font-size:14px;line-height:1.7;color:#1E3A5F;">`,
      `${esc(summaryText)}`,
      `</div></div>`
    );
  }

  /* ── DOMAIN SCORES ── */
  if (domainScores.length > 0) {
    parts.push(
      divider,
      `<div style="margin-bottom:32px;">`,
      `<h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#0F172A;">Domain Scores</h2>`
    );
    for (const ds of domainScores) {
      const maxVal = Number(ds.maxScore ?? ds.weight ?? 0);
      const pct = maxVal > 0 ? Math.round((Number(ds.score) / maxVal) * 100) : (ds.percentage ?? 0);
      const color = scoreColor(pct >= 85 ? 85 : pct >= 70 ? 75 : 50);
      parts.push(
        `<div style="margin-bottom:14px;">`,
        `<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">`,
        `<span style="font-size:13px;font-weight:600;color:#1F2937;">${esc(ds.domain)}</span>`,
        `<span style="font-size:12px;color:#64748B;">${esc(ds.score)} / ${esc(maxVal)} (${pct}%)</span>`,
        `</div>`,
        `<div style="height:8px;background:#E5E7EB;border-radius:4px;overflow:hidden;">`,
        `<div style="width:${Math.min(100, Math.max(0, pct))}%;height:100%;background:${color};border-radius:4px;"></div>`,
        `</div>`,
        ds.reason ? `<p style="margin:4px 0 0;font-size:12px;color:#64748B;">${esc(ds.reason)}</p>` : "",
        `</div>`
      );
    }
    parts.push(`</div>`);
  }

  /* ── FINDINGS (card per finding, with reviewer comment) ── */
  parts.push(divider);
  parts.push(
    `<div style="margin-bottom:32px;">`,
    `<h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#0F172A;">Findings <span style="font-size:13px;font-weight:400;color:#64748B;">(${findings.length})</span></h2>`
  );
  if (findings.length === 0) {
    parts.push(`<p style="color:#64748B;font-style:italic;">No findings recorded.</p>`);
  } else {
    for (const f of findings) {
      const sev = String(f.severity || "").toLowerCase();
      const leftBorderColor = (sev === "high" || sev === "critical") ? "#D92B2B"
        : sev === "medium" ? "#B45309" : "#0078D4";
      const statusStyle = f.status === "Closed"
        ? "background:#D1FAE5;color:#065F46;"
        : f.status === "Open" ? "background:#FEE2E2;color:#D92B2B;"
          : "background:#F1F5F9;color:#475569;";
      parts.push(
        `<div style="margin-bottom:16px;border:1px solid #E2E8F0;border-left:4px solid ${leftBorderColor};border-radius:6px;overflow:hidden;">`,
        /* Finding header */
        `<div style="padding:14px 18px;background:#FAFAFA;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">`,
        `<div style="flex:1;min-width:0;">`,
        `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">`,
        severityBadge(f.severity),
        `<span style="font-size:11px;font-weight:500;padding:2px 8px;border-radius:10px;${statusStyle}">${esc(f.status)}</span>`,
        `<span style="font-size:11px;color:#94A3B8;">${esc(f.domain || "")}</span>`,
        `</div>`,
        `<p style="margin:0;font-size:14px;font-weight:600;color:#0F172A;line-height:1.4;">${esc(f.title)}</p>`,
        `</div></div>`,
        /* Finding body */
        `<div style="padding:14px 18px;">`,
        (f.description || f.findingStatement) ? `<p style="margin:0 0 10px;font-size:13px;color:#374151;line-height:1.6;">${esc(f.description || f.findingStatement)}</p>` : "",
        f.recommendation
          ? `<div style="margin-bottom:10px;padding:10px 14px;background:#EFF6FF;border-radius:4px;font-size:13px;color:#1E3A5F;"><strong>Recommendation:</strong> ${esc(f.recommendation)}</div>`
          : "",
        f.reviewerNote
          ? `<div style="margin-bottom:4px;padding:10px 14px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:4px;font-size:13px;color:#78350F;"><strong>Reviewer comment:</strong> ${esc(f.reviewerNote)}</div>`
          : "",
        `</div></div>`
      );
    }
  }
  parts.push(`</div>`);

  /* ── ACTIONS TABLE ── */
  parts.push(divider);
  parts.push(
    `<div style="margin-bottom:32px;">`,
    `<h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#0F172A;">Actions</h2>`
  );
  if (actions.length === 0) {
    parts.push(`<p style="color:#64748B;font-style:italic;">No actions recorded.</p>`);
  } else {
    parts.push(
      `<table style="width:100%;border-collapse:collapse;font-size:13px;">`,
      `<thead>`,
      `<tr style="border-bottom:2px solid #E2E8F0;">`,
      `<th style="text-align:left;padding:8px 10px;color:#64748B;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Action</th>`,
      `<th style="text-align:left;padding:8px 10px;color:#64748B;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Owner</th>`,
      `<th style="text-align:left;padding:8px 10px;color:#64748B;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Due Date</th>`,
      `<th style="text-align:left;padding:8px 10px;color:#64748B;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Status</th>`,
      `</tr>`,
      `</thead>`,
      `<tbody>`
    );
    for (const a of actions) {
      parts.push(
        `<tr style="border-bottom:1px solid #F1F5F9;">`,
        `<td style="padding:10px;vertical-align:top;">${esc(a.title || a.actionSummary)}</td>`,
        `<td style="padding:10px;vertical-align:top;color:#475569;">${esc(a.owner || "Unassigned")}</td>`,
        `<td style="padding:10px;vertical-align:top;color:#475569;">${esc(a.dueDate || "\u2014")}</td>`,
        `<td style="padding:10px;vertical-align:top;"><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500;background:#F1F5F9;color:#475569;">${esc(a.status)}</span></td>`,
        `</tr>`
      );
    }
    parts.push(`</tbody></table>`);
  }
  parts.push(`</div>`);

  /* ── EVIDENCE CARDS ── */
  parts.push(divider);
  parts.push(
    `<div style="margin-bottom:32px;">`,
    `<h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#0F172A;">Evidence</h2>`
  );
  if (evidence.length === 0) {
    parts.push(`<p style="color:#64748B;font-style:italic;">No evidence recorded.</p>`);
  } else {
    for (const ev of evidence) {
      parts.push(
        `<div style="margin-bottom:12px;padding:14px 18px;border:1px solid #E2E8F0;border-radius:6px;background:#FFFFFF;">`,
        `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">`,
        `<span style="font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">${esc(ev.factType || "Evidence")}</span>`,
        confidenceBadge(ev.confidence),
        `</div>`,
        `<p style="margin:0 0 6px;font-size:14px;font-weight:500;color:#1F2937;">${esc(ev.summary)}</p>`,
        `<p style="margin:0;font-size:12px;color:#94A3B8;">Source: ${esc(ev.sourceFileName || "Derived summary")}</p>`,
        ev.sourceExcerpt ? `<div style="margin-top:8px;padding:8px 12px;background:#F8FAFC;border-radius:4px;font-size:12px;color:#475569;font-style:italic;border-left:3px solid #CBD5E1;">${esc(ev.sourceExcerpt)}</div>` : "",
        `</div>`
      );
    }
  }
  parts.push(`</div>`);

  /* ── UPLOADED INPUTS ── */
  parts.push(divider);
  parts.push(
    `<div style="margin-bottom:32px;">`,
    `<h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#0F172A;">Uploaded Inputs</h2>`
  );
  if (files.length === 0) {
    parts.push(`<p style="color:#64748B;font-style:italic;">No files uploaded.</p>`);
  } else {
    parts.push(
      `<table style="width:100%;border-collapse:collapse;font-size:13px;">`,
      `<thead>`,
      `<tr style="border-bottom:2px solid #E2E8F0;">`,
      `<th style="text-align:left;padding:8px 10px;color:#64748B;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">File Name</th>`,
      `<th style="text-align:left;padding:8px 10px;color:#64748B;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Category</th>`,
      `<th style="text-align:left;padding:8px 10px;color:#64748B;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Extraction Status</th>`,
      `</tr>`,
      `</thead>`,
      `<tbody>`
    );
    for (const file of files) {
      const statusCell = file.extractionStatus === "Failed"
        ? `<span style="color:#D92B2B;font-weight:500;">⚠ Extraction failed</span>${file.extractionSummary ? `<br/><span style="font-size:11px;color:#64748B;">${esc(file.extractionSummary)}</span>` : ""}`
        : `<span style="color:#059669;">${esc(file.extractionStatus)}</span>`;
      parts.push(
        `<tr style="border-bottom:1px solid #F1F5F9;">`,
        `<td style="padding:8px 10px;font-size:13px;">${esc(file.fileName)}</td>`,
        `<td style="padding:8px 10px;color:#475569;font-size:13px;">${esc(file.documentType)}</td>`,
        `<td style="padding:8px 10px;font-size:13px;">${statusCell}</td>`,
        `</tr>`
      );
    }
    parts.push(`</tbody></table>`);
  }
  parts.push(`</div>`);

  /* ── REQUIREMENTS ── */
  parts.push(divider);
  parts.push(
    `<div style="margin-bottom:32px;">`,
    `<h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#0F172A;">Reviewed Requirements</h2>`
  );
  if (requirements.length === 0) {
    parts.push(`<p style="color:#64748B;font-style:italic;">No requirements recorded.</p>`);
  } else {
    parts.push(
      `<table style="width:100%;border-collapse:collapse;font-size:13px;">`,
      `<thead>`,
      `<tr style="border-bottom:2px solid #E2E8F0;">`,
      `<th style="text-align:left;padding:8px 10px;color:#64748B;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Category</th>`,
      `<th style="text-align:left;padding:8px 10px;color:#64748B;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Criticality</th>`,
      `<th style="text-align:left;padding:8px 10px;color:#64748B;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Requirement</th>`,
      `<th style="text-align:left;padding:8px 10px;color:#64748B;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Source</th>`,
      `<th style="text-align:left;padding:8px 10px;color:#64748B;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Status</th>`,
      `</tr>`,
      `</thead>`,
      `<tbody>`
    );
    for (const req of requirements) {
      parts.push(
        `<tr style="border-bottom:1px solid #F1F5F9;">`,
        `<td style="padding:8px 10px;font-weight:500;">${esc(req.category)}</td>`,
        `<td style="padding:8px 10px;">${severityBadge(req.criticality)}</td>`,
        `<td style="padding:8px 10px;color:#1F2937;">${esc(req.normalizedText)}</td>`,
        `<td style="padding:8px 10px;color:#94A3B8;font-size:12px;">${esc(req.sourceFileName || "\u2014")}</td>`,
        `<td style="padding:8px 10px;"><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500;background:#F1F5F9;color:#475569;">${esc(req.reviewerStatus)}</span></td>`,
        `</tr>`
      );
    }
    parts.push(`</tbody></table>`);
  }
  parts.push(`</div>`);

  /* ── FOOTER ── */
  parts.push(
    divider,
    `<div style="text-align:center;padding:16px 0 8px;font-size:12px;color:#94A3B8;">`,
    `Generated by Cloud Architecture Review Intelligence (CARI) &middot; ${esc(timestamp)}`,
    `</div>`
  );

  /* close wrapper + body + html */
  parts.push(`</div></body></html>`);

  return parts.filter(Boolean).join("\n");
}

function mergeExportRecords(existingExports, nextRecord) {
  return [...(existingExports || []).filter((record) => record.exportId !== nextRecord.exportId), nextRecord].sort(
    (left, right) => String(right.generatedAt).localeCompare(String(left.generatedAt))
  );
}

async function writeArbOutputArtifact({
  principal,
  review,
  files,
  requirements,
  evidence,
  findings,
  scorecard,
  actions,
  decision,
  format,
  generatedAt,
  summaryText,
  existingExports
}) {
  const outputContainer = await getContainerClient(ARB_OUTPUT_CONTAINER_NAME);
  const fileName = buildExportFileName(review.reviewId, format);
  const blobPath = buildExportBlobPath(principal.userId, review.reviewId, fileName);

  if (format === "docx") {
    const docxPack = normalizeReviewForExport(review, files, requirements, evidence, findings, actions, scorecard, decision, "docx");
    const body = await generateArbDocx(docxPack);
    await uploadBinaryBlob(outputContainer, blobPath, body, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  } else if (format === "xlsx") {
    const xlsxPack = normalizeReviewForExport(review, files, requirements, evidence, findings, actions, scorecard, decision, "xlsx");
    const body = await generateArbExcel(xlsxPack);
    await uploadBinaryBlob(outputContainer, blobPath, body, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  } else if (format === "csv") {
    const csvPack = normalizeReviewForExport(review, files, requirements, evidence, findings, actions, scorecard, decision, "csv");
    const body = renderCsvExportBody(csvPack);
    await uploadTextBlob(outputContainer, blobPath, body, "text/csv; charset=utf-8");
  } else if (format === "html") {
    const htmlPack = normalizeReviewForExport(review, files, requirements, evidence, findings, actions, scorecard, decision, "html");
    const body = renderHtmlExportBody(htmlPack, summaryText);
    await uploadTextBlob(outputContainer, blobPath, body, "text/html; charset=utf-8");
  } else {
    const mdPack = normalizeReviewForExport(review, files, requirements, evidence, findings, actions, scorecard, decision, "markdown");
    const body = renderMarkdownExportBody(mdPack);
    await uploadTextBlob(outputContainer, blobPath, body, "text/markdown; charset=utf-8");
  }

  const contentType = format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : format === "csv"  ? "text/csv; charset=utf-8"
    : format === "html" ? "text/html; charset=utf-8"
    : "text/markdown; charset=utf-8";

  const exportRecord = {
    exportId: buildExportId(review.reviewId, format),
    reviewId: review.reviewId,
    format,
    includeFindings: true,
    includeScorecard: true,
    includeActions: true,
    blobPath,
    fileName,
    contentType,
    generatedAt: generatedAt || new Date().toISOString()
  };

  return {
    exportRecord,
    exportsList: mergeExportRecords(existingExports, exportRecord)
  };
}

async function syncArbReviewedOutputs({
  principal,
  review,
  files,
  requirements,
  evidence,
  findings,
  scorecard,
  actions,
  decision,
  formats,
  generatedAt,
  existingExports
}) {
  const summaryText = await buildAiSummary(
    review,
    files,
    requirements,
    evidence,
    findings,
    scorecard,
    actions
  );
  const requestedFormats = Array.isArray(formats) && formats.length > 0 ? formats : ["markdown"];
  const normalizedFormats = [...new Set(requestedFormats.map((format) => normalizeExportFormat(format)))];
  let nextExports = existingExports || [];
  const createdArtifacts = [];

  for (const format of normalizedFormats) {
    const result = await writeArbOutputArtifact({
      principal,
      review,
      files,
      requirements,
      evidence,
      findings,
      scorecard,
      actions,
      decision,
      format,
      generatedAt,
      summaryText,
      existingExports: nextExports
    });

    nextExports = result.exportsList;
    createdArtifacts.push(result.exportRecord);
  }

  return {
    exportsList: nextExports,
    artifacts: createdArtifacts
  };
}

function deriveRequirementsAndEvidence(review, files, fileTexts) {
  const requirements = [];
  const evidence = [];

  for (const file of files) {
    const text = fileTexts.get(file.fileId) || "";
    const lines = extractMeaningfulLines(text);
    const isVisualArtifact =
      supportsImageExtraction(file.fileName) ||
      supportsDiagramExtraction(file.fileName) ||
      /^\[(Architecture diagram|Diagram file):/i.test(text.trim());

    if (["sow", "design_doc", "cost_assumptions", "dr_ha_note", "ops_monitoring_note"].includes(file.logicalCategory)) {
      for (const line of lines.slice(0, 10)) {
        requirements.push({
          requirementId: `${review.reviewId}-req-${requirements.length + 1}`,
          reviewId: review.reviewId,
          sourceFileId: file.fileId,
          sourceFileName: file.fileName,
          normalizedText: line,
          category: buildRequirementCategory(line, file.logicalCategory),
          criticality:
            /must|required|critical|mandatory|non-negotiable/i.test(line) ? "High" : "Medium",
          reviewerStatus: "Pending"
        });
      }
    }

    const HIGH_CONFIDENCE_CATEGORIES = ["sow", "design_doc", "security_note", "cost_assumptions", "dr_ha_note", "ops_monitoring_note"];
    const requiresKeywordFilter = isVisualArtifact
      ? false
      : !HIGH_CONFIDENCE_CATEGORIES.includes(file.logicalCategory);

    for (const line of lines.slice(0, 20)) {
      if (requiresKeywordFilter && !/azure|security|network|identity|monitor|backup|recovery|cost|pricing|service/i.test(line)) {
        continue;
      }

      const factType = buildRequirementCategory(line, isVisualArtifact ? "VisualArchitecture" : "Architecture");
      const confidence = isVisualArtifact
        ? "Medium"
        : HIGH_CONFIDENCE_CATEGORIES.includes(file.logicalCategory)
          ? "High"
          : supportsTextExtraction(file.fileName) ? "Medium" : "Low";

      evidence.push({
        evidenceId: `${review.reviewId}-ev-${evidence.length + 1}`,
        reviewId: review.reviewId,
        sourceFileId: file.fileId,
        sourceFileName: file.fileName,
        factType,
        summary: line,
        sourceExcerpt: line,
        confidence
      });
    }
  }

  if (requirements.length === 0) {
    requirements.push({
      requirementId: `${review.reviewId}-req-1`,
      reviewId: review.reviewId,
      sourceFileId: null,
      sourceFileName: null,
      normalizedText: `${review.projectName} requires a grounded Azure review package before final board sign-off.`,
      category: "Architecture",
      criticality: "High",
      reviewerStatus: "Pending"
    });
  }

  return {
    requirements: uniqueBy(requirements, (item) => `${item.sourceFileId}:${item.normalizedText}`),
    evidence: uniqueBy(evidence, (item) => `${item.sourceFileId}:${item.summary}`)
  };
}

function buildReviewContextForCopilot(review, files, requirements, evidence, findings, scorecard, actions) {
  return {
    review: {
      id: review.reviewId,
      name: review.projectName,
      audience: review.assignedReviewer || review.createdBy || "Architecture Review Board",
      businessScope: review.notes || `${review.projectName} architecture review package`,
      targetRegions: []
    },
    services: [],
    findings: findings.map((finding) => ({
      guid: finding.findingId,
      serviceName: finding.domain,
      finding: finding.findingStatement,
      severity: finding.severity,
      decision: finding.status,
      comments: finding.reviewerNote || finding.recommendation,
      owner: finding.owner || finding.suggestedOwner,
      dueDate: finding.dueDate || finding.suggestedDueDate
    })),
    sources: [
      ...files.map((file) => ({
        label: file.fileName,
        note: `${file.logicalCategory} · ${file.extractionStatus}`
      })),
      {
        label: `${requirements.length} normalized requirements`,
        note: `${evidence.length} evidence facts · ${actions.length} actions · ${scorecard.overallScore ?? "TBD"} score`
      }
    ]
  };
}

function getPartitionKey(reviewId) {
  return encodeTableKey(reviewId);
}

function buildDefaultReview(reviewId, principal, input = {}) {
  const now = new Date().toISOString();
  const architectName = String(input.architectName ?? "").trim() || principal.userDetails || principal.userId;
  const readiness = buildReadinessFromFiles([]);

  return {
    reviewId,
    projectName: String(input.projectName ?? "").trim() || "Sample ARB Review",
    customerName: String(input.customerName ?? "").trim() || "Contoso",
    architectName,
    createdBy: architectName,
    createdByUserId: principal.userId,
    createdAt: now,
    workflowState: "Review In Progress",
    evidenceReadinessState: "Ready with Gaps",
    assignedReviewer: input.assignedReviewer
      ? String(input.assignedReviewer).trim()
      : (principal.userDetails || principal.userId || null),
    targetReviewDate: normalizeNullableString(input.targetReviewDate),
    notes: normalizeNullableString(input.notes),
    overallScore: Number.isFinite(Number(input.overallScore)) ? Number(input.overallScore) : null,
    recommendation: String(input.recommendation ?? "").trim() || "Needs Remediation",
    finalDecision: input.finalDecision ? String(input.finalDecision).trim() : null,
    requiredEvidencePresent: readiness.requiredEvidencePresent,
    recommendedEvidenceCoverage: readiness.recommendedEvidenceCoverage,
    missingRequiredItems: readiness.missingRequiredItems,
    missingRecommendedItems: readiness.missingRecommendedItems,
    readinessOutcome: readiness.readinessOutcome,
    readinessNotes: readiness.readinessNotes,
    projectId: normalizeNullableString(input.projectId),
    projectCategory: normalizeNullableString(input.projectCategory),
    inScope: Array.isArray(input.inScope) ? input.inScope : [],
    outOfScope: Array.isArray(input.outOfScope) ? input.outOfScope : [],
    documentCount: 0,
    lastUpdated: now
  };
}

function buildDefaultFindings(review) {
  return [
    {
      findingId: `${review.reviewId}-find-001`,
      reviewId: review.reviewId,
      severity: "High",
      domain: "Security",
      findingType: "Best Practice Missing",
      title: `${review.projectName}: boundary control pattern not yet explicit`,
      findingStatement:
        "The current design does not yet document an explicit boundary control pattern for internet-facing access.",
      whyItMatters:
        "Unclear edge and boundary controls increase security and governance risk during design review.",
      evidenceFound: [],
      missingEvidence: ["No explicit WAF, APIM, or access restriction statement found yet."],
      recommendation:
        "Document a clear ingress and boundary protection pattern before final approval.",
      references: [],
      confidence: "Medium",
      criticalBlocker: false,
      suggestedOwner: "Security Architect",
      suggestedDueDate: null,
      owner: null,
      dueDate: null,
      reviewerNote: null,
      status: "Open",
      source: "scaffold"
    },
    {
      findingId: `${review.reviewId}-find-002`,
      reviewId: review.reviewId,
      severity: "Medium",
      domain: "Operational Excellence",
      findingType: "Improvement Opportunity",
      title: `${review.projectName}: runbook ownership needs clarification`,
      findingStatement:
        "The design package does not clearly assign operational ownership for deployment and incident procedures.",
      whyItMatters:
        "Unclear ownership slows incident response and weakens operational readiness.",
      evidenceFound: [],
      missingEvidence: ["No named runbook owner or support handoff model documented."],
      recommendation:
        "Assign an operational owner and define the runbook accountability model.",
      references: [],
      confidence: "Medium",
      criticalBlocker: false,
      suggestedOwner: "Platform Lead",
      suggestedDueDate: null,
      owner: null,
      dueDate: null,
      reviewerNote: null,
      status: "Open",
      source: "scaffold"
    }
  ];
}

function isActiveFinding(finding) {
  return finding.status !== "Closed" && finding.status !== "Not Applicable";
}

function normalizeNullableString(value) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function buildDefaultScorecard(review) {
  return {
    overallScore: review.overallScore,
    recommendation: review.recommendation,
    confidence: "Medium",
    criticalBlockers: 0,
    domainScores: [
      {
        domain: "Requirements Coverage",
        weight: 20,
        score: 16,
        reason: "Baseline requirement mapping scaffold.",
        linkedFindings: []
      },
      {
        domain: "Security",
        weight: 20,
        score: 12,
        reason: "Security rationale scaffold.",
        linkedFindings: [`${review.reviewId}-find-001`]
      },
      {
        domain: "Operational Excellence",
        weight: 20,
        score: 16,
        reason: "Operational ownership still needs explicit assignment.",
        linkedFindings: [`${review.reviewId}-find-002`]
      },
      {
        domain: "Reliability And Resilience",
        weight: 20,
        score: 18,
        reason: "No critical reliability blockers have been identified in the current scaffold.",
        linkedFindings: []
      },
      {
        domain: "Documentation Completeness",
        weight: 20,
        score: 16,
        reason: "The review package is usable, but still has evidence and clarity gaps to close.",
        linkedFindings: []
      }
    ],
    evidenceReadinessState: review.evidenceReadinessState,
    reviewerOverride: null
  };
}

function buildDefaultActions() {
  return [];
}

function toSummaryEntity(review) {
  const {
    missingRequiredItems,
    missingRecommendedItems,
    inScope,
    outOfScope,
    ...persistableReview
  } = review;

  return {
    partitionKey: getPartitionKey(review.reviewId),
    rowKey: getRowKey(SUMMARY_ROW_KEY, review.createdByUserId),
    ...persistableReview,
    assignedReviewer: review.assignedReviewer ?? "",
    finalDecision: review.finalDecision ?? "",
    targetReviewDate: review.targetReviewDate ?? "",
    notes: review.notes ?? "",
    missingRequiredItemsJson: JSON.stringify(missingRequiredItems ?? []),
    missingRecommendedItemsJson: JSON.stringify(missingRecommendedItems ?? []),
    inScopeJson: JSON.stringify(inScope ?? []),
    outOfScopeJson: JSON.stringify(outOfScope ?? [])
  };
}

function toFilesEntity(reviewId, userId, files) {
  return {
    partitionKey: getPartitionKey(reviewId),
    rowKey: getRowKey(FILES_ROW_KEY, userId),
    reviewId,
    createdByUserId: userId,
    filesJson: JSON.stringify(files),
    lastUpdated: new Date().toISOString()
  };
}

function toExtractionEntity(reviewId, userId, extraction) {
  const safeExtraction = {
    ...extraction,
    visualExtractionErrors: trimStringArray(extraction.visualExtractionErrors, 25, 500),
    extractionErrors: trimStringArray(extraction.extractionErrors, 25, 500),
    fileStatuses: Array.isArray(extraction.fileStatuses)
      ? extraction.fileStatuses.map((file) => ({
          ...file,
          fileName: trimString(file.fileName, 240),
          extractionError: trimString(file.extractionError, 500)
        }))
      : extraction.fileStatuses
  };

  return {
    partitionKey: getPartitionKey(reviewId),
    rowKey: getRowKey(EXTRACTION_ROW_KEY, userId),
    reviewId,
    createdByUserId: userId,
    extractionJson: JSON.stringify(safeExtraction),
    lastUpdated: new Date().toISOString()
  };
}

function toRequirementsEntity(reviewId, userId, requirements) {
  const safeRequirements = capRequirementsForTableStorage(requirements);
  return {
    partitionKey: getPartitionKey(reviewId),
    rowKey: getRowKey(REQUIREMENTS_ROW_KEY, userId),
    reviewId,
    createdByUserId: userId,
    requirementsJson: JSON.stringify(safeRequirements),
    lastUpdated: new Date().toISOString()
  };
}

// Azure Table Storage limits each property to 32K characters (64KB UTF-16).
// Visual evidence summaries can be up to 6000 chars each; with 12+ items this
// blows the limit. Truncate before writing — the full summary text is already
// persisted in blob storage at each record's imageUri.
const TABLE_STORAGE_PROPERTY_CHAR_LIMIT = 28_000;

function trimString(value, maxChars) {
  return typeof value === "string" ? value.slice(0, maxChars) : value;
}

function trimStringArray(value, maxItems, maxChars) {
  return Array.isArray(value)
    ? value.slice(0, maxItems).map((item) => trimString(item, maxChars))
    : value;
}

function capArrayJsonForTableStorage(items, mapItem) {
  if (!Array.isArray(items) || items.length === 0) return [];

  let subset = items.map(mapItem);
  while (subset.length > 0 && JSON.stringify(subset).length > TABLE_STORAGE_PROPERTY_CHAR_LIMIT) {
    const nextLength = Math.floor(subset.length * 0.8);
    subset = nextLength >= subset.length
      ? subset.slice(0, subset.length - 1)
      : subset.slice(0, Math.max(0, nextLength));
  }
  return subset;
}

function capRequirementsForTableStorage(requirements) {
  return capArrayJsonForTableStorage(requirements, (req) => ({
    requirementId: req.requirementId,
    reviewId: req.reviewId,
    sourceFileId: req.sourceFileId,
    sourceFileName: trimString(req.sourceFileName, 240),
    normalizedText: trimString(req.normalizedText, 900),
    category: trimString(req.category, 120),
    criticality: req.criticality,
    reviewerStatus: req.reviewerStatus,
    cariStatus: req.cariStatus,
    cariValidationNote: trimString(req.cariValidationNote, 300),
    isGap: req.isGap === true
  }));
}

function capEvidenceForTableStorage(evidence) {
  return capArrayJsonForTableStorage(evidence, (ev) => ({
    evidenceId: ev.evidenceId,
    reviewId: ev.reviewId,
    sourceFileId: ev.sourceFileId,
    sourceFileName: trimString(ev.sourceFileName, 240),
    factType: trimString(ev.factType, 120),
    category: trimString(ev.category, 120),
    summary: trimString(ev.summary, 900),
    sourceExcerpt: trimString(ev.sourceExcerpt, 500),
    confidence: ev.confidence,
    linkedRequirementIds: Array.isArray(ev.linkedRequirementIds) ? ev.linkedRequirementIds.slice(0, 8) : ev.linkedRequirementIds
  }));
}

function capVisualEvidenceForTableStorage(visualEvidence) {
  return capArrayJsonForTableStorage(visualEvidence, (ve) => ({
    visualEvidenceId: ve.visualEvidenceId,
    reviewId: ve.reviewId,
    sourceFileId: ve.sourceFileId,
    sourceFileName: trimString(ve.sourceFileName, 240),
    sourcePage: ve.sourcePage,
    visualIndex: ve.visualIndex,
    factType: trimString(ve.factType, 120),
    summary: trimString(ve.summary, 900),
    sourceExcerpt: trimString(ve.sourceExcerpt, 400),
    confidence: ve.confidence,
    imageUri: trimString(ve.imageUri, 1000),
    extractionSource: trimString(ve.extractionSource, 240),
    promptInjectionRisk: ve.promptInjectionRisk,
    analysisError: trimString(ve.analysisError, 500),
    servicesDetected: trimStringArray(ve.servicesDetected, 20, 80),
    architecturalPatterns: trimStringArray(ve.architecturalPatterns, 12, 120)
  }));
}

function capFindingsForTableStorage(findings) {
  if (!Array.isArray(findings) || findings.length === 0) return [];
  const trim = (s, n) => typeof s === "string" ? s.slice(0, n) : s;
  const capped = findings.map((f) => ({
    ...f,
    findingStatement: trim(f.findingStatement, 600),
    whyItMatters: trim(f.whyItMatters, 400),
    recommendation: trim(f.recommendation, 500),
    evidenceBasis: trim(f.evidenceBasis, 500),
    evidenceFound: Array.isArray(f.evidenceFound)
      ? f.evidenceFound.slice(0, 3).map((e) => ({ ...e, summary: trim(e.summary, 200) }))
      : f.evidenceFound,
    missingEvidence: Array.isArray(f.missingEvidence)
      ? f.missingEvidence.slice(0, 3).map((m) => (typeof m === "string" ? m.slice(0, 200) : m))
      : f.missingEvidence,
  }));
  let subset = capped;
  while (subset.length > 0 && JSON.stringify(subset).length > TABLE_STORAGE_PROPERTY_CHAR_LIMIT) {
    subset = subset.slice(0, Math.max(1, Math.floor(subset.length * 0.8)));
  }
  return subset;
}

function capScorecardForTableStorage(scorecard) {
  if (!scorecard) return scorecard;
  const trim = (s, n) => typeof s === "string" ? s.slice(0, n) : s;
  const trimArr = (arr, maxItems, maxChars) =>
    Array.isArray(arr)
      ? arr.slice(0, maxItems).map((item) => (typeof item === "string" ? item.slice(0, maxChars) : item))
      : arr;
  return {
    ...scorecard,
    reviewSummary: trim(scorecard.reviewSummary, 2000),
    dimensionScores: Array.isArray(scorecard.dimensionScores)
      ? scorecard.dimensionScores.map((d) => ({
          ...d,
          rationale: trim(d.rationale, 400),
          blockers: trimArr(d.blockers, 3, 200),
        }))
      : scorecard.dimensionScores,
    strengths: trimArr(scorecard.strengths, 8, 400),
    missingEvidence: trimArr(scorecard.missingEvidence, 12, 300),
    criticalBlockers: trimArr(scorecard.criticalBlockers, 6, 400),
    nextActions: trimArr(scorecard.nextActions, 10, 400),
  };
}

function toEvidenceEntity(reviewId, userId, evidence, visualEvidence = []) {
  const safeEvidence = capEvidenceForTableStorage(evidence);
  const safeVisualEvidence = capVisualEvidenceForTableStorage(visualEvidence);
  return {
    partitionKey: getPartitionKey(reviewId),
    rowKey: getRowKey(EVIDENCE_ROW_KEY, userId),
    reviewId,
    createdByUserId: userId,
    evidenceJson: JSON.stringify(safeEvidence),
    visualEvidenceJson: JSON.stringify(safeVisualEvidence),
    lastUpdated: new Date().toISOString()
  };
}

function buildTransientExtractionStatus(review, state, input = {}) {
  const startedAt = input.startedAt || new Date().toISOString();
  return {
    reviewId: review.reviewId,
    jobId: input.jobId || `${review.reviewId}-extract-${Date.now()}`,
    state,
    extractionConfidencePercent: 0,
    completedSteps: ["files-registered"],
    failedSteps: [],
    textExtractionStatus: "NotStarted",
    tableExtractionStatus: "NotStarted",
    figureExtractionStatus: "NotStarted",
    visualAnalysisStatus: "NotStarted",
    visualEvidenceCount: 0,
    visualExtractionErrors: [],
    evidenceReadinessState: review.evidenceReadinessState,
    missingRequiredItems: review.missingRequiredItems || [],
    missingRecommendedItems: review.missingRecommendedItems || [],
    readinessNotes: input.readinessNotes || review.readinessNotes || null,
    extractionErrors: input.error ? [input.error] : [],
    lastStartedAt: startedAt,
    lastCompletedAt: input.completedAt || null,
    fileStatuses: Array.isArray(input.fileStatuses) ? input.fileStatuses : []
  };
}

function toExportsEntity(reviewId, userId, exportsList) {
  return {
    partitionKey: getPartitionKey(reviewId),
    rowKey: getRowKey(EXPORTS_ROW_KEY, userId),
    reviewId,
    createdByUserId: userId,
    exportsJson: JSON.stringify(exportsList),
    lastUpdated: new Date().toISOString()
  };
}

function toFindingsEntity(reviewId, userId, findings) {
  return {
    partitionKey: getPartitionKey(reviewId),
    rowKey: getRowKey(FINDINGS_ROW_KEY, userId),
    reviewId,
    createdByUserId: userId,
    findingsJson: JSON.stringify(findings),
    lastUpdated: new Date().toISOString()
  };
}

function toScorecardEntity(reviewId, userId, scorecard) {
  return {
    partitionKey: getPartitionKey(reviewId),
    rowKey: getRowKey(SCORECARD_ROW_KEY, userId),
    reviewId,
    createdByUserId: userId,
    overallScore: scorecard.overallScore ?? null,
    recommendation: scorecard.recommendation,
    confidence: scorecard.confidence,
    criticalBlockers: scorecard.criticalBlockers ?? 0,
    domainScoresJson: JSON.stringify(scorecard.domainScores ?? []),
    lastUpdated: new Date().toISOString()
  };
}

function toDecisionEntity(reviewId, userId, decision) {
  return {
    partitionKey: getPartitionKey(reviewId),
    rowKey: getRowKey(DECISION_ROW_KEY, userId),
    reviewId,
    createdByUserId: userId,
    aiRecommendation: decision.aiRecommendation,
    reviewerDecision: decision.reviewerDecision,
    rationale: decision.rationale,
    reviewerName: decision.reviewerName ?? null,
    reviewerRole: decision.reviewerRole ?? null,
    recordedAt: decision.recordedAt
  };
}

function toActionsEntity(reviewId, userId, actions) {
  return {
    partitionKey: getPartitionKey(reviewId),
    rowKey: getRowKey(ACTIONS_ROW_KEY, userId),
    reviewId,
    createdByUserId: userId,
    actionsJson: JSON.stringify(actions),
    lastUpdated: new Date().toISOString()
  };
}

function fromSummaryEntity(entity) {
  if (!entity) {
    return null;
  }

  return {
    reviewId: entity.reviewId,
    projectName: entity.projectName,
    customerName: entity.customerName,
    architectName: entity.architectName || null,
    createdBy: entity.createdBy || null,
    createdByUserId: entity.createdByUserId,
    createdAt: entity.createdAt,
    workflowState: entity.workflowState,
    evidenceReadinessState: entity.evidenceReadinessState,
    assignedReviewer: entity.assignedReviewer || null,
    targetReviewDate: entity.targetReviewDate || null,
    notes: entity.notes || null,
    overallScore: entity.overallScore != null ? Number(entity.overallScore) : null,
    recommendation: entity.recommendation,
    finalDecision: entity.finalDecision || null,
    requiredEvidencePresent: Boolean(entity.requiredEvidencePresent),
    recommendedEvidenceCoverage: Number(entity.recommendedEvidenceCoverage ?? 0),
    missingRequiredItems: entity.missingRequiredItemsJson ? JSON.parse(entity.missingRequiredItemsJson) : [],
    missingRecommendedItems: entity.missingRecommendedItemsJson
      ? JSON.parse(entity.missingRecommendedItemsJson)
      : [],
    readinessOutcome: entity.readinessOutcome || entity.evidenceReadinessState,
    readinessNotes: entity.readinessNotes || null,
    documentCount: Number(entity.documentCount ?? 0),
    lastUpdated: entity.lastUpdated,
    projectId: entity.projectId || null,
    projectCategory: entity.projectCategory || null,
    inScope: entity.inScopeJson ? JSON.parse(entity.inScopeJson) : [],
    outOfScope: entity.outOfScopeJson ? JSON.parse(entity.outOfScopeJson) : []
  };
}

function fromFilesEntity(entity) {
  if (!entity?.filesJson) {
    return [];
  }

  return JSON.parse(entity.filesJson);
}

function fromFindingsEntity(entity, reviewId) {
  if (!entity?.findingsJson) {
    return buildDefaultFindings({ reviewId, projectName: "Sample ARB Review" });
  }

  const raw = JSON.parse(entity.findingsJson);
  // Normalize findings to ensure all required array/object fields exist
  return (Array.isArray(raw) ? raw : []).map((f) => ({
    ...f,
    missingEvidence: Array.isArray(f.missingEvidence) ? f.missingEvidence : [],
    references: Array.isArray(f.references) ? f.references : [],
    evidenceFound: Array.isArray(f.evidenceFound) ? f.evidenceFound : [],
    reviewId: f.reviewId ?? reviewId
  }));
}

function fromScorecardEntity(entity, review) {
  if (!entity) {
    return buildDefaultScorecard(review);
  }

  return {
    overallScore: entity.overallScore != null ? Number(entity.overallScore) : (review.overallScore ?? null),
    recommendation: entity.recommendation || review.recommendation,
    confidence: entity.confidence || "Medium",
    criticalBlockers: Number(entity.criticalBlockers ?? 0),
    domainScores: entity.domainScoresJson ? JSON.parse(entity.domainScoresJson) : [],
    evidenceReadinessState: entity.evidenceReadinessState || review.evidenceReadinessState,
    reviewerOverride: entity.reviewerOverrideJson ? JSON.parse(entity.reviewerOverrideJson) : null,
    reviewSummary: entity.reviewSummary || null,
    strengths: entity.strengthsJson ? JSON.parse(entity.strengthsJson) : [],
    missingEvidence: entity.missingEvidenceJson ? JSON.parse(entity.missingEvidenceJson) : [],
    criticalBlockersList: entity.criticalBlockersJson ? JSON.parse(entity.criticalBlockersJson) : [],
    nextActions: entity.nextActionsJson ? JSON.parse(entity.nextActionsJson) : []
  };
}

function fromActionsEntity(entity) {
  if (!entity?.actionsJson) {
    return buildDefaultActions();
  }

  return JSON.parse(entity.actionsJson);
}

function fromExtractionEntity(entity, review) {
  if (!entity?.extractionJson) {
    return buildDefaultExtractionStatus(review);
  }

  const extraction = JSON.parse(entity.extractionJson);

  if (typeof extraction.extractionConfidencePercent !== "number") {
    const fileStatuses = Array.isArray(extraction.fileStatuses) ? extraction.fileStatuses : [];
    extraction.extractionConfidencePercent = calculateExtractionConfidencePercent({
      files: fileStatuses,
      requirements: [],
      evidence: [],
      readiness: {
        requiredEvidencePresent: review.requiredEvidencePresent,
        recommendedEvidenceCoverage: review.recommendedEvidenceCoverage
      },
      extractionErrors: extraction.extractionErrors
    });
  }

  return normalizeExtractionStatus(extraction, review);
}

function fromRequirementsEntity(entity) {
  if (!entity?.requirementsJson) {
    return buildDefaultRequirements();
  }

  return JSON.parse(entity.requirementsJson);
}

function fromEvidenceEntity(entity) {
  if (!entity?.evidenceJson) {
    return buildDefaultEvidence();
  }

  return JSON.parse(entity.evidenceJson);
}

function fromVisualEvidenceEntity(entity) {
  if (!entity?.visualEvidenceJson) {
    return [];
  }

  const parsed = JSON.parse(entity.visualEvidenceJson);
  return Array.isArray(parsed) ? parsed : [];
}

function fromExportsEntity(entity) {
  if (!entity?.exportsJson) {
    return buildDefaultExports();
  }

  return JSON.parse(entity.exportsJson);
}

function buildActionId(reviewId, actions) {
  return `${reviewId}-action-${String(actions.length + 1).padStart(3, "0")}`;
}

function calculateDomainScore(domain, weight, findings, review) {
  const linkedFindings = findings.filter(
    (finding) => finding.domain === domain && isActiveFinding(finding)
  );

  if (domain === "Requirements Coverage") {
    return {
      domain,
      weight,
      score: review.evidenceReadinessState === "Ready for Review" ? 18 : 16,
      reason:
        review.evidenceReadinessState === "Ready for Review"
          ? "Evidence is ready for review and requirement coverage is broadly documented."
          : "Most explicit requirements were mapped, but some evidence still needs clarification.",
      linkedFindings: linkedFindings.map((finding) => finding.findingId)
    };
  }

  if (linkedFindings.length === 0) {
    const readinessQualifier =
      review.evidenceReadinessState === "Ready for Review"
        ? "No active blockers are open, but the domain remains capped below full score until reviewer sign-off confirms the positive control evidence."
        : "No active blockers are open, but the domain remains capped below full score because the submitted package still has evidence gaps.";

    return {
      domain,
      weight,
      score: 16,
      reason: readinessQualifier,
      linkedFindings: []
    };
  }

  const penalty = linkedFindings.reduce((total, finding) => {
    if (finding.severity === "Critical") {
      return total + 8;
    }

    if (finding.severity === "High") {
      return total + 6;
    }

    if (finding.severity === "Medium") {
      return total + 4;
    }

    return total + 2;
  }, 0);

  const hasCriticalBlocker = linkedFindings.some((f) => f.criticalBlocker && isActiveFinding(f));
  const minScore = hasCriticalBlocker ? 0 : Math.round(weight * 0.1);

  return {
    domain,
    weight,
    score: Math.max(minScore, weight - penalty),
    reason: `${linkedFindings.length} active finding${linkedFindings.length === 1 ? "" : "s"} currently influence this domain.`,
    linkedFindings: linkedFindings.map((finding) => finding.findingId)
  };
}

function buildDerivedScorecard(review, findings, decision) {
  const domainDefinitions = [
    ["Requirements Coverage", 20],
    ["Security", 20],
    ["Operational Excellence", 20],
    ["Reliability And Resilience", 20],
    ["Documentation Completeness", 20]
  ];
  const domainScores = domainDefinitions.map(([domain, weight]) =>
    calculateDomainScore(domain, weight, findings, review)
  );
  const overallScore = domainScores.reduce((total, domainScore) => total + domainScore.score, 0);
  const criticalBlockers = findings.filter(
    (finding) => finding.criticalBlocker && isActiveFinding(finding)
  ).length;

  let recommendation = "Needs Remediation";
  let confidence = "Medium";

  const readiness = review.evidenceReadinessState;
  const hasUnresolvedHigh = findings.some(
    (finding) => finding.severity === "High" && isActiveFinding(finding)
  );
  const hasSowArtifact = Array.isArray(review.missingRequiredItems)
    ? !review.missingRequiredItems.includes("sow")
    : Boolean(review.requiredEvidencePresent);

  if (readiness === "Insufficient Evidence") {
    recommendation = "Ready with Gaps";
    confidence = "Low";
  } else if (criticalBlockers > 0 || hasUnresolvedHigh || overallScore < 70) {
    recommendation = "Needs Remediation";
    confidence = "Medium";
  } else if (overallScore >= 80 && readiness === "Ready for Review" && hasSowArtifact) {
    recommendation = "Recommended for Approval";
    confidence = "High";
  } else if (overallScore >= 70) {
    recommendation = "Ready with Gaps";
    confidence = "Medium";
  }

  return {
    reviewId: review.reviewId,
    overallScore,
    recommendation,
    confidence,
    criticalBlockers,
    evidenceReadinessState: review.evidenceReadinessState,
    domainScores,
    reviewerOverride: decision
      ? {
          reviewerName: decision.reviewerName || review.assignedReviewer || review.createdBy || review.createdByUserId,
          reviewerRole: decision.reviewerRole || null,
          overrideDecision: decision.reviewerDecision,
          overrideRationale: decision.rationale,
          overriddenAt: decision.recordedAt
        }
      : null
  };
}

async function getEntity(client, reviewId, rowKey) {
  try {
    return await client.getEntity(getPartitionKey(reviewId), rowKey);
  } catch (error) {
    if (error?.statusCode === 404) {
      return null;
    }

    throw error;
  }
}

async function getOwnedSummaryEntity(client, principal, reviewId) {
  const entity = await getEntity(client, reviewId, getRowKey(SUMMARY_ROW_KEY, principal.userId));

  if (!entity) {
    return null;
  }

  return entity;
}

async function seedDemoReview(client, principal, reviewId) {
  const review = buildDefaultReview(reviewId, principal, {});
  const findings = buildDefaultFindings(review);
  const scorecard = buildDefaultScorecard(review);
  const actions = buildDefaultActions();
  const extraction = buildDefaultExtractionStatus(review);

  await client.upsertEntity(toSummaryEntity(review), "Replace");
  await client.upsertEntity(toFindingsEntity(reviewId, principal.userId, findings), "Replace");
  await client.upsertEntity(toScorecardEntity(reviewId, principal.userId, scorecard), "Replace");
  await client.upsertEntity(toActionsEntity(reviewId, principal.userId, actions), "Replace");
  await client.upsertEntity(toFilesEntity(reviewId, principal.userId, []), "Replace");
  await client.upsertEntity(toExtractionEntity(reviewId, principal.userId, extraction), "Replace");
  await client.upsertEntity(toRequirementsEntity(reviewId, principal.userId, []), "Replace");
  await client.upsertEntity(toEvidenceEntity(reviewId, principal.userId, []), "Replace");
  await client.upsertEntity(toExportsEntity(reviewId, principal.userId, []), "Replace");

  return review;
}

async function listArbReviews(principal, options = {}) {
  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const reviews = [];
  const targetRowKey = getRowKey(SUMMARY_ROW_KEY, principal.userId);

  for await (const entity of client.listEntities({
    queryOptions: { filter: `RowKey eq '${targetRowKey}'` }
  })) {
    reviews.push(fromSummaryEntity(entity));
  }

  reviews.sort((left, right) => String(right.lastUpdated ?? "").localeCompare(String(left.lastUpdated ?? "")));

  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  const total = reviews.length;
  const page = reviews.slice(offset, offset + limit);

  return {
    reviews: page,
    total,
    limit,
    offset,
    hasMore: offset + limit < total
  };
}

async function createArbReview(principal, input = {}) {
  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const baseId = input.reviewId || input.projectCode || input.projectName || "demo-review";
  let reviewId = input.projectCode
    ? normalizeReviewId(`arb-${baseId}`, "demo-review")
    : normalizeReviewId(baseId, "demo-review");

  // Auto-resolve name collision: append a short timestamp suffix so the upload
  // always succeeds rather than showing "Unable to create the ARB review."
  const existing = await getEntity(client, reviewId, getRowKey(SUMMARY_ROW_KEY, principal.userId));
  if (existing) {
    const suffix = Date.now().toString(36); // e.g. "lp5xtk"
    reviewId = normalizeReviewId(`${reviewId}-${suffix}`, "demo-review");
  }

  const review = buildDefaultReview(reviewId, principal, input);
  const findings = buildDefaultFindings(review);
  const scorecard = buildDefaultScorecard(review);
  const actions = buildDefaultActions();
  const extraction = buildDefaultExtractionStatus(review);

  await client.upsertEntity(toSummaryEntity(review), "Replace");
  await client.upsertEntity(toFindingsEntity(reviewId, principal.userId, findings), "Replace");
  await client.upsertEntity(toScorecardEntity(reviewId, principal.userId, scorecard), "Replace");
  await client.upsertEntity(toActionsEntity(reviewId, principal.userId, actions), "Replace");
  await client.upsertEntity(toFilesEntity(reviewId, principal.userId, []), "Replace");
  await client.upsertEntity(toExtractionEntity(reviewId, principal.userId, extraction), "Replace");
  await client.upsertEntity(toRequirementsEntity(reviewId, principal.userId, []), "Replace");
  await client.upsertEntity(toEvidenceEntity(reviewId, principal.userId, []), "Replace");
  await client.upsertEntity(toExportsEntity(reviewId, principal.userId, []), "Replace");

  return review;
}

async function deleteArbReview(principal, reviewId) {
  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const summaryEntity = await getOwnedSummaryEntity(client, principal, reviewId);

  if (!summaryEntity) {
    throw createHttpError(404, `ARB review ${reviewId} was not found or you do not have permission to delete it.`);
  }

  // Delete all row keys for this review owned by this user
  const rowKeys = [
    SUMMARY_ROW_KEY,
    FINDINGS_ROW_KEY,
    SCORECARD_ROW_KEY,
    DECISION_ROW_KEY,
    ACTIONS_ROW_KEY,
    FILES_ROW_KEY,
    EXTRACTION_ROW_KEY,
    REQUIREMENTS_ROW_KEY,
    EVIDENCE_ROW_KEY,
    EXPORTS_ROW_KEY
  ];

  const partitionKey = getPartitionKey(reviewId);
  await Promise.all(
    rowKeys.map(async (baseKey) => {
      const rowKey = getRowKey(baseKey, principal.userId);
      try {
        await client.deleteEntity(partitionKey, rowKey);
      } catch (error) {
        // 404 means entity didn't exist — safe to ignore
        if (error?.statusCode !== 404) throw error;
      }
    })
  );

  return { deleted: true, reviewId };
}

async function getArbFiles(principal, reviewId) {
  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const summaryEntity = await getOwnedSummaryEntity(client, principal, reviewId);

  if (!summaryEntity) {
    if (reviewId === "demo-review") {
      await seedDemoReview(client, principal, reviewId);
      return getArbFiles(principal, reviewId);
    }

    throw createHttpError(404, `ARB review ${reviewId} was not found.`);
  }

  const filesEntity = await getEntity(client, reviewId, getRowKey(FILES_ROW_KEY, principal.userId));
  return fromFilesEntity(filesEntity);
}

async function uploadArbFiles(principal, reviewId, filesInput = []) {
  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const summaryEntity = await getOwnedSummaryEntity(client, principal, reviewId);

  if (!summaryEntity) {
    if (reviewId === "demo-review") {
      await seedDemoReview(client, principal, reviewId);
      return uploadArbFiles(principal, reviewId, filesInput);
    }

    throw createHttpError(404, `ARB review ${reviewId} was not found.`);
  }

  const MAX_FILES_PER_REVIEW = 30;
  const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;  // 50 MB per file
  const MAX_TOTAL_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB per review

  const files = Array.isArray(filesInput) ? filesInput : [];

  if (files.length === 0) {
    throw createHttpError(400, "At least one upload file is required.");
  }

  const existingFilesEntity = await getEntity(client, reviewId, getRowKey(FILES_ROW_KEY, principal.userId));
  const existingFiles = fromFilesEntity(existingFilesEntity);

  const existingTotalBytes = existingFiles.reduce((sum, f) => sum + (f.sizeBytes ?? 0), 0);
  const incomingTotalBytes = files.reduce((sum, f) => sum + (Buffer.isBuffer(f.contentBuffer) ? f.contentBuffer.byteLength : 0), 0);

  if (existingTotalBytes + incomingTotalBytes > MAX_TOTAL_SIZE_BYTES) {
    throw createHttpError(400, `Total upload size would exceed the ${MAX_TOTAL_SIZE_BYTES / (1024 * 1024)} MB review limit.`);
  }

  const inputContainer = await getContainerClient(ARB_INPUT_CONTAINER_NAME);
  const now = new Date().toISOString();
  const persistedFiles = [];
  const uploadWorkItems = [];

  for (const file of files) {
    const fileName = sanitizeFilename(file.fileName);

    if (!isSupportedUpload(fileName)) {
      throw createHttpError(400, `Unsupported file type for ${fileName}.`);
    }

    const contentBuffer = Buffer.isBuffer(file.contentBuffer)
      ? file.contentBuffer
      : Buffer.from(file.contentBuffer || []);

    if (contentBuffer.byteLength > MAX_FILE_SIZE_BYTES) {
      throw createHttpError(400, `File ${fileName} exceeds the ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB per-file limit.`);
    }

    if (contentBuffer.byteLength === 0) {
      throw createHttpError(400, `File ${fileName} is empty and cannot be uploaded.`);
    }

    uploadWorkItems.push({ file, fileName, contentBuffer, packageWarnings: null, packageChildFiles: [] });

    if (isZipUpload(fileName)) {
      const expanded = await expandZipUpload(file, fileName, contentBuffer);
      uploadWorkItems[uploadWorkItems.length - 1].packageWarnings = expanded.warnings;
      uploadWorkItems[uploadWorkItems.length - 1].packageChildFiles = expanded.childFiles;
      for (const childFile of expanded.childFiles) {
        uploadWorkItems.push({
          file: childFile,
          fileName: sanitizeFilename(childFile.fileName),
          contentBuffer: childFile.contentBuffer,
          packageWarnings: null,
          packageChildFiles: []
        });
      }
    }
  }

  if (existingFiles.length + uploadWorkItems.length > MAX_FILES_PER_REVIEW) {
    throw createHttpError(400, `Upload limit reached. A review may contain at most ${MAX_FILES_PER_REVIEW} files including ZIP child files.`);
  }

  const expandedIncomingTotalBytes = uploadWorkItems.reduce((sum, item) => sum + item.contentBuffer.byteLength, 0);
  if (existingTotalBytes + expandedIncomingTotalBytes > MAX_TOTAL_SIZE_BYTES) {
    throw createHttpError(400, `Total upload size would exceed the ${MAX_TOTAL_SIZE_BYTES / (1024 * 1024)} MB review limit after ZIP expansion.`);
  }

  for (const workItem of uploadWorkItems) {
    const { file, fileName, contentBuffer, packageWarnings, packageChildFiles } = workItem;
    const contentHash = `sha256:${crypto.createHash("sha256").update(contentBuffer).digest("hex")}`;
    const logicalCategory = isZipUpload(fileName)
      ? "evidence_package"
      : normalizeLogicalCategory(file.logicalCategory, inferLogicalCategory(fileName));

    if (
      existingFiles.some(
        (existing) => existing.fileName === fileName && existing.contentHash === contentHash
      )
    ) {
      continue;
    }

    const fileId = buildFileId(reviewId, fileName, contentHash.replace(/^sha256:/, ""));
    const blobPath = buildBlobPath(principal.userId, reviewId, fileName, logicalCategory);
    const contentType = file.contentType || getUploadContentType(fileName, "application/octet-stream");
    const extractable =
      !isZipUpload(fileName) &&
      (
        supportsTextExtraction(fileName) ||
        supportsSpreadsheetExtraction(fileName) ||
        supportsDiagramExtraction(fileName) ||
        supportsImageExtraction(fileName) ||
        supportsDocumentIntelligenceExtraction(fileName)
      );

    await uploadBinaryBlob(inputContainer, blobPath, contentBuffer, contentType);

    persistedFiles.push({
      fileId,
      reviewId,
      fileName,
      fileType: getFileExtension(fileName).replace(/^\./, "") || "bin",
      logicalCategory,
      blobPath,
      uploadedBy: principal.userDetails || principal.userId,
      uploadedAt: now,
      contentHash,
      extractionStatus: isZipUpload(fileName)
        ? (packageWarnings?.length ? "ExpandedWithWarnings" : "Expanded")
        : (extractable ? "Pending" : "Limited Evidence"),
      extractionError: packageWarnings?.length ? packageWarnings.join(" | ") : null,
      sourceRole: normalizeNullableString(file.sourceRole) || inferSourceRole(logicalCategory),
      sizeBytes: contentBuffer.byteLength,
      contentType,
      supportedTextExtraction: extractable,
      parentPackageFileName: file.parentPackageFileName || null,
      parentPackagePath: file.parentPackagePath || null,
      packageChildCount: isZipUpload(fileName) ? packageChildFiles.length : undefined,
      packageSkippedCount: isZipUpload(fileName) ? (packageWarnings?.length || 0) : undefined,
      packageWarnings: isZipUpload(fileName) ? (packageWarnings || []) : undefined
    });
  }

  const nextFiles = [...existingFiles, ...persistedFiles];
  const readiness = buildReadinessFromFiles(nextFiles);
  const nextEvidenceState =
    readiness.readinessOutcome === "Ready for Review"
      ? "Ready for Review"
      : readiness.readinessOutcome === "Insufficient Evidence"
        ? "Insufficient Evidence"
        : "Ready with Gaps";

  await client.upsertEntity(toFilesEntity(reviewId, principal.userId, nextFiles), "Replace");
  await client.upsertEntity(
    {
      partitionKey: getPartitionKey(reviewId),
      rowKey: getRowKey(SUMMARY_ROW_KEY, principal.userId),
      workflowState: nextFiles.length > 0 ? "Evidence Ready" : "Draft",
      evidenceReadinessState: nextEvidenceState,
      requiredEvidencePresent: readiness.requiredEvidencePresent,
      recommendedEvidenceCoverage: readiness.recommendedEvidenceCoverage,
      readinessOutcome: readiness.readinessOutcome,
      readinessNotes: readiness.readinessNotes,
      missingRequiredItemsJson: JSON.stringify(readiness.missingRequiredItems),
      missingRecommendedItemsJson: JSON.stringify(readiness.missingRecommendedItems),
      documentCount: nextFiles.length,
      lastUpdated: now
    },
    "Merge"
  );
  await client.upsertEntity(
    toExtractionEntity(
      reviewId,
      principal.userId,
      buildNotStartedExtractionStatus(
        {
          ...fromSummaryEntity(summaryEntity),
          evidenceReadinessState: nextEvidenceState,
          missingRequiredItems: readiness.missingRequiredItems,
          missingRecommendedItems: readiness.missingRecommendedItems,
          readinessNotes: readiness.readinessNotes
        },
        nextFiles
      )
    ),
    "Replace"
  );

  return {
    files: nextFiles,
    addedCount: persistedFiles.length,
    evidenceReadinessState: nextEvidenceState,
    readiness
  };
}

async function deleteArbFile(principal, reviewId, fileId) {
  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const summaryEntity = await getOwnedSummaryEntity(client, principal, reviewId);

  if (!summaryEntity) {
    throw createHttpError(404, `ARB review ${reviewId} was not found.`);
  }

  const filesEntity = await getEntity(client, reviewId, getRowKey(FILES_ROW_KEY, principal.userId));
  const existingFiles = fromFilesEntity(filesEntity);
  const fileToDelete = existingFiles.find((f) => f.fileId === fileId);

  if (!fileToDelete) {
    throw createHttpError(404, `File ${fileId} was not found in review ${reviewId}.`);
  }

  const nextFiles = existingFiles.filter((f) => f.fileId !== fileId);

  if (fileToDelete.blobPath) {
    const inputContainer = await getContainerClient(ARB_INPUT_CONTAINER_NAME);
    const { deleteBlobIfExists } = require("./storage");
    await deleteBlobIfExists(inputContainer, fileToDelete.blobPath);
  }

  await client.upsertEntity(toFilesEntity(reviewId, principal.userId, nextFiles), "Replace");

  const readiness = buildReadinessFromFiles(nextFiles);
  const nextEvidenceState =
    readiness.readinessOutcome === "Ready for Review"
      ? "Ready for Review"
      : readiness.readinessOutcome === "Insufficient Evidence"
        ? "Insufficient Evidence"
        : "Ready with Gaps";

  await client.upsertEntity(
    {
      partitionKey: getPartitionKey(reviewId),
      rowKey: getRowKey(SUMMARY_ROW_KEY, principal.userId),
      workflowState: nextFiles.length > 0 ? "Evidence Ready" : "Draft",
      evidenceReadinessState: nextEvidenceState,
    },
    "Merge"
  );
  await client.upsertEntity(
    toExtractionEntity(
      reviewId,
      principal.userId,
      buildNotStartedExtractionStatus(
        {
          ...fromSummaryEntity(summaryEntity),
          evidenceReadinessState: nextEvidenceState,
          missingRequiredItems: readiness.missingRequiredItems,
          missingRecommendedItems: readiness.missingRecommendedItems,
          readinessNotes: readiness.readinessNotes
        },
        nextFiles
      )
    ),
    "Replace"
  );

  return { deletedFileId: fileId, remainingCount: nextFiles.length };
}

async function startArbExtraction(principal, reviewId) {
  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const review = await getArbReview(principal, reviewId);
  const files = await getArbFiles(principal, reviewId);

  if (files.length === 0) {
    throw createHttpError(400, "Upload files before starting extraction.");
  }

  // STRIDE REC-07: reserve per-user hourly DI quota before the extraction loop.
  // Only counts files that will actually hit Document Intelligence.
  if (getDocumentIntelligenceConfiguration().configured) {
    const diEligibleCount = files.filter(
      (f) => supportsDocumentIntelligenceExtraction(f.fileName)
    ).length;
    await checkAndReserveQuota(principal, diEligibleCount);
  }

  const inputContainer = await getContainerClient(ARB_INPUT_CONTAINER_NAME);
  const jobId = `${reviewId}-extract-${Date.now()}`;
  const startedAt = new Date().toISOString();
  const nextFiles = [];
  const extractionErrors = [];
  const visualEvidence = [];
  const visualExtractionErrors = [];
  const visualCountsByFile = new Map();
  const fileTexts = new Map();
  let searchIndexed = false;
  const outputContainer = await getContainerClient(ARB_OUTPUT_CONTAINER_NAME);

  if (getSearchConfiguration().configured) {
    try {
      await ensureArbSearchIndex();
      searchIndexed = true;
    } catch {
      // Search indexing is best-effort; extraction continues without it
    }
  }

  const visionAvailable = getFoundryConfiguration().configured;

  async function addVisualEvidenceRecord(file, artifact, visualIndexOverride = null) {
    try {
      const record = await persistAndAnalyzeVisualArtifact({
        principal,
        reviewId,
        visualIndex: visualIndexOverride ?? visualEvidence.length,
        sourceFile: file,
        artifact,
        outputContainer,
        canUseMultimodal: visionAvailable
      });
      visualEvidence.push(record);
      visualCountsByFile.set(file.fileId, (visualCountsByFile.get(file.fileId) || 0) + 1);
      if (record.analysisError) {
        visualExtractionErrors.push(`${file.fileName}: visual analysis warning for ${record.visualEvidenceId}: ${record.analysisError}`);
      }
      if (record.promptInjectionRisk && record.promptInjectionRisk !== "NoneDetected") {
        visualExtractionErrors.push(`${file.fileName}: possible prompt-injection text detected in ${record.visualEvidenceId}; treated as untrusted evidence.`);
      }
      return record;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      visualExtractionErrors.push(`${file.fileName}: visual evidence extraction failed: ${message}`);
      return null;
    }
  }

  async function addVisualEvidenceRecords(file, artifacts, concurrency = 1) {
    if (!Array.isArray(artifacts) || artifacts.length === 0) {
      return [];
    }

    const indexedArtifacts = artifacts.map((artifact, index) => ({
      artifact,
      visualIndex: visualEvidence.length + index
    }));
    const records = [];

    for (let i = 0; i < indexedArtifacts.length; i += concurrency) {
      const chunk = indexedArtifacts.slice(i, i + concurrency);
      const chunkRecords = await Promise.all(
        chunk.map(({ artifact, visualIndex }) => addVisualEvidenceRecord(file, artifact, visualIndex))
      );
      records.push(...chunkRecords.filter(Boolean));
    }

    return records;
  }

  async function processOfficeVisualEvidence(file, buffer) {
    const extension = getFileExtension(file.fileName);
    if (![".docx", ".pptx", ".xlsx"].includes(extension)) {
      return;
    }

    const { artifacts, warnings } = await extractOfficeMediaArtifacts(buffer, file.fileName);
    for (const warning of warnings) {
      visualExtractionErrors.push(warning);
    }
    await addVisualEvidenceRecords(file, artifacts);

    const shouldRunFallback = artifacts.length === 0 || extension === ".pptx";
    if (shouldRunFallback) {
      const rendered = await renderOfficeVisualArtifacts(buffer, file.fileName);
      for (const warning of rendered.warnings) {
        visualExtractionErrors.push(warning);
      }
      await addVisualEvidenceRecords(file, rendered.artifacts);

      if (rendered.artifacts.length > 0) {
        // Render all remaining slides/pages beyond the first batch — diagrams and
        // images can appear on any slide/page regardless of content type.
        const extra = await renderDocumentRemainingPages(buffer, file.fileName, rendered.artifacts.length);
        for (const warning of extra.warnings) visualExtractionErrors.push(warning);
        if (extra.artifacts.length > 0) {
          await addVisualEvidenceRecords(file, extra.artifacts);
        }
        return;
      }

      const fallback = await extractOfficeRenderFallbackEvidence(buffer, file.fileName);
      for (const warning of fallback.warnings) {
        visualExtractionErrors.push(warning);
      }
      await addVisualEvidenceRecords(file, fallback.artifacts);
    }
  }

  async function processPdfVisualEvidence(file, layout, buffer, prerendered = null) {
    const figures = Array.isArray(layout?.figures) ? layout.figures : [];
    const figureArtifacts = [];
    for (const figure of figures) {
      if (!figure.buffer) {
        visualExtractionErrors.push(`${file.fileName}: Document Intelligence could not retrieve figure ${figure.figureId || "unknown"}.`);
        continue;
      }
      figureArtifacts.push({
        sourceName: `${file.fileName}-${figure.figureId || "figure"}.png`,
        buffer: figure.buffer,
        extension: ".png",
        contentType: figure.contentType || "image/png",
        sourcePage: figure.sourcePage ?? figure.pageNumber ?? null,
        figureId: figure.figureId ?? null,
        sourceExcerpt: `Visual analysis of embedded architecture figure ${figure.figureId || ""} in ${file.fileName}.`.trim(),
        extractionSource: "Document Intelligence figures + multimodal analysis"
      });
    }

    const persistedFigureRecords = await addVisualEvidenceRecords(file, figureArtifacts);
    const persistedFigures = persistedFigureRecords.length;

    if (persistedFigures > 0) {
      return;
    }

    const rendered = prerendered || await renderOfficeVisualArtifacts(buffer, file.fileName);
    for (const warning of rendered.warnings) {
      visualExtractionErrors.push(warning);
    }
    if (rendered.artifacts.length > 0) {
      await addVisualEvidenceRecords(file, rendered.artifacts);

      // Render all remaining pages beyond the first batch — diagrams can appear
      // on any page regardless of text density or keyword presence.
      const extra = await renderDocumentRemainingPages(buffer, file.fileName, rendered.artifacts.length);
      for (const warning of extra.warnings) visualExtractionErrors.push(warning);
      if (extra.artifacts.length > 0) {
        await addVisualEvidenceRecords(file, extra.artifacts);
      }
      return;
    }

    const pages = Array.isArray(layout?.result?.pages) ? layout.result.pages : [];
    const fallbackPages = pages
      .filter((page) => {
        const pageText = Array.isArray(page.lines) ? page.lines.map((l) => l.content).join(" ") : "";
        const wordCount = pageText.split(/\s+/).filter(Boolean).length;
        return (wordCount < 150 && PDF_FALLBACK_KEYWORDS.test(pageText)) || wordCount < 15;
      })
      .slice(0, 12);
    await addVisualEvidenceRecords(file, fallbackPages.map((page) => {
      const pageText = Array.isArray(page.lines)
        ? page.lines.map((line) => line.content).filter(Boolean).join("\n")
        : "";
      return {
        sourceName: `${file.fileName}-page-${page.pageNumber}.txt`,
        sourcePage: page.pageNumber ?? null,
        summaryText: pageText
          ? `PDF page ${page.pageNumber} was treated as visual evidence fallback. Extracted page labels:\n${pageText.slice(0, 4000)}`
          : `PDF page ${page.pageNumber} was treated as visual evidence fallback because no cropped figures were returned by Document Intelligence.`,
        sourceExcerpt: `Visual analysis fallback for full-page architecture content on page ${page.pageNumber}.`,
        extractionSource: "PDF page render fallback + extracted page evidence"
      };
    }));
  }

  // Per-file extraction timeout — prevents a single hung file (e.g. DI stall, network hang)
  // from blocking the entire pipeline. 120 s is well above the DI abort guard (90 s) so
  // this only fires when an unexpected code path fails to self-cancel.
  async function withFileTimeout(fn, file, timeoutMs = 120000) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`File extraction timed out after ${timeoutMs / 1000}s`)), timeoutMs);
    });
    try {
      return await Promise.race([fn(), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  for (const file of files) {
    const isSpreadsheet = supportsSpreadsheetExtraction(file.fileName);
    const isDiagram = supportsDiagramExtraction(file.fileName);
    const isImage = supportsImageExtraction(file.fileName);

    // ── Spreadsheet extraction via ExcelJS (DI fallback when ExcelJS fails) ──
    if (isSpreadsheet) {
      let diSpreadsheetFallback = false;
      try {
        const buffer = await readBinaryBlob(inputContainer, file.blobPath);

        if (!buffer || buffer.length === 0) {
          nextFiles.push({
            ...file,
            extractionStatus: "Failed",
            extractionError: "Spreadsheet file could not be read from storage."
          });
          extractionErrors.push(`${file.fileName}: empty blob.`);
          continue;
        }

        await processOfficeVisualEvidence(file, buffer);

        const text = await extractSpreadsheetText(buffer);

        if (!text || !text.trim()) {
          nextFiles.push({
            ...file,
            extractionStatus: "Failed",
            extractionError: "No data rows could be extracted from the spreadsheet."
          });
          extractionErrors.push(`${file.fileName}: no data rows found.`);
          continue;
        }

        fileTexts.set(file.fileId, text);
        nextFiles.push({ ...file, extractionStatus: "Completed", extractionError: null });

        if (searchIndexed) {
          indexArbDocumentChunks(reviewId, file.fileId, file.fileName, file.logicalCategory, text).catch((err) => { console.warn(`[search-index] Failed to index "${file.fileName}" (review ${reviewId}):`, err?.message ?? err); });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown spreadsheet extraction error.";
        const diCfg = getDocumentIntelligenceConfiguration();
        if (!diCfg.configured) {
          nextFiles.push({ ...file, extractionStatus: "Failed", extractionError: message });
          extractionErrors.push(`${file.fileName}: ${message}`);
        } else {
          // ExcelJS failed but DI is available — fall through to DI path below.
          extractionErrors.push(`${file.fileName}: ExcelJS parse error (${message}) — retrying with Document Intelligence.`);
          diSpreadsheetFallback = true;
        }
      }
      if (!diSpreadsheetFallback) continue;
      // diSpreadsheetFallback === true: fall through to supportsDocumentIntelligenceExtraction block
    }

    // ── Native diagram extraction (Draw.io / Visio VSDX) ───────────────────
    if (isDiagram) {
      try {
        const buffer = await readBinaryBlob(inputContainer, file.blobPath);

        if (!buffer || buffer.length === 0) {
          nextFiles.push({
            ...file,
            extractionStatus: "Failed",
            extractionError: "Diagram file could not be read from storage."
          });
          extractionErrors.push(`${file.fileName}: empty blob.`);
          continue;
        }

        const text = await extractDiagramText(buffer, file.fileName);

        if (!text || !text.trim()) {
          nextFiles.push({
            ...file,
            extractionStatus: "Failed",
            extractionError: "No readable labels or diagram metadata could be extracted."
          });
          extractionErrors.push(`${file.fileName}: no readable diagram labels found.`);
          continue;
        }

        await addVisualEvidenceRecord(file, {
          sourceName: file.fileName,
          summaryText: text,
          sourceExcerpt: `Readable diagram labels and metadata extracted from ${file.fileName}.`,
          extractionSource: "Native diagram file extraction + visual evidence normalization"
        });

        fileTexts.set(file.fileId, text);
        nextFiles.push({ ...file, extractionStatus: "Completed", extractionError: null });

        if (searchIndexed) {
          indexArbDocumentChunks(reviewId, file.fileId, file.fileName, file.logicalCategory, text).catch((err) => { console.warn(`[search-index] Failed to index "${file.fileName}" (review ${reviewId}):`, err?.message ?? err); });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown diagram extraction error.";
        nextFiles.push({ ...file, extractionStatus: "Failed", extractionError: message });
        extractionErrors.push(`${file.fileName}: ${message}`);
      }
      continue;
    }

    // ── Image description via multimodal vision ──────────────────────────────
    if (isImage) {
      try {
        const buffer = await readBinaryBlob(inputContainer, file.blobPath);

        if (!buffer || buffer.length === 0) {
          nextFiles.push({
            ...file,
            extractionStatus: "Failed",
            extractionError: "Image file could not be read from storage."
          });
          extractionErrors.push(`${file.fileName}: empty blob.`);
          continue;
        }

        const visualRecord = await addVisualEvidenceRecord(file, {
          sourceName: file.fileName,
          buffer,
          extension: getFileExtension(file.fileName),
          contentType: file.contentType,
          summaryText: visionAvailable
            ? ""
            : "Standalone image uploaded as visual architecture evidence. Multimodal analysis is unavailable because FOUNDRY_PROJECT_ENDPOINT is not configured.",
          sourceExcerpt: `Visual analysis of standalone uploaded image ${file.fileName}.`,
          extractionSource: "Standalone image upload + multimodal analysis"
        });
        const description = visualRecord?.summary || "";

        if (!description || !description.trim()) {
          nextFiles.push({
            ...file,
            extractionStatus: "Failed",
            extractionError: "Vision model returned no description for the image."
          });
          extractionErrors.push(`${file.fileName}: vision returned empty response.`);
          continue;
        }

        const text = `[Architecture diagram: ${file.fileName}]\n\n${description}`;
        fileTexts.set(file.fileId, text);
        nextFiles.push({ ...file, extractionStatus: "Completed", extractionError: null });

        if (searchIndexed) {
          indexArbDocumentChunks(reviewId, file.fileId, file.fileName, file.logicalCategory, text).catch((err) => { console.warn(`[search-index] Failed to index "${file.fileName}" (review ${reviewId}):`, err?.message ?? err); });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown image analysis error.";
        nextFiles.push({ ...file, extractionStatus: "Failed", extractionError: message });
        extractionErrors.push(`${file.fileName}: ${message}`);
      }
      continue;
    }

    // ── Azure AI Document Intelligence (PDF, DOCX, PPTX, DOC, PPT) ─────────
    // Fallback: when DI is unavailable or returns no text, Azure Vision Service
    // OCR is attempted for PDF and image formats before marking Limited Evidence.
    if (supportsDocumentIntelligenceExtraction(file.fileName)) {
      const diConfig = getDocumentIntelligenceConfiguration();
      const visionConfig = getVisionServiceConfiguration();
      const canUseVisionFallback = visionConfig.configured && supportsVisionExtraction(file.fileName);

      const isPdf = getFileExtension(file.fileName) === ".pdf";
      const isDocx = getFileExtension(file.fileName) === ".docx";
      const isXlsx = [".xlsx", ".xls"].includes(getFileExtension(file.fileName));
      // PDFs always proceed — pdf-parse is a zero-config fallback.
      // DOCX always proceeds — jszip XML extraction is a zero-config fallback.
      // XLSX proceeds when diSpreadsheetFallback is true (ExcelJS crashed — DI or jszip will try).
      // Other non-PDF DI formats still need at least one configured service.
      if (!isPdf && !isDocx && !isXlsx && !diConfig.configured && !canUseVisionFallback) {
        nextFiles.push({
          ...file,
          extractionStatus: "Limited Evidence",
          extractionError:
            "Azure AI Document Intelligence is not configured (AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT or AZURE_DOCINT_ENDPOINT missing). " +
            "Text extraction is unavailable for this file format."
        });
        continue;
      }

      try {
        await withFileTimeout(async () => {
          const buffer = await readBinaryBlob(inputContainer, file.blobPath);

          if (!buffer || buffer.length === 0) {
            nextFiles.push({
              ...file,
              extractionStatus: "Failed",
              extractionError: "Document file could not be read from storage."
            });
            extractionErrors.push(`${file.fileName}: empty blob.`);
            return;
          }

          let text = null;
          let extractionSource = "Document Intelligence";

          await processOfficeVisualEvidence(file, buffer);

          if (isPdf) {
            console.log(`[pdf-visual] Processing "${file.fileName}" — scanning for embedded images and diagram pages.`);

            // Office Renderer is independent of Document Intelligence — attempt for all PDFs.
            // Previously this was nested inside if (diConfig.configured), which silently
            // skipped visual evidence for all PDFs when DI was not configured.
            const renderResult = await renderOfficeVisualArtifacts(buffer, file.fileName);
            for (const warning of renderResult.warnings) {
              visualExtractionErrors.push(warning);
            }
            const prerendered = renderResult;

            if (diConfig.configured) {
              let layout = null;
              try {
                layout = await extractDocumentLayout(buffer, file.contentType, file.fileName, { includeFigures: true });
                text = layout.text;
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                visualExtractionErrors.push(`${file.fileName}: PDF figure extraction failed: ${message}`);
                try {
                  text = await extractDocumentText(buffer, file.contentType, file.fileName);
                } catch {
                  // text remains null; Vision OCR fallback runs below if configured
                }
              }
              await processPdfVisualEvidence(file, layout, buffer, prerendered);
            } else {
              // DI not configured — use rendered page artifacts as visual evidence directly
              if (prerendered.artifacts.length > 0) {
                console.log(`[pdf-visual] "${file.fileName}": ${prerendered.artifacts.length} page-render visual evidence records created (Office Renderer; DI not configured).`);
                await addVisualEvidenceRecords(file, prerendered.artifacts);
              } else {
                // Last resort: pdf-parse keyword + density heuristics — no external services required
                const pdfFallback = await extractPdfDiagramPageEvidence(buffer, file.fileName);
                for (const warning of pdfFallback.warnings) {
                  visualExtractionErrors.push(warning);
                }
                if (pdfFallback.artifacts.length > 0) {
                  console.log(`[pdf-visual] "${file.fileName}": ${pdfFallback.artifacts.length} pdf-parse diagram page evidence records created.`);
                  await addVisualEvidenceRecords(file, pdfFallback.artifacts);
                } else {
                  console.log(`[pdf-visual] "${file.fileName}": no visual evidence extracted (DI not configured, Office Renderer returned no images, pdf-parse found no diagram pages).`);
                }
              }
            }
          } else if (diConfig.configured) {
            try {
              text = await extractDocumentText(buffer, file.contentType, file.fileName);
            } catch (diErr) {
              const diMsg = diErr instanceof Error ? diErr.message : String(diErr);
              extractionErrors.push(`${file.fileName}: Document Intelligence failed (${diMsg}) — trying fallback.`);
              // text remains null; jszip fallback runs below for .docx
            }
          }

          // Vision Service OCR fallback — used when DI is not configured or returned no text.
          // Only applies to formats Vision Read API accepts (PDF, JPEG, PNG, TIFF, BMP, GIF).
          if ((!text || !text.trim()) && canUseVisionFallback) {
            text = await extractTextWithVision(buffer, file.contentType, file.fileName);
            extractionSource = "Azure Vision Service (OCR fallback)";
          }

          // jszip text fallback for .docx — zero-config, no external service required.
          // Reads word/document.xml directly from the Office Open XML ZIP package.
          // Handles cases where DI is not configured, quota-exhausted, or returning no text.
          if ((!text || !text.trim()) && isDocx) {
            try {
              const JSZip = require('jszip');
              const zip = await JSZip.loadAsync(buffer);
              const docXmlEntry = zip.file('word/document.xml');
              if (docXmlEntry) {
                const xml = await docXmlEntry.async('string');
                const textNodes = [];
                const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
                let m;
                while ((m = re.exec(xml)) !== null) if (m[1]) textNodes.push(m[1]);
                const extracted = textNodes.join(' ').replace(/\s+/g, ' ').trim();
                if (extracted) {
                  text = extracted;
                  extractionSource = 'docx ZIP text extraction (jszip fallback)';
                  console.log(`[docx-fallback] "${file.fileName}": extracted ${extracted.length} chars via jszip XML fallback.`);
                }
              }
            } catch (zipErr) {
              console.warn(`[docx-fallback] "${file.fileName}": jszip fallback failed:`, zipErr?.message ?? zipErr);
            }
          }

          // jszip xlsx XML fallback — zero-config, no external service required.
          // Reads xl/sharedStrings.xml and xl/worksheets/sheet*.xml from the Office Open XML ZIP.
          // Handles xlsx files where ExcelJS crashes (e.g. threaded comments) AND DI rejects the file.
          if ((!text || !text.trim()) && isXlsx) {
            try {
              const JSZip = require('jszip');
              const zip = await JSZip.loadAsync(buffer);
              const sharedStrings = [];
              const ssEntry = zip.file('xl/sharedStrings.xml');
              if (ssEntry) {
                const ssXml = await ssEntry.async('string');
                const re = /<t[^>]*>([^<]*)<\/t>/g;
                let m;
                while ((m = re.exec(ssXml)) !== null) sharedStrings.push(m[1]);
              }
              const rows = [];
              const sheetFiles = Object.keys(zip.files).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/i.test(n)).sort();
              for (const sheetName of sheetFiles) {
                const sheetXml = await zip.files[sheetName].async('string');
                const cellRe = /<c\b[^>]*>.*?<\/c>/gs;
                const tRe = /\bt="s"\b/;
                const vRe = /<v>([^<]*)<\/v>/;
                let cm;
                const rowValues = [];
                while ((cm = cellRe.exec(sheetXml)) !== null) {
                  const cell = cm[0];
                  const vm = vRe.exec(cell);
                  if (!vm) continue;
                  if (tRe.test(cell)) {
                    const idx = parseInt(vm[1], 10);
                    rowValues.push(isNaN(idx) ? vm[1] : (sharedStrings[idx] ?? vm[1]));
                  } else {
                    rowValues.push(vm[1]);
                  }
                }
                if (rowValues.length > 0) rows.push(rowValues.join(', '));
              }
              const extracted = rows.join('\n').trim();
              if (extracted) {
                text = extracted;
                extractionSource = 'xlsx ZIP text extraction (jszip fallback)';
                console.log(`[xlsx-fallback] "${file.fileName}": extracted ${extracted.length} chars via jszip XML fallback.`);
              }
            } catch (zipErr) {
              console.warn(`[xlsx-fallback] "${file.fileName}": jszip xlsx fallback failed:`, zipErr?.message ?? zipErr);
            }
          }

          // pdf-parse text fallback — zero-config, no external services.
          // Handles text-layer PDFs when DI and Vision are both unavailable or returned nothing.
          // Scanned/image-only PDFs will still return empty here and fall through to Failed.
          if (!text || !text.trim()) {
            try {
              const pdfParse = require("pdf-parse");
              const parsed = await pdfParse(buffer);
              if (parsed.text && parsed.text.trim()) {
                text = parsed.text;
                extractionSource = "pdf-parse (native text layer)";
                console.log(`[pdf-text] "${file.fileName}": extracted ${parsed.text.length} chars via pdf-parse native text layer.`);
              }
            } catch (pdfErr) {
              console.warn(`[pdf-text] "${file.fileName}": pdf-parse text fallback failed:`, pdfErr?.message ?? pdfErr);
            }
          }

          if (!text || !text.trim()) {
            nextFiles.push({
              ...file,
              extractionStatus: "Failed",
              extractionError: diConfig.configured
                ? "Azure AI Document Intelligence returned no text. The document may be a scanned image — try uploading a text-layer PDF."
                : "No text could be extracted. Document Intelligence is not configured, Azure Vision OCR returned nothing, and the PDF has no selectable text layer."
            });
            extractionErrors.push(`${file.fileName}: ${extractionSource} returned no text.`);
            return;
          }

          fileTexts.set(file.fileId, text);
          nextFiles.push({ ...file, extractionStatus: "Completed", extractionError: null });

          if (searchIndexed) {
            indexArbDocumentChunks(reviewId, file.fileId, file.fileName, file.logicalCategory, text).catch((err) => { console.warn(`[search-index] Failed to index "${file.fileName}" (review ${reviewId}):`, err?.message ?? err); });
          }
        }, file);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown Document Intelligence error.";
        nextFiles.push({ ...file, extractionStatus: "Failed", extractionError: message });
        extractionErrors.push(`${file.fileName}: ${message}`);
      }
      continue;
    }

    // ── Plain-text extraction (existing path) ────────────────────────────────
    if (file.logicalCategory === "evidence_package") {
      nextFiles.push({
        ...file,
        extractionStatus: file.extractionStatus || "Expanded",
        extractionError: file.extractionError || null
      });
      continue;
    }

    if (!file.supportedTextExtraction) {
      nextFiles.push({
        ...file,
        extractionStatus: "Limited Evidence",
        extractionError:
          file.extractionError ||
          "File is stored successfully but needs a richer text extraction worker for this format."
      });
      continue;
    }

    try {
      const text = await readTextBlob(inputContainer, file.blobPath);

      if (!text || !text.trim()) {
        nextFiles.push({
          ...file,
          extractionStatus: "Failed",
          extractionError: "No readable text could be extracted from the uploaded file."
        });
        extractionErrors.push(`${file.fileName}: no readable text could be extracted.`);
        continue;
      }

      fileTexts.set(file.fileId, text);
      nextFiles.push({
        ...file,
        extractionStatus: "Completed",
        extractionError: null
      });

      // Text-based diagram formats (Mermaid, PlantUML, Excalidraw) — create a visual
      // evidence record so the agent treats them as architectural diagram evidence
      // rather than generic text. GPT-4o natively understands these syntaxes.
      if (DIAGRAM_TEXT_EXTENSIONS.has(getFileExtension(file.fileName))) {
        const ext = getFileExtension(file.fileName);
        const diagramType =
          ext === ".mmd" || ext === ".mermaid" ? "Mermaid" :
          ext === ".puml" || ext === ".plantuml" ? "PlantUML" :
          ext === ".excalidraw" ? "Excalidraw" : "Diagram";
        addVisualEvidenceRecord(file, {
          sourceName: file.fileName,
          summaryText: `[${diagramType} architecture diagram: ${file.fileName}]\n\nDiagram specification — describes architecture topology, components, and data flows:\n${text.slice(0, 5000)}`,
          sourceExcerpt: `${diagramType} diagram specification extracted from ${file.fileName}.`,
          extractionSource: `${diagramType} diagram specification analysis`
        }).catch((err) => {
          console.warn(`[diagram-visual] Failed to create visual evidence for "${file.fileName}":`, err?.message ?? err);
        });
      }

      // Index text chunks into Azure AI Search (best-effort)
      if (searchIndexed) {
        indexArbDocumentChunks(reviewId, file.fileId, file.fileName, file.logicalCategory, text).catch((err) => { console.warn(`[search-index] Failed to index "${file.fileName}" (review ${reviewId}):`, err?.message ?? err); });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown extraction error.";
      nextFiles.push({
        ...file,
        extractionStatus: "Failed",
        extractionError: message
      });
      extractionErrors.push(`${file.fileName}: ${message}`);
    }
  }

  const nextFilesWithVisualEvidence = nextFiles.map((file) => ({
    ...file,
    visualEvidenceCount: visualCountsByFile.get(file.fileId) || 0
  }));
  const derived = deriveRequirementsAndEvidence(review, nextFilesWithVisualEvidence, fileTexts);

  // AI-powered requirement extraction and SOW-vs-design validation (best-effort).
  // Cap at 30 s per attempt, 2 attempts max (60 s total) so a slow model
  // cannot stall the entire extraction for 8+ minutes.
  if (getFoundryConfiguration().configured) {
    try {
      const aiResult = await aiEnhanceRequirements(review, nextFilesWithVisualEvidence, fileTexts);
      if (aiResult && aiResult.requirements.length > 0) {
        // Replace keyword-extracted requirements with AI-structured ones + gap items
        derived.requirements = [...aiResult.requirements, ...aiResult.gaps];
      }
    } catch (aiErr) {
      console.warn("[requirements] AI enhancement failed, using keyword extraction:", aiErr?.message ?? aiErr);
    }
  }

  const completedAt = new Date().toISOString();
  const readiness = buildReadinessFromFiles(nextFilesWithVisualEvidence);
  const contentReadiness = assessExtractedContentReadiness({
    files: nextFilesWithVisualEvidence,
    requirements: derived.requirements,
    evidence: derived.evidence,
    visualEvidence
  });
  const missingRecommendedItems = readiness.missingRecommendedItems.filter(
    (item) => !contentReadiness.coveredRecommendedItems.includes(item)
  );
  const recommendedEvidenceCoverage = Math.max(
    readiness.recommendedEvidenceCoverage,
    contentReadiness.recommendedCoverage
  );
  const hasEnoughExtractedEvidence = readiness.requiredEvidencePresent || contentReadiness.sufficient;
  const evidenceReadinessState =
    derived.requirements.length > 0 && hasEnoughExtractedEvidence
      ? readiness.requiredEvidencePresent && missingRecommendedItems.length === 0
        ? "Ready for Review"
        : "Ready with Gaps"
      : "Insufficient Evidence";
  const readinessNotes =
    contentReadiness.sufficient && !readiness.requiredEvidencePresent
      ? "A standalone SOW is not uploaded, but the extracted architecture pack contains enough design, visual, security, cost, HA/DR, and operations evidence to start review with gaps."
      : readiness.readinessNotes;
  const extractionState = extractionErrors.length > 0 || visualExtractionErrors.length > 0 ? "Completed with Issues" : "Completed";
  const extractionConfidencePercent = calculateExtractionConfidencePercent({
    files: nextFilesWithVisualEvidence,
    requirements: derived.requirements,
    evidence: derived.evidence,
    readiness,
    extractionErrors: [...extractionErrors, ...visualExtractionErrors]
  });
  const findingsEntity = await getEntity(client, reviewId, getRowKey(FINDINGS_ROW_KEY, principal.userId));
  const actionsEntity = await getEntity(client, reviewId, getRowKey(ACTIONS_ROW_KEY, principal.userId));
  const exportsEntity = await getEntity(client, reviewId, getRowKey(EXPORTS_ROW_KEY, principal.userId));
  const findings = fromFindingsEntity(findingsEntity, reviewId);
  const actions = fromActionsEntity(actionsEntity);
  const nextReview = {
    ...review,
    workflowState: "Review In Progress",
    evidenceReadinessState,
    requiredEvidencePresent: readiness.requiredEvidencePresent,
    recommendedEvidenceCoverage,
    missingRequiredItems: readiness.missingRequiredItems,
    missingRecommendedItems,
    readinessOutcome: evidenceReadinessState,
    readinessNotes,
    documentCount: nextFilesWithVisualEvidence.length,
    lastUpdated: completedAt
  };
  const scorecard = buildDerivedScorecard(nextReview, findings, null);
  const extraction = {
    reviewId,
    jobId,
    state: extractionState,
    extractionConfidencePercent,
    completedSteps: [
      "files-registered",
      "blob-read",
      "text-extraction",
      "table-extraction",
      "requirements-normalized",
      "evidence-normalized",
      ...(visualEvidence.length > 0 ? ["visual-evidence-extracted"] : []),
      ...(searchIndexed ? ["search-indexed"] : [])
    ],
    failedSteps: [
      ...(extractionErrors.length > 0 ? ["text-extraction"] : []),
      ...(visualExtractionErrors.length > 0 ? ["visual-extraction"] : [])
    ],
    textExtractionStatus: extractionErrors.length > 0 ? "CompletedWithIssues" : "Completed",
    tableExtractionStatus: "CompletedOrNotApplicable",
    figureExtractionStatus: visualExtractionErrors.length > 0 ? "CompletedWithIssues" : "Completed",
    visualAnalysisStatus: visualExtractionErrors.length > 0 ? "CompletedWithIssues" : "Completed",
    visualEvidenceCount: visualEvidence.length,
    visualExtractionErrors,
    evidenceReadinessState,
    missingRequiredItems: readiness.missingRequiredItems,
    missingRecommendedItems,
    readinessNotes,
    extractionErrors,
    lastStartedAt: startedAt,
    lastCompletedAt: completedAt,
    fileStatuses: nextFilesWithVisualEvidence.map((file) => ({
      fileId: file.fileId,
      fileName: file.fileName,
      extractionStatus: file.extractionStatus,
      extractionError: file.extractionError,
      visualEvidenceCount: file.visualEvidenceCount || 0
    }))
  };

  await client.upsertEntity(toFilesEntity(reviewId, principal.userId, nextFilesWithVisualEvidence), "Replace");
  await client.upsertEntity(toRequirementsEntity(reviewId, principal.userId, derived.requirements), "Replace");
  await client.upsertEntity(toEvidenceEntity(reviewId, principal.userId, derived.evidence, visualEvidence), "Replace");
  await client.upsertEntity(toExtractionEntity(reviewId, principal.userId, extraction), "Replace");
  await client.upsertEntity(
    {
      ...toScorecardEntity(reviewId, principal.userId, scorecard),
      evidenceReadinessState: scorecard.evidenceReadinessState,
      reviewerOverrideJson: JSON.stringify(scorecard.reviewerOverride)
    },
    "Replace"
  );
  await client.upsertEntity(
    {
      partitionKey: getPartitionKey(reviewId),
      rowKey: getRowKey(SUMMARY_ROW_KEY, principal.userId),
      workflowState: "Review In Progress",
      evidenceReadinessState,
      requiredEvidencePresent: readiness.requiredEvidencePresent,
      recommendedEvidenceCoverage,
      readinessOutcome: evidenceReadinessState,
      readinessNotes,
      missingRequiredItemsJson: JSON.stringify(readiness.missingRequiredItems),
      missingRecommendedItemsJson: JSON.stringify(missingRecommendedItems),
      documentCount: nextFilesWithVisualEvidence.length,
      lastUpdated: completedAt
    },
    "Merge"
  );

  const evidenceForOutputs = [
    ...derived.evidence,
    ...visualEvidence.map((v) => ({
      evidenceId: v.visualEvidenceId,
      reviewId: v.reviewId,
      sourceFileId: v.sourceFileId,
      sourceFileName: v.sourceFileName,
      factType: v.factType,
      summary: v.summary,
      sourceExcerpt: v.sourceExcerpt,
      confidence: v.confidence
    }))
  ];

  // Output generation is best-effort. Cap at 90 s so a slow Copilot or
  // Blob write cannot stall extraction indefinitely.
  const SYNC_TIMEOUT_MS_LEGACY = 90_000;
  let syncedOutputs;
  try {
    syncedOutputs = await Promise.race([
      syncArbReviewedOutputs({
        principal,
        review: nextReview,
        files: nextFilesWithVisualEvidence,
        requirements: derived.requirements,
        evidence: evidenceForOutputs,
        findings,
        scorecard,
        actions,
        formats: ["markdown", "csv", "html"],
        generatedAt: completedAt,
        existingExports: fromExportsEntity(exportsEntity)
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('syncArbReviewedOutputs timed out after 90s')), SYNC_TIMEOUT_MS_LEGACY)
      )
    ]);
  } catch (syncErr) {
    console.warn('[startArbExtraction] syncArbReviewedOutputs failed/timed-out — skipping export writes:', syncErr?.message ?? syncErr);
    syncedOutputs = { exportsList: fromExportsEntity(exportsEntity) };
  }

  await client.upsertEntity(
    toExportsEntity(reviewId, principal.userId, syncedOutputs.exportsList),
    "Replace"
  );

  return extraction;
}

// ── Durable extraction helpers ────────────────────────────────────────────────
// Used by the durable fan-out activity (extractSingleFile). The legacy
// startArbExtraction path is unchanged; these functions share none of its
// mutable outer state.

/**
 * Extracts content for a single file and returns self-contained, serializable results.
 * Each call is completely independent — safe to run in parallel Durable activities.
 */
async function extractSingleFileContent(file, {
  reviewId,
  principal,
  inputContainer,
  outputContainer,
  visionAvailable,
  searchIndexed = false
}) {
  const localVisualRecords = [];
  const localVisualExtractionErrors = [];
  const localExtractionErrors = [];
  let fileResult = null;
  let extractedText = null;

  // File-scoped ID prefix avoids blob-path collisions when multiple activities run in parallel
  const shortFileId = (file.fileId || "").replace(/[^a-zA-Z0-9]/g, "").slice(-8) || "unknown";

  async function addVisualEvidenceRecord(artifact, localIndexOverride = null) {
    try {
      const idx = localIndexOverride ?? localVisualRecords.length;
      const visualEvidenceIdOverride = `${reviewId}-${shortFileId}-v${String(idx + 1).padStart(3, "0")}`;
      const record = await persistAndAnalyzeVisualArtifact({
        principal,
        reviewId,
        visualIndex: idx,
        visualEvidenceIdOverride,
        sourceFile: file,
        artifact,
        outputContainer,
        canUseMultimodal: visionAvailable
      });
      localVisualRecords.push(record);
      if (record.analysisError) {
        localVisualExtractionErrors.push(`${file.fileName}: visual analysis warning for ${record.visualEvidenceId}: ${record.analysisError}`);
      }
      if (record.promptInjectionRisk && record.promptInjectionRisk !== "NoneDetected") {
        localVisualExtractionErrors.push(`${file.fileName}: possible prompt-injection text detected in ${record.visualEvidenceId}; treated as untrusted evidence.`);
      }
      return record;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      localVisualExtractionErrors.push(`${file.fileName}: visual evidence extraction failed: ${message}`);
      return null;
    }
  }

  async function addVisualEvidenceRecords(artifacts, concurrency = 1) {
    if (!Array.isArray(artifacts) || artifacts.length === 0) return [];
    const records = [];
    for (let i = 0; i < artifacts.length; i += concurrency) {
      const chunk = artifacts.slice(i, i + concurrency);
      const chunkRecords = await Promise.all(
        chunk.map((artifact, ci) => addVisualEvidenceRecord(artifact, localVisualRecords.length + i + ci))
      );
      records.push(...chunkRecords.filter(Boolean));
    }
    return records;
  }

  async function processOfficeVisualEvidence(buffer) {
    const extension = getFileExtension(file.fileName);
    if (![".docx", ".pptx", ".xlsx"].includes(extension)) return;
    const { artifacts, warnings } = await extractOfficeMediaArtifacts(buffer, file.fileName);
    for (const warning of warnings) localVisualExtractionErrors.push(warning);
    await addVisualEvidenceRecords(artifacts, 6);
    const shouldRunFallback = artifacts.length === 0 || extension === ".pptx";
    if (shouldRunFallback) {
      const rendered = await renderOfficeVisualArtifacts(buffer, file.fileName);
      for (const warning of rendered.warnings) localVisualExtractionErrors.push(warning);
      await addVisualEvidenceRecords(rendered.artifacts, 6);
      if (rendered.artifacts.length > 0) {
        const extra = await renderDocumentRemainingPages(buffer, file.fileName, rendered.artifacts.length);
        for (const warning of extra.warnings) localVisualExtractionErrors.push(warning);
        if (extra.artifacts.length > 0) await addVisualEvidenceRecords(extra.artifacts, 6);
        return;
      }
      const fallback = await extractOfficeRenderFallbackEvidence(buffer, file.fileName);
      for (const warning of fallback.warnings) localVisualExtractionErrors.push(warning);
      await addVisualEvidenceRecords(fallback.artifacts, 6);
    }
  }

  async function processPdfVisualEvidence(layout, buffer, prerendered = null) {
    const figures = Array.isArray(layout?.figures) ? layout.figures : [];
    const figureArtifacts = [];
    for (const figure of figures) {
      if (!figure.buffer) {
        localVisualExtractionErrors.push(`${file.fileName}: Document Intelligence could not retrieve figure ${figure.figureId || "unknown"}.`);
        continue;
      }
      figureArtifacts.push({
        sourceName: `${file.fileName}-${figure.figureId || "figure"}.png`,
        buffer: figure.buffer,
        extension: ".png",
        contentType: figure.contentType || "image/png",
        sourcePage: figure.sourcePage ?? figure.pageNumber ?? null,
        figureId: figure.figureId ?? null,
        sourceExcerpt: `Visual analysis of embedded architecture figure ${figure.figureId || ""} in ${file.fileName}.`.trim(),
        extractionSource: "Document Intelligence figures + multimodal analysis"
      });
    }
    const persistedFigureRecords = await addVisualEvidenceRecords(figureArtifacts);
    if (persistedFigureRecords.length > 0) return;
    const rendered = prerendered || await renderOfficeVisualArtifacts(buffer, file.fileName);
    for (const warning of rendered.warnings) localVisualExtractionErrors.push(warning);
    if (rendered.artifacts.length > 0) {
      await addVisualEvidenceRecords(rendered.artifacts);
      const extra = await renderDocumentRemainingPages(buffer, file.fileName, rendered.artifacts.length);
      for (const warning of extra.warnings) localVisualExtractionErrors.push(warning);
      if (extra.artifacts.length > 0) await addVisualEvidenceRecords(extra.artifacts);
      return;
    }
    const pages = Array.isArray(layout?.result?.pages) ? layout.result.pages : [];
    const fallbackPages = pages
      .filter((page) => {
        const pageText = Array.isArray(page.lines) ? page.lines.map((l) => l.content).join(" ") : "";
        const wordCount = pageText.split(/\s+/).filter(Boolean).length;
        return (wordCount < 150 && PDF_FALLBACK_KEYWORDS.test(pageText)) || wordCount < 15;
      })
      .slice(0, 12);
    await addVisualEvidenceRecords(fallbackPages.map((page) => {
      const pageText = Array.isArray(page.lines)
        ? page.lines.map((line) => line.content).filter(Boolean).join("\n")
        : "";
      return {
        sourceName: `${file.fileName}-page-${page.pageNumber}.txt`,
        sourcePage: page.pageNumber ?? null,
        summaryText: pageText
          ? `PDF page ${page.pageNumber} was treated as visual evidence fallback. Extracted page labels:\n${pageText.slice(0, 4000)}`
          : `PDF page ${page.pageNumber} was treated as visual evidence fallback because no cropped figures were returned by Document Intelligence.`,
        sourceExcerpt: `Visual analysis fallback for full-page architecture content on page ${page.pageNumber}.`,
        extractionSource: "PDF page render fallback + extracted page evidence"
      };
    }));
  }

  function withFileTimeout(fn, timeoutMs = 120000) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`File extraction timed out after ${timeoutMs / 1000}s`)), timeoutMs);
    });
    return Promise.race([fn(), timeout]).finally(() => clearTimeout(timer));
  }

  // ── Per-file extraction (mirrors startArbExtraction loop body) ─────────────
  const isSpreadsheet = supportsSpreadsheetExtraction(file.fileName);
  const isDiagram = supportsDiagramExtraction(file.fileName);
  const isImage = supportsImageExtraction(file.fileName);

  if (isSpreadsheet) {
    let diSpreadsheetFallback = false;
    try {
      await withFileTimeout(async () => {
        const buffer = await readBinaryBlob(inputContainer, file.blobPath);
        if (!buffer || buffer.length === 0) {
          fileResult = { ...file, extractionStatus: "Failed", extractionError: "Spreadsheet file could not be read from storage." };
          localExtractionErrors.push(`${file.fileName}: empty blob.`);
          return;
        }
        await processOfficeVisualEvidence(buffer);
        const text = await extractSpreadsheetText(buffer);
        if (!text || !text.trim()) {
          fileResult = { ...file, extractionStatus: "Failed", extractionError: "No data rows could be extracted from the spreadsheet." };
          localExtractionErrors.push(`${file.fileName}: no data rows found.`);
        } else {
          extractedText = text;
          fileResult = { ...file, extractionStatus: "Completed", extractionError: null };
          if (searchIndexed) {
            indexArbDocumentChunks(reviewId, file.fileId, file.fileName, file.logicalCategory, text).catch((err) => { console.warn(`[search-index] Failed to index "${file.fileName}":`, err?.message ?? err); });
          }
        }
      }, 720000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown spreadsheet extraction error.";
      const diCfg = getDocumentIntelligenceConfiguration();
      if (!diCfg.configured) {
        fileResult = { ...file, extractionStatus: "Failed", extractionError: message };
        localExtractionErrors.push(`${file.fileName}: ${message}`);
      } else {
        // ExcelJS failed but DI is available — fall through to DI extraction below.
        localExtractionErrors.push(`${file.fileName}: ExcelJS parse error (${message}) — retrying with Document Intelligence.`);
        diSpreadsheetFallback = true;
      }
    }
    // Only continue to DI fallback when ExcelJS crashed and DI is configured.
    // For all other spreadsheet outcomes (success, empty, no-DI-fail), return early.
    if (!diSpreadsheetFallback) {
      // fileResult was set inside the try/catch above — return it.
    } else {
      // Fall through: ExcelJS crashed and DI is configured — try DI first, then jszip xlsx fallback.
      try {
        await withFileTimeout(async () => {
          const buffer = await readBinaryBlob(inputContainer, file.blobPath);
          if (!buffer || buffer.length === 0) {
            fileResult = { ...file, extractionStatus: "Failed", extractionError: "Spreadsheet file could not be read from storage (DI fallback)." };
            localExtractionErrors.push(`${file.fileName}: empty blob (DI fallback).`);
            return;
          }
          let text = null;
          // Attempt 1: Document Intelligence
          try {
            text = await extractDocumentText(buffer, file.contentType, file.fileName);
          } catch (diErr) {
            const diMsg = diErr instanceof Error ? diErr.message : String(diErr);
            localExtractionErrors.push(`${file.fileName}: DI fallback failed (${diMsg}) — trying jszip xlsx extraction.`);
          }
          // Attempt 2: jszip xlsx XML extraction (zero-config, no external service).
          // Reads xl/sharedStrings.xml and xl/worksheets/sheet*.xml from the Office Open XML ZIP package.
          if (!text || !text.trim()) {
            try {
              const JSZip = require('jszip');
              const zip = await JSZip.loadAsync(buffer);
              // Extract shared strings table (maps string indices to values)
              const sharedStrings = [];
              const ssEntry = zip.file('xl/sharedStrings.xml');
              if (ssEntry) {
                const ssXml = await ssEntry.async('string');
                const re = /<t[^>]*>([^<]*)<\/t>/g;
                let m;
                while ((m = re.exec(ssXml)) !== null) sharedStrings.push(m[1]);
              }
              // Extract cell values from all worksheets
              const rows = [];
              const sheetFiles = Object.keys(zip.files).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/i.test(n)).sort();
              for (const sheetName of sheetFiles) {
                const sheetXml = await zip.files[sheetName].async('string');
                const cellRe = /<c\b[^>]*>.*?<\/c>/gs;
                const tRe = /\bt="s"\b/;
                const vRe = /<v>([^<]*)<\/v>/;
                let cm;
                const rowValues = [];
                while ((cm = cellRe.exec(sheetXml)) !== null) {
                  const cell = cm[0];
                  const vm = vRe.exec(cell);
                  if (!vm) continue;
                  if (tRe.test(cell)) {
                    // Shared string reference
                    const idx = parseInt(vm[1], 10);
                    rowValues.push(isNaN(idx) ? vm[1] : (sharedStrings[idx] ?? vm[1]));
                  } else {
                    rowValues.push(vm[1]);
                  }
                }
                if (rowValues.length > 0) rows.push(rowValues.join(', '));
              }
              const extracted = rows.join('\n').trim();
              if (extracted) {
                text = extracted;
              }
            } catch (zipErr) {
              localExtractionErrors.push(`${file.fileName}: jszip xlsx fallback failed: ${zipErr?.message ?? zipErr}`);
            }
          }
          if (!text || !text.trim()) {
            fileResult = { ...file, extractionStatus: "Failed", extractionError: "All extraction methods failed for this spreadsheet (ExcelJS crash, DI rejected, jszip fallback empty)." };
            localExtractionErrors.push(`${file.fileName}: all fallbacks exhausted.`);
          } else {
            extractedText = text;
            fileResult = { ...file, extractionStatus: "Completed", extractionError: null };
            if (searchIndexed) {
              indexArbDocumentChunks(reviewId, file.fileId, file.fileName, file.logicalCategory, text).catch((err) => { console.warn(`[search-index] Failed to index "${file.fileName}":`, err?.message ?? err); });
            }
          }
        }, 720000);
      } catch (diError) {
        const diMsg = diError instanceof Error ? diError.message : "Unknown DI error.";
        fileResult = { ...file, extractionStatus: "Failed", extractionError: diMsg };
        localExtractionErrors.push(`${file.fileName}: DI/xlsx fallback failed: ${diMsg}`);
      }
    }
  } else if (isDiagram) {
    try {
      await withFileTimeout(async () => {
        const buffer = await readBinaryBlob(inputContainer, file.blobPath);
        if (!buffer || buffer.length === 0) {
          fileResult = { ...file, extractionStatus: "Failed", extractionError: "Diagram file could not be read from storage." };
          localExtractionErrors.push(`${file.fileName}: empty blob.`);
          return;
        }
        const text = await extractDiagramText(buffer, file.fileName);
        if (!text || !text.trim()) {
          fileResult = { ...file, extractionStatus: "Failed", extractionError: "No readable labels or diagram metadata could be extracted." };
          localExtractionErrors.push(`${file.fileName}: no readable diagram labels found.`);
        } else {
          await addVisualEvidenceRecord({
            sourceName: file.fileName,
            summaryText: text,
            sourceExcerpt: `Readable diagram labels and metadata extracted from ${file.fileName}.`,
            extractionSource: "Native diagram file extraction + visual evidence normalization"
          });
          extractedText = text;
          fileResult = { ...file, extractionStatus: "Completed", extractionError: null };
          if (searchIndexed) {
            indexArbDocumentChunks(reviewId, file.fileId, file.fileName, file.logicalCategory, text).catch((err) => { console.warn(`[search-index] Failed to index "${file.fileName}":`, err?.message ?? err); });
          }
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown diagram extraction error.";
      fileResult = { ...file, extractionStatus: "Failed", extractionError: message };
      localExtractionErrors.push(`${file.fileName}: ${message}`);
    }
  } else if (isImage) {
    try {
      const buffer = await readBinaryBlob(inputContainer, file.blobPath);
      if (!buffer || buffer.length === 0) {
        fileResult = { ...file, extractionStatus: "Failed", extractionError: "Image file could not be read from storage." };
        localExtractionErrors.push(`${file.fileName}: empty blob.`);
      } else {
        const visualRecord = await addVisualEvidenceRecord({
          sourceName: file.fileName,
          buffer,
          extension: getFileExtension(file.fileName),
          contentType: file.contentType,
          summaryText: visionAvailable
            ? ""
            : "Standalone image uploaded as visual architecture evidence. Multimodal analysis is unavailable because FOUNDRY_PROJECT_ENDPOINT is not configured.",
          sourceExcerpt: `Visual analysis of standalone uploaded image ${file.fileName}.`,
          extractionSource: "Standalone image upload + multimodal analysis"
        });
        const description = visualRecord?.summary || "";
        if (!description || !description.trim()) {
          fileResult = { ...file, extractionStatus: "Failed", extractionError: "Vision model returned no description for the image." };
          localExtractionErrors.push(`${file.fileName}: vision returned empty response.`);
        } else {
          extractedText = `[Architecture diagram: ${file.fileName}]\n\n${description}`;
          fileResult = { ...file, extractionStatus: "Completed", extractionError: null };
          if (searchIndexed) {
            indexArbDocumentChunks(reviewId, file.fileId, file.fileName, file.logicalCategory, extractedText).catch((err) => { console.warn(`[search-index] Failed to index "${file.fileName}":`, err?.message ?? err); });
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown image analysis error.";
      fileResult = { ...file, extractionStatus: "Failed", extractionError: message };
      localExtractionErrors.push(`${file.fileName}: ${message}`);
    }
  } else if (supportsDocumentIntelligenceExtraction(file.fileName)) {
    const diConfig = getDocumentIntelligenceConfiguration();
    const visionConfig = getVisionServiceConfiguration();
    const canUseVisionFallback = visionConfig.configured && supportsVisionExtraction(file.fileName);
    const isPdf = getFileExtension(file.fileName) === ".pdf";
    const isDocx = getFileExtension(file.fileName) === ".docx";
    // PDFs always proceed — pdf-parse is a zero-config fallback.
    // DOCX always proceeds — jszip XML extraction is a zero-config fallback.
    // Other non-PDF DI formats still need at least one configured service.
    if (!isPdf && !isDocx && !diConfig.configured && !canUseVisionFallback) {
      fileResult = {
        ...file,
        extractionStatus: "Limited Evidence",
        extractionError: "Azure AI Document Intelligence is not configured. Text extraction is unavailable for this file format."
      };
    } else {
      try {
        await withFileTimeout(async () => {
          const buffer = await readBinaryBlob(inputContainer, file.blobPath);
          if (!buffer || buffer.length === 0) {
            fileResult = { ...file, extractionStatus: "Failed", extractionError: "Document file could not be read from storage." };
            localExtractionErrors.push(`${file.fileName}: empty blob.`);
            return;
          }
          let text = null;
          let extractionSource = "Document Intelligence";
          await processOfficeVisualEvidence(buffer);
          if (isPdf) {
            const renderResult = await renderOfficeVisualArtifacts(buffer, file.fileName);
            for (const warning of renderResult.warnings) localVisualExtractionErrors.push(warning);
            const prerendered = renderResult;
            if (diConfig.configured) {
              let layout = null;
              try {
                layout = await extractDocumentLayout(buffer, file.contentType, file.fileName, { includeFigures: true });
                text = layout.text;
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                localVisualExtractionErrors.push(`${file.fileName}: PDF figure extraction failed: ${message}`);
                try { text = await extractDocumentText(buffer, file.contentType, file.fileName); } catch { /* falls through */ }
              }
              await processPdfVisualEvidence(layout, buffer, prerendered);
            } else {
              if (prerendered.artifacts.length > 0) {
                await addVisualEvidenceRecords(prerendered.artifacts);
              } else {
                const pdfFallback = await extractPdfDiagramPageEvidence(buffer, file.fileName);
                for (const warning of pdfFallback.warnings) localVisualExtractionErrors.push(warning);
                if (pdfFallback.artifacts.length > 0) await addVisualEvidenceRecords(pdfFallback.artifacts);
              }
            }
          } else if (diConfig.configured) {
            try {
              text = await extractDocumentText(buffer, file.contentType, file.fileName);
            } catch (diErr) {
              const diMsg = diErr instanceof Error ? diErr.message : String(diErr);
              localExtractionErrors.push(`${file.fileName}: Document Intelligence failed (${diMsg}) — trying fallback.`);
              // text remains null; jszip fallback runs below for .docx
            }
          }
          if ((!text || !text.trim()) && canUseVisionFallback) {
            text = await extractTextWithVision(buffer, file.contentType, file.fileName);
            extractionSource = "Azure Vision Service (OCR fallback)";
          }
          // jszip text fallback for .docx — zero-config, no external service required.
          // Reads word/document.xml directly from the Office Open XML ZIP package.
          // Handles cases where DI is not configured, quota-exhausted, or returning no text.
          if ((!text || !text.trim()) && isDocx) {
            try {
              const JSZip = require('jszip');
              const zip = await JSZip.loadAsync(buffer);
              const docXmlEntry = zip.file('word/document.xml');
              if (docXmlEntry) {
                const xml = await docXmlEntry.async('string');
                const textNodes = [];
                const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
                let m;
                while ((m = re.exec(xml)) !== null) if (m[1]) textNodes.push(m[1]);
                const extracted = textNodes.join(' ').replace(/\s+/g, ' ').trim();
                if (extracted) {
                  text = extracted;
                  extractionSource = 'docx ZIP text extraction (jszip fallback)';
                }
              }
            } catch (zipErr) {
              localExtractionErrors.push(`${file.fileName}: jszip fallback failed: ${zipErr?.message ?? zipErr}`);
            }
          }
          if (!text || !text.trim()) {
            try {
              const pdfParse = require("pdf-parse");
              const parsed = await pdfParse(buffer);
              if (parsed.text && parsed.text.trim()) {
                text = parsed.text;
                extractionSource = "pdf-parse (native text layer)";
              }
            } catch { /* best-effort */ }
          }
          if (!text || !text.trim()) {
            fileResult = {
              ...file,
              extractionStatus: "Failed",
              extractionError: diConfig.configured
                ? "Azure AI Document Intelligence returned no text. The document may be a scanned image."
                : "No text could be extracted. Document Intelligence is not configured and the PDF has no selectable text layer."
            };
            localExtractionErrors.push(`${file.fileName}: ${extractionSource} returned no text.`);
            return;
          }
          extractedText = text;
          fileResult = { ...file, extractionStatus: "Completed", extractionError: null };
          if (searchIndexed) {
            indexArbDocumentChunks(reviewId, file.fileId, file.fileName, file.logicalCategory, text).catch((err) => { console.warn(`[search-index] Failed to index "${file.fileName}":`, err?.message ?? err); });
          }
        }, 720000);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown Document Intelligence error.";
        fileResult = { ...file, extractionStatus: "Failed", extractionError: message };
        localExtractionErrors.push(`${file.fileName}: ${message}`);
      }
    }
  } else if (file.logicalCategory === "evidence_package") {
    fileResult = { ...file, extractionStatus: file.extractionStatus || "Expanded", extractionError: file.extractionError || null };
  } else if (!file.supportedTextExtraction) {
    fileResult = {
      ...file,
      extractionStatus: "Limited Evidence",
      extractionError: file.extractionError || "File is stored successfully but needs a richer text extraction worker for this format."
    };
  } else {
    try {
      await withFileTimeout(async () => {
        const text = await readTextBlob(inputContainer, file.blobPath);
        if (!text || !text.trim()) {
          fileResult = { ...file, extractionStatus: "Failed", extractionError: "No readable text could be extracted from the uploaded file." };
          localExtractionErrors.push(`${file.fileName}: no readable text could be extracted.`);
        } else {
          extractedText = text;
          fileResult = { ...file, extractionStatus: "Completed", extractionError: null };
          if (DIAGRAM_TEXT_EXTENSIONS.has(getFileExtension(file.fileName))) {
            const ext = getFileExtension(file.fileName);
            const diagramType =
              ext === ".mmd" || ext === ".mermaid" ? "Mermaid" :
              ext === ".puml" || ext === ".plantuml" ? "PlantUML" :
              ext === ".excalidraw" ? "Excalidraw" : "Diagram";
            addVisualEvidenceRecord({
              sourceName: file.fileName,
              summaryText: `[${diagramType} architecture diagram: ${file.fileName}]\n\nDiagram specification — describes architecture topology, components, and data flows:\n${text.slice(0, 5000)}`,
              sourceExcerpt: `${diagramType} diagram specification extracted from ${file.fileName}.`,
              extractionSource: `${diagramType} diagram specification analysis`
            }).catch((err) => { console.warn(`[diagram-visual] Failed to create visual evidence for "${file.fileName}":`, err?.message ?? err); });
          }
          if (searchIndexed) {
            indexArbDocumentChunks(reviewId, file.fileId, file.fileName, file.logicalCategory, text).catch((err) => { console.warn(`[search-index] Failed to index "${file.fileName}":`, err?.message ?? err); });
          }
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown extraction error.";
      fileResult = { ...file, extractionStatus: "Failed", extractionError: message };
      localExtractionErrors.push(`${file.fileName}: ${message}`);
    }
  }

  if (!fileResult) {
    fileResult = { ...file, extractionStatus: "Failed", extractionError: "Unknown extraction path — file type not handled." };
    localExtractionErrors.push(`${file.fileName}: unhandled file type.`);
  }

  return {
    fileResult,
    extractedText,
    visualRecords: localVisualRecords,
    visualExtractionErrors: localVisualExtractionErrors,
    extractionErrors: localExtractionErrors
  };
}

/**
 * Aggregates fan-out results and writes all entities to Table Storage.
 * Called by the durable persistExtractionResults activity.
 */
async function persistAggregatedExtractionResults({ reviewId, principal, fileResults, jobId, startedAt }) {
  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const review = await getArbReview(principal, reviewId);

  const nextFiles = fileResults.map((r) => r.fileResult);
  const allVisualRecords = fileResults.flatMap((r) => r.visualRecords || []);
  const allVisualExtractionErrors = fileResults.flatMap((r) => r.visualExtractionErrors || []);
  const allExtractionErrors = fileResults.flatMap((r) => r.extractionErrors || []);

  const fileTexts = new Map(
    fileResults.filter((r) => r.extractedText).map((r) => [r.fileResult.fileId, r.extractedText])
  );

  const visualCountsByFile = new Map();
  for (const vr of allVisualRecords) {
    if (vr && vr.sourceFileId) {
      visualCountsByFile.set(vr.sourceFileId, (visualCountsByFile.get(vr.sourceFileId) || 0) + 1);
    }
  }

  const nextFilesWithVisualEvidence = nextFiles.map((file) => ({
    ...file,
    visualEvidenceCount: visualCountsByFile.get(file.fileId) || 0
  }));

  const derived = deriveRequirementsAndEvidence(review, nextFilesWithVisualEvidence, fileTexts);

  if (getFoundryConfiguration().configured) {
    try {
      const aiResult = await aiEnhanceRequirements(review, nextFilesWithVisualEvidence, fileTexts);
      if (aiResult && aiResult.requirements.length > 0) {
        derived.requirements = [...aiResult.requirements, ...aiResult.gaps];
      }
    } catch (aiErr) {
      console.warn("[requirements] AI enhancement failed, using keyword extraction:", aiErr?.message ?? aiErr);
    }
  }

  const completedAt = new Date().toISOString();
  const readiness = buildReadinessFromFiles(nextFilesWithVisualEvidence);
  const contentReadiness = assessExtractedContentReadiness({
    files: nextFilesWithVisualEvidence,
    requirements: derived.requirements,
    evidence: derived.evidence,
    visualEvidence: allVisualRecords
  });
  const missingRecommendedItems = readiness.missingRecommendedItems.filter(
    (item) => !contentReadiness.coveredRecommendedItems.includes(item)
  );
  const recommendedEvidenceCoverage = Math.max(
    readiness.recommendedEvidenceCoverage,
    contentReadiness.recommendedCoverage
  );
  const hasEnoughExtractedEvidence = readiness.requiredEvidencePresent || contentReadiness.sufficient;
  const evidenceReadinessState =
    derived.requirements.length > 0 && hasEnoughExtractedEvidence
      ? readiness.requiredEvidencePresent && missingRecommendedItems.length === 0
        ? "Ready for Review"
        : "Ready with Gaps"
      : "Insufficient Evidence";
  const readinessNotes =
    contentReadiness.sufficient && !readiness.requiredEvidencePresent
      ? "A standalone SOW is not uploaded, but the extracted architecture pack contains enough design, visual, security, cost, HA/DR, and operations evidence to start review with gaps."
      : readiness.readinessNotes;
  const extractionState =
    allExtractionErrors.length > 0 || allVisualExtractionErrors.length > 0
      ? "Completed with Issues"
      : "Completed";
  const extractionConfidencePercent = calculateExtractionConfidencePercent({
    files: nextFilesWithVisualEvidence,
    requirements: derived.requirements,
    evidence: derived.evidence,
    readiness,
    extractionErrors: [...allExtractionErrors, ...allVisualExtractionErrors]
  });

  const findingsEntity = await getEntity(client, reviewId, getRowKey(FINDINGS_ROW_KEY, principal.userId));
  const actionsEntity = await getEntity(client, reviewId, getRowKey(ACTIONS_ROW_KEY, principal.userId));
  const exportsEntity = await getEntity(client, reviewId, getRowKey(EXPORTS_ROW_KEY, principal.userId));
  const findings = fromFindingsEntity(findingsEntity, reviewId);
  const actions = fromActionsEntity(actionsEntity);

  const nextReview = {
    ...review,
    workflowState: "Review In Progress",
    evidenceReadinessState,
    requiredEvidencePresent: readiness.requiredEvidencePresent,
    recommendedEvidenceCoverage,
    missingRequiredItems: readiness.missingRequiredItems,
    missingRecommendedItems,
    readinessOutcome: evidenceReadinessState,
    readinessNotes,
    documentCount: nextFilesWithVisualEvidence.length,
    lastUpdated: completedAt
  };
  const scorecard = buildDerivedScorecard(nextReview, findings, null);

  const extraction = {
    reviewId,
    jobId: jobId || `${reviewId}-durable-${Date.now()}`,
    state: extractionState,
    extractionConfidencePercent,
    completedSteps: [
      "files-registered",
      "blob-read",
      "text-extraction",
      "table-extraction",
      "requirements-normalized",
      "evidence-normalized",
      ...(allVisualRecords.length > 0 ? ["visual-evidence-extracted"] : [])
    ],
    failedSteps: [
      ...(allExtractionErrors.length > 0 ? ["text-extraction"] : []),
      ...(allVisualExtractionErrors.length > 0 ? ["visual-extraction"] : [])
    ],
    textExtractionStatus: allExtractionErrors.length > 0 ? "CompletedWithIssues" : "Completed",
    tableExtractionStatus: "CompletedOrNotApplicable",
    figureExtractionStatus: allVisualExtractionErrors.length > 0 ? "CompletedWithIssues" : "Completed",
    visualAnalysisStatus: allVisualExtractionErrors.length > 0 ? "CompletedWithIssues" : "Completed",
    visualEvidenceCount: allVisualRecords.length,
    visualExtractionErrors: allVisualExtractionErrors,
    evidenceReadinessState,
    missingRequiredItems: readiness.missingRequiredItems,
    missingRecommendedItems,
    readinessNotes,
    extractionErrors: allExtractionErrors,
    lastStartedAt: startedAt || completedAt,
    lastCompletedAt: completedAt,
    fileStatuses: nextFilesWithVisualEvidence.map((f) => ({
      fileId: f.fileId,
      fileName: f.fileName,
      extractionStatus: f.extractionStatus,
      extractionError: f.extractionError,
      visualEvidenceCount: f.visualEvidenceCount || 0
    }))
  };

  await client.upsertEntity(toFilesEntity(reviewId, principal.userId, nextFilesWithVisualEvidence), "Replace");
  await client.upsertEntity(toRequirementsEntity(reviewId, principal.userId, derived.requirements), "Replace");
  await client.upsertEntity(toEvidenceEntity(reviewId, principal.userId, derived.evidence, allVisualRecords), "Replace");
  await client.upsertEntity(toExtractionEntity(reviewId, principal.userId, extraction), "Replace");
  await client.upsertEntity(
    {
      ...toScorecardEntity(reviewId, principal.userId, scorecard),
      evidenceReadinessState: scorecard.evidenceReadinessState,
      reviewerOverrideJson: JSON.stringify(scorecard.reviewerOverride)
    },
    "Replace"
  );
  await client.upsertEntity(
    {
      partitionKey: getPartitionKey(reviewId),
      rowKey: getRowKey(SUMMARY_ROW_KEY, principal.userId),
      workflowState: "Review In Progress",
      evidenceReadinessState,
      requiredEvidencePresent: readiness.requiredEvidencePresent,
      recommendedEvidenceCoverage,
      readinessOutcome: evidenceReadinessState,
      readinessNotes,
      missingRequiredItemsJson: JSON.stringify(readiness.missingRequiredItems),
      missingRecommendedItemsJson: JSON.stringify(missingRecommendedItems),
      documentCount: nextFilesWithVisualEvidence.length,
      lastUpdated: completedAt
    },
    "Merge"
  );

  const evidenceForOutputs = [
    ...derived.evidence,
    ...allVisualRecords.map((v) => ({
      evidenceId: v.visualEvidenceId,
      reviewId: v.reviewId,
      sourceFileId: v.sourceFileId,
      sourceFileName: v.sourceFileName,
      factType: v.factType,
      summary: v.summary,
      sourceExcerpt: v.sourceExcerpt,
      confidence: v.confidence
    }))
  ];

  // Output generation (markdown/csv/html + AI summary) is best-effort.
  // Cap at 90 s so a slow Copilot or Blob write cannot stall extraction.
  const SYNC_TIMEOUT_MS = 90_000;
  const syncTimeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('syncArbReviewedOutputs timed out after 90s')), SYNC_TIMEOUT_MS)
  );
  let syncedOutputs;
  try {
    syncedOutputs = await Promise.race([
      syncArbReviewedOutputs({
        principal,
        review: nextReview,
        files: nextFilesWithVisualEvidence,
        requirements: derived.requirements,
        evidence: evidenceForOutputs,
        findings,
        scorecard,
        actions,
        formats: ["markdown", "csv", "html"],
        generatedAt: completedAt,
        existingExports: fromExportsEntity(exportsEntity)
      }),
      syncTimeoutPromise
    ]);
  } catch (syncErr) {
    console.warn('[persist] syncArbReviewedOutputs failed/timed-out — skipping export writes:', syncErr?.message ?? syncErr);
    syncedOutputs = { exportsList: fromExportsEntity(exportsEntity) };
  }

  await client.upsertEntity(
    toExportsEntity(reviewId, principal.userId, syncedOutputs.exportsList),
    "Replace"
  );

  return extraction;
}

async function markArbExtractionQueued(principal, reviewId) {
  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const review = await getArbReview(principal, reviewId);
  const files = await getArbFiles(principal, reviewId);

  if (files.length === 0) {
    throw createHttpError(400, "Upload files before starting extraction.");
  }

  const jobId = `${reviewId}-extract-${Date.now()}`;
  const extraction = buildTransientExtractionStatus(review, "Queued", {
    jobId,
    readinessNotes: "Extraction has been queued. Large PDFs and visual evidence processing continue in the background.",
    fileStatuses: files.map((file) => ({
      fileId: file.fileId,
      fileName: file.fileName,
      extractionStatus: file.extractionStatus || "Pending",
      extractionError: file.extractionError || null,
      visualEvidenceCount: file.visualEvidenceCount || 0
    }))
  });

  await client.upsertEntity(toExtractionEntity(reviewId, principal.userId, extraction), "Replace");
  await client.upsertEntity(
    {
      partitionKey: getPartitionKey(reviewId),
      rowKey: getRowKey(SUMMARY_ROW_KEY, principal.userId),
      workflowState: "Extraction Queued",
      lastUpdated: new Date().toISOString()
    },
    "Merge"
  );

  return extraction;
}

async function markArbExtractionRunning(principal, reviewId) {
  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const review = await getArbReview(principal, reviewId);
  const files = await getArbFiles(principal, reviewId);
  const extraction = buildTransientExtractionStatus(review, "Running", {
    readinessNotes: "Extraction is running. The system is reading text, tables, diagrams, and visual evidence.",
    fileStatuses: files.map((file) => ({
      fileId: file.fileId,
      fileName: file.fileName,
      extractionStatus: file.extractionStatus || "Pending",
      extractionError: file.extractionError || null,
      visualEvidenceCount: file.visualEvidenceCount || 0
    }))
  });

  await client.upsertEntity(toExtractionEntity(reviewId, principal.userId, extraction), "Replace");
  await client.upsertEntity(
    {
      partitionKey: getPartitionKey(reviewId),
      rowKey: getRowKey(SUMMARY_ROW_KEY, principal.userId),
      workflowState: "Extraction Running",
      lastUpdated: new Date().toISOString()
    },
    "Merge"
  );

  return extraction;
}

async function markArbExtractionFailed(principal, reviewId, errorMessage) {
  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const review = await getArbReview(principal, reviewId);
  const files = await getArbFiles(principal, reviewId);
  const extraction = buildTransientExtractionStatus(review, "Failed", {
    error: errorMessage || "Extraction worker failed.",
    completedAt: new Date().toISOString(),
    readinessNotes: "Extraction failed before the review package could be normalized.",
    fileStatuses: files.map((file) => ({
      fileId: file.fileId,
      fileName: file.fileName,
      extractionStatus: file.extractionStatus || "Pending",
      extractionError: file.extractionError || null,
      visualEvidenceCount: file.visualEvidenceCount || 0
    }))
  });

  await client.upsertEntity(toExtractionEntity(reviewId, principal.userId, extraction), "Replace");
  await client.upsertEntity(
    {
      partitionKey: getPartitionKey(reviewId),
      rowKey: getRowKey(SUMMARY_ROW_KEY, principal.userId),
      workflowState: "Extraction Failed",
      lastUpdated: new Date().toISOString()
    },
    "Merge"
  );

  return extraction;
}

async function getArbExtractionStatus(principal, reviewId) {
  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const review = await getArbReview(principal, reviewId);
  const extractionEntity = await getEntity(client, reviewId, getRowKey(EXTRACTION_ROW_KEY, principal.userId));
  const status = fromExtractionEntity(extractionEntity, review);

  // Re-evaluate upload-level readiness against the live file list on every read.
  // The extraction snapshot is frozen at extraction-start time — files uploaded after
  // extraction began (or files that stayed Pending from a previous failed run) will not
  // be in the snapshot, producing a false "SOW missing" error even when the file is
  // present. Override missingRequiredItems / readinessNotes from the current file list
  // so "Refresh status" reflects actual uploaded state, not stale extraction metadata.
  // Re-evaluate upload-level readiness against the live file list on every read.
  // The extraction snapshot is frozen at extraction-start time — files uploaded after
  // extraction began (or after extraction completed) will not be reflected in the stored
  // missingRequiredItems, producing false "SOW missing" errors even when the file is
  // present. When a new file is uploaded after extraction, the upload resets the
  // extraction state to "Not Started" — but that Not Started entity is built from the
  // current readiness snapshot, so it already carries the correct missingRequiredItems.
  // The live re-evaluation here covers all remaining edge cases and ensures Refresh
  // always reflects the actual uploaded file set.
  const filesEntity = await getEntity(client, reviewId, getRowKey(FILES_ROW_KEY, principal.userId));
  const currentFiles = fromFilesEntity(filesEntity);
  if (currentFiles.length > 0) {
    const liveReadiness = buildReadinessFromFiles(currentFiles);
    const previousMissingCount = Array.isArray(status.missingRequiredItems)
      ? status.missingRequiredItems.length
      : Infinity;
    status.missingRequiredItems = liveReadiness.missingRequiredItems;
    status.missingRecommendedItems = liveReadiness.missingRecommendedItems;
    // Only replace readinessNotes when required-item coverage improves — preserve
    // contextual messages such as "stale extraction — click Start analysis".
    if (liveReadiness.missingRequiredItems.length < previousMissingCount) {
      status.readinessNotes = liveReadiness.readinessNotes;
    }
  }

  return status;
}

async function getArbRequirements(principal, reviewId) {
  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const summaryEntity = await getOwnedSummaryEntity(client, principal, reviewId);

  if (!summaryEntity) {
    if (reviewId === "demo-review") {
      await seedDemoReview(client, principal, reviewId);
      return getArbRequirements(principal, reviewId);
    }

    throw createHttpError(404, `ARB review ${reviewId} was not found.`);
  }

  const requirementsEntity = await getEntity(
    client,
    reviewId,
    getRowKey(REQUIREMENTS_ROW_KEY, principal.userId)
  );
  return fromRequirementsEntity(requirementsEntity);
}

async function getArbEvidence(principal, reviewId) {
  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const summaryEntity = await getOwnedSummaryEntity(client, principal, reviewId);

  if (!summaryEntity) {
    if (reviewId === "demo-review") {
      await seedDemoReview(client, principal, reviewId);
      return getArbEvidence(principal, reviewId);
    }

    throw createHttpError(404, `ARB review ${reviewId} was not found.`);
  }

  const evidenceEntity = await getEntity(client, reviewId, getRowKey(EVIDENCE_ROW_KEY, principal.userId));
  return fromEvidenceEntity(evidenceEntity);
}

async function getArbVisualEvidence(principal, reviewId) {
  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const summaryEntity = await getOwnedSummaryEntity(client, principal, reviewId);

  if (!summaryEntity) {
    if (reviewId === "demo-review") {
      await seedDemoReview(client, principal, reviewId);
      return getArbVisualEvidence(principal, reviewId);
    }

    throw createHttpError(404, `ARB review ${reviewId} was not found.`);
  }

  const evidenceEntity = await getEntity(client, reviewId, getRowKey(EVIDENCE_ROW_KEY, principal.userId));
  return fromVisualEvidenceEntity(evidenceEntity);
}

async function listArbExports(principal, reviewId) {
  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const summaryEntity = await getOwnedSummaryEntity(client, principal, reviewId);

  if (!summaryEntity) {
    if (reviewId === "demo-review") {
      await seedDemoReview(client, principal, reviewId);
      return listArbExports(principal, reviewId);
    }

    throw createHttpError(404, `ARB review ${reviewId} was not found.`);
  }

  const exportsEntity = await getEntity(client, reviewId, getRowKey(EXPORTS_ROW_KEY, principal.userId));
  return fromExportsEntity(exportsEntity);
}

async function downloadArbExport(principal, reviewId, exportId) {
  const exportsList = await listArbExports(principal, reviewId);
  const artifact = exportsList.find((candidate) => candidate.exportId === exportId);

  if (!artifact) {
    throw createHttpError(404, `ARB export ${exportId} was not found.`);
  }

  const outputContainer = await getContainerClient(ARB_OUTPUT_CONTAINER_NAME);
  const isBinary = artifact.format === "xlsx" || artifact.format === "docx";
  const body = isBinary
    ? await readBinaryBlob(outputContainer, artifact.blobPath)
    : await readTextBlob(outputContainer, artifact.blobPath);

  if (body == null) {
    throw createHttpError(404, `ARB export ${exportId} is missing from blob storage.`);
  }

  return {
    ...artifact,
    body
  };
}

async function createArbExport(principal, reviewId, input = {}) {
  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const review = await getArbReview(principal, reviewId);
  const files = await getArbFiles(principal, reviewId);
  const requirements = await getArbRequirements(principal, reviewId);
  const evidence = await getArbEvidence(principal, reviewId);
  const visualEvidence = await getArbVisualEvidence(principal, reviewId);
  const findings = await getArbFindings(principal, reviewId);
  const actions = await getArbActions(principal, reviewId);
  const scorecard = await getArbScorecard(principal, reviewId);
  const decision = await getArbDecision(principal, reviewId).catch(() => null);
  const exportsEntity = await getEntity(client, reviewId, getRowKey(EXPORTS_ROW_KEY, principal.userId));
  const exportsList = fromExportsEntity(exportsEntity);
  const format = normalizeExportFormat(input.format);
  const syncedOutputs = await syncArbReviewedOutputs({
    principal,
    review: {
      ...review,
      documentCount: files.length
    },
    files,
    requirements,
    evidence: [
      ...evidence,
      ...visualEvidence.map((v) => ({
        evidenceId: v.visualEvidenceId,
        reviewId: v.reviewId,
        sourceFileId: v.sourceFileId,
        sourceFileName: v.sourceFileName,
        factType: v.factType,
        summary: v.summary,
        sourceExcerpt: v.sourceExcerpt,
        confidence: v.confidence
      }))
    ],
    findings,
    scorecard,
    actions,
    decision,
    formats: [format],
    generatedAt: new Date().toISOString(),
    existingExports: exportsList
  });

  await client.upsertEntity(toExportsEntity(reviewId, principal.userId, syncedOutputs.exportsList), "Replace");
  return syncedOutputs.artifacts[0];
}

async function getArbReview(principal, reviewId) {
  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  let summaryEntity = await getOwnedSummaryEntity(client, principal, reviewId);

  if (!summaryEntity && reviewId === "demo-review") {
    await seedDemoReview(client, principal, reviewId);
    summaryEntity = await getOwnedSummaryEntity(client, principal, reviewId);
  }

  if (!summaryEntity) {
    throw createHttpError(404, `ARB review ${reviewId} was not found.`);
  }

  return fromSummaryEntity(summaryEntity);
}

async function getArbFindings(principal, reviewId) {
  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const summaryEntity = await getOwnedSummaryEntity(client, principal, reviewId);

  if (!summaryEntity) {
    if (reviewId === "demo-review") {
      await seedDemoReview(client, principal, reviewId);
      return getArbFindings(principal, reviewId);
    }

    throw createHttpError(404, `ARB review ${reviewId} was not found.`);
  }

  const findingsEntity = await getEntity(client, reviewId, getRowKey(FINDINGS_ROW_KEY, principal.userId));
  return fromFindingsEntity(findingsEntity, reviewId);
}

async function updateArbFinding(principal, reviewId, findingId, input = {}) {
  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const summaryEntity = await getOwnedSummaryEntity(client, principal, reviewId);

  if (!summaryEntity) {
    if (reviewId === "demo-review") {
      await seedDemoReview(client, principal, reviewId);
      return updateArbFinding(principal, reviewId, findingId, input);
    }

    throw createHttpError(404, `ARB review ${reviewId} was not found.`);
  }

  const findingsEntity = await getEntity(client, reviewId, getRowKey(FINDINGS_ROW_KEY, principal.userId));
  const findings = fromFindingsEntity(findingsEntity, reviewId);
  const findingIndex = findings.findIndex((finding) => finding.findingId === findingId);

  if (findingIndex === -1) {
    throw createHttpError(404, `ARB finding ${findingId} was not found.`);
  }

  const currentFinding = findings[findingIndex];
  const nextFinding = {
    ...currentFinding,
    status: normalizeNullableString(input.status) || currentFinding.status,
    owner:
      Object.prototype.hasOwnProperty.call(input, "owner")
        ? normalizeNullableString(input.owner)
        : currentFinding.owner ?? null,
    dueDate:
      Object.prototype.hasOwnProperty.call(input, "dueDate")
        ? normalizeNullableString(input.dueDate)
        : currentFinding.dueDate ?? null,
    reviewerNote:
      Object.prototype.hasOwnProperty.call(input, "reviewerNote")
        ? normalizeNullableString(input.reviewerNote)
        : currentFinding.reviewerNote ?? null,
    criticalBlocker:
      typeof input.criticalBlocker === "boolean"
        ? input.criticalBlocker
        : currentFinding.criticalBlocker
  };

  findings[findingIndex] = nextFinding;
  const lastUpdated = new Date().toISOString();

  await client.upsertEntity(toFindingsEntity(reviewId, principal.userId, findings), "Replace");

  // ── Sync linked action if it exists ──────────────────────────────────
  // When a finding is updated, automatically sync relevant fields to the
  // linked remediation action to keep them consistent.
  let linkedAction = null;
  let actionSynced = false;

  const actionsEntity = await getEntity(client, reviewId, getRowKey(ACTIONS_ROW_KEY, principal.userId));
  const actions = fromActionsEntity(actionsEntity);
  const actionIndex = actions.findIndex((action) => action.sourceFindingId === findingId);

  if (actionIndex !== -1) {
    const currentAction = actions[actionIndex];
    const syncedAction = syncActionFromFinding(currentAction, currentFinding, nextFinding, input);
    
    if (syncedAction !== currentAction) {
      actions[actionIndex] = syncedAction;
      await client.upsertEntity(toActionsEntity(reviewId, principal.userId, actions), "Replace");
      linkedAction = syncedAction;
      actionSynced = true;
    } else {
      linkedAction = currentAction;
      actionSynced = false;
    }
  }

  await client.upsertEntity(
    {
      partitionKey: getPartitionKey(reviewId),
      rowKey: getRowKey(SUMMARY_ROW_KEY, principal.userId),
      lastUpdated
    },
    "Merge"
  );

  return {
    ...nextFinding,
    linkedAction,
    actionSynced
  };
}

/**
 * Sync action fields from finding update.
 * 
 * Sync rules:
 * - status: Always sync (finding status drives action status)
 * - owner: Sync if action owner is null, was same as old finding owner, or was inherited from suggestedOwner
 * - dueDate: Sync if action dueDate is null, was same as old finding dueDate, or was inherited from suggestedDueDate
 * - criticalBlocker → reviewerVerificationRequired: true→true, false→no change
 * - reviewerNote → closureNotes: Append if status is being set to Closed
 */
function syncActionFromFinding(action, oldFinding, newFinding, input) {
  let changed = false;
  const updates = { ...action };

  // Sync status always
  if (Object.prototype.hasOwnProperty.call(input, "status") && input.status !== action.status) {
    updates.status = newFinding.status;
    changed = true;
  }

  // Sync owner if action owner is null, matches old finding owner, or was inherited from suggestedOwner
  if (Object.prototype.hasOwnProperty.call(input, "owner")) {
    const shouldSyncOwner = !action.owner || 
      action.owner === oldFinding.owner || 
      action.owner === oldFinding.suggestedOwner;
    if (shouldSyncOwner && newFinding.owner !== action.owner) {
      updates.owner = newFinding.owner;
      changed = true;
    }
  }

  // Sync dueDate if action dueDate is null, matches old finding dueDate, or was inherited from suggestedDueDate
  if (Object.prototype.hasOwnProperty.call(input, "dueDate")) {
    const shouldSyncDueDate = !action.dueDate || 
      action.dueDate === oldFinding.dueDate || 
      action.dueDate === oldFinding.suggestedDueDate;
    if (shouldSyncDueDate && newFinding.dueDate !== action.dueDate) {
      updates.dueDate = newFinding.dueDate;
      changed = true;
    }
  }

  // Sync criticalBlocker → reviewerVerificationRequired (only escalate, never de-escalate)
  if (input.criticalBlocker === true && !action.reviewerVerificationRequired) {
    updates.reviewerVerificationRequired = true;
    changed = true;
  }

  // Append reviewerNote to closureNotes when closing
  if (input.status === "Closed" && newFinding.reviewerNote) {
    const existingNotes = action.closureNotes || "";
    const noteToAppend = `[Finding note] ${newFinding.reviewerNote}`;
    if (!existingNotes.includes(noteToAppend)) {
      updates.closureNotes = existingNotes
        ? `${existingNotes}\n\n${noteToAppend}`
        : noteToAppend;
      changed = true;
    }
  }

  return changed ? updates : action;
}

async function getArbActions(principal, reviewId) {
  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const summaryEntity = await getOwnedSummaryEntity(client, principal, reviewId);

  if (!summaryEntity) {
    if (reviewId === "demo-review") {
      await seedDemoReview(client, principal, reviewId);
      return getArbActions(principal, reviewId);
    }

    throw createHttpError(404, `ARB review ${reviewId} was not found.`);
  }

  const actionsEntity = await getEntity(client, reviewId, getRowKey(ACTIONS_ROW_KEY, principal.userId));
  return fromActionsEntity(actionsEntity);
}

async function createArbAction(principal, reviewId, input = {}) {
  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const summaryEntity = await getOwnedSummaryEntity(client, principal, reviewId);

  if (!summaryEntity) {
    if (reviewId === "demo-review") {
      await seedDemoReview(client, principal, reviewId);
      return createArbAction(principal, reviewId, input);
    }

    throw createHttpError(404, `ARB review ${reviewId} was not found.`);
  }

  const sourceFindingId = normalizeNullableString(input.sourceFindingId);

  if (!sourceFindingId) {
    throw createHttpError(400, "A sourceFindingId is required before an ARB action can be created.");
  }

  const findingsEntity = await getEntity(client, reviewId, getRowKey(FINDINGS_ROW_KEY, principal.userId));
  const actionsEntity = await getEntity(client, reviewId, getRowKey(ACTIONS_ROW_KEY, principal.userId));
  const findings = fromFindingsEntity(findingsEntity, reviewId);
  const actions = fromActionsEntity(actionsEntity);
  const sourceFinding = findings.find((finding) => finding.findingId === sourceFindingId);

  if (!sourceFinding) {
    throw createHttpError(404, `ARB finding ${sourceFindingId} was not found.`);
  }

  if (actions.some((action) => action.sourceFindingId === sourceFindingId)) {
    throw createHttpError(409, `An ARB action already exists for finding ${sourceFindingId}.`);
  }

  const action = {
    actionId: buildActionId(reviewId, actions),
    reviewId,
    sourceFindingId,
    actionSummary:
      normalizeNullableString(input.actionSummary) || sourceFinding.recommendation || sourceFinding.title,
    owner:
      normalizeNullableString(input.owner) || sourceFinding.owner || sourceFinding.suggestedOwner || null,
    dueDate: normalizeNullableString(input.dueDate) || sourceFinding.dueDate || sourceFinding.suggestedDueDate || null,
    severity: sourceFinding.severity,
    status: normalizeNullableString(input.status) || "Open",
    closureNotes: normalizeNullableString(input.closureNotes),
    reviewerVerificationRequired:
      typeof input.reviewerVerificationRequired === "boolean"
        ? input.reviewerVerificationRequired
        : Boolean(sourceFinding.criticalBlocker),
    createdAt: new Date().toISOString()
  };

  actions.push(action);

  await client.upsertEntity(toActionsEntity(reviewId, principal.userId, actions), "Replace");
  await client.upsertEntity(
    {
      partitionKey: getPartitionKey(reviewId),
      rowKey: getRowKey(SUMMARY_ROW_KEY, principal.userId),
      lastUpdated: new Date().toISOString()
    },
    "Merge"
  );

  return action;
}

async function updateArbAction(principal, reviewId, actionId, input = {}) {
  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const summaryEntity = await getOwnedSummaryEntity(client, principal, reviewId);

  if (!summaryEntity) {
    if (reviewId === "demo-review") {
      await seedDemoReview(client, principal, reviewId);
      return updateArbAction(principal, reviewId, actionId, input);
    }

    throw createHttpError(404, `ARB review ${reviewId} was not found.`);
  }

  const actionsEntity = await getEntity(client, reviewId, getRowKey(ACTIONS_ROW_KEY, principal.userId));
  const actions = fromActionsEntity(actionsEntity);
  const actionIndex = actions.findIndex((action) => action.actionId === actionId);

  if (actionIndex === -1) {
    throw createHttpError(404, `ARB action ${actionId} was not found.`);
  }

  const currentAction = actions[actionIndex];
  const updatedAction = {
    ...currentAction,
    owner:
      Object.prototype.hasOwnProperty.call(input, "owner")
        ? normalizeNullableString(input.owner)
        : currentAction.owner ?? null,
    dueDate:
      Object.prototype.hasOwnProperty.call(input, "dueDate")
        ? normalizeNullableString(input.dueDate)
        : currentAction.dueDate ?? null,
    status: normalizeNullableString(input.status) || currentAction.status,
    closureNotes:
      Object.prototype.hasOwnProperty.call(input, "closureNotes")
        ? normalizeNullableString(input.closureNotes)
        : currentAction.closureNotes ?? null,
    reviewerVerificationRequired:
      typeof input.reviewerVerificationRequired === "boolean"
        ? input.reviewerVerificationRequired
        : currentAction.reviewerVerificationRequired
  };

  actions[actionIndex] = updatedAction;

  await client.upsertEntity(toActionsEntity(reviewId, principal.userId, actions), "Replace");
  await client.upsertEntity(
    {
      partitionKey: getPartitionKey(reviewId),
      rowKey: getRowKey(SUMMARY_ROW_KEY, principal.userId),
      lastUpdated: new Date().toISOString()
    },
    "Merge"
  );

  return updatedAction;
}

async function getArbScorecard(principal, reviewId) {
  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const review = await getArbReview(principal, reviewId);
  const findingsEntity = await getEntity(client, reviewId, getRowKey(FINDINGS_ROW_KEY, principal.userId));
  const decisionEntity = await getEntity(client, reviewId, getRowKey(DECISION_ROW_KEY, principal.userId));
  const findings = fromFindingsEntity(findingsEntity, reviewId);
  const decision = decisionEntity
    ? {
        aiRecommendation: decisionEntity.aiRecommendation,
        reviewerDecision: decisionEntity.reviewerDecision,
        rationale: decisionEntity.rationale,
        reviewerName: decisionEntity.reviewerName ?? null,
        reviewerRole: decisionEntity.reviewerRole ?? null,
        recordedAt: decisionEntity.recordedAt
      }
    : null;
  const derivedScorecard = buildDerivedScorecard(review, findings, decision);

  await client.upsertEntity(
    {
      ...toScorecardEntity(reviewId, principal.userId, derivedScorecard),
      evidenceReadinessState: derivedScorecard.evidenceReadinessState,
      reviewerOverrideJson: JSON.stringify(derivedScorecard.reviewerOverride)
    },
    "Replace"
  );

  // Sync computed score + recommendation back to the summary entity so the
  // review shell always displays the current score instead of "Pending".
  await client.upsertEntity(
    {
      partitionKey: getPartitionKey(reviewId),
      rowKey: getRowKey(SUMMARY_ROW_KEY, principal.userId),
      overallScore: derivedScorecard.overallScore,
      recommendation: derivedScorecard.recommendation,
      lastUpdated: new Date().toISOString()
    },
    "Merge"
  );

  return derivedScorecard;
}

async function getArbDecision(principal, reviewId) {
  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const summaryEntity = await getOwnedSummaryEntity(client, principal, reviewId);

  if (!summaryEntity) {
    if (reviewId === "demo-review") {
      await seedDemoReview(client, principal, reviewId);
      return getArbDecision(principal, reviewId);
    }

    throw createHttpError(404, `ARB review ${reviewId} was not found.`);
  }

  const decisionEntity = await getEntity(client, reviewId, getRowKey(DECISION_ROW_KEY, principal.userId));

  if (!decisionEntity) {
    return null;
  }

  return {
    aiRecommendation: decisionEntity.aiRecommendation,
    reviewerDecision: decisionEntity.reviewerDecision,
    rationale: decisionEntity.rationale,
    reviewerName: decisionEntity.reviewerName ?? null,
    reviewerRole: decisionEntity.reviewerRole ?? null,
    recordedAt: decisionEntity.recordedAt
  };
}

async function recordArbDecision(principal, reviewId, input = {}) {
  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const summaryEntity = await getOwnedSummaryEntity(client, principal, reviewId);

  if (!summaryEntity) {
    if (reviewId === "demo-review") {
      await seedDemoReview(client, principal, reviewId);
      return recordArbDecision(principal, reviewId, input);
    }

    throw createHttpError(404, `ARB review ${reviewId} was not found.`);
  }

  const review = fromSummaryEntity(summaryEntity);
  const requestedDecision = String(input.finalDecision ?? "").trim() || "Needs Revision";
  const recordedAt = new Date().toISOString();
  const decision = {
    aiRecommendation: review.recommendation,
    reviewerDecision: requestedDecision,
    rationale:
      String(input.rationale ?? "").trim() ||
      "Decision recorded against the persisted ARB review.",
    reviewerName: normalizeNullableString(input.reviewerName) || principal.userDetails || null,
    reviewerRole: normalizeNullableString(input.reviewerRole) || null,
    recordedAt
  };

  await client.upsertEntity(toDecisionEntity(reviewId, principal.userId, decision), "Replace");
  await client.upsertEntity(
    {
      partitionKey: getPartitionKey(reviewId),
      rowKey: getRowKey(SUMMARY_ROW_KEY, principal.userId),
      finalDecision: decision.reviewerDecision,
      workflowState: "Decision Recorded",
      lastUpdated: recordedAt
    },
    "Merge"
  );

  return decision;
}

module.exports = {
  buildDefaultActions,
  buildDefaultEvidence,
  capFindingsForTableStorage,
  capScorecardForTableStorage,
  buildDefaultExports,
  buildDefaultFindings,
  buildDefaultExtractionStatus,
  buildDefaultRequirements,
  buildDefaultReview,
  buildDefaultScorecard,
  createArbExport,
  createArbAction,
  createArbReview,
  deleteArbReview,
  deleteArbFile,
  downloadArbExport,
  getArbEvidence,
  getArbVisualEvidence,
  getArbActions,
  getArbDecision,
  getArbExtractionStatus,
  markArbExtractionQueued,
  markArbExtractionRunning,
  markArbExtractionFailed,
  listArbExports,
  getArbFiles,
  getArbRequirements,
  listArbReviews,
  getArbFindings,
  getArbReview,
  getArbScorecard,
  recordArbDecision,
  startArbExtraction,
  extractSingleFileContent,
  persistAggregatedExtractionResults,
  syncArbReviewedOutputs,
  uploadArbFiles,
  updateArbAction,
  updateArbFinding,
  _tableStorageInternals: {
    TABLE_STORAGE_PROPERTY_CHAR_LIMIT,
    capRequirementsForTableStorage,
    capEvidenceForTableStorage,
    capVisualEvidenceForTableStorage
  }
};
