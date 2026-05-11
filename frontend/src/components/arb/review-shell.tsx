import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import type { ArbReviewStep, ArbReviewSummary } from "@/arb/types";

function formatWorkflowTimestamp(value: string | undefined) {
  if (!value) {
    return "Not yet available";
  }

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function getStepGuidance(activeStep: string) {
  switch (activeStep) {
    case "upload":
      return {
        title: "Package intake",
        body:
          "Stage source documents first so extraction, findings, and scoring are grounded in actual project evidence."
      };
    case "requirements":
      return {
        title: "Requirement confirmation",
        body:
          "Confirm what the platform extracted before moving into evidence mapping or generating findings."
      };
    case "evidence":
      return {
        title: "Evidence mapping",
        body:
          "Keep each requirement traceable to a cited source excerpt so missing evidence stays visible before scoring."
      };
    case "findings":
      return {
        title: "Findings-first workflow",
        body:
          "Triaging blockers, owners, and due dates here should drive what appears in the scorecard and decision surfaces."
      };
    case "scorecard":
      return {
        title: "Explainable scoring",
        body:
          "Use the weighted score as a transparent checkpoint, not as a replacement for human review judgment."
      };
    case "decision":
      return {
        title: "Final decision",
        body:
          "The assessment provides a recommendation, but the final decision, rationale, and conditions are determined by the reviewer."
      };
    default:
      return {
        title: "Review orientation",
        body:
          "Use this workspace to move from uploaded evidence to findings, score, and an explicit reviewer decision."
      };
  }
}

function getPostureActionHint(review: ArbReviewSummary) {
  if (review.finalDecision) {
    return "Decision recorded. Confirm rationale and export the board pack.";
  }

  if (review.recommendation === "Needs Revision") {
    return "Prioritize unresolved evidence gaps before final sign-off.";
  }

  if (review.recommendation === "Needs Remediation") {
    return "Resolve remediation findings before final sign-off.";
  }

  if (review.workflowState === "Evidence Ready") {
    return "Evidence is staged. Run findings and verify domain score impact.";
  }

  return "Advance the active workflow stage to keep findings and scorecard current.";
}

function getScoreClass(score: number | null | undefined) {
  if (score === null || score === undefined) {
    return "arb-shell-score-pending";
  }

  if (score >= 80) {
    return "arb-shell-score-good";
  }

  if (score >= 70) {
    return "arb-shell-score-warning";
  }

  return "arb-shell-score-risk";
}

export function ArbReviewShell(props: {
  review: ArbReviewSummary;
  steps: ArbReviewStep[];
  activeStep: string;
  title: string;
  description: string;
  reviewSummary?: string | null;
  children: ReactNode;
}) {
  const { review, steps, activeStep, title, description, reviewSummary, children } = props;
  const activeStepIndex = steps.findIndex((step) => step.key === activeStep);
  const guidance = getStepGuidance(activeStep);
  const activeStepLabel = steps.find((step) => step.key === activeStep)?.label ?? "Overview";
  const postureActionHint = getPostureActionHint(review);
  const recommendationValue = review.finalDecision ?? review.recommendation ?? "Pending";

  // Generate a derived summary when model-backed review output does not provide one.
  const derivedSummary = reviewSummary || (
    review.workflowState !== "Draft" && review.recommendation
      ? `${review.projectName} review is ${review.workflowState.toLowerCase()}. Recommendation: ${review.recommendation}. Evidence readiness: ${review.evidenceReadinessState}.${review.overallScore != null ? ` Overall score: ${review.overallScore}/100.` : ""}`
      : null
  );

  // Helper: build upload step href for this review
  function getUploadStepHref() {
    return `/arb?reviewId=${encodeURIComponent(review.reviewId)}&step=upload`;
  }

  return (
    <main className="arb-page-stack">
      <section className="review-command-panel">
        <div className="detail-command-grid">
          <div className="detail-command-copy">
            <p className="header-badge">
              {activeStep === "scorecard" || activeStep === "decision"
                ? "Decision Center"
                : "Review Workspace"}
            </p>
            <h1 className="review-command-title">{title}</h1>
            <p className="review-command-summary">{description}</p>
            <div className="board-summary-row">
              <span className="pill">Project: {review.projectName}</span>
              <span className="pill">Customer: {review.customerName || "Not specified"}</span>
              <span className="pill">Review ID: {review.reviewId}</span>
            </div>
            <div className="button-row">
              <Link href="/arb" className="secondary-button">
                Back to reviews
              </Link>
              <Link href="/decision-center" className="ghost-button">
                Open Decision Center
              </Link>
              {/* Persistent Upload Documents button, hidden on upload step */}
              {activeStep !== "upload" && (
                <Link
                  href={getUploadStepHref() as Route}
                  className="primary-button"
                  title="You can upload additional evidence at any time."
                  style={{ marginLeft: 8 }}
                >
                  Upload Documents
                </Link>
              )}
            </div>
          </div>

          <aside className="detail-command-sidecar future-card arb-shell-sidecar-card">
            <p className="board-card-subtitle">Current status</p>
            <div className="arb-shell-sidecar-metrics">
              <div className="arb-shell-metric">
                <p className="arb-shell-metric-label">Workflow</p>
                <p className="arb-shell-metric-value">{review.workflowState}</p>
              </div>
              <div className="arb-shell-metric">
                <p className="arb-shell-metric-label">Evidence</p>
                <p className="arb-shell-metric-value">{review.evidenceReadinessState}</p>
              </div>
              <div className="arb-shell-metric">
                <p className="arb-shell-metric-label">Recommendation</p>
                <p className="arb-shell-metric-value">{recommendationValue}</p>
              </div>
              <div className="arb-shell-metric">
                <p className="arb-shell-metric-label">Score</p>
                {review.evidenceReadinessState === "Insufficient Evidence" ? (
                  <p className="arb-shell-metric-value arb-shell-score arb-shell-score-pending" title="Score is provisional — insufficient evidence to validate">
                    {review.overallScore ?? "—"}
                    <span className="arb-shell-score-caveat"> (provisional)</span>
                  </p>
                ) : (
                  <p className={`arb-shell-metric-value arb-shell-score ${getScoreClass(review.overallScore)}`}>
                    {review.overallScore ?? "Pending"}
                  </p>
                )}
              </div>
            </div>
            <p className="arb-shell-posture-note">{postureActionHint}</p>
          </aside>
        </div>

        <nav className="arb-step-strip" aria-label="ARB workflow steps">
          {steps.map((step) => (
            <Link
              key={step.key}
              href={step.href}
              className={`arb-step-link${
                step.key === activeStep
                  ? " arb-step-link-active"
                  : activeStepIndex >= 0 && steps.findIndex((candidate) => candidate.key === step.key) < activeStepIndex
                    ? " arb-step-link-complete"
                    : ""
              }`}
              aria-current={step.key === activeStep ? "step" : undefined}
            >
              <span>{step.label}</span>
            </Link>
          ))}
        </nav>
      </section>

      <div className="arb-shell-grid">
        <section className="surface-panel arb-shell-main">{children}</section>

        <aside className="arb-sidecar-stack" style={{ minWidth: 0 }}>
          <section style={{ padding: "20px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFFFFF" }}>
            <p style={{ margin: "0 0 12px", color: "#111827", fontSize: "0.82rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>Assessment summary</p>
            {derivedSummary ? (
              <p style={{ color: "#374151", fontSize: "0.9rem", lineHeight: 1.65, margin: 0, whiteSpace: "pre-wrap" as const }}>{derivedSummary}</p>
            ) : (
              <p style={{ color: "#9CA3AF", fontStyle: "italic", fontSize: "0.9rem", lineHeight: 1.6, margin: 0 }}>
                Run the automated assessment to generate an executive summary grounded in your uploaded documents.
              </p>
            )}
          </section>

          <section style={{ padding: "20px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFFFFF" }}>
            <p style={{ margin: "0 0 12px", color: "#111827", fontSize: "0.82rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>Review status</p>
            <div style={{ display: "grid", gap: "0" }}>
              {[
                ["Active Stage", activeStepLabel],
                ["Workflow State", review.workflowState],
                ["Evidence Readiness", review.evidenceReadinessState],
                ["Recommendation", review.recommendation ?? "Pending"],
                ["Final Decision", review.finalDecision ?? "Pending"],
                ["Assigned Reviewer", review.assignedReviewer ?? "Unassigned"],
                ["Review ID", review.reviewId],
                ["Last Updated", formatWorkflowTimestamp(review.lastUpdated)]
              ].map(([label, value], i, arr) => (
                <div key={label} style={{ padding: "8px 0", borderBottom: i < arr.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                  <div style={{ color: "#0078D4", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: "2px" }}>{label}</div>
                  <div style={{ color: "#111827", fontSize: "0.92rem", fontWeight: 600 }}>{value}</div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ padding: "20px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#F9FAFB" }}>
            <p style={{ margin: "0 0 8px", color: "#111827", fontSize: "0.82rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>{guidance.title}</p>
            <p style={{ color: "#4B5563", fontSize: "0.9rem", lineHeight: 1.6, margin: 0 }}>{guidance.body}</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
