"use client";

import { useEffect, useRef, useState } from "react";
import {
  createArbExport,
  createArbAction,
  deleteArbFile,
  downloadArbExport,
  fetchArbAgentStatus,
  fetchArbEvidence,
  fetchArbActions,
  fetchArbDecision,
  fetchArbExtractionStatus,
  fetchArbExports,
  fetchArbFindings,
  fetchArbRequirements,
  fetchArbReview,
  fetchArbScorecard,
  fetchArbUploads,
  recordArbDecision,
  runArbAgentReview,
  startArbExtraction,
  uploadArbFiles,
  updateArbAction,
  updateArbFinding
} from "@/arb/api";
import { getArbReviewSteps } from "@/arb/routes";
import { getArbStepHref } from "@/arb/routes";
import { ENABLED_AUTH_PROVIDERS, buildLoginUrl } from "@/lib/review-cloud";
import { trackArbEvent } from "@/lib/telemetry";
import type {
  ArbAction,
  ArbDecision,
  ArbDomainScore,
  ArbEvidenceFact,
  ArbExportArtifact,
  ArbExportFormat,
  ArbFinding,
  ArbExtractionStatus,
  ArbRequirement,
  ArbReviewSummary,
  ArbReviewStepKey,
  ArbScorecard,
  ArbUploadedFile
} from "@/arb/types";
import { ArbPlaceholderPage } from "@/components/arb/placeholder-page";
import { ArbReviewShell } from "@/components/arb/review-shell";
import { EvidenceGuidancePanel } from "@/components/arb/evidence-guidance";
import {
  SUPPORTED_ARB_SOW_EXTENSIONS,
  SUPPORTED_ARB_UPLOAD_EXTENSIONS
} from "@/components/arb/upload-extensions";
import { SeverityBadge } from "@/components/severity-badge";

function buildBullets(
  activeStep: ArbReviewStepKey,
  findings: ArbFinding[],
  scorecard: ArbScorecard | null
) {
  switch (activeStep) {
    case "upload":
      return [
        "Upload SOW, design docs, and supporting artifacts",
        "Register logical file category and evidence readiness",
        "Prepare extraction pipeline handoff"
      ];
    case "requirements":
      return [
        "Review extracted requirements",
        "Correct category, criticality, and normalized text",
        "Accept or reject weak extractions"
      ];
    case "evidence":
      return [
        "Compare requirements to extracted design evidence",
        "Adjust match states and rationale",
        "Open source excerpts for traceability"
      ];
    case "findings":
      return findings.length > 0
        ? findings.map((finding) => `[${finding.severity}] ${finding.title}`)
        : [
            "Load structured findings from the API",
            "Filter by severity and domain",
            "Assign owners and due dates"
          ];
    case "scorecard":
      return scorecard
        ? [
            `Overall score: ${scorecard.overallScore ?? "TBD"}`,
            `Recommendation: ${scorecard.recommendation} (${scorecard.confidence} confidence)`,
            ...scorecard.domainScores.map(
              (domainScore) =>
                `${domainScore.domain}: ${domainScore.score}/${domainScore.weight} - ${domainScore.reason}`
            )
          ]
        : [
            "Show weighted domain scores",
            "Link score rationale to findings",
            "Display recommendation and confidence"
          ];
    case "decision":
      return [
        "Show derived recommendation and blocker summary",
        "Capture reviewer decision and rationale",
        "Track conditions and must-fix actions"
      ];
    default:
      return [
        "Show review summary and workflow state",
        "Link to each ARB review step",
        "Prepare navigation into the live workflow"
      ];
  }
}

function formatEvidenceCategoryLabel(value: string) {
  switch (value) {
    case "sow":
      return "Statement of Work / scope";
    case "design_doc":
      return "Architecture design document";
    case "diagram":
      return "Architecture diagram";
    case "security_note":
      return "Security notes";
    case "cost_assumptions":
      return "Cost assumptions";
    case "dr_ha_note":
      return "HA/DR notes";
    case "ops_monitoring_note":
      return "Operations and monitoring notes";
    default:
      return value.replace(/_/g, " ");
  }
}

function summarizeActions(actions: ArbAction[]) {
  const openActions = actions.filter((action) => action.status !== "Closed");
  const blockedActions = openActions.filter((action) => action.status === "Blocked");
  const reviewerVerificationActions = openActions.filter(
    (action) => action.reviewerVerificationRequired
  );

  return {
    openCount: openActions.length,
    blockedCount: blockedActions.length,
    reviewerVerificationCount: reviewerVerificationActions.length,
    openActions,
    blockedActions,
    reviewerVerificationActions
  };
}

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

function formatCategory(category: string): string {
  return CATEGORY_LABELS[category] ?? category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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

function formatExportLabel(format: string) {
  if (format === "markdown") {
    return ".md";
  }

  if (format === "html") {
    return ".html";
  }

  return ".csv";
}

function toSeverityLevel(value: string | undefined): "High" | "Medium" | "Low" | undefined {
  if (value === "High" || value === "Medium" || value === "Low") {
    return value;
  }

  return undefined;
}

function getFindingPrimaryReference(finding: ArbFinding) {
  const refs = finding.references ?? [];
  return refs.find((reference) => Boolean(reference.url)) ?? refs[0] ?? null;
}

function getDomainScorePercent(domainScore: ArbDomainScore) {
  if (!Number.isFinite(domainScore.weight) || domainScore.weight <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((domainScore.score / domainScore.weight) * 100)));
}

function getPercentTone(percent: number) {
  if (percent >= 80) {
    return "strong";
  }

  if (percent >= 70) {
    return "steady";
  }

  return "attention";
}

function getRecommendationTone(recommendation: string) {
  const normalized = recommendation.trim().toLowerCase();

  if (normalized.includes("recommended for approval")) {
    return "approved";
  }

  if (normalized.includes("rejected") || normalized.includes("improvement") || normalized.includes("revision") || normalized.includes("remediation")) {
    return "attention";
  }

  if (normalized.includes("insufficient")) {
    return "neutral";
  }

  return "neutral";
}

