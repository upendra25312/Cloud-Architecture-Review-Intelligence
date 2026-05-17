"use client";

import { useEffect, useRef, useState } from "react";
import {
  deleteArbFile,
  fetchArbAgentStatus,
  fetchArbEvidence,
  fetchArbExports,
  fetchArbExtractionStatus,
  fetchArbRequirements,
  fetchArbReview,
  fetchArbUploads,
  runArbAgentReview,
  startArbExtraction,
  uploadArbFiles,
} from "@/arb/api";
import { getArbReviewSteps } from "@/arb/routes";
import { getArbStepHref } from "@/arb/routes";
import { ENABLED_AUTH_PROVIDERS, buildLoginUrl } from "@/lib/review-cloud";
import { trackArbEvent } from "@/lib/telemetry";
import type {
  ArbExtractionStatus,
  ArbReviewSummary,
  ArbUploadedFile,
} from "@/arb/types";
import { ArbReviewShell } from "@/components/arb/review-shell";
import { EvidenceGuidancePanel } from "@/components/arb/evidence-guidance";
import {
  SUPPORTED_ARB_SOW_EXTENSIONS,
  SUPPORTED_ARB_UPLOAD_EXTENSIONS,
} from "@/components/arb/upload-extensions";
import styles from "./arb-upload-page.module.css";

// ── Constants ──────────────────────────────────────────────────────────────
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_TOTAL_SIZE = 100 * 1024 * 1024;

const CATEGORY_LABELS: Record<string, string> = {
  sow: "Statement of Work",
  design_doc: "Design Document",
  diagram: "Diagram",
  security_note: "Security Note",
  cost_assumptions: "Cost Assumptions",
  dr_ha_note: "DR / HA Note",
  ops_monitoring_note: "Operations / Monitoring",
  supporting_artifact: "Supporting Artifact",
};

