"use client";

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useRef, useState } from "react";
import { createArbReview, listArbReviews, uploadArbFiles, deleteArbReview } from "@/arb/api";
import { getArbStepHref } from "@/arb/routes";
import type { ArbReviewSummary } from "@/arb/types";
import { useAuthSession } from "@/components/auth-session-provider";
import { SUPPORTED_ARB_UPLOAD_EXTENSIONS } from "@/components/arb/upload-extensions";
import { ENABLED_AUTH_PROVIDERS, buildLoginUrl } from "@/lib/review-cloud";
import { trackArbEvent } from "@/lib/telemetry";

type ArbReviewLibraryFocus = "workspace" | "decision";

function getActiveStep(review: ArbReviewSummary): number {
  const s = review.workflowState;
  if (s === "Draft") return 2;
  if (s === "Evidence Ready") return 3;
  if (s === "Review In Progress") return 4;
  if (
    s === "Decision Recorded" ||
    s === "Approved" ||
    s === "Needs Revision" ||
    s === "Rejected"
  ) return 5;
  if (s === "Review Complete" || s === "Closed") return 6;
  return 1;
}

function formatDate(value: string | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getPrimaryHref(review: ArbReviewSummary, focus: ArbReviewLibraryFocus): Route {
  const reviewId = String(review.reviewId ?? "").trim();
  if (!reviewId || reviewId === "undefined" || reviewId === "null") {
    return "/arb" as Route;
  }

  if (focus === "decision") return getArbStepHref(reviewId, "decision");
  const step = getActiveStep(review);
  if (step <= 2) return getArbStepHref(reviewId, "upload", "upload-documents");
  if (step === 3) return getArbStepHref(reviewId, "upload", "run-automated-analysis");
  if (step === 4) return getArbStepHref(reviewId, "findings");
  return getArbStepHref(reviewId, "overview");
}

const MAX_ARB_UPLOAD_FILE_SIZE = 20 * 1024 * 1024;
const MAX_ARB_UPLOAD_TOTAL_SIZE = 100 * 1024 * 1024;

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (bytes >= 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${Math.max(1, bytes)} B`;
}

function hasValidReviewId(review: ArbReviewSummary): boolean {
  const reviewId = String(review.reviewId ?? "").trim();
  return Boolean(reviewId) && reviewId !== "undefined" && reviewId !== "null";
}

function getPrimaryLabel(review: ArbReviewSummary, focus: ArbReviewLibraryFocus) {
  if (focus === "decision") return review.finalDecision ? "Review decision" : "Open decision";
  const step = getActiveStep(review);
  if (step <= 2) return "Upload documents →";
  if (step === 3) return "Run analysis →";
  if (step === 4) return "Resolve findings →";
  if (step === 5) return "Complete sign-off →";
  return "Open reviewed pack →";
}

function getReviewPosture(review: ArbReviewSummary) {
  return review.finalDecision ?? review.recommendation ?? review.workflowState;
}

function getNextStepSummary(review: ArbReviewSummary) {
  const step = getActiveStep(review);
  if (step <= 2) {
    return "Next: upload the architecture package so the assessment can start from real evidence.";
  }
  if (step === 3) {
    return "Next: run analysis and validate the extracted evidence before findings are shared.";
  }
  if (step === 4) {
    return "Next: assign owners and resolve findings that block board-ready sign-off.";
  }
  if (step === 5) {
    return "Next: confirm the recommendation, reviewer rationale, and final decision state.";
  }
  return "Next: open the reviewed pack and export the latest board-ready outputs.";
}

function getEvidenceSummary(review: ArbReviewSummary) {
  const requiredGaps = review.missingRequiredItems?.length ?? 0;
  const recommendedGaps = review.missingRecommendedItems?.length ?? 0;

  if (requiredGaps > 0) {
    return `${requiredGaps} required evidence gap${requiredGaps === 1 ? "" : "s"}`;
  }

  if (recommendedGaps > 0) {
    return `${recommendedGaps} recommended evidence gap${recommendedGaps === 1 ? "" : "s"}`;
  }

  if (review.documentCount && review.documentCount > 0) {
    return `${review.documentCount} document${review.documentCount === 1 ? "" : "s"} staged`;
  }

  return review.evidenceReadinessState;
}

function StatusBadge({ state }: { state: string }) {
  const cls =
    state === "Approved"
      ? "arb-status-badge arb-status-approved"
      : state === "Needs Revision" || state === "Rejected"
      ? "arb-status-badge arb-status-needs-work"
      : state === "Draft"
      ? "arb-status-badge arb-status-draft"
      : "arb-status-badge arb-status-in-progress";
  return <span className={cls}>{state}</span>;
}

export function ArbReviewLibrary(props: { focus?: ArbReviewLibraryFocus }) {
  const { focus = "workspace" } = props;
  const { principal, resolved } = useAuthSession();
  const [reviews, setReviews] = useState<ArbReviewSummary[]>([]);
  const [projectName, setProjectName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadDropActive, setUploadDropActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleDeleteReview(reviewId: string) {
    // First click: show inline confirm
    if (confirmDeleteId !== reviewId) {
      setConfirmDeleteId(reviewId);
      return;
    }
    // Second click (confirmed): execute delete
    setConfirmDeleteId(null);
    setDeletingId(reviewId);
    try {
      await deleteArbReview(reviewId);
      setReviews((prev) => prev.filter((r) => r.reviewId !== reviewId));
    } catch (err) {
      setError("Failed to delete review. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    let active = true;

    if (!resolved) {
      return () => {
        active = false;
      };
    }

    if (!principal) {
      setReviews([]);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    async function load() {
      try {
        const payload = await listArbReviews();
        if (!active) return;
        setReviews(payload.reviews.filter(hasValidReviewId));
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load reviews.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => { active = false; };
  }, [principal, resolved]);

  const filteredReviews = useMemo(() => {
    if (focus === "decision") {
      return [...reviews].sort((a, b) => {
        const aw = a.finalDecision ? 1 : 0;
        const bw = b.finalDecision ? 1 : 0;
        if (aw !== bw) return aw - bw;
        return (b.overallScore ?? -1) - (a.overallScore ?? -1);
      });
    }
    return reviews;
  }, [focus, reviews]);

  async function handleCreateReview() {
    try {
      setSaving(true);
      setError(null);
      const review = await createArbReview({ projectName, customerName });
      trackArbEvent({
        name: "arb_review_started",
        properties: { projectName, customerName: customerName || undefined },
      });
      const uploadHref = getArbStepHref(review.reviewId, "upload", "upload-documents");

      if (selectedFiles.length === 0) {
        window.location.href = uploadHref;
        return;
      }

      try {
        await uploadArbFiles({ reviewId: review.reviewId, files: selectedFiles });
        window.location.href = getArbStepHref(review.reviewId, "upload", "run-automated-analysis");
        return;
      } catch {
        window.location.href = uploadHref;
        return;
      }
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create review.");
    } finally {
      setSaving(false);
    }
  }

  function handleSelectedFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) {
      return;
    }

    const files = Array.from(fileList);
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    const oversizedFiles = files.filter((file) => file.size > MAX_ARB_UPLOAD_FILE_SIZE);

    if (oversizedFiles.length > 0) {
      setSelectedFiles([]);
      setError(
        `One or more selected files exceed the maximum per-file limit of ${formatFileSize(
          MAX_ARB_UPLOAD_FILE_SIZE
        )}. Remove ${oversizedFiles.length} file${oversizedFiles.length === 1 ? "" : "s"} and try again.`
      );
      return;
    }

    if (totalBytes > MAX_ARB_UPLOAD_TOTAL_SIZE) {
      setSelectedFiles([]);
      setError(
        `Selected files total ${formatFileSize(totalBytes)}, which exceeds the ${formatFileSize(
          MAX_ARB_UPLOAD_TOTAL_SIZE
        )} package limit. Reduce the number of files or upload fewer large files.`
      );
      return;
    }

    setSelectedFiles(files);
    setError(null);
  }



  if (loading) {
    return <div className="arb-library-loading"><p>Loading reviews…</p></div>;
  }

  // --- Session diagnostics always visible ---
  if (!principal) {
    return (
      <div className="arb-signin-hero arb-session-diagnostics">
        <img src="/rackspace-icon.jpg" alt="Rackspace Technology" className="arb-signin-mark" />
        <p className="arb-signin-kicker">Architecture review mode</p>
        <h1 className="arb-signin-headline">
          Upload your design documents and get a framework-validated architecture review in minutes.
        </h1>
        {ENABLED_AUTH_PROVIDERS.map((provider, index) => (
          <a
            key={provider.id}
            href={buildLoginUrl(provider.id)}
            className={index === 0 ? "arb-signin-cta" : "arb-signin-cta arb-signin-cta--secondary"}
            style={index > 0 ? { marginTop: 10 } : undefined}
          >
            Sign in with {provider.label} to start →
          </a>
        ))}
        <ul className="arb-signin-bullets">
          <li>PDF, Word, PowerPoint (.pptx), or Markdown — drag and drop your documents</li>
          <li>Automated coverage across WAF · CAF · ALZ · HA/DR · Security · Networking · Monitoring</li>
          <li>Every finding scored 0–100 and linked to a Microsoft Learn source</li>
          <li>Sign in is required to save uploads, findings, exports, and final sign-off</li>
        </ul>

        <div className="arb-signin-workflow-diagram" aria-label="ARB review workflow overview">
          <Image
            src="/arb-workflow.png"
            alt="Review workflow: Evidence Intake → Review Readiness → Findings & Risks → Decisions & Exceptions → Board Pack Export"
            width={900}
            height={315}
            className="arb-signin-workflow-img"
            priority={false}
          />
        </div>

        <div className="arb-preview-card" aria-label="Example review output">
          <div className="arb-preview-header">
            <div>
              <p className="arb-preview-label">Example output</p>
              <p className="arb-preview-project">Contoso Landing Zone Modernization</p>
            </div>
            <span className="arb-preview-approved">Approved</span>
          </div>
          <div className="arb-preview-domains">
            {[
              { label: "Security", score: 84 },
              { label: "Reliability", score: 91 },
              { label: "Cost", score: 72 },
              { label: "Operations", score: 88 },
              { label: "Architecture", score: 78 },
            ].map(({ label, score }) => (
              <div key={label} className="arb-preview-domain-row">
                <span className="arb-preview-domain-label">{label}</span>
                <div className="arb-preview-bar-track" aria-hidden="true">
                  <div className="arb-preview-bar-fill" style={{ width: `${score}%` }} />
                </div>
                <span className="arb-preview-score">{score}</span>
              </div>
            ))}
          </div>
          <p className="arb-preview-footer">23 findings &nbsp;·&nbsp; 5 framework domains &nbsp;·&nbsp; Board-ready sign-off</p>
        </div>
        <p className="arb-signin-demo-link">
          Not ready to sign in?{" "}
          <a href="/demo" className="arb-signin-demo-anchor">View the live demo →</a>
          {" "}No account required.
        </p>
      </div>
    );
  }

  /* ── Signed-in state ── */
  return (
    <div className="arb-library-stack">
      <section className="arb-create-card">
        <div className="arb-create-copy">
          <p className="arb-create-label">Architecture review workspace</p>
          <h2 className="arb-create-title">Upload architecture documents and start a structured review.</h2>
          <p className="arb-create-sub">
            Create the review, move straight into document upload, and generate Microsoft Learn-grounded findings across Security, Reliability, Cost, Operations, Architecture, Governance, and Delivery.
          </p>
          <div className="arb-proof-strip" aria-label="Architecture review proof points">
            <span className="arb-proof-chip">Security</span>
            <span className="arb-proof-chip">Reliability</span>
            <span className="arb-proof-chip">Cost</span>
            <span className="arb-proof-chip">Operations</span>
            <span className="arb-proof-chip">Architecture</span>
            <span className="arb-proof-chip">Governance</span>
            <span className="arb-proof-chip">Delivery</span>
          </div>
          <div className="arb-proof-strip" style={{ marginTop: 8 }}>
            <span className="arb-proof-chip">Traceable Microsoft guidance</span>
            <span className="arb-proof-chip">Board-ready sign-off workflow</span>
          </div>
        </div>
        <section
          className={`arb-create-upload arb-upload-dropzone${uploadDropActive ? " arb-upload-dropzone-active" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setUploadDropActive(true);
          }}
          onDragLeave={() => setUploadDropActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setUploadDropActive(false);
            handleSelectedFiles(event.dataTransfer.files);
          }}
        >
          <div className="arb-create-upload-head">
            <div>
              <p className="arb-create-upload-label">Upload your review package now</p>
              <h3 className="arb-create-upload-title">Stage your SOW, design docs, diagrams, and workbooks before the workspace opens.</h3>
            </div>
            <button
              type="button"
              className="secondary-button arb-upload-picker"
              onClick={() => fileInputRef.current?.click()}
            >
              Select files
            </button>
          </div>
          <input
            ref={fileInputRef}
            id="arb-landing-upload"
            className="arb-landing-upload-input"
            aria-label="Select review files before creating the architecture review"
            type="file"
            multiple
            accept={SUPPORTED_ARB_UPLOAD_EXTENSIONS.join(",")}
            onChange={(event) => {
              handleSelectedFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />
          <p className="arb-create-upload-sub">
            Optional but recommended. If you select files here, the new review opens with those files already staged and ready for analysis.
          </p>
          <p className="microcopy">
            Accepted: PDF, Word, PowerPoint (.ppt or .pptx), Excel, diagrams, images, Markdown, text, IaC, and archive files.
            Max per file: {formatFileSize(MAX_ARB_UPLOAD_FILE_SIZE)} · Max total package: {formatFileSize(MAX_ARB_UPLOAD_TOTAL_SIZE)}.
            Convert legacy .ppt to .pptx for review extraction.
          </p>
          {selectedFiles.length > 0 ? (
            <div className="arb-selected-files">
              <div className="arb-selected-files-head">
                <strong>
                  {selectedFiles.length} file{selectedFiles.length === 1 ? "" : "s"} ready for upload
                </strong>
                <button
                  type="button"
                  className="arb-upload-clear"
                  onClick={() => setSelectedFiles([])}
                >
                  Clear
                </button>
              </div>
              <p className="arb-selected-files-list">
                {selectedFiles.slice(0, 4).map((file) => file.name).join(", ")}
                {selectedFiles.length > 4 ? ` +${selectedFiles.length - 4} more` : ""}
              </p>
              <p className="microcopy" style={{ marginTop: 8 }}>
                Total selected: {formatFileSize(selectedFiles.reduce((sum, file) => sum + file.size, 0))} across {selectedFiles.length} file{selectedFiles.length === 1 ? "" : "s"}.
                Remove or replace files when you need a smaller upload package.
              </p>
            </div>
          ) : (
            <p className="arb-create-upload-empty">
              No files selected yet. You can still start the review and upload inside the workspace.
            </p>
          )}
        </section>
        <div className="arb-create-fields">
          <label className="arb-field">
            <span>Project name</span>
            <input
              className="arb-field-input"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Contoso landing zone modernization"
              aria-label="Project name"
            />
          </label>
          <label className="arb-field">
            <span>Customer / organization</span>
            <input
              className="arb-field-input"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Contoso"
              aria-label="Customer name"
            />
          </label>
          <button
            type="button"
            className="arb-create-btn"
            onClick={() => void handleCreateReview()}
            disabled={saving || !projectName.trim()}
          >
            {saving
              ? (selectedFiles.length > 0 ? "Creating review and uploading…" : "Creating…")
              : (selectedFiles.length > 0 ? "Start Architecture Review and upload files →" : "Start Architecture Review →")}
          </button>
        </div>
        <p className="arb-create-trust">
          Files are retained for 30 days. The next step opens the upload workspace so the review starts from your actual design package.
        </p>
        {error ? <p className="arb-create-error">{error}</p> : null}
      </section>

      {filteredReviews.length === 0 ? (
        <section className="arb-empty-state">
          <p className="arb-empty-title">Start your first review</p>
          <p className="arb-empty-sub">
            Enter a project name above, upload your architecture documents, and follow the five-step workflow to a board-ready pack.
          </p>
          <ol className="arb-steps-list" aria-label="Review workflow steps">
            <li className="arb-step-item"><span className="arb-step-num">1</span><span className="arb-step-text">Name the project and customer</span></li>
            <li className="arb-step-item"><span className="arb-step-num">2</span><span className="arb-step-text">Upload SOW, design docs, diagrams, and workbooks</span></li>
            <li className="arb-step-item"><span className="arb-step-num">3</span><span className="arb-step-text">Run automated framework analysis</span></li>
            <li className="arb-step-item"><span className="arb-step-num">4</span><span className="arb-step-text">Review findings and assign owners</span></li>
            <li className="arb-step-item"><span className="arb-step-num">5</span><span className="arb-step-text">Sign off and export the board-ready package</span></li>
          </ol>
        </section>
      ) : (
        <section className="arb-review-table-wrap">
          <div className="arb-review-section-head">
            <h2 className="arb-review-table-heading">Resume an active review</h2>
            <p className="arb-review-table-sub">
              Each card shows current posture, evidence readiness, and the next action needed to reach a board-ready pack.
            </p>
          </div>
          <div className="arb-review-list">
            {filteredReviews.map((review) => (
              <article
                key={`${review.reviewId}-${review.createdByUserId ?? "user"}`}
                className="arb-review-card"
              >
                <div className="arb-review-card-head">
                  <div className="arb-review-card-meta">
                    <span className="arb-review-card-project">{review.projectName}</span>
                    {review.customerName && (
                      <span className="arb-review-card-customer">{review.customerName}</span>
                    )}
                  </div>
                  <div className="arb-review-card-actions">
                    <span className="arb-review-updated">Updated {formatDate(review.lastUpdated)}</span>
                    <Link href={getPrimaryHref(review, focus)} className="arb-table-open">
                      {getPrimaryLabel(review, focus)}
                    </Link>
                    {confirmDeleteId === review.reviewId ? (
                      <>
                        <button
                          type="button"
                          className="arb-table-delete arb-table-delete--confirm"
                          onClick={() => void handleDeleteReview(review.reviewId)}
                          disabled={deletingId === review.reviewId}
                        >
                          {deletingId === review.reviewId ? "Deleting…" : "Confirm delete"}
                        </button>
                        <button
                          type="button"
                          className="arb-table-delete-cancel"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="arb-table-delete"
                        onClick={() => void handleDeleteReview(review.reviewId)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
                <div className="arb-review-metrics" aria-label={`Review posture for ${review.projectName}`}>
                  <div className="arb-review-metric">
                    <span className="arb-review-metric-label">Workflow</span>
                    <StatusBadge state={review.workflowState} />
                  </div>
                  <div className="arb-review-metric">
                    <span className="arb-review-metric-label">Decision posture</span>
                    <strong className="arb-review-metric-value">{getReviewPosture(review)}</strong>
                  </div>
                  <div className="arb-review-metric">
                    <span className="arb-review-metric-label">Evidence</span>
                    <strong className="arb-review-metric-value">{getEvidenceSummary(review)}</strong>
                  </div>
                  <div className="arb-review-metric">
                    <span className="arb-review-metric-label">Score</span>
                    {review.overallScore !== null && review.overallScore !== undefined && (
                      <strong className="arb-review-metric-value">{review.overallScore}/100</strong>
                    )}
                    {(review.overallScore === null || review.overallScore === undefined) && (
                      <strong className="arb-review-metric-value">Pending</strong>
                    )}
                  </div>
                </div>
                <p className="arb-review-next-step">{getNextStepSummary(review)}</p>
                <div className="arb-review-links">
                  <Link href={getArbStepHref(review.reviewId, "findings")} className="arb-table-secondary">
                    Open findings
                  </Link>
                  <span className="arb-review-id">Review ID: {review.reviewId}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