function getScoreBandLabel(score: number | null) {
  if (score === null || score === undefined) {
    return "Awaiting score";
  }

  if (score >= 80) {
    return "Meets approval threshold";
  }

  if (score >= 70) {
    return "Needs follow-through";
  }

  return "Needs remediation";
}

export function ArbLiveReviewStep(props: {
  reviewId: string;
  activeStep: ArbReviewStepKey;
  title: string;
  description: string;
}) {
  const { reviewId, activeStep, title, description } = props;
  const [review, setReview] = useState<ArbReviewSummary | null>(null);
  const [findings, setFindings] = useState<ArbFinding[]>([]);
  const [actions, setActions] = useState<ArbAction[]>([]);
  const [scorecard, setScorecard] = useState<ArbScorecard | null>(null);
  const [decisionChoice, setDecisionChoice] = useState("Needs Revision");
  const [decisionRationale, setDecisionRationale] = useState("");
  const [decisionReviewerName, setDecisionReviewerName] = useState("");
  const [decisionReviewerRole, setDecisionReviewerRole] = useState("");
  const [decisionResult, setDecisionResult] = useState<ArbDecision | null>(null);
  const [decisionSaving, setDecisionSaving] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadedFiles, setUploadedFiles] = useState<ArbUploadedFile[]>([]);
  const [requirements, setRequirements] = useState<ArbRequirement[]>([]);
  const [evidenceFacts, setEvidenceFacts] = useState<ArbEvidenceFact[]>([]);
  const [exportArtifacts, setExportArtifacts] = useState<ArbExportArtifact[]>([]);
  const [extractionStatus, setExtractionStatus] = useState<ArbExtractionStatus | null>(null);
  const [extractionStatusRefreshing, setExtractionStatusRefreshing] = useState(false);
  const [confidentialityConfirmed, setConfidentialityConfirmed] = useState(false);
  const [uploadSaving, setUploadSaving] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [extractionStarting, setExtractionStarting] = useState(false);
  const [uploadDropActive, setUploadDropActive] = useState(false);
  const [exportDownloadingId, setExportDownloadingId] = useState<string | null>(null);
  const [exportRegenerating, setExportRegenerating] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [agentCompleted, setAgentCompleted] = useState(false);
  const [agentStatusMessage, setAgentStatusMessage] = useState<string | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [deleteFileError, setDeleteFileError] = useState<string | null>(null);
  const [timerNow, setTimerNow] = useState(() => Date.now());
  // Tracks highest progress seen — prevents bar from going backwards when polls return stale stage data
  const epPctHighWater = useRef(0);
  // Tracks the previous jobId so we only reset the high-water mark when switching between two real jobs,
  // not when the jobId first appears (which caused the bar to bounce: 75% → 0% → 34%)
  const epPctPrevJobId = useRef<string | undefined>(undefined);
  const actionSummary = summarizeActions(actions);
  const authRequired = error?.includes("Sign in is required") ?? false;
  const sowMissingForSignoff = Boolean(
    review?.missingRequiredItems?.includes("sow") || review?.requiredEvidencePresent === false
  );

  let decisionGateMessage: string | null = null;

  if (actionSummary.blockedCount > 0) {
    decisionGateMessage =
      "Blocked actions remain. Record the decision only when the rationale clearly states whether approval is conditional and who owns the remaining actions.";
  } else if (actionSummary.reviewerVerificationCount > 0) {
    decisionGateMessage =
      "Reviewer verification is still required for at least one open action. Capture the verification condition in the decision rationale.";
  } else if (decisionChoice === "Approved" && actionSummary.openCount > 0) {
    decisionGateMessage =
      "Open remediation actions remain. If you approve, record whether the approval is conditional and what must close before implementation.";
  } else if (decisionChoice === "Approved" && sowMissingForSignoff) {
    decisionGateMessage =
      "The SOW or scope document is missing. If you approve, include the reviewer waiver or condition in the decision rationale.";
  }

  function updateLocalFinding(findingId: string, updater: (current: ArbFinding) => ArbFinding) {
    setFindings((currentFindings) =>
      currentFindings.map((finding) =>
        finding.findingId === findingId ? updater(finding) : finding
      )
    );
  }

  function updateLocalAction(actionId: string, updater: (current: ArbAction) => ArbAction) {
    setActions((currentActions) =>
      currentActions.map((action) => (action.actionId === actionId ? updater(action) : action))
    );
  }

  async function handleFileUpload(fileList: FileList | null, logicalCategory?: string) {
    if (!fileList || fileList.length === 0) {
      return;
    }

    const files = Array.from(fileList);
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    const oversizedFiles = files.filter((file) => file.size > MAX_ARB_UPLOAD_FILE_SIZE);

    if (oversizedFiles.length > 0) {
      setUploadError(
        `One or more files exceed the maximum per-file limit of ${formatFileSize(
          MAX_ARB_UPLOAD_FILE_SIZE
        )}. Remove ${oversizedFiles.length} file${oversizedFiles.length === 1 ? "" : "s"} and try again.`
      );
      return;
    }

    if (totalBytes > MAX_ARB_UPLOAD_TOTAL_SIZE) {
      setUploadError(
        `Selected files total ${formatFileSize(totalBytes)}, which exceeds the ${formatFileSize(
          MAX_ARB_UPLOAD_TOTAL_SIZE
        )} package limit. Upload fewer files or split the package.`
      );
      return;
    }

    try {
      setUploadSaving(true);
      setUploadError(null);

      const payload = await uploadArbFiles({
        reviewId,
        files,
        logicalCategory
      });

      setUploadedFiles(payload.files);
      setReview((currentReview) =>
        currentReview
          ? {
              ...currentReview,
              evidenceReadinessState:
                payload.evidenceReadinessState as ArbReviewSummary["evidenceReadinessState"],
              documentCount: payload.files.length
            }
          : currentReview
      );
      trackArbEvent({
        name: "arb_document_uploaded",
        properties: {
          reviewId,
          fileCount: String(payload.files.length),
        },
      });
    } catch (uploadFailure) {
      setUploadError(
        uploadFailure instanceof Error ? uploadFailure.message : "Unable to upload files."
      );
    } finally {
      setUploadSaving(false);
    }
  }

  async function handleDeleteFile(fileId: string) {
    try {
      setDeletingFileId(fileId);
      setDeleteFileError(null);
      const result = await deleteArbFile(reviewId, fileId);
      setUploadedFiles((current) => current.filter((f) => f.fileId !== fileId));
      if (result.remainingCount === 0) {
        setExtractionStatus(null);
      }
    } catch (deleteError) {
      setDeleteFileError(
        deleteError instanceof Error ? deleteError.message : "Unable to delete the file."
      );
    } finally {
      setDeletingFileId(null);
    }
  }

  async function handleExportDownload(exportArtifact: ArbExportArtifact) {
    try {
      setExportDownloadingId(exportArtifact.exportId);
      setExportError(null);
      await downloadArbExport(reviewId, exportArtifact);
      trackArbEvent({
        name: "arb_scorecard_exported",
        properties: { reviewId, format: exportArtifact.format },
      });
    } catch (downloadError) {
      setExportError(
        downloadError instanceof Error
          ? downloadError.message
          : "Unable to download the reviewed output."
      );
    } finally {
      setExportDownloadingId(null);
    }
  }

  async function regenerateReviewedOutputs() {
    const formats: ArbExportFormat[] = ["markdown", "csv", "html"];

    try {
      setExportRegenerating(true);
      setExportError(null);

      await Promise.all(
        formats.map((format) =>
          createArbExport({
            reviewId,
            format,
            includeFindings: true,
            includeScorecard: true,
            includeActions: true
          })
        )
      );

      const nextExports = await fetchArbExports(reviewId);
      setExportArtifacts(nextExports);
    } catch (regenerateError) {
      setExportError(
        regenerateError instanceof Error
          ? regenerateError.message
          : "Unable to regenerate the reviewed outputs."
      );
    } finally {
      setExportRegenerating(false);
    }
  }

  async function refreshExtractionStatus() {
    try {
      setExtractionStatusRefreshing(true);
      const nextExtraction = await fetchArbExtractionStatus(reviewId);
      setExtractionStatus(nextExtraction);
    } catch (refreshError) {
      setUploadError(
        refreshError instanceof Error
          ? refreshError.message
          : "Unable to refresh extraction status."
      );
    } finally {
      setExtractionStatusRefreshing(false);
    }
  }

  function renderOutputArtifactsCard() {
    return (
      <section className="trace-card arb-summary-card">
        <div className="board-card-head">
          <div className="board-card-head-copy">
            <p className="board-card-subtitle">Reviewed outputs</p>
            <h2 className="section-title">Regenerate or download the reviewed package</h2>
          </div>
        </div>
        <p className="section-copy">
          Review outputs are generated and available for download below.
        </p>
        <div className="button-row">
          <button
            type="button"
            className="primary-button"
            disabled={exportRegenerating}
            onClick={() => void regenerateReviewedOutputs()}
          >
            {exportRegenerating ? "Regenerating outputs…" : "Regenerate reviewed outputs"}
          </button>
        </div>
        {exportArtifacts.length === 0 ? (
          <p className="microcopy">
            Downloadable reviewed outputs will appear after extraction completes for this review.
          </p>
        ) : (
          <div className="arb-upload-file-list">
            {exportArtifacts.map((artifact) => (
              <article key={artifact.exportId} className="trace-card arb-upload-file">
                <div className="arb-upload-file-copy">
                  <strong>{artifact.fileName}</strong>
                  <p className="microcopy">
                    {formatExportLabel(artifact.format)} · generated {new Date(artifact.generatedAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={exportDownloadingId === artifact.exportId}
                  onClick={() => void handleExportDownload(artifact)}
                >
                  {exportDownloadingId === artifact.exportId ? "Preparing download…" : "Download"}
                </button>
              </article>
            ))}
          </div>
        )}
        {exportError ? <p>{exportError}</p> : null}
      </section>
    );
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const reviewResponse = await fetchArbReview(reviewId);
        const findingsResponse = activeStep === "findings" ? await fetchArbFindings(reviewId) : [];
        const uploadsResponse =
          activeStep === "upload" || activeStep === "requirements" || activeStep === "evidence"
            ? await fetchArbUploads(reviewId)
            : null;
        const actionsResponse =
          activeStep === "findings" || activeStep === "scorecard" || activeStep === "decision"
            ? await fetchArbActions(reviewId)
            : [];
        const requirementsResponse =
          activeStep === "requirements" ? await fetchArbRequirements(reviewId) : [];
        const evidenceResponse = activeStep === "evidence" ? await fetchArbEvidence(reviewId) : [];
        const exportsResponse =
          activeStep === "upload" || activeStep === "requirements" || activeStep === "evidence"
            ? await fetchArbExports(reviewId)
            : [];
        const agentStatusResponse =
          activeStep === "upload" ? await fetchArbAgentStatus(reviewId).catch(() => null) : null;
        const scorecardResponse =
          activeStep === "scorecard" || activeStep === "findings" || activeStep === "decision"
            ? await fetchArbScorecard(reviewId)
            : null;
        const decisionResponse =
          activeStep === "decision" ? await fetchArbDecision(reviewId) : null;

        if (!cancelled) {
          setReview(reviewResponse);
          setFindings(findingsResponse);
          setUploadedFiles(uploadsResponse?.files ?? []);
          setExtractionStatus(uploadsResponse?.extraction ?? null);
          setRequirements(requirementsResponse);
          setEvidenceFacts(evidenceResponse);
          setExportArtifacts(exportsResponse);
          setActions(actionsResponse);
          setScorecard(scorecardResponse);
          if (agentStatusResponse?.status === "running") {
            setAgentRunning(true);
            setAgentCompleted(false);
            setAgentStatusMessage(agentStatusResponse.message || "Assessment is in progress.");
          } else if (agentStatusResponse?.status === "completed") {
            setAgentRunning(false);
            setAgentCompleted(true);
            setAgentStatusMessage(
              `Assessment complete${agentStatusResponse.findingsCount != null ? ` — ${agentStatusResponse.findingsCount} findings generated` : ""}.`
            );
          } else if (agentStatusResponse?.status === "failed") {
            setAgentRunning(false);
            setAgentCompleted(false);
            setAgentError(agentStatusResponse.error || "Assessment failed.");
          }
          setDecisionResult(decisionResponse);
          setDecisionChoice(decisionResponse?.reviewerDecision || "Needs Revision");
          setDecisionRationale(decisionResponse?.rationale || "");
          setDecisionReviewerName(decisionResponse?.reviewerName || "");
          setDecisionReviewerRole(decisionResponse?.reviewerRole || "");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load the review.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [reviewId, activeStep]);

  useEffect(() => {
    if (activeStep !== "upload" || !extractionStatus) return;

    const intervalId = window.setInterval(() => {
      void refreshExtractionStatus();
    }, extractionStatus.visualExtractionErrors?.length ? 5000 : 15000);

    return () => window.clearInterval(intervalId);
  }, [activeStep, extractionStatus?.jobId, extractionStatus?.state, extractionStatus?.visualExtractionErrors?.length, reviewId]);

  useEffect(() => {
    if (activeStep !== "upload" || !agentRunning) return;

    let cancelled = false;
    const intervalId = window.setInterval(() => {
      void (async () => {
        const status = await fetchArbAgentStatus(reviewId).catch(() => null);
        if (cancelled || !status) return;

        if (status.status === "completed") {
          setAgentRunning(false);
          setAgentCompleted(true);
          setAgentStatusMessage(
            `Assessment complete${status.findingsCount != null ? ` — ${status.findingsCount} findings generated` : ""}.`
          );
          window.clearInterval(intervalId);
        } else if (status.status === "failed") {
          setAgentRunning(false);
          setAgentError(status.error || "Assessment failed.");
          window.clearInterval(intervalId);
        } else if (status.status === "running") {
          setAgentStatusMessage(status.message || "Assessment is in progress.");
        }
      })();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeStep, agentRunning, reviewId]);

  // Tick every second while extraction or agent is running so the elapsed timer updates smoothly
  useEffect(() => {
    const extractionRunning = extractionStatus?.state === "Running" || extractionStarting;
    if (!extractionRunning && !agentRunning) return;
    const id = window.setInterval(() => setTimerNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [extractionStatus?.state, extractionStarting, agentRunning]);

  // Reset high-water mark only when switching from one real job to a DIFFERENT real job.
  // Do NOT reset when jobId first appears (null → "xyz") — that caused the bar to bounce
  // from an intermediate value (e.g. 75%) back down to the file-only floor (34%).
  useEffect(() => {
    const prev = epPctPrevJobId.current;
    const curr = extractionStatus?.jobId;
    if (prev && curr && prev !== curr) {
      epPctHighWater.current = 0;
    }
    epPctPrevJobId.current = curr;
  }, [extractionStatus?.jobId]);

  const shellReview =
    review ??
    ({
      reviewId,
      projectName: "Loading review…",
      customerName: "",
      workflowState: "Draft",
      evidenceReadinessState: "Ready with Gaps",
      overallScore: null,
      recommendation: "Loading",
      assignedReviewer: null
    } satisfies ArbReviewSummary);

  async function submitDecision() {
    try {
      setDecisionSaving(true);
      setDecisionError(null);

      const nextDecision = await recordArbDecision({
        reviewId,
        finalDecision: decisionChoice,
        rationale: decisionRationale,
        reviewerName: decisionReviewerName.trim() || undefined,
        reviewerRole: decisionReviewerRole.trim() || undefined
      });

      setDecisionResult(nextDecision);
      setDecisionChoice(nextDecision.reviewerDecision);
      setDecisionRationale(nextDecision.rationale);
      setDecisionReviewerName(nextDecision.reviewerName || "");
      setDecisionReviewerRole(nextDecision.reviewerRole || "");
      setReview((currentReview) =>
        currentReview
          ? {
              ...currentReview,
              workflowState: "Decision Recorded",
              finalDecision: nextDecision.reviewerDecision
            }
          : currentReview
      );
    } catch (decisionLoadError) {
      setDecisionError(
        decisionLoadError instanceof Error
          ? decisionLoadError.message
          : "Unable to record ARB decision."
      );
    } finally {
      setDecisionSaving(false);
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
      // Refresh findings and scorecard after agent run
      const [nextFindings, nextScorecard] = await Promise.all([
        fetchArbFindings(reviewId).catch(() => []),
        fetchArbScorecard(reviewId).catch(() => null)
      ]);
      setFindings(nextFindings);
      setScorecard(nextScorecard);
      trackArbEvent({
        name: "arb_findings_generated",
        properties: {
          reviewId,
          findingCount: String(nextFindings.length),
          scorecardScore: nextScorecard?.overallScore != null ? String(nextScorecard.overallScore) : undefined,
        },
      });
      // Auto-navigate to findings once agent review completes
      window.location.assign(getArbStepHref(reviewId, "findings"));
    } catch (agentRunError) {
      setAgentError(
        agentRunError instanceof Error ? agentRunError.message : "Unable to run agent review."
      );
    } finally {
      setAgentRunning(false);
    }
  }

  function renderUploadContent() {
    if (!review) {
      return (
        <div className="arb-page-stack">
          <ArbPlaceholderPage
            intro="Unable to load this review. The review may not exist or the session may have expired."
            bullets={[
              "Check that the review ID in the URL is correct",
              "Try signing out and signing back in",
              "If the problem persists, create a new review from the home page"
            ]}
            footer={
              <a href="/arb" className="primary-button">
                Back to reviews
              </a>
            }
          />
        </div>
      );
    }
    const supportedUploads = uploadedFiles.filter((item) => item.supportedTextExtraction);
    const unsupportedUploads = uploadedFiles.filter((item) => !item.supportedTextExtraction);
    const readinessChecks = [
      {
        label: "At least one document has been uploaded",
        complete: supportedUploads.length > 0
      },
      {
        label: "Confidentiality and handling note is acknowledged",
        complete: confidentialityConfirmed
      }
    ];
    const extractionPreview =
      supportedUploads.length === 0
        ? [
            "Scope and requirements from your SOW or design narrative",
            "Architecture topology, services, network, and security posture",
            "Cost, support, and operational readiness signals"
          ]
        : Array.from(new Set(supportedUploads.map((item) => item.logicalCategory))).map(
            (category) => `Assessment engine will analyze: ${formatCategory(category)}`
          );
    const canStartExtraction = readinessChecks.every((check) => check.complete) && !uploadSaving;

    const extractionIsRunning = extractionStarting || extractionStatus?.state === "Running";
    // After clicking "Start analysis", the new extraction hasn't returned yet so extractionStatus
    // still holds prior-run data (stages fully done = 75%). Guard prevents bar from flashing 75%
    // then snapping back to ~40% when the new jobId arrives and the high-water mark resets.
    const isNewExtractionPending = extractionStarting && extractionStatus?.state !== "Running";
    const epSteps = [
      { label: "Text", value: isNewExtractionPending ? undefined : extractionStatus?.textExtractionStatus },
      { label: "Tables", value: isNewExtractionPending ? undefined : extractionStatus?.tableExtractionStatus },
      { label: "Figures", value: isNewExtractionPending ? undefined : extractionStatus?.figureExtractionStatus },
      { label: "Visual analysis", value: isNewExtractionPending ? undefined : extractionStatus?.visualAnalysisStatus },
    ];
    const epIsDone = (v?: string) => v === "Completed" || v === "CompletedWithIssues";
    const epIsActive = (v?: string) => v === "Running";
    const epDoneCount = epSteps.filter((st) => epIsDone(st.value)).length;
    const epActiveCount = epSteps.filter((st) => epIsActive(st.value)).length;
    const epFileStatuses = isNewExtractionPending ? [] : (extractionStatus?.fileStatuses ?? []);
    const epTotalFiles = epFileStatuses.length;
    const epDoneFiles = epFileStatuses.filter(
      (f) => f.extractionStatus === "Completed" || f.extractionStatus === "CompletedWithIssues" || f.extractionStatus === "Failed"
    ).length;
    // Stage statuses update late in the pipeline; derive a floor from per-file completion.
    // Cap file-based progress at 45% — stage progress takes over once stages advance.
    const epPctFromFiles = epTotalFiles > 0 ? Math.round((epDoneFiles / epTotalFiles) * 45) : 0;
    const epPctFromStages = epDoneCount * 25 + epActiveCount * 12;
    const usingFileFallback = epPctFromStages === 0;

    // Time-based crawl: once all files are done and stage statuses haven't advanced,
    // slowly increment 1% per 12 seconds up to 88% so the bar visibly moves during the
    // long analysis phase (8-20 min) rather than freezing.
    const elapsedSec = extractionStatus?.lastStartedAt
      ? Math.max(0, Math.floor((timerNow - new Date(extractionStatus.lastStartedAt).getTime()) / 1000))
      : 0;
    const allFilesDone = epTotalFiles > 0 && epDoneFiles === epTotalFiles;
    const epPctTimeCrawl = usingFileFallback && allFilesDone
      ? Math.min(88, epPctFromFiles + Math.floor(elapsedSec / 12))
      : 0;

    const epPctRaw = extractionStatus
      ? Math.min(99, Math.max(epPctFromStages, epPctFromFiles, epPctTimeCrawl))
      : 0;
    // Apply high-water mark: bar never goes backwards across polls
    epPctHighWater.current = Math.max(epPctHighWater.current, epPctRaw);
    const epPct = epPctHighWater.current;

    let epElapsedLabel = "";
    let epEtaLabel = "";
    if (extractionStatus?.lastStartedAt) {
      const mins = Math.floor(elapsedSec / 60);
      const secs = elapsedSec % 60;
      epElapsedLabel = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      // Only show ETA when stage-level progress is driving the bar (not file/time fallback)
      if (!usingFileFallback && epPct > 5) {
        const totalEst = (elapsedSec / epPct) * 100;
        const rem = Math.max(0, totalEst - elapsedSec);
        const remMins = Math.round(rem / 60);
        epEtaLabel = remMins <= 1 ? "< 1 min remaining" : `~${remMins} min remaining`;
      }
    }

    return (
      <div className="arb-page-stack">
        <div className="arb-summary-grid">
          <article className="future-card">
            <p className="board-card-subtitle">Files uploaded</p>
            <strong>{supportedUploads.length}</strong>
            <p className="section-copy">
              Text-based files (PDF, Word, Markdown) are ready for automated assessment.
            </p>
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
                ? `${extractionStatus!.visualEvidenceCount} visual evidence items extracted — includes diagrams and images found inside uploaded documents.`
                : "Images, Draw.io, Visio, spreadsheets, and architecture diagrams embedded in PDFs are extracted for review evidence."}
            </p>
          </article>
          <article className="future-card">
            <p className="board-card-subtitle">Ready to analyze</p>
            <strong>{canStartExtraction ? "Yes" : "Not yet"}</strong>
            <p className="section-copy">
              Upload at least one document and confirm it can be used for review.
            </p>
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

        <section
          id="upload-documents"
          className={`surface-panel arb-upload-dropzone${
            uploadDropActive ? " arb-upload-dropzone-active" : ""
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            setUploadDropActive(true);
          }}
          onDragLeave={() => setUploadDropActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setUploadDropActive(false);
            void handleFileUpload(event.dataTransfer.files);
          }}
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
            {SUPPORTED_ARB_UPLOAD_EXTENSIONS.map((extension) => (
              <span key={extension} className="pill">
                {extension}
              </span>
            ))}
          </div>

          <div className="button-row" style={{ gap: 12, flexWrap: "wrap" }}>
          <label htmlFor={`arb-upload-sow-${reviewId}`} className="arb-upload-label">
            <span className="arb-upload-icon"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 4a2 2 0 0 1 2-2h4.586a1 1 0 0 1 .707.293l4.414 4.414a1 1 0 0 1 .293.707V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Z" stroke="currentColor" strokeWidth="1.5" fill="none"/><path d="M10 2v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M8 13l2-2 2 2M10 11v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
            <span>Upload SOW / Scope</span>
            <input
              id={`arb-upload-sow-${reviewId}`}
              className="field-input"
              aria-label="Upload statement of work or scope documents"
              type="file"
              multiple
              accept={SUPPORTED_ARB_SOW_EXTENSIONS.join(",")}
              style={{ display: 'none' }}
              onChange={(event) => {
                void handleFileUpload(event.target.files, "sow");
                event.currentTarget.value = "";
              }}
            />
          </label>
          <label htmlFor={`arb-upload-design-${reviewId}`} className="arb-upload-label">
            <span className="arb-upload-icon"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 4a2 2 0 0 1 2-2h4.586a1 1 0 0 1 .707.293l4.414 4.414a1 1 0 0 1 .293.707V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Z" stroke="currentColor" strokeWidth="1.5" fill="none"/><path d="M10 2v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M8 13l2-2 2 2M10 11v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
            <span>Upload Design Documents</span>
            <input
              id={`arb-upload-design-${reviewId}`}
              className="field-input"
              aria-label="Upload architecture design documents and diagrams"
              type="file"
              multiple
              accept={SUPPORTED_ARB_UPLOAD_EXTENSIONS.join(",")}
              style={{ display: 'none' }}
              onChange={(event) => {
                void handleFileUpload(event.target.files, "design_doc");
                event.currentTarget.value = "";
              }}
            />
          </label>
          <label htmlFor={`arb-upload-zip-${reviewId}`} className="arb-upload-label">
            <span className="arb-upload-icon"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Z" stroke="currentColor" strokeWidth="1.5" fill="none"/><path d="M8 3v14M8 6h2M8 9h2M8 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></span>
            <span>Upload Evidence ZIP</span>
            <input
              id={`arb-upload-zip-${reviewId}`}
              className="field-input"
              aria-label="Upload evidence ZIP package"
              type="file"
              multiple
              accept=".zip"
              style={{ display: 'none' }}
              onChange={(event) => {
                void handleFileUpload(event.target.files, "evidence_package");
                event.currentTarget.value = "";
              }}
            />
          </label>
          </div>
          <div className="arb-upload-helper-text" style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
            Accepted for processing and analysis: PDF, DOCX, PPTX, XLSX, CSV, PNG/JPG/JPEG/GIF/WEBP/BMP/TIFF images, Draw.io, VSDX, Mermaid/PlantUML, Markdown, text, JSON, XML, YAML, IaC/config, scripts, API schemas, notebooks, and ZIP evidence packages.
            Max per file: {formatFileSize(MAX_ARB_UPLOAD_FILE_SIZE)} · Max total upload: {formatFileSize(
              MAX_ARB_UPLOAD_TOTAL_SIZE
            )}.
            ZIP packages are unpacked and analyzed file-by-file. Include SOW/scope, design documents, diagrams, cost workbooks, HA/DR notes, and operations notes. Unsupported or unsafe files are skipped with a visible reason.
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

        {/* Staged files */}
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
                const isExtracted =
                  upload.extractionStatus === "Completed" ||
                  upload.extractionStatus === "CompletedWithIssues";
                const visCount =
                  typeof upload.visualEvidenceCount === "number" && upload.visualEvidenceCount > 0
                    ? upload.visualEvidenceCount
                    : null;
                return (
                <article key={upload.fileId} className="trace-card arb-upload-file">
                  <div className="arb-upload-file-copy">
                    <strong>{upload.fileName}</strong>
                    <p className="microcopy">
                      {formatCategory(upload.logicalCategory)} · {formatFileSize(upload.sizeBytes)} ·{" "}
                      <span className={upload.extractionStatus === "Completed" ? "arb-status-done" : undefined}>
                        {upload.extractionStatus}
                      </span>
                      {typeof upload.packageChildCount === "number"
                        ? ` · ${upload.packageChildCount} extracted`
                        : ""}
                      {typeof upload.packageSkippedCount === "number" && upload.packageSkippedCount > 0
                        ? ` · ${upload.packageSkippedCount} skipped`
                        : ""}
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

        {/* Confidentiality confirmation + Start extraction CTA */}
        <section id="run-automated-analysis" className="surface-panel arb-action-panel">
          <label className="arb-inline-check">
            <input
              aria-label="Confirm uploaded files can be used for review extraction"
              type="checkbox"
              checked={confidentialityConfirmed}
              onChange={(event) => setConfidentialityConfirmed(event.target.checked)}
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
            disabled={!canStartExtraction || extractionStarting || extractionStatus?.state === "Running"}
            onClick={async () => {
              try {
                setExtractionStarting(true);
                setUploadError(null);
                const nextExtraction = await startArbExtraction(reviewId);
                setExtractionStatus(nextExtraction);
                trackArbEvent({
                  name: "arb_extraction_completed",
                  properties: {
                    reviewId,
                    state: nextExtraction.state,
                    evidenceReadiness: nextExtraction.evidenceReadinessState,
                    extractionConfidencePercent: String(nextExtraction.extractionConfidencePercent),
                  },
                });
                const nextRequirements = await fetchArbRequirements(reviewId);
                const nextEvidence = await fetchArbEvidence(reviewId);
                const nextExports = await fetchArbExports(reviewId);
                setRequirements(nextRequirements);
                setEvidenceFacts(nextEvidence);
                setExportArtifacts(nextExports);
                setReview((currentReview) =>
                  currentReview
                    ? {
                        ...currentReview,
                        workflowState: "Review In Progress",
                        evidenceReadinessState:
                          nextExtraction.evidenceReadinessState as ArbReviewSummary["evidenceReadinessState"]
                      }
                    : currentReview
                );
              } catch (startFailure) {
                setUploadError(
                  startFailure instanceof Error
                    ? startFailure.message
                    : "Unable to start analysis. Please try again."
                );
              } finally {
                setExtractionStarting(false);
              }
            }}
          >
            {extractionStarting ? (
              <><span className="arb-spinner" aria-hidden="true" /> Starting analysis…</>
            ) : extractionStatus?.state === "Running" ? (
              <><span className="arb-spinner" aria-hidden="true" /> Analysis in progress…</>
            ) : extractionStatus?.state === "Failed" ? (
              "Retry analysis →"
            ) : (
              "Start analysis →"
            )}
          </button>
          <p className="microcopy">Typical package: 25–35 page design doc, 10–12 page SOW, and a ZIP with 10–15 supporting files. Small uploads may finish sooner; full packages usually take 8–20 minutes.</p>
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
              {extractionStatus.readinessNotes ? (
                <span>{extractionStatus.readinessNotes}</span>
              ) : null}
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

        {/* Run Assessment CTA — shown once extraction is complete */}
        {extractionStatus?.state?.startsWith("Completed") ? (
          <section className="surface-panel arb-action-panel arb-action-panel-highlight">
            <p className="arb-action-panel-label">Extraction complete — ready for framework assessment</p>
            <p className="section-copy">
              Run the automated assessment to produce structured findings, a weighted scorecard, and a
              derived recommendation. Every evidence item is validated against WAF, CAF, ALZ, HA/DR, Security,
              Networking, and Monitoring. Typically takes 10–15 minutes for a full evidence package.
            </p>
            <button
              type="button"
              className="arb-cta-btn"
              disabled={agentRunning}
              onClick={() => {
                if (agentCompleted) {
                  window.location.assign(getArbStepHref(reviewId, "findings"));
                  return;
                }
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

        {/* Export outputs */}
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
            {renderOutputArtifactsCard()}
          </div>
        </div>
      </div>
    );
  }

  function renderRequirementsContent() {
    // Requirements rendering has been extracted to the dedicated ArbRequirementsPage component
    // at src/components/arb/requirements/arb-requirements-page.tsx
    return <p>Requirements are now rendered by the dedicated requirements page component.</p>;
  }

  function renderEvidenceContent() {
    // Evidence rendering has been extracted to the dedicated ArbEvidencePage component
    // at src/components/arb/evidence/arb-evidence-page.tsx
    return <p>Evidence is now rendered by the dedicated evidence page component.</p>;
  }

  // renderFindingsContent removed — findings route now uses ArbFindingsPage component

  // renderScorecardContent removed — scorecard route now uses ArbScorecardPage component

  function renderDecisionContent() {
    const recordedAtLabel = decisionResult?.recordedAt
      ? new Date(decisionResult.recordedAt).toLocaleString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit"
        })
      : "Not recorded yet";
    const decisionStatusLabel = decisionResult?.reviewerDecision ?? shellReview.finalDecision ?? "Pending reviewer sign-off";
    const checkpointOwnerLabel =
      decisionResult?.reviewerName || shellReview.assignedReviewer || decisionReviewerName || "Unassigned";
    const checkpointRoleLabel = decisionResult?.reviewerRole || decisionReviewerRole || "Role not captured";
    const actionableFindings = findings.filter((finding) => !finding.findingId.startsWith("fallback-"));
    const unresolvedFindings = actionableFindings.filter((finding) => !["Accepted", "Resolved"].includes(finding.status));
    const highRiskFindings = unresolvedFindings.filter((finding) =>
      ["Critical", "High"].includes(finding.severity)
    );
    const topDecisionFindings = [...highRiskFindings, ...unresolvedFindings]
      .filter((finding, index, list) => list.findIndex((candidate) => candidate.findingId === finding.findingId) === index)
      .slice(0, 5);
    const decisionReadinessItems = [
      {
        label: "Derived recommendation",
        value: scorecard?.recommendation || shellReview.recommendation || "Pending",
        tone: shellReview.recommendation === "Needs Remediation" ? "risk" : "neutral"
      },
      {
        label: "Evidence readiness",
        value: shellReview.evidenceReadinessState,
        tone: shellReview.evidenceReadinessState === "Insufficient Evidence" ? "risk" : "neutral"
      },
      {
        label: "Score",
        value: scorecard?.overallScore != null ? `${scorecard.overallScore}/100` : shellReview.overallScore != null ? `${shellReview.overallScore}/100` : "Pending",
        tone: (scorecard?.overallScore ?? shellReview.overallScore ?? 0) >= 70 ? "warning" : "risk"
      },
      {
        label: "Open findings",
        value: String(unresolvedFindings.length),
        tone: unresolvedFindings.length > 0 ? "risk" : "neutral"
      }
    ];

    return (
      <div className="arb-page-stack">
        {decisionGateMessage ? (
          <section className="trace-card arb-decision-gate-banner">
            <p className="board-card-subtitle">Decision warning</p>
            <p className="section-copy">{decisionGateMessage}</p>
          </section>
        ) : null}
        <div className="arb-decision-grid arb-decision-workspace">
          <section className="surface-panel arb-summary-card">
            <div className="board-card-head">
              <div className="board-card-head-copy">
                <p className="board-card-subtitle">Decision posture</p>
                <h2 className="section-title">Review status before sign-off</h2>
              </div>
            </div>
            <div className="arb-decision-readiness-grid">
              {decisionReadinessItems.map((item) => (
                <article key={item.label} className={`arb-decision-metric arb-decision-metric-${item.tone}`}>
                  <p className="board-card-subtitle">{item.label}</p>
                  <strong>{item.value}</strong>
                </article>
              ))}
            </div>
            <div className="arb-decision-checkpoint-grid">
              <article className="arb-decision-checkpoint">
                <p className="board-card-subtitle">Decision state</p>
                <strong>{decisionStatusLabel}</strong>
              </article>
              <article className="arb-decision-checkpoint">
                <p className="board-card-subtitle">Checkpoint owner</p>
                <strong>{checkpointOwnerLabel}</strong>
                <p>{checkpointRoleLabel}</p>
              </article>
              <article className="arb-decision-checkpoint">
                <p className="board-card-subtitle">Target review date</p>
                <strong>{shellReview.targetReviewDate ?? "Not scheduled"}</strong>
              </article>
              <article className="arb-decision-checkpoint">
                <p className="board-card-subtitle">Recorded checkpoint</p>
                <strong>{recordedAtLabel}</strong>
              </article>
            </div>

            <section className="arb-decision-section">
              <div>
                <p className="board-card-subtitle">Required reviewer attention</p>
                <h3 className="arb-decision-section-title">Conditions before final approval</h3>
              </div>
              {topDecisionFindings.length > 0 ? (
                <ul className="arb-decision-condition-list">
                  {topDecisionFindings.map((finding) => (
                    <li key={finding.findingId}>
                      <div>
                        <strong>{finding.title}</strong>
                        <p>{finding.domain} · {finding.severity} · {finding.status}</p>
                      </div>
                      <a href={getArbStepHref(reviewId, "findings")} className="arb-inline-link">
                        Review finding
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="section-copy">No unresolved findings are currently blocking reviewer sign-off.</p>
              )}
            </section>

            <section className="arb-decision-section">
              <div>
                <p className="board-card-subtitle">Remediation actions</p>
                <h3 className="arb-decision-section-title">Open action checkpoint</h3>
              </div>
              {actionSummary.openActions.length > 0 ? (
                <ul className="arb-checklist">
                  {actionSummary.openActions.map((action) => (
                    <li key={action.actionId}>
                      {action.actionSummary} ({action.status})
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="section-copy">No action records are open. Findings may still need remediation before approval.</p>
              )}
            </section>

            <p className="section-copy">The derived recommendation is advisory. The recorded decision is the binding outcome for this review.</p>
            {decisionResult ? (
              <div className="trace-card arb-summary-card arb-decision-recorded">
                <p className="board-card-subtitle">Decision recorded</p>
                <div className="arb-decision-recorded-grid">
                  <div><span className="microcopy">Decision</span><strong>{decisionResult.reviewerDecision}</strong></div>
                  <div><span className="microcopy">Derived recommendation</span><strong>{decisionResult.aiRecommendation}</strong></div>
                  {decisionResult.reviewerName && <div><span className="microcopy">Reviewer</span><strong>{decisionResult.reviewerName}</strong></div>}
                  {decisionResult.reviewerRole && <div><span className="microcopy">Role</span><strong>{decisionResult.reviewerRole}</strong></div>}
                  <div><span className="microcopy">Recorded at</span><strong>{new Date(decisionResult.recordedAt).toLocaleString()}</strong></div>
                </div>
                {decisionResult.rationale && <p className="section-copy" style={{ marginTop: 8 }}>{decisionResult.rationale}</p>}
              </div>
            ) : null}
          </section>

          <section className="surface-panel arb-summary-card">
            <div className="board-card-head">
              <div className="board-card-head-copy">
                <p className="board-card-subtitle">Reviewer sign-off</p>
                <h2 className="section-title">Record the human decision — separate from the derived recommendation</h2>
              </div>
            </div>
            <div className="arb-form-grid">
              <label className="filter-field">
                <span>Reviewer name</span>
                <input
                  className="field-input"
                  aria-label="Reviewer name"
                  placeholder="Your name"
                  value={decisionReviewerName}
                  onChange={(event) => setDecisionReviewerName(event.target.value)}
                />
              </label>
              <label className="filter-field">
                <span>Reviewer role</span>
                <input
                  className="field-input"
                  aria-label="Reviewer role"
                  placeholder="e.g. Principal Architect, Cloud Director"
                  value={decisionReviewerRole}
                  onChange={(event) => setDecisionReviewerRole(event.target.value)}
                />
              </label>
            </div>
            <section className="trace-card arb-summary-card" style={{ marginBottom: 16 }}>
              <p className="board-card-subtitle">Decision model</p>
              <div className="arb-checklist">
                <div>
                  <strong>Approved</strong>
                  <p className="microcopy">Use only when remediation is complete, no blocked actions remain, and the architecture is ready for board sign-off.</p>
                </div>
                <div>
                  <strong>Needs Revision</strong>
                  <p className="microcopy">Use when the architecture can proceed only after named actions, evidence, or reviewer verification are completed.</p>
                </div>
                <div>
                  <strong>Rejected</strong>
                  <p className="microcopy">Use when the proposed architecture should not move forward in its current form and needs material redesign.</p>
                </div>
              </div>
            </section>
            <label className="filter-field">
              <span>Final decision</span>
              <select
                className="field-select"
                aria-label="Final decision"
                value={decisionChoice}
                onChange={(event) => setDecisionChoice(event.target.value)}
              >
                <option value="Approved">Approved</option>
                <option value="Needs Revision">Needs Revision</option>
                <option value="Rejected">Rejected</option>
              </select>
            </label>
            <label className="filter-field">
              <span>Decision rationale</span>
              <textarea
                className="field-textarea"
                aria-label="Decision rationale"
                placeholder="Summarize the basis for this decision, any conditions, and what must happen before approval is unconditional."
                value={decisionRationale}
                onChange={(event) => setDecisionRationale(event.target.value)}
              />
            </label>
            <div className="button-row">
              <button
                type="button"
                className="primary-button"
                onClick={() => void submitDecision()}
                disabled={decisionSaving}
              >
                {decisionSaving ? "Recording decision…" : "Record decision"}
              </button>
            </div>
            {decisionError ? <p className="arb-upload-error">{decisionError}</p> : null}
          </section>
        </div>

        {renderOutputArtifactsCard()}
      </div>
    );
  }

  function renderDefaultContent() {
    // Overview is now rendered by the dedicated ArbOverviewPage component.
    // This fallback is kept for non-overview default steps only.
    return (
      <ArbPlaceholderPage
        intro="Review workspace for this architecture assessment. Use the navigation above to access each step of the review workflow."
        bullets={buildBullets(activeStep, findings, scorecard)}
        footer={null}
      />
    );
  }

  function renderStepContent() {
    if (activeStep === "upload") {
      return renderUploadContent();
    }

    if (activeStep === "findings") {
      return <p>Findings are now rendered by the dedicated findings page component.</p>;
    }

    if (activeStep === "requirements") {
      return renderRequirementsContent();
    }

    if (activeStep === "evidence") {
      return <p>Evidence is now rendered by the dedicated evidence page component.</p>;
    }

    if (activeStep === "scorecard") {
      return <p>Scorecard is now rendered by the dedicated scorecard page component.</p>;
    }

    if (activeStep === "decision") {
      return renderDecisionContent();
    }

    return renderDefaultContent();
  }

  return (
    <ArbReviewShell
      review={shellReview}
      steps={getArbReviewSteps(reviewId)}
      activeStep={activeStep}
      title={title}
      description={description}
      reviewSummary={scorecard?.reviewSummary ?? null}
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
        renderStepContent()
      )}
    </ArbReviewShell>
  );
}
