"use client";

import { useEffect, useState } from "react";
import {
  createArbExport,
  fetchArbActions,
  fetchArbEvidence,
  fetchArbExports,
  fetchArbFindings,
  fetchArbRequirements,
  fetchArbReview,
  fetchArbScorecard,
} from "@/arb/api";
import { getArbReviewSteps } from "@/arb/mock-review";
import { ENABLED_AUTH_PROVIDERS, buildLoginUrl } from "@/lib/review-cloud";
import type {
  ArbAction,
  ArbEvidenceFact,
  ArbExportArtifact,
  ArbFinding,
  ArbRequirement,
  ArbReviewSummary,
  ArbScorecard,
} from "@/arb/types";
import { ArbReviewShell } from "@/components/arb/review-shell";
import { OverviewStatusBar } from "./overview-status-bar";
import { OverviewScoreSection } from "./overview-score-section";
import { OverviewMetricsGrid } from "./overview-metrics-grid";
import { OverviewWorkflowProgress } from "./overview-workflow-progress";
import { OverviewQuickLinks } from "./overview-quick-links";
import { getWorkflowProgress } from "./overview-utils";
import styles from "./arb-overview-page.module.css";

export function ArbOverviewPage({ reviewId }: { reviewId: string }) {
  const [review, setReview] = useState<ArbReviewSummary | null>(null);
  const [findings, setFindings] = useState<ArbFinding[]>([]);
  const [actions, setActions] = useState<ArbAction[]>([]);
  const [scorecard, setScorecard] = useState<ArbScorecard | null>(null);
  const [evidence, setEvidence] = useState<ArbEvidenceFact[]>([]);
  const [requirements, setRequirements] = useState<ArbRequirement[]>([]);
  const [exports, setExports] = useState<ArbExportArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  const authRequired = error?.includes("Sign in is required") ?? false;

  // ── Data fetching ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [
          reviewRes,
          findingsRes,
          actionsRes,
          scorecardRes,
          evidenceRes,
          requirementsRes,
          exportsRes,
        ] = await Promise.all([
          fetchArbReview(reviewId),
          fetchArbFindings(reviewId),
          fetchArbActions(reviewId),
          fetchArbScorecard(reviewId),
          fetchArbEvidence(reviewId),
          fetchArbRequirements(reviewId),
          fetchArbExports(reviewId),
        ]);

        if (!cancelled) {
          setReview(reviewRes);
          setFindings(findingsRes);
          setActions(actionsRes);
          setScorecard(scorecardRes);
          setEvidence(evidenceRes);
          setRequirements(requirementsRes);
          setExports(exportsRes);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load the review.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [reviewId]);

  // ── Handlers ───────────────────────────────────────────────────────
  async function handleExport() {
    try {
      setExportLoading(true);
      const artifact = await createArbExport({
        reviewId,
        format: "markdown",
        includeFindings: true,
        includeScorecard: true,
        includeActions: true,
      });
      setExports((prev) => [...prev, artifact]);
    } catch {
      // Export error is non-blocking
    } finally {
      setExportLoading(false);
    }
  }

  // ── Derived data ───────────────────────────────────────────────────
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

  const workflowSteps = review
    ? getWorkflowProgress(review, findings, scorecard, evidence, requirements)
    : [];

  const assessmentSummary =
    scorecard?.reviewSummary ??
    (review && review.workflowState !== "Draft" && review.recommendation
      ? `${review.projectName} review is ${review.workflowState.toLowerCase()}. Recommendation: ${review.recommendation}. Evidence readiness: ${review.evidenceReadinessState}.${review.overallScore != null ? ` Overall score: ${review.overallScore}/100.` : ""}`
      : null);

  const hasData =
    findings.length > 0 ||
    evidence.length > 0 ||
    requirements.length > 0 ||
    (scorecard !== null && scorecard.overallScore !== null);

  // ── Render content ─────────────────────────────────────────────────
  function renderContent() {
    if (!hasData && review?.workflowState === "Draft") {
      return (
        <div style={{ padding: 40, textAlign: "center" }}>
          <p style={{ fontSize: "1.1rem", color: "var(--t1)", marginBottom: 8 }}>
            Start by uploading your architecture documents
          </p>
          <p style={{ fontSize: "0.9rem", color: "var(--t2)", marginBottom: 20 }}>
            Upload SOW, design docs, and supporting artifacts to begin the review workflow.
          </p>
          <a
            href={`/arb?reviewId=${encodeURIComponent(reviewId)}&step=upload`}
            className="primary-button"
          >
            Go to Upload
          </a>
        </div>
      );
    }

    return (
      <>
        <OverviewStatusBar
          review={shellReview}
          onExport={handleExport}
          exportLoading={exportLoading}
        />

        <div className={styles.dashboardGrid}>
          <OverviewScoreSection scorecard={scorecard} review={shellReview} />
          <OverviewMetricsGrid
            findings={findings}
            evidence={evidence}
            requirements={requirements}
            actions={actions}
            review={shellReview}
          />
        </div>

        <OverviewWorkflowProgress steps={workflowSteps} reviewId={reviewId} />

        {assessmentSummary && (
          <div className={styles.summaryCard}>
            <p>{assessmentSummary}</p>
          </div>
        )}

        <OverviewQuickLinks steps={workflowSteps} reviewId={reviewId} />
      </>
    );
  }

  return (
    <div className={styles.fullWidthShell}>
      <ArbReviewShell
        review={shellReview}
        steps={getArbReviewSteps(reviewId)}
        activeStep="overview"
        title="Review Workspace Overview"
        description="See the current evidence posture, workflow state, and next step for this architecture review."
        reviewSummary={assessmentSummary}
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
          <div style={{ padding: 24 }}>
            <p>{error}</p>
            {authRequired ? (
              <div className="review-command-bar">
                <p>Sign in to access review data.</p>
                <div className="review-command-actions">
                  {ENABLED_AUTH_PROVIDERS.map((provider, index) => (
                    <a
                      key={provider.id}
                      href={buildLoginUrl(provider.id)}
                      className={
                        index === 0 ? "primary-button" : "secondary-button"
                      }
                    >
                      Continue with {provider.label}
                    </a>
                  ))}
                </div>
              </div>
            ) : (
              <p>
                This feature is temporarily unavailable. Please try again later.
              </p>
            )}
          </div>
        ) : (
          <div className={styles.overviewLayout}>{renderContent()}</div>
        )}
      </ArbReviewShell>
    </div>
  );
}
