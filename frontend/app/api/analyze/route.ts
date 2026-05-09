import { AzureKeyCredential, DocumentAnalysisClient } from "@azure/ai-form-recognizer";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

const ANALYZE_SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/bmp",
  "image/heif",
  "text/plain",
  "text/html",
]);

const LEGACY_POWERPOINT_MIME_TYPES = new Set([
  "application/vnd.ms-powerpoint",
  "application/mspowerpoint",
  "application/powerpoint",
]);

function getFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";
}

function buildSummary(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "No readable text was extracted from the file.";
  if (clean.length <= 600) return clean;

  const sentences = clean.split(/(?<=[.!?])\s+/);
  let summary = "";
  for (const sentence of sentences) {
    if ((summary + " " + sentence).trim().length > 600) break;
    summary = (summary + " " + sentence).trim();
  }

  return summary || clean.slice(0, 600);
}

export async function POST(request: Request) {
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

  if (!endpoint || !key) {
    return NextResponse.json(
      { error: "Document Intelligence environment variables are not configured." },
      { status: 500 },
    );
  }

  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const now = Date.now();
  const entry = rateLimitMap.get(ip) ?? { count: 0, resetAt: now + 60_000 };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 60_000; }
  entry.count++;
  rateLimitMap.set(ip, entry);
  if (entry.count > 5) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((entry.resetAt - now) / 1000)) } },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Please upload a file." }, { status: 400 });
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `File too large. Maximum allowed size is 50 MB. Received: ${(file.size / 1024 / 1024).toFixed(1)} MB.` },
        { status: 413 },
      );
    }

    const fileExtension = getFileExtension(file.name);

    if (fileExtension === ".ppt" || LEGACY_POWERPOINT_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Legacy .ppt files are not supported for review summary extraction. Convert the deck to .pptx and try again." },
        { status: 415 },
      );
    }

    if (file.type && !ANALYZE_SUPPORTED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Please upload a PDF, DOCX, PPTX, XLSX, text file, HTML file, or supported image.` },
        { status: 415 },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key));

    const poller = await client.beginAnalyzeDocument("prebuilt-read", bytes);

    const result = await poller.pollUntilDone();
    const extractedText = (result as { content?: string } | undefined)?.content ?? "";

    return NextResponse.json({
      summary: buildSummary(extractedText),
      extractedTextLength: extractedText.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected analysis error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
