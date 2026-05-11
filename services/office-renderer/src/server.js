const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");

const PORT = Number(process.env.PORT || 8080);
const MAX_FILE_BYTES = Number(process.env.RENDERER_MAX_FILE_BYTES || 50 * 1024 * 1024);
const MAX_PAGES = Number(process.env.RENDERER_MAX_PAGES || 20);
const COMMAND_TIMEOUT_MS = Number(process.env.RENDERER_COMMAND_TIMEOUT_MS || 120000);
const RENDER_DPI = Number(process.env.RENDERER_DPI || 160);
const SHARED_SECRET = process.env.RENDERER_SHARED_SECRET || "";

const OFFICE_EXTENSIONS = new Set([".docx", ".pptx", ".xlsx"]);

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: COMMAND_TIMEOUT_MS, ...options }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function readRequestJson(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_FILE_BYTES * 1.45) {
      throw Object.assign(new Error("Request payload exceeds renderer limit."), { statusCode: 413 });
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function assertAuthorized(req) {
  if (!SHARED_SECRET) return;
  const token = req.headers["x-cari-renderer-token"];
  const expected = Buffer.from(SHARED_SECRET);
  const actual = Buffer.from(Array.isArray(token) ? token[0] || "" : token || "");
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw Object.assign(new Error("Unauthorized renderer request."), { statusCode: 401 });
  }
}

async function renderOfficeToImages({ fileName, fileBase64, maxPages }) {
  const extension = path.extname(String(fileName || "").toLowerCase());
  if (!OFFICE_EXTENSIONS.has(extension)) {
    throw Object.assign(new Error(`Unsupported Office file type: ${extension || "unknown"}.`), { statusCode: 400 });
  }

  const inputBuffer = Buffer.from(String(fileBase64 || ""), "base64");
  if (!inputBuffer.length) {
    throw Object.assign(new Error("No file content supplied."), { statusCode: 400 });
  }
  if (inputBuffer.length > MAX_FILE_BYTES) {
    throw Object.assign(new Error(`File exceeds renderer limit of ${MAX_FILE_BYTES} bytes.`), { statusCode: 413 });
  }

  const limit = Math.max(1, Math.min(Number(maxPages || MAX_PAGES), MAX_PAGES));
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "cari-office-render-"));
  const inputPath = path.join(workDir, `input${extension}`);
  const outputDir = path.join(workDir, "out");

  try {
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(inputPath, inputBuffer);

    await runCommand("libreoffice", [
      "--headless",
      "--nologo",
      "--nofirststartwizard",
      "--convert-to",
      "pdf",
      "--outdir",
      outputDir,
      inputPath
    ]);

    const pdfPath = path.join(outputDir, "input.pdf");
    await fs.stat(pdfPath);

    const imagePrefix = path.join(outputDir, "page");
    await runCommand("pdftoppm", ["-png", "-r", String(RENDER_DPI), pdfPath, imagePrefix]);

    const imageFiles = (await fs.readdir(outputDir))
      .filter((name) => /^page-\d+\.png$/i.test(name))
      .sort((a, b) => Number(a.match(/\d+/)?.[0] || 0) - Number(b.match(/\d+/)?.[0] || 0))
      .slice(0, limit);

    const images = [];
    for (const [index, imageName] of imageFiles.entries()) {
      const bytes = await fs.readFile(path.join(outputDir, imageName));
      images.push({
        index: index + 1,
        sourcePage: extension === ".docx" ? index + 1 : null,
        sourceSlide: extension === ".pptx" ? index + 1 : null,
        sourceSheet: extension === ".xlsx" ? `rendered-page-${index + 1}` : null,
        fileName: imageName,
        contentType: "image/png",
        base64: bytes.toString("base64")
      });
    }

    if (images.length === 0) {
      throw new Error("LibreOffice conversion completed but no PNG pages were produced.");
    }

    return {
      status: "Completed",
      sourceFileName: fileName,
      renderedCount: images.length,
      images
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      jsonResponse(res, 200, {
        status: "Healthy",
        renderer: "cari-office-renderer",
        libreOffice: true,
        maxFileBytes: MAX_FILE_BYTES,
        maxPages: MAX_PAGES
      });
      return;
    }

    if (req.method === "POST" && req.url === "/render") {
      assertAuthorized(req);
      const body = await readRequestJson(req);
      const result = await renderOfficeToImages(body);
      jsonResponse(res, 200, result);
      return;
    }

    jsonResponse(res, 404, { error: "Not found" });
  } catch (error) {
    jsonResponse(res, error.statusCode || 500, {
      status: "Failed",
      error: error.message || "Office rendering failed.",
      stderr: error.stderr ? String(error.stderr).slice(0, 2000) : undefined
    });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`CARI office renderer listening on ${PORT}`);
});
