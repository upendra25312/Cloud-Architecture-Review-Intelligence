const crypto = require("node:crypto");
const path = require("node:path");
const zlib = require("node:zlib");
const ExcelJS = require("exceljs");
const JSZip = require("jszip");
const {
  ARB_INPUT_CONTAINER_NAME,
  ARB_OUTPUT_CONTAINER_NAME,
  getContainerClient,
  readBinaryBlob,
  readTextBlob,
  sanitizePathSegment,
  uploadBinaryBlob,
  uploadTextBlob
} = require("./storage");
const { getCopilotConfiguration, runCopilot } = require("./copilot");
const { ensureArbSearchIndex, indexArbDocumentChunks, getSearchConfiguration } = require("./arb-search");
const { describeImageForReview, getFoundryConfiguration } = require("./arb-foundry-agent");
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
const OFFICE_RENDERER_MAX_PAGES = Number(process.env.OFFICE_RENDERER_MAX_PAGES || 20);
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

function extractDrawioText(buffer, fileName) {
  const xml = buffer.toString("utf8");
  const parts = [`[Diagram file: ${fileName}] (Draw.io XML)`];
  const values = new Set();

  for (const value of extractXmlAttributeValues(xml, "value")) values.add(value);
  for (const value of extractXmlAttributeValues(xml, "label")) values.add(value);

  for (const match of xml.matchAll(/<diagram\b[^>]*>([\s\S]*?)<\/diagram>/gi)) {
    const body = match[1].trim();
    if (!body) continue;

    const nestedXml = body.startsWith("<") ? body : tryInflateDrawioDiagram(body);
    if (!nestedXml) continue;

    for (const value of extractXmlAttributeValues(nestedXml, "value")) values.add(value);
    for (const value of extractXmlAttributeValues(nestedXml, "label")) values.add(value);
  }

  if (values.size === 0) {
    const stripped = cleanDiagramText(xml);
    if (stripped) values.add(stripped.slice(0, 8000));
  }

  parts.push(...[...values].slice(0, 200).map((value) => `- ${value}`));
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

function extractVsdxText(buffer, fileName) {
  const parts = [`[Diagram file: ${fileName}] (Visio VSDX)`];
  const values = new Set();

  for (const entry of readZipEntries(buffer)) {
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
        maxPages: ext === ".pdf" ? 6 : OFFICE_RENDERER_MAX_PAGES,
        startPage: ext === ".pdf" ? 4 : undefined,
        endPage: ext === ".pdf" ? 9 : undefined
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
  sourceFile,
  artifact,
  outputContainer,
  canUseMultimodal
}) {
  const visualEvidenceId = buildVisualEvidenceId(reviewId, visualIndex);
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
    try {
      const analyzedSummary = await describeImageForReview(artifact.buffer, artifact.sourceName || sourceFile.fileName, extension);
      summary = String(analyzedSummary || "").trim() || summary;
    } catch (error) {
      analysisError = error instanceof Error ? error.message : String(error);
      summary = artifact.summaryText || `Visual artifact ${artifact.sourceName || sourceFile.fileName} could not be analyzed by the multimodal model.`;
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

function buildBlobPath(userId, reviewId, fileName) {
  return `${sanitizePathSegment(userId)}/reviews/${sanitizePathSegment(reviewId)}/${Date.now()}-${sanitizeFilename(fileName)}`;
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
    extractionErrors: [],
    lastStartedAt: null,
    lastCompletedAt: null,
    fileStatuses: []
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

  if (normalized === "csv" || normalized === "html") {
    return normalized;
  }

  throw createHttpError(400, "Supported ARB export formats are markdown, csv, and html.");
}

function getExportExtension(format) {
  return format === "markdown" ? "md" : format;
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

function renderMarkdownExportBody(review, files, requirements, evidence, findings, scorecard, actions, summaryText) {
  const domainScores = scorecard?.domainScores || [];
  const actionLines = actions.length
    ? actions.map((action) => `- ${action.actionSummary} (${action.status})`)
    : ["_No actions recorded._"];

  return [
    `# ${review.projectName} ARB Reviewed Output`,
    "",
    `- Review ID: ${review.reviewId}`,
    `- Customer: ${review.customerName}`,
    `- Workflow state: ${review.workflowState}`,
    `- Evidence readiness: ${review.evidenceReadinessState}`,
    `- Documents reviewed: ${files.length}`,
    `- Requirements extracted: ${requirements.length}`,
    `- Evidence facts extracted: ${evidence.length}`,
    scorecard ? `- Overall score: ${scorecard.overallScore ?? "TBD"}` : null,
    scorecard ? `- Recommendation: ${scorecard.recommendation}` : null,
    "",
    summaryText ? `## Assessment Summary\n\n${summaryText}` : null,
    summaryText ? "" : null,
    "## Uploaded Inputs",
    "",
    ...files.map(
      (file) =>
        `- ${file.fileName} (${file.logicalCategory}, ${file.extractionStatus}, ${file.supportedTextExtraction ? "text-ready" : "stored-only"})`
    ),
    "",
    "## Reviewed Requirements",
    "",
    ...requirements.map(
      (requirement) =>
        `- [${requirement.category}/${requirement.criticality}] ${requirement.normalizedText}`
    ),
    "",
    "## Reviewed Evidence",
    "",
    ...evidence.map(
      (fact) => `- [${fact.factType}] ${fact.summary} (${fact.sourceFileName || "Derived summary"})`
    ),
    "",
    "## Scorecard",
    "",
    ...domainScores.map(
      (domainScore) =>
        `- ${domainScore.domain}: ${domainScore.score}/${domainScore.weight} - ${domainScore.reason || "No rationale recorded."}`
    ),
    "",
    "## Findings",
    "",
    ...findings.map((finding) =>
      [
        `- [${finding.severity}] ${finding.title} (${finding.status})`,
        finding.findingStatement ? `  - Finding: ${finding.findingStatement}` : null,
        finding.recommendation ? `  - Recommendation: ${finding.recommendation}` : null,
        finding.source ? `  - Source: ${finding.source}` : null
      ]
        .filter(Boolean)
        .join("\n")
    ),
    "",
    "## Actions",
    "",
    ...actionLines
  ]
    .filter(Boolean)
    .join("\n");
}

function renderCsvExportBody(review, files, requirements, evidence, findings, scorecard, actions) {
  const rows = [
    [
      "recordType",
      "reviewId",
      "projectName",
      "category",
      "title",
      "details",
      "sourceFile",
      "status",
      "severity",
      "owner",
      "dueDate",
      "source"
    ],
    [
      "review",
      review.reviewId,
      review.projectName,
      "summary",
      review.customerName,
      `Workflow=${review.workflowState}; Readiness=${review.evidenceReadinessState}; Score=${scorecard?.overallScore ?? "TBD"}`,
      "",
      review.workflowState,
      scorecard?.recommendation || "",
      review.assignedReviewer || "",
      review.targetReviewDate || "",
      ""
    ],
    ...files.map((file) => [
      "file",
      review.reviewId,
      review.projectName,
      file.logicalCategory,
      file.fileName,
      `Extraction=${file.extractionStatus}; Size=${file.sizeBytes}`,
      file.fileName,
      file.extractionStatus,
      "",
      file.uploadedBy,
      file.uploadedAt
    ]),
    ...requirements.map((requirement) => [
      "requirement",
      review.reviewId,
      review.projectName,
      requirement.category,
      requirement.normalizedText,
      requirement.reviewerStatus,
      requirement.sourceFileName || "",
      requirement.reviewerStatus,
      requirement.criticality,
      "",
      ""
    ]),
    ...evidence.map((fact) => [
      "evidence",
      review.reviewId,
      review.projectName,
      fact.factType,
      fact.summary,
      fact.sourceExcerpt,
      fact.sourceFileName || "",
      fact.confidence,
      "",
      "",
      ""
    ]),
    ...findings.map((finding) => [
      "finding",
      review.reviewId,
      review.projectName,
      finding.domain,
      finding.title,
      finding.findingStatement,
      formatEvidenceReferences(finding.evidenceFound),
      finding.status,
      finding.severity,
      finding.owner || finding.suggestedOwner || "",
      finding.dueDate || finding.suggestedDueDate || "",
      finding.source || ""
    ]),
    ...actions.map((action) => [
      "action",
      review.reviewId,
      review.projectName,
      "remediation",
      action.actionSummary,
      action.closureNotes || "",
      action.sourceFindingId,
      action.status,
      action.severity,
      action.owner || "",
      action.dueDate || ""
    ])
  ];

  return rows.map((row) => row.map((value) => escapeCsvValue(value)).join(",")).join("\n");
}

function renderHtmlExportBody(review, files, requirements, evidence, findings, scorecard, actions, summaryText) {
  const esc = escapeHtml;
  const timestamp = new Date().toISOString();

  /* ── colour helpers ── */
  const severityBadge = (sev) => {
    const s = String(sev || "").toLowerCase();
    if (s === "high" || s === "critical")
      return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;background:#FEE2E2;color:#D92B2B;">${esc(sev)}</span>`;
    if (s === "medium")
      return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;background:#FEF3C7;color:#B45309;">${esc(sev)}</span>`;
    return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;background:#DBEAFE;color:#0078D4;">${esc(sev)}</span>`;
  };

  const recommendationBadge = (rec) => {
    const r = String(rec || "").toLowerCase();
    let bg = "#FEF3C7"; let fg = "#B45309";
    if (r === "recommended for approval") { bg = "#D1FAE5"; fg = "#065F46"; }
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

  const overallScore = scorecard?.overallScore ?? null;
  const recommendation = scorecard?.recommendation ?? "Pending";
  const domainScores = scorecard?.domainScores || [];

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
    `<title>${esc(review.projectName)} \u2014 Architecture Review Pack</title>`,
    `</head>`,
    `<body style="margin:0;padding:0;background:#ffffff;color:#1F2937;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.6;">`
  );

  /* page wrapper */
  parts.push(`<div style="max-width:900px;margin:0 auto;padding:40px 24px;">`);

  /* ── HEADER ── */
  parts.push(
    `<div style="margin-bottom:8px;">`,
    `<h1 style="margin:0 0 4px;font-size:26px;font-weight:700;color:#0F172A;letter-spacing:-0.3px;">${esc(review.projectName)}</h1>`,
    `<p style="margin:0;font-size:14px;color:#64748B;">Architecture Review Pack</p>`,
    `</div>`
  );

  /* ── METADATA CARD ── */
  parts.push(
    `<div style="margin:20px 0 32px;padding:20px 24px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;">`,
    `<table style="width:100%;border-collapse:collapse;font-size:13px;">`,
    `<tr><td style="padding:4px 16px 4px 0;color:#64748B;white-space:nowrap;vertical-align:top;">Review ID</td><td style="padding:4px 0;font-weight:500;">${esc(review.reviewId)}</td></tr>`,
    `<tr><td style="padding:4px 16px 4px 0;color:#64748B;white-space:nowrap;vertical-align:top;">Customer</td><td style="padding:4px 0;font-weight:500;">${esc(review.customerName)}</td></tr>`,
    `<tr><td style="padding:4px 16px 4px 0;color:#64748B;white-space:nowrap;vertical-align:top;">Workflow State</td><td style="padding:4px 0;font-weight:500;">${esc(review.workflowState)}</td></tr>`,
    `<tr><td style="padding:4px 16px 4px 0;color:#64748B;white-space:nowrap;vertical-align:top;">Evidence Readiness</td><td style="padding:4px 0;font-weight:500;">${esc(review.evidenceReadinessState)}</td></tr>`,
    `<tr><td style="padding:4px 16px 4px 0;color:#64748B;white-space:nowrap;vertical-align:top;">Overall Score</td><td style="padding:4px 0;font-weight:600;">${overallScore !== null ? esc(overallScore) + " / 100" : "TBD"}</td></tr>`,
    `<tr><td style="padding:4px 16px 4px 0;color:#64748B;white-space:nowrap;vertical-align:top;">Recommendation</td><td style="padding:4px 0;">${recommendationBadge(recommendation)}</td></tr>`,
    `</table>`,
    `</div>`
  );

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
      const pct = ds.weight > 0 ? Math.round((Number(ds.score) / Number(ds.weight)) * 100) : 0;
      const color = scoreColor(pct >= 85 ? 85 : pct >= 70 ? 75 : 50);
      parts.push(
        `<div style="margin-bottom:14px;">`,
        `<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">`,
        `<span style="font-size:13px;font-weight:600;color:#1F2937;">${esc(ds.domain)}</span>`,
        `<span style="font-size:12px;color:#64748B;">${esc(ds.score)} / ${esc(ds.weight)} (${pct}%)</span>`,
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

  /* ── FINDINGS TABLE ── */
  parts.push(divider);
  parts.push(
    `<div style="margin-bottom:32px;">`,
    `<h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#0F172A;">Findings</h2>`
  );
  if (findings.length === 0) {
    parts.push(`<p style="color:#64748B;font-style:italic;">No findings recorded.</p>`);
  } else {
    parts.push(
      `<table style="width:100%;border-collapse:collapse;font-size:13px;">`,
      `<thead>`,
      `<tr style="border-bottom:2px solid #E2E8F0;">`,
      `<th style="text-align:left;padding:8px 10px;color:#64748B;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Severity</th>`,
      `<th style="text-align:left;padding:8px 10px;color:#64748B;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Finding</th>`,
      `<th style="text-align:left;padding:8px 10px;color:#64748B;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Domain</th>`,
      `<th style="text-align:left;padding:8px 10px;color:#64748B;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Recommendation</th>`,
      `<th style="text-align:left;padding:8px 10px;color:#64748B;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Status</th>`,
      `</tr>`,
      `</thead>`,
      `<tbody>`
    );
    for (const f of findings) {
      parts.push(
        `<tr style="border-bottom:1px solid #F1F5F9;">`,
        `<td style="padding:10px;vertical-align:top;">${severityBadge(f.severity)}</td>`,
        `<td style="padding:10px;vertical-align:top;"><strong style="color:#0F172A;">${esc(f.title)}</strong><br/><span style="color:#64748B;font-size:12px;">${esc(f.findingStatement || "")}</span></td>`,
        `<td style="padding:10px;vertical-align:top;color:#475569;">${esc(f.domain || "")}</td>`,
        `<td style="padding:10px;vertical-align:top;color:#475569;font-size:12px;">${esc(f.recommendation || "")}</td>`,
        `<td style="padding:10px;vertical-align:top;"><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500;background:#F1F5F9;color:#475569;">${esc(f.status)}</span></td>`,
        `</tr>`
      );
    }
    parts.push(`</tbody></table>`);
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
        `<td style="padding:10px;vertical-align:top;">${esc(a.actionSummary)}</td>`,
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
      parts.push(
        `<tr style="border-bottom:1px solid #F1F5F9;">`,
        `<td style="padding:8px 10px;">${esc(file.fileName)}</td>`,
        `<td style="padding:8px 10px;color:#475569;">${esc(file.logicalCategory)}</td>`,
        `<td style="padding:8px 10px;color:#475569;">${esc(file.extractionStatus)}</td>`,
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
    `Generated by Azure Review Assistant &middot; ${esc(timestamp)}`,
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
  format,
  generatedAt,
  summaryText,
  existingExports
}) {
  const outputContainer = await getContainerClient(ARB_OUTPUT_CONTAINER_NAME);
  const fileName = buildExportFileName(review.reviewId, format);
  const blobPath = buildExportBlobPath(principal.userId, review.reviewId, fileName);
  let body;
  let contentType;

  if (format === "csv") {
    body = renderCsvExportBody(review, files, requirements, evidence, findings, scorecard, actions);
    contentType = "text/csv; charset=utf-8";
  } else if (format === "html") {
    body = renderHtmlExportBody(
      review,
      files,
      requirements,
      evidence,
      findings,
      scorecard,
      actions,
      summaryText
    );
    contentType = "text/html; charset=utf-8";
  } else {
    body = renderMarkdownExportBody(
      review,
      files,
      requirements,
      evidence,
      findings,
      scorecard,
      actions,
      summaryText
    );
    contentType = "text/markdown; charset=utf-8";
  }

  await uploadTextBlob(outputContainer, blobPath, body, contentType);

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

    for (const line of lines.slice(0, 12)) {
      if (!isVisualArtifact && !/azure|security|network|identity|monitor|backup|recovery|cost|pricing|service/i.test(line)) {
        continue;
      }

      evidence.push({
        evidenceId: `${review.reviewId}-ev-${evidence.length + 1}`,
        reviewId: review.reviewId,
        sourceFileId: file.fileId,
        sourceFileName: file.fileName,
        factType: isVisualArtifact ? "VisualArchitecture" : buildRequirementCategory(line, "Architecture"),
        summary: line,
        sourceExcerpt: line,
        confidence: isVisualArtifact ? "Medium" : supportsTextExtraction(file.fileName) ? "Medium" : "Low"
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
    missingRecommendedItemsJson: JSON.stringify(missingRecommendedItems ?? [])
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
  return {
    partitionKey: getPartitionKey(reviewId),
    rowKey: getRowKey(EXTRACTION_ROW_KEY, userId),
    reviewId,
    createdByUserId: userId,
    extractionJson: JSON.stringify(extraction),
    lastUpdated: new Date().toISOString()
  };
}

function toRequirementsEntity(reviewId, userId, requirements) {
  return {
    partitionKey: getPartitionKey(reviewId),
    rowKey: getRowKey(REQUIREMENTS_ROW_KEY, userId),
    reviewId,
    createdByUserId: userId,
    requirementsJson: JSON.stringify(requirements),
    lastUpdated: new Date().toISOString()
  };
}

function toEvidenceEntity(reviewId, userId, evidence, visualEvidence = []) {
  return {
    partitionKey: getPartitionKey(reviewId),
    rowKey: getRowKey(EVIDENCE_ROW_KEY, userId),
    reviewId,
    createdByUserId: userId,
    evidenceJson: JSON.stringify(evidence),
    visualEvidenceJson: JSON.stringify(visualEvidence),
    lastUpdated: new Date().toISOString()
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
    lastUpdated: entity.lastUpdated
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

  return extraction;
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
          reviewerName: review.assignedReviewer || review.createdBy || review.createdByUserId,
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
  const extraction = buildDefaultExtractionStatus(review);

  await client.upsertEntity(toSummaryEntity(review), "Replace");
  await client.upsertEntity(toFindingsEntity(reviewId, principal.userId, findings), "Replace");
  await client.upsertEntity(toScorecardEntity(reviewId, principal.userId, scorecard), "Replace");
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
    const blobPath = buildBlobPath(principal.userId, reviewId, fileName);
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

  async function addVisualEvidenceRecord(file, artifact) {
    try {
      const record = await persistAndAnalyzeVisualArtifact({
        principal,
        reviewId,
        visualIndex: visualEvidence.length,
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

  async function processOfficeVisualEvidence(file, buffer) {
    const extension = getFileExtension(file.fileName);
    if (![".docx", ".pptx", ".xlsx"].includes(extension)) {
      return;
    }

    const { artifacts, warnings } = await extractOfficeMediaArtifacts(buffer, file.fileName);
    for (const warning of warnings) {
      visualExtractionErrors.push(warning);
    }
    for (const artifact of artifacts) {
      await addVisualEvidenceRecord(file, artifact);
    }

    const shouldRunFallback = artifacts.length === 0 || extension === ".pptx";
    if (shouldRunFallback) {
      const rendered = await renderOfficeVisualArtifacts(buffer, file.fileName);
      for (const warning of rendered.warnings) {
        visualExtractionErrors.push(warning);
      }
      for (const artifact of rendered.artifacts) {
        await addVisualEvidenceRecord(file, artifact);
      }

      if (rendered.artifacts.length > 0) {
        return;
      }

      const fallback = await extractOfficeRenderFallbackEvidence(buffer, file.fileName);
      for (const warning of fallback.warnings) {
        visualExtractionErrors.push(warning);
      }
      for (const artifact of fallback.artifacts) {
        await addVisualEvidenceRecord(file, artifact);
      }
    }
  }

  async function processPdfVisualEvidence(file, layout, buffer) {
    const figures = Array.isArray(layout?.figures) ? layout.figures : [];
    let persistedFigures = 0;
    for (const figure of figures) {
      if (!figure.buffer) {
        visualExtractionErrors.push(`${file.fileName}: Document Intelligence could not retrieve figure ${figure.figureId || "unknown"}.`);
        continue;
      }
      const record = await addVisualEvidenceRecord(file, {
        sourceName: `${file.fileName}-${figure.figureId || "figure"}.png`,
        buffer: figure.buffer,
        extension: ".png",
        contentType: figure.contentType || "image/png",
        sourcePage: figure.sourcePage ?? figure.pageNumber ?? null,
        figureId: figure.figureId ?? null,
        sourceExcerpt: `Visual analysis of embedded architecture figure ${figure.figureId || ""} in ${file.fileName}.`.trim(),
        extractionSource: "Document Intelligence figures + multimodal analysis"
      });
      if (record) persistedFigures++;
    }

    if (persistedFigures > 0) {
      return;
    }

    const rendered = await renderOfficeVisualArtifacts(buffer, file.fileName);
    for (const warning of rendered.warnings) {
      visualExtractionErrors.push(warning);
    }
    if (rendered.artifacts.length > 0) {
      for (const artifact of rendered.artifacts) {
        await addVisualEvidenceRecord(file, artifact);
      }
      return;
    }

    const pages = Array.isArray(layout?.result?.pages) ? layout.result.pages : [];
    const fallbackPages = pages
      .filter((page) => Number(page.pageNumber) >= 4 && Number(page.pageNumber) <= 9)
      .slice(0, 6);
    for (const page of fallbackPages) {
      const pageText = Array.isArray(page.lines)
        ? page.lines.map((line) => line.content).filter(Boolean).join("\n")
        : "";
      await addVisualEvidenceRecord(file, {
        sourceName: `${file.fileName}-page-${page.pageNumber}.txt`,
        sourcePage: page.pageNumber ?? null,
        summaryText: pageText
          ? `PDF page ${page.pageNumber} was treated as visual evidence fallback. Extracted page labels:\n${pageText.slice(0, 4000)}`
          : `PDF page ${page.pageNumber} was treated as visual evidence fallback because no cropped figures were returned by Document Intelligence.`,
        sourceExcerpt: `Visual analysis fallback for full-page architecture content on page ${page.pageNumber}.`,
        extractionSource: "PDF page render fallback + extracted page evidence"
      });
    }
  }

  for (const file of files) {
    const isSpreadsheet = supportsSpreadsheetExtraction(file.fileName);
    const isDiagram = supportsDiagramExtraction(file.fileName);
    const isImage = supportsImageExtraction(file.fileName);

    // ── Spreadsheet extraction via SheetJS ──────────────────────────────────
    if (isSpreadsheet) {
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
        nextFiles.push({ ...file, extractionStatus: "Failed", extractionError: message });
        extractionErrors.push(`${file.fileName}: ${message}`);
      }
      continue;
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

      if (!diConfig.configured && !canUseVisionFallback) {
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
        const buffer = await readBinaryBlob(inputContainer, file.blobPath);

        if (!buffer || buffer.length === 0) {
          nextFiles.push({
            ...file,
            extractionStatus: "Failed",
            extractionError: "Document file could not be read from storage."
          });
          extractionErrors.push(`${file.fileName}: empty blob.`);
          continue;
        }

        let text = null;
        let extractionSource = "Document Intelligence";

        await processOfficeVisualEvidence(file, buffer);

        if (diConfig.configured) {
          if (getFileExtension(file.fileName) === ".pdf") {
            try {
              const layout = await extractDocumentLayout(buffer, file.contentType, file.fileName, { includeFigures: true });
              text = layout.text;
              await processPdfVisualEvidence(file, layout, buffer);
            } catch (figureError) {
              const message = figureError instanceof Error ? figureError.message : String(figureError);
              visualExtractionErrors.push(`${file.fileName}: PDF figure extraction failed: ${message}`);
              text = await extractDocumentText(buffer, file.contentType, file.fileName);
            }
          } else {
            text = await extractDocumentText(buffer, file.contentType, file.fileName);
          }
        }

        // Vision Service OCR fallback — used when DI is not configured or returned no text.
        // Only applies to formats Vision Read API accepts (PDF, JPEG, PNG, TIFF, BMP, GIF).
        if ((!text || !text.trim()) && canUseVisionFallback) {
          text = await extractTextWithVision(buffer, file.contentType, file.fileName);
          extractionSource = "Azure Vision Service (OCR fallback)";
        }

        if (!text || !text.trim()) {
          nextFiles.push({
            ...file,
            extractionStatus: "Failed",
            extractionError: diConfig.configured
              ? "Azure AI Document Intelligence returned no text for this document."
              : "Document Intelligence is not configured and Azure Vision Service OCR returned no text."
          });
          extractionErrors.push(`${file.fileName}: ${extractionSource} returned no text.`);
          continue;
        }

        fileTexts.set(file.fileId, text);
        nextFiles.push({ ...file, extractionStatus: "Completed", extractionError: null });

        if (searchIndexed) {
          indexArbDocumentChunks(reviewId, file.fileId, file.fileName, file.logicalCategory, text).catch((err) => { console.warn(`[search-index] Failed to index "${file.fileName}" (review ${reviewId}):`, err?.message ?? err); });
        }
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

  const syncedOutputs = await syncArbReviewedOutputs({
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
  });

  await client.upsertEntity(
    toExportsEntity(reviewId, principal.userId, syncedOutputs.exportsList),
    "Replace"
  );

  return extraction;
}

async function getArbExtractionStatus(principal, reviewId) {
  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const review = await getArbReview(principal, reviewId);
  const extractionEntity = await getEntity(client, reviewId, getRowKey(EXTRACTION_ROW_KEY, principal.userId));
  return fromExtractionEntity(extractionEntity, review);
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
  const body = await readTextBlob(outputContainer, artifact.blobPath);

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
  await client.upsertEntity(
    {
      partitionKey: getPartitionKey(reviewId),
      rowKey: getRowKey(SUMMARY_ROW_KEY, principal.userId),
      lastUpdated
    },
    "Merge"
  );

  return nextFinding;
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
  const sowMissingForSignoff =
    requestedDecision === "Approved" &&
    (
      review.requiredEvidencePresent === false ||
      (Array.isArray(review.missingRequiredItems) && review.missingRequiredItems.includes("sow"))
    );

  if (sowMissingForSignoff) {
    throw createHttpError(
      400,
      "Approved decisions require the SOW or scope document to be uploaded first, or a formal reviewer waiver to be recorded."
    );
  }

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
  listArbExports,
  getArbFiles,
  getArbRequirements,
  listArbReviews,
  getArbFindings,
  getArbReview,
  getArbScorecard,
  recordArbDecision,
  startArbExtraction,
  syncArbReviewedOutputs,
  uploadArbFiles,
  updateArbAction,
  updateArbFinding
};