// ── Helpers ────────────────────────────────────────────────────────────────
function formatCategory(category: string): string {
  return CATEGORY_LABELS[category] ?? category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${Math.max(1, bytes)} B`;
}

function formatEvidenceCategoryLabel(value: string) {
  switch (value) {
    case "sow": return "Statement of Work / scope";
    case "design_doc": return "Architecture design document";
    case "diagram": return "Architecture diagram";
    case "security_note": return "Security notes";
    case "cost_assumptions": return "Cost assumptions";
    case "dr_ha_note": return "HA/DR notes";
    case "ops_monitoring_note": return "Operations and monitoring notes";
    default: return value.replace(/_/g, " ");
  }
}

// ── SVG icons ──────────────────────────────────────────────────────────────
const ICON_DOC = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M4 4a2 2 0 0 1 2-2h4.586a1 1 0 0 1 .707.293l4.414 4.414a1 1 0 0 1 .293.707V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
    <path d="M10 2v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M8 13l2-2 2 2M10 11v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const ICON_ZIP = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M4 5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
    <path d="M8 3v14M8 6h2M8 9h2M8 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

// ── Component ──────────────────────────────────────────────────────────────
export function ArbUploadPage({ reviewId }: { reviewId: string }) {
  const [review, setReview] = useState<ArbReviewSummary | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<ArbUploadedFile[]>([]);
  const [extractionStatus, setExtractionStatus] = useState<ArbExtractionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [confidentialityConfirmed, setConfidentialityConfirmed] = useState(false);
  const [uploadSaving, setUploadSaving] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadDropActive, setUploadDropActive] = useState(false);
  const [extractionStarting, setExtractionStarting] = useState(false);
  const [extractionStatusRefreshing, setExtractionStatusRefreshing] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [deleteFileError, setDeleteFileError] = useState<string | null>(null);

  const [agentRunning, setAgentRunning] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [agentCompleted, setAgentCompleted] = useState(false);
  const [agentStatusMessage, setAgentStatusMessage] = useState<string | null>(null);

  const [timerNow, setTimerNow] = useState(() => Date.now());

  // High-water mark prevents progress bar from going backwards across polls
  const epPctHighWater = useRef(0);
  const epPctPrevJobId = useRef<string | undefined>(undefined);
  // Local start time — set when the user clicks "Start analysis" on this page.
  // Used as a floor so elapsed doesn't reset if the backend resets lastStartedAt on retry.
  const epLocalStartedAt = useRef<number | null>(null);

  const authRequired = error?.includes("Sign in is required") ?? false;

  // ── Data fetching ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [reviewRes, uploadsRes, agentStatusRes] = await Promise.all([
          fetchArbReview(reviewId),
          fetchArbUploads(reviewId),
          fetchArbAgentStatus(reviewId).catch(() => null),
        ]);

        if (!cancelled) {
          setReview(reviewRes);
          setUploadedFiles(uploadsRes.files);
          setExtractionStatus(uploadsRes.extraction ?? null);

          if (agentStatusRes?.status === "running") {
            setAgentRunning(true);
            setAgentCompleted(false);
            setAgentStatusMessage(agentStatusRes.message || "Assessment is in progress.");
          } else if (agentStatusRes?.status === "completed") {
            setAgentRunning(false);
            setAgentCompleted(true);
            setAgentStatusMessage(
              `Assessment complete${agentStatusRes.findingsCount != null ? ` — ${agentStatusRes.findingsCount} findings generated` : ""}.`
            );
          } else if (agentStatusRes?.status === "failed") {
            setAgentRunning(false);
            setAgentError(agentStatusRes.error || "Assessment failed.");
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load the review.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [reviewId]);

  // ── Poll extraction status while running ───────────────────────────────
  useEffect(() => {
    if (!extractionStatus) return;
    const interval = extractionStatus.visualExtractionErrors?.length ? 5000 : 15000;
    const id = window.setInterval(() => void refreshExtractionStatus(), interval);
    return () => window.clearInterval(id);
  }, [extractionStatus?.jobId, extractionStatus?.state, extractionStatus?.visualExtractionErrors?.length, reviewId]);

  // ── Poll agent status while running ───────────────────────────────────
  useEffect(() => {
    if (!agentRunning) return;
    let cancelled = false;
    const id = window.setInterval(() => {
      void (async () => {
        const status = await fetchArbAgentStatus(reviewId).catch(() => null);
        if (cancelled || !status) return;
        if (status.status === "completed") {
          setAgentRunning(false);
          setAgentCompleted(true);
          setAgentStatusMessage(
            `Assessment complete${status.findingsCount != null ? ` — ${status.findingsCount} findings generated` : ""}.`
          );
          window.clearInterval(id);
        } else if (status.status === "failed") {
          setAgentRunning(false);
          setAgentError(status.error || "Assessment failed.");
          window.clearInterval(id);
        } else if (status.status === "running") {
          setAgentStatusMessage(status.message || "Assessment is in progress.");
        }
      })();
    }, 5000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [agentRunning, reviewId]);

  // ── Timer tick for elapsed display ────────────────────────────────────
  useEffect(() => {
    const extractionRunning = extractionStatus?.state === "Running" || extractionStarting;
    if (!extractionRunning && !agentRunning) return;
    const id = window.setInterval(() => setTimerNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [extractionStatus?.state, extractionStarting, agentRunning]);

  // ── Reset high-water mark and local start time only when job changes ──
  useEffect(() => {
    const prev = epPctPrevJobId.current;
    const curr = extractionStatus?.jobId;
    if (prev && curr && prev !== curr) {
      epPctHighWater.current = 0;
      epLocalStartedAt.current = null;
    }
    epPctPrevJobId.current = curr;
  }, [extractionStatus?.jobId]);

  // ── Handlers ──────────────────────────────────────────────────────────
  async function handleFileUpload(fileList: FileList | null, logicalCategory?: string) {
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    const oversized = files.filter((f) => f.size > MAX_FILE_SIZE);

    if (oversized.length > 0) {
      setUploadError(
        `One or more files exceed the per-file limit of ${formatFileSize(MAX_FILE_SIZE)}. Remove ${oversized.length} file${oversized.length === 1 ? "" : "s"} and try again.`
      );
      return;
    }

    if (totalBytes > MAX_TOTAL_SIZE) {
      setUploadError(
        `Selected files total ${formatFileSize(totalBytes)}, which exceeds the ${formatFileSize(MAX_TOTAL_SIZE)} package limit. Upload fewer files or split the package.`
      );
      return;
    }

    try {
      setUploadSaving(true);
      setUploadError(null);

      const payload = await uploadArbFiles({ reviewId, files, logicalCategory });
      setUploadedFiles(payload.files);
      setReview((prev) =>
        prev
          ? { ...prev, evidenceReadinessState: payload.evidenceReadinessState as ArbReviewSummary["evidenceReadinessState"], documentCount: payload.files.length }
          : prev
      );
      trackArbEvent({ name: "arb_document_uploaded", properties: { reviewId, fileCount: String(payload.files.length) } });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Unable to upload files.");
    } finally {
      setUploadSaving(false);
    }
  }

  async function handleDeleteFile(fileId: string) {
    try {
      setDeletingFileId(fileId);
      setDeleteFileError(null);
      const result = await deleteArbFile(reviewId, fileId);
      setUploadedFiles((prev) => prev.filter((f) => f.fileId !== fileId));
      if (result.remainingCount === 0) setExtractionStatus(null);
    } catch (err) {
      setDeleteFileError(err instanceof Error ? err.message : "Unable to delete the file.");
    } finally {
      setDeletingFileId(null);
    }
  }

  async function refreshExtractionStatus() {
    try {
      setExtractionStatusRefreshing(true);
      const next = await fetchArbExtractionStatus(reviewId);
      setExtractionStatus(next);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Unable to refresh extraction status.");
    } finally {
      setExtractionStatusRefreshing(false);
    }
  }

  async function handleRunAgentReview() {
    try {
      setAgentRunning(true);
      setAgentError(null);
      setAgentCompleted(false);
      setAgentStatusMessage("Assessment is in progress.");
      await runArbAgentReview(reviewId);
      setAgentCompleted(true);
      setAgentStatusMessage("Assessment complete. Opening findings.");
      trackArbEvent({ name: "arb_findings_generated", properties: { reviewId } });
      window.location.assign(getArbStepHref(reviewId, "findings"));
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : "Unable to run assessment.");
    } finally {
      setAgentRunning(false);
    }
  }

  // ── Progress bar computation ───────────────────────────────────────────
  const epSteps = [
    { label: "Text", value: extractionStatus?.textExtractionStatus },
    { label: "Tables", value: extractionStatus?.tableExtractionStatus },
    { label: "Figures", value: extractionStatus?.figureExtractionStatus },
    { label: "Visual analysis", value: extractionStatus?.visualAnalysisStatus },
  ];
  const epIsDone = (v?: string) => v === "Completed" || v === "CompletedWithIssues";
  const epIsActive = (v?: string) => v === "Running";
  const epDoneCount = epSteps.filter((s) => epIsDone(s.value)).length;
  const epActiveCount = epSteps.filter((s) => epIsActive(s.value)).length;
  const epFileStatuses = extractionStatus?.fileStatuses ?? [];
  const epTotalFiles = epFileStatuses.length;
  const epDoneFiles = epFileStatuses.filter(
    (f) => f.extractionStatus === "Completed" || f.extractionStatus === "CompletedWithIssues" || f.extractionStatus === "Failed"
  ).length;
  const epPctFromFiles = epTotalFiles > 0 ? Math.round((epDoneFiles / epTotalFiles) * 45) : 0;
  const epPctFromStages = epDoneCount * 25 + epActiveCount * 12;
  const usingFileFallback = epPctFromStages === 0;
  const elapsedSec = (() => {
    const serverMs = extractionStatus?.lastStartedAt
      ? new Date(extractionStatus.lastStartedAt).getTime()
      : null;
    const localMs = epLocalStartedAt.current;
    // Use the earliest known start — whichever is smaller means "running longer"
    const effectiveStart =
      localMs !== null && serverMs !== null
        ? Math.min(localMs, serverMs)
        : (localMs ?? serverMs);
    return effectiveStart !== null
      ? Math.max(0, Math.floor((timerNow - effectiveStart) / 1000))
      : 0;
  })();
  const allFilesDone = epTotalFiles > 0 && epDoneFiles === epTotalFiles;
  const epPctTimeCrawl = usingFileFallback && allFilesDone
    ? Math.min(88, epPctFromFiles + Math.floor(elapsedSec / 12))
    : 0;
  const epPctRaw = extractionStatus ? Math.min(99, Math.max(epPctFromStages, epPctFromFiles, epPctTimeCrawl)) : 0;
  epPctHighWater.current = Math.max(epPctHighWater.current, epPctRaw);
  const epPct = epPctHighWater.current;

  let epElapsedLabel = "";
  let epEtaLabel = "";
  if (elapsedSec > 0) {
    const mins = Math.floor(elapsedSec / 60);
    const secs = elapsedSec % 60;
    epElapsedLabel = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    if (!usingFileFallback && epPct > 5) {
      const totalEst = (elapsedSec / epPct) * 100;
      const rem = Math.max(0, totalEst - elapsedSec);
      const remMins = Math.round(rem / 60);
      epEtaLabel = remMins <= 1 ? "< 1 min remaining" : `~${remMins} min remaining`;
    }
  }

  // ── Derived state ──────────────────────────────────────────────────────
  const supportedUploads = uploadedFiles.filter((f) => f.supportedTextExtraction);
  const unsupportedUploads = uploadedFiles.filter((f) => !f.supportedTextExtraction);
  const readinessChecks = [
    { label: "At least one document has been uploaded", complete: supportedUploads.length > 0 },
    { label: "Confidentiality and handling note is acknowledged", complete: confidentialityConfirmed },
  ];
  const canStartExtraction = readinessChecks.every((c) => c.complete) && !uploadSaving;
  const extractionIsRunning = extractionStarting || extractionStatus?.state === "Running" || extractionStatus?.state === "Queued";
  const extractionPreview =
    supportedUploads.length === 0
      ? [
          "Scope and requirements from your SOW or design narrative",
          "Architecture topology, services, network, and security posture",
          "Cost, support, and operational readiness signals",
        ]
      : Array.from(new Set(supportedUploads.map((f) => f.logicalCategory))).map(
          (cat) => `Assessment engine will analyze: ${formatCategory(cat)}`
        );

  const shellReview: ArbReviewSummary = review ?? {
    reviewId,
    projectName: "Loading review…",
    customerName: "",
    workflowState: "Draft",
    evidenceReadinessState: "Ready with Gaps",
    overallScore: null,
    recommendation: "Loading",
    assignedReviewer: null,
  };

  // ── Render ─────────────────────────────────────────────────────────────
  function renderContent() {
    return (
      <div className="arb-page-stack">
        {/* ── Stat cards ── */}
        <div className="arb-summary-grid">
          <article className="future-card">
            <p className="board-card-subtitle">Files uploaded</p>
            <strong>{supportedUploads.length}</strong>
            <p className="section-copy">Text-based files (PDF, Word, Markdown) ready for automated assessment.</p>
          </article>
          <article className="future-card">
            <p className="board-card-subtitle">Visual / binary files</p>
            <strong>
              {(extractionStatus?.visualEvidenceCount ?? 0) > 0
                ? extractionStatus!.visualEvidenceCount
                : unsupportedUploads.length}
            </strong>
            <p className="section-copy">
              {(extractionStatus?.visualEvidenceCount ?? 0) > 0
                ? `${extractionStatus!.visualEvidenceCount} visual evidence items extracted — includes diagrams and images inside uploaded documents.`
                : "Images, Draw.io, Visio, spreadsheets, and architecture diagrams embedded in PDFs are extracted for review evidence."}
            </p>
          </article>
          <article className="future-card">
            <p className="board-card-subtitle">Ready to analyze</p>
            <strong>{canStartExtraction ? "Yes" : "Not yet"}</strong>
            <p className="section-copy">Upload at least one document and confirm it can be used for review.</p>
          </article>
          <article className="future-card">
            <p className="board-card-subtitle">Analysis status</p>
            <strong>{extractionStatus?.state ?? "Not started"}</strong>
            <p className="section-copy">
              {extractionStatus?.completedSteps?.length
                ? `${extractionStatus.completedSteps.length} steps complete`
                : "Start analysis to extract requirements and evidence."}
            </p>
          </article>
        </div>

        <EvidenceGuidancePanel />

        {/* ── Drop zone ── */}
        <section
          id="upload-documents"
          className={`surface-panel arb-upload-dropzone${uploadDropActive ? " arb-upload-dropzone-active" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setUploadDropActive(true); }}
          onDragLeave={() => setUploadDropActive(false)}
          onDrop={(e) => { e.preventDefault(); setUploadDropActive(false); void handleFileUpload(e.dataTransfer.files); }}
        >
          <div className="board-card-head">
            <div className="board-card-head-copy">
              <p className="board-card-subtitle">Upload documents</p>
              <h2 className="section-title">Add SOW and design evidence</h2>
            </div>
          </div>

          <p className="section-copy">
            Upload design evidence to run analysis. Upload the SOW or scope document before human approval or record a reviewer waiver.
          </p>

          <div className="pill-row">
            {SUPPORTED_ARB_UPLOAD_EXTENSIONS.map((ext) => (
              <span key={ext} className="pill">{ext}</span>
            ))}
          </div>

          <div className="button-row" style={{ gap: 12, flexWrap: "wrap" }}>
            <label htmlFor={`arb-upload-sow-${reviewId}`} className="arb-upload-label">
              <span className="arb-upload-icon">{ICON_DOC}</span>
              <span>Upload SOW / Scope</span>
              <input
                id={`arb-upload-sow-${reviewId}`}
                className="field-input"
                aria-label="Upload statement of work or scope documents"
                type="file"
                multiple
                accept={SUPPORTED_ARB_SOW_EXTENSIONS.join(",")}
                style={{ display: "none" }}
                onChange={(e) => { void handleFileUpload(e.target.files, "sow"); e.currentTarget.value = ""; }}
              />
            </label>
            <label htmlFor={`arb-upload-design-${reviewId}`} className="arb-upload-label">
              <span className="arb-upload-icon">{ICON_DOC}</span>
              <span>Upload Design Documents</span>
              <input
                id={`arb-upload-design-${reviewId}`}
                className="field-input"
                aria-label="Upload architecture design documents and diagrams"
                type="file"
                multiple
                accept={SUPPORTED_ARB_UPLOAD_EXTENSIONS.join(",")}
                style={{ display: "none" }}
                onChange={(e) => { void handleFileUpload(e.target.files, "design_doc"); e.currentTarget.value = ""; }}
              />
            </label>
            <label htmlFor={`arb-upload-zip-${reviewId}`} className="arb-upload-label">
              <span className="arb-upload-icon">{ICON_ZIP}</span>
              <span>Upload Evidence ZIP</span>
              <input
                id={`arb-upload-zip-${reviewId}`}
                className="field-input"
                aria-label="Upload evidence ZIP package"
                type="file"
                multiple
                accept=".zip"
                style={{ display: "none" }}
                onChange={(e) => { void handleFileUpload(e.target.files, "evidence_package"); e.currentTarget.value = ""; }}
              />
            </label>
          </div>

          <div className="arb-upload-helper-text" style={{ marginTop: "0.5rem", marginBottom: "0.5rem" }}>
            Accepted: PDF, DOCX, PPTX, XLSX, CSV, PNG/JPG/JPEG/GIF/WEBP/BMP/TIFF, Draw.io, VSDX, Mermaid/PlantUML, Markdown, text, JSON, XML, YAML, IaC/config, scripts, API schemas, notebooks, and ZIP evidence packages.
            Max per file: {formatFileSize(MAX_FILE_SIZE)} · Max total upload: {formatFileSize(MAX_TOTAL_SIZE)}.
            ZIP packages are unpacked and analyzed file-by-file. Unsupported or unsafe files are skipped with a visible reason.
          </div>

          {uploadSaving ? (
            <p className="arb-upload-status arb-upload-status-progress">Uploading files…</p>
          ) : uploadedFiles.length > 0 && !uploadError ? (
            <p className="arb-upload-status arb-upload-status-done">
              {uploadedFiles.length} file{uploadedFiles.length !== 1 ? "s" : ""} uploaded — ready to start analysis
            </p>
          ) : null}
          {uploadError ? <p className="arb-upload-error">{uploadError}</p> : null}
        </section>

        {/* ── Uploaded files list ── */}
        <section className="surface-panel">
          <div className="board-card-head">
            <div className="board-card-head-copy">
              <p className="board-card-subtitle">Uploaded files</p>
              <h2 className="section-title">Documents in this review</h2>
            </div>
          </div>
          {uploadedFiles.length === 0 ? (
            <p className="section-copy">
              No files uploaded yet. Add your SOW, architecture design, diagrams, or workbook above to get started.
            </p>
          ) : (
            <div className="arb-upload-file-list">
              {uploadedFiles.map((upload) => {
                const isExtracted = upload.extractionStatus === "Completed" || upload.extractionStatus === "CompletedWithIssues";
                const visCount = typeof upload.visualEvidenceCount === "number" && upload.visualEvidenceCount > 0 ? upload.visualEvidenceCount : null;
                return (
                  <article key={upload.fileId} className="trace-card arb-upload-file">
                    <div className="arb-upload-file-copy">
                      <strong>{upload.fileName}</strong>
                      <p className="microcopy">
                        {formatCategory(upload.logicalCategory)} · {formatFileSize(upload.sizeBytes)} ·{" "}
                        <span className={upload.extractionStatus === "Completed" ? "arb-status-done" : undefined}>
                          {upload.extractionStatus}
                        </span>
                        {typeof upload.packageChildCount === "number" ? ` · ${upload.packageChildCount} extracted` : ""}
                        {typeof upload.packageSkippedCount === "number" && upload.packageSkippedCount > 0 ? ` · ${upload.packageSkippedCount} skipped` : ""}
                      </p>
                      {upload.parentPackageFileName ? (
                        <p className="microcopy">From ZIP: {upload.parentPackageFileName}</p>
                      ) : null}
                      {upload.packageWarnings?.length ? (
                        <p className="microcopy" style={{ color: "#B45309" }}>
                          ZIP warnings: {upload.packageWarnings.join(" | ")}
                        </p>
                      ) : null}
                      {isExtracted ? (
                        <div className="arb-file-coverage-row" aria-label="What the agent analyzed from this file">
                          {upload.supportedTextExtraction ? (
                            <span className="arb-file-coverage-tag arb-file-coverage-tag-done">Text read</span>
                          ) : null}
                          {visCount !== null ? (
                            <span className="arb-file-coverage-tag arb-file-coverage-tag-done">
                              {visCount} {visCount === 1 ? "image" : "images"} analyzed
                            </span>
                          ) : null}
                          {!upload.supportedTextExtraction && visCount === null ? (
                            <span className="arb-file-coverage-tag arb-file-coverage-tag-meta">Content processed</span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="arb-upload-file-actions">
                      <span className="pill">{upload.supportedTextExtraction ? "Supported" : "Limited"}</span>
                      <button
                        type="button"
                        className="arb-delete-file-btn"
                        aria-label={`Delete ${upload.fileName}`}
                        disabled={deletingFileId === upload.fileId}
                        onClick={() => void handleDeleteFile(upload.fileId)}
                      >
                        {deletingFileId === upload.fileId ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {deleteFileError ? <p className="arb-upload-error">{deleteFileError}</p> : null}
        </section>

        {/* ── Readiness + Start analysis CTA ── */}
        <section id="run-automated-analysis" className="surface-panel arb-action-panel">
          <label className="arb-inline-check">
            <input
              aria-label="Confirm uploaded files can be used for review extraction"
              type="checkbox"
              checked={confidentialityConfirmed}
              onChange={(e) => setConfidentialityConfirmed(e.target.checked)}
            />
            <span>I confirm the uploaded files can be used for review extraction</span>
          </label>
          <ul className="arb-checklist arb-checklist-compact">
            {readinessChecks.map((check) => (
              <li key={check.label} className={check.complete ? "arb-check-done" : "arb-check-pending"}>
                {check.complete ? "✓" : "○"} {check.label}
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="arb-cta-btn"
            disabled={!canStartExtraction || extractionIsRunning}
            onClick={async () => {
              try {
                epLocalStartedAt.current = Date.now();
                setExtractionStarting(true);
                setUploadError(null);
                const next = await startArbExtraction(reviewId);
                setExtractionStatus(next);
                trackArbEvent({
                  name: "arb_extraction_completed",
                  properties: {
                    reviewId,
                    state: next.state,
                    evidenceReadiness: next.evidenceReadinessState,
                    extractionConfidencePercent: String(next.extractionConfidencePercent),
                  },
                });
                const [nextReqs, nextEvidence, nextExports] = await Promise.all([
                  fetchArbRequirements(reviewId),
                  fetchArbEvidence(reviewId),
                  fetchArbExports(reviewId),
                ]);
                // Update review workflow state
                setReview((prev) =>
                  prev
                    ? { ...prev, workflowState: "Review In Progress", evidenceReadinessState: next.evidenceReadinessState as ArbReviewSummary["evidenceReadinessState"] }
                    : prev
                );
                // Side-effect: prefetch reqs/evidence/exports (consumed by downstream pages)
                void nextReqs; void nextEvidence; void nextExports;
              } catch (err) {
                setUploadError(err instanceof Error ? err.message : "Unable to start analysis. Please try again.");
              } finally {
                setExtractionStarting(false);
              }
            }}
          >
            {extractionStarting ? (
              <><span className="arb-spinner" aria-hidden="true" /> Starting analysis…</>
            ) : extractionStatus?.state === "Running" ? (
              <><span className="arb-spinner" aria-hidden="true" /> Analysis in progress…</>
            ) : extractionStatus?.state === "Queued" ? (
              <><span className="arb-spinner" aria-hidden="true" /> Queued — analysis pending…</>
            ) : extractionStatus?.state === "Failed" ? (
              "Retry analysis →"
            ) : (
              "Start analysis →"
            )}
          </button>

          <p className="microcopy">
            Typical package: 25–35 page design doc, 10–12 page SOW, and a ZIP with 10–15 supporting files. Small uploads may finish sooner; full packages usually take 8–20 minutes.
          </p>

          {/* Progress panel */}
          {extractionIsRunning ? (
            <div className="arb-upload-status arb-upload-status-progress arb-ep-panel">
              <div className="arb-ep-header">
                <span className="arb-ep-title">
                  {usingFileFallback && epDoneFiles === epTotalFiles && epTotalFiles > 0
                    ? "Preparing deep analysis…"
                    : "Analyzing documents…"}
                </span>
                <span className="arb-ep-pct">{epPct}%</span>
              </div>
              <div className="arb-ep-bar-track" role="progressbar" aria-valuenow={epPct} aria-valuemin={0} aria-valuemax={100}>
                <div className="arb-ep-bar-fill" style={{ width: `${epPct > 0 ? epPct : 2}%` }} />
              </div>
              <div className="arb-ep-steps">
                {epSteps.map((st) => {
                  const done = epIsDone(st.value);
                  const active = epIsActive(st.value);
                  return (
                    <span key={st.label} className={`arb-ep-step${done ? " arb-ep-step-done" : active ? " arb-ep-step-active" : ""}`}>
                      <span className="arb-ep-step-icon" aria-hidden="true">{done ? "✓" : active ? "⟳" : "○"}</span>
                      {st.label}
                    </span>
                  );
                })}
              </div>
              <div className="arb-ep-footer">
                {epTotalFiles > 0 ? (
                  <span>{epDoneFiles} of {epTotalFiles} {epTotalFiles === 1 ? "file" : "files"} processed</span>
                ) : null}
                {epElapsedLabel ? (
                  <span>Running for {epElapsedLabel}{epEtaLabel ? ` · ${epEtaLabel}` : ""}</span>
                ) : (
                  <span>Do not close this page — results will appear automatically.</span>
                )}
              </div>
            </div>
          ) : extractionStatus?.state === "Failed" ? (
            <p className="arb-upload-error">
              Analysis failed. Check that your files are not password-protected and try again.
            </p>
          ) : extractionStatus ? (
            <div className="arb-upload-status arb-upload-status-progress" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <span>
                  Status: {extractionStatus.state} · Evidence readiness: {extractionStatus.evidenceReadinessState} · Extraction confidence: {extractionStatus.extractionConfidencePercent}%
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  style={{ minHeight: 32, padding: "6px 12px" }}
                  disabled={extractionStatusRefreshing}
                  onClick={() => void refreshExtractionStatus()}
                >
                  {extractionStatusRefreshing ? "Refreshing…" : "Refresh status"}
                </button>
              </span>
              {extractionStatus.readinessNotes ? <span>{extractionStatus.readinessNotes}</span> : null}
              {extractionStatus.missingRequiredItems?.length ? (
                <span>
                  Missing required artifact for final sign-off:{" "}
                  {extractionStatus.missingRequiredItems.map(formatEvidenceCategoryLabel).join(", ")}.
                </span>
              ) : null}
              {extractionStatus.missingRecommendedItems?.length ? (
                <span>
                  Recommended supporting artifacts still missing:{" "}
                  {extractionStatus.missingRecommendedItems.map(formatEvidenceCategoryLabel).join(", ")}.
                </span>
              ) : null}
              {extractionStatus.visualExtractionErrors?.length ? (
                <span style={{ color: "#B45309" }}>
                  {(extractionStatus.visualEvidenceCount ?? 0) > 0
                    ? "Visual evidence was captured, but some automated visual summaries need retry: "
                    : "Visual evidence extraction failed: "}
                  {extractionStatus.visualExtractionErrors.join(" | ")}. The review may not include all diagram-derived architecture findings until analysis is rerun.
                </span>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* ── Run Assessment CTA (post-extraction) ── */}
        {extractionStatus?.state?.startsWith("Completed") ? (
          <section className="surface-panel arb-action-panel arb-action-panel-highlight">
            <p className="arb-action-panel-label">Extraction complete — ready for framework assessment</p>
            <p className="section-copy">
              Run the automated assessment to produce structured findings, a weighted scorecard, and a derived recommendation.
              Every evidence item is validated against WAF, CAF, ALZ, HA/DR, Security, Networking, and Monitoring.
              Typically takes 10–15 minutes for a full evidence package.
            </p>
            <button
              type="button"
              className="arb-cta-btn"
              disabled={agentRunning}
              onClick={() => {
                if (agentCompleted) { window.location.assign(getArbStepHref(reviewId, "findings")); return; }
                void handleRunAgentReview();
              }}
            >
              {agentRunning ? (
                <><span className="arb-spinner" aria-hidden="true" /> Running assessment… typically 10–15 minutes</>
              ) : agentCompleted ? (
                "View findings →"
              ) : (
                "Run assessment →"
              )}
            </button>
            {agentRunning ? (
              <p className="arb-upload-status arb-upload-status-progress">
                {agentStatusMessage || "Validating your documents against Security, Networking, Reliability, Cost, Operations, Evidence, Governance, and Delivery domains. Do not close this page."}
              </p>
            ) : null}
            {agentCompleted ? (
              <p className="arb-upload-status arb-upload-status-done">
                Assessment complete — findings and scorecard updated.{" "}
                <a href={getArbStepHref(reviewId, "findings")} className="arb-inline-link">View findings →</a>
              </p>
            ) : null}
            {agentError ? <p className="arb-upload-error">{agentError}</p> : null}
          </section>
        ) : null}

        {/* ── Framework coverage sidecar ── */}
        <div className="arb-upload-layout">
          <div className="arb-sidecar-stack">
            <section className="future-card arb-summary-card">
              <p className="board-card-subtitle">Framework coverage</p>
              <ul className="arb-checklist">
                {extractionPreview.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.fullWidthShell}>
      <ArbReviewShell
        review={shellReview}
        steps={getArbReviewSteps(reviewId)}
        activeStep="upload"
        title="Upload Review Package"
        description="Stage source documents, confirm package readiness, and run the automated assessment."
        reviewSummary={null}
      >
        {loading ? (
          <div className="arb-loading-skeleton">
            <div className="arb-skeleton-bar arb-skeleton-bar--wide" />
            <div className="arb-skeleton-bar arb-skeleton-bar--medium" />
            <div className="arb-skeleton-bar arb-skeleton-bar--narrow" />
            <div className="arb-skeleton-bar arb-skeleton-bar--wide" />
            <div className="arb-skeleton-bar arb-skeleton-bar--medium" />
          </div>
        ) : error ? (
          <div>
            <p>{error}</p>
            {authRequired ? (
              <div className="review-command-bar">
                <p>Sign in to open Azure-backed uploads, findings, exports, and decision state for this review.</p>
                <div className="review-command-actions">
                  {ENABLED_AUTH_PROVIDERS.map((provider, index) => (
                    <a
                      key={provider.id}
                      href={buildLoginUrl(provider.id)}
                      className={index === 0 ? "primary-button" : "secondary-button"}
                    >
                      Continue with {provider.label}
                    </a>
                  ))}
                </div>
              </div>
            ) : (
              <p>This feature is temporarily unavailable. Please try again later.</p>
            )}
          </div>
        ) : (
          renderContent()
        )}
      </ArbReviewShell>
    </div>
  );
}
