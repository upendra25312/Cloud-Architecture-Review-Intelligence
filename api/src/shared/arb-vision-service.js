/**
 * arb-vision-service.js
 *
 * Azure Computer Vision Read API (v3.2) — OCR fallback for the ARB pipeline.
 * Activated when Azure AI Document Intelligence is not configured or fails to
 * extract text from a supported document.
 *
 * Supported formats: PDF (scanned/image-based), JPEG, PNG, BMP, TIFF, GIF.
 * Not suitable for Office XML formats (DOCX, PPTX) — those remain DI-only.
 *
 * Configuration:
 *   AZURE_VISION_ENDPOINT  (required) — e.g. https://my-vision.cognitiveservices.azure.com
 *   Auth: DefaultAzureCredential (Managed Identity in production, az login locally)
 *
 * Graceful degradation: returns null if not configured or if extraction fails,
 * so the caller can fall through to "Limited Evidence" without throwing.
 */

const { DefaultAzureCredential } = require("@azure/identity");

const VISION_ENDPOINT = (process.env.AZURE_VISION_ENDPOINT || "").replace(/\/+$/, "");

// File extensions the Vision Read API can process.
// PDF is the primary value-add over DI (handles scanned/image-only PDFs).
const VISION_EXTRACTABLE_EXTENSIONS = new Set([
  ".pdf",
  ".jpg", ".jpeg",
  ".png", ".bmp",
  ".tiff", ".tif",
  ".gif"
]);

let _visionCred = null;
function getVisionCredential() {
  if (!_visionCred) _visionCred = new DefaultAzureCredential();
  return _visionCred;
}
async function getVisionToken() {
  const token = await getVisionCredential().getToken("https://cognitiveservices.azure.com/.default");
  return token.token;
}

function getVisionServiceConfiguration() {
  return {
    configured: Boolean(VISION_ENDPOINT),
    endpoint: VISION_ENDPOINT
  };
}

function supportsVisionExtraction(fileName) {
  const ext = fileName.includes(".")
    ? "." + fileName.split(".").pop().toLowerCase()
    : "";
  return VISION_EXTRACTABLE_EXTENSIONS.has(ext);
}

/**
 * Extracts OCR text from a document buffer using Azure Computer Vision Read API v3.2.
 *
 * Returns plain text with page separators, or null on failure so the caller
 * can decide whether to fall back to "Limited Evidence".
 *
 * @param {Buffer} buffer        Raw file bytes
 * @param {string} contentType   MIME type (e.g. "application/pdf")
 * @param {string} fileName      Original filename for logging
 * @returns {Promise<string|null>}
 */
async function extractTextWithVision(buffer, contentType, fileName) {
  const config = getVisionServiceConfiguration();
  if (!config.configured) return null;

  try {
    const token = await getVisionToken();
    const authHeader = { "Authorization": `Bearer ${token}` };
    const analyzeUrl = `${VISION_ENDPOINT}/vision/v3.2/read/analyze`;

    // Submit the asynchronous read operation
    const submitRes = await fetch(analyzeUrl, {
      method: "POST",
      headers: {
        ...authHeader,
        "Content-Type": contentType || "application/octet-stream"
      },
      body: buffer
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text().catch(() => `HTTP ${submitRes.status}`);
      const status = submitRes.status;
      let hint = "";
      if (status === 429) hint = " Rate limit hit — S1 tier allows 5,000 transactions/month. Check usage in Azure Portal → Vision resource → Metrics.";
      else if (status === 401 || status === 403) hint = " Auth failed — verify the Function App Managed Identity has 'Cognitive Services User' role on the Vision resource.";
      else if (status === 400) hint = " Unsupported format or malformed payload.";
      console.error(`[VisionService] submit failed for "${fileName}" (HTTP ${status})${hint}: ${errText.slice(0, 300)}`);
      return null;
    }

    const operationUrl = submitRes.headers.get("Operation-Location");
    if (!operationUrl) {
      console.error(`[VisionService] no Operation-Location header for ${fileName}`);
      return null;
    }

    // Poll for completion — 2s → 4s → 8s backoff, max 60s total
    const MAX_WAIT_MS = 60_000;
    let elapsed = 0;
    let delay = 2000;
    let resultData = null;

    while (elapsed < MAX_WAIT_MS) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      elapsed += delay;
      delay = Math.min(delay * 2, 8_000);

      const pollRes = await fetch(operationUrl, { headers: authHeader });

      if (!pollRes.ok) break;
      const data = await pollRes.json();

      if (data.status === "succeeded") {
        resultData = data;
        break;
      } else if (data.status === "failed") {
        console.error(`[VisionService] read operation failed for ${fileName}`);
        return null;
      }
      // "running" or "notStarted" — keep polling
    }

    if (!resultData) {
      console.error(`[VisionService] timed out or no result for ${fileName}`);
      return null;
    }

    return buildTextFromVisionResult(resultData, fileName);
  } catch (err) {
    console.error(`[VisionService] extraction failed for ${fileName}: ${err?.message ?? err}`);
    return null;
  }
}

/**
 * Converts a Vision Read API result into structured plain text
 * compatible with the ARB search and evidence pipeline.
 */
function buildTextFromVisionResult(data, fileName) {
  const parts = [`[Document: ${fileName}] (OCR via Azure Vision Service)`];

  for (const readResult of data.analyzeResult?.readResults ?? []) {
    parts.push(`\n--- Page ${readResult.page} ---`);
    for (const line of readResult.lines ?? []) {
      const text = (line.text ?? "").trim();
      if (text.length >= 3) parts.push(text);
    }
  }

  return parts.join("\n").trim();
}

/**
 * Verifies that the Azure AI Vision service is reachable and the Managed Identity
 * token can be obtained. Uses the models list endpoint (no quota cost).
 *
 * @returns {{ ok: boolean, configured: boolean, message: string }}
 */
async function checkVisionServiceHealth() {
  const config = getVisionServiceConfiguration();
  if (!config.configured) {
    return { ok: false, configured: false, message: "AZURE_VISION_ENDPOINT is not set in Application Settings." };
  }

  try {
    const token = await getVisionToken();
    // Simple ping: retrieve Vision service info (GET /vision/v3.2/models)
    const res = await fetch(`${VISION_ENDPOINT}/vision/v3.2/models`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.ok) {
      return {
        ok: true,
        configured: true,
        message: `Azure AI Vision reachable at ${VISION_ENDPOINT}. Auth: Managed Identity (token obtained).`
      };
    }

    const errText = await res.text().catch(() => `HTTP ${res.status}`);
    const status = res.status;
    let hint = "";
    if (status === 401 || status === 403) hint = " Managed Identity may be missing 'Cognitive Services User' role on the Vision resource.";
    if (status === 404) hint = " Endpoint URL may be incorrect or the Vision v3.2 Read API is not available on this resource SKU.";
    return { ok: false, configured: true, message: `Vision health check failed (HTTP ${status})${hint}: ${errText.slice(0, 200)}` };
  } catch (err) {
    return { ok: false, configured: true, message: `Vision health check failed: ${err?.message ?? err}` };
  }
}

module.exports = {
  getVisionServiceConfiguration,
  supportsVisionExtraction,
  extractTextWithVision,
  checkVisionServiceHealth,
  VISION_EXTRACTABLE_EXTENSIONS
};
