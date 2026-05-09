"use client";

import { useEffect, useState } from "react";
import {
  createArbExport,
  downloadArbExport,
  fetchArbActions,
  fetchArbExports,
  fetchArbFindings,
  fetchArbReview,
  fetchArbScorecard,
} from "@/arb/api";
import { getArbReviewSteps } from "@/arb/mock-review";
import { ENABLED_AUTH_PROVIDERS, buildLoginUrl } from "@/lib/review-cloud";
import type {
  ArbAction,
  ArbExportArtifact,
  ArbFinding,
  ArbReviewSummary,
  ArbScorecard,
} from "@/arb/types";
import { ArbReviewShell } from "@/components/arb/review-shell";
import { sortDomainScores, getDomainScorePercent } from "./scorecard-utils";
import { ScorecardStatusBar } from "./scorecard-status-bar";
import { SummaryHero } from "./summary-hero";
import { StrengthsSection } from "./strengths-section";
import { ConditionsToClose } from "./conditions-to-close";
import { DomainSection } from "./domain-section";
import { ReviewerOverrideSection } from "./reviewer-override-section";
import { NextActionsSection } from "./next-actions-section";
import { ExportSection } from "./export-section";
import styles from "./arb-scorecard-page.module.css";

export function ArbScorecardPage({ reviewId }: { reviewId: string }) {
  const [review, setReview] = useState<ArbReviewSummary | null>(null);
  const [scorecard, setScorecard] = useState<ArbScorecard | null>(null);
  const [findings, setFindings] = useState<ArbFinding[]>([]);
  const [actions, setActions] = useState<ArbAction[]>([]);
  const [exports, setExports] = useState<ArbExportArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [exportLoading, setExportLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const authRequired = error?.includes("Sign in is required") ?? false;

  // ── Data fetching ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [reviewRes, scorecardRes, findingsRes, actionsRes, exportsRes] =
          await Promise.all([
            fetchArbReview(reviewId),
            fetchArbScorecard(reviewId),
            fetchArbFindings(reviewId),
            fetchArbActions(reviewId),
            fetchArbExports(reviewId),
          ]);

        if (!cancelled) {
          setReview(reviewRes);
          setScorecard(scorecardRes);
          setFindings(findingsRes);
          setActions(actionsRes);
          setExports(exportsRes);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load the scorecard."
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
      setExportError(null);
      const artifact = await createArbExport({
        reviewId,
        format: "markdown",
        includeFindings: true,
        includeScorecard: true,
        includeActions: true,
      });
      setExports((prev) => [...prev, artifact]);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Unable to export.");
    } finally {
      setExportLoading(false);
    }
  }

  async function handleRegenerate() {
    try {
      setRegenerating(true);
      setExportError(null);
      const formats = ["markdown", "csv", "html"] as const;
      const results = await Promise.all(
        formats.map((format) =>
          createArbExport({
            reviewId,
            format,
            includeFindings: true,
            includeScorecard: true,
            includeActions: true,
          })
        )
      );
      setExports((prev) => [...prev, ...results]);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Unable to regenerate exports."
      );
    } finally {
      setRegenerating(false);
    }
  }

  async function handleDownload(artifact: ArbExportArtifact) {
    try {
      setDownloadingId(artifact.exportId);
      setExportError(null);
      await downloadArbExport(reviewId, artifact);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Unable to download export."
      );
    } finally {
      setDownloadingId(null);
    }
  }

  // ── Derived data ───────────────────────────────────────────────────
  const openActions = actions.filter((a) => a.status !== "Closed");
  const sortedDomains = scorecard ? sortDomainScores(scorecard.domainScores) : [];
  const isFallback =
    scorecard?.confidence === "Low" &&
    findings.some((f) => f.findingId.startsWith("fallback-"));

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

  // ── Render ─────────────────────────────────────────────────────────
  function renderContent() {
    if (!scorecard) {
      return (
        <div style={{ padding: 24 }}>
          <p style={{ color: "var(--t2)" }}>
            No scorecard available yet. Run the automated assessment from the{" "}
            <a href={`/arb?reviewId=${encodeURIComponent(reviewId)}&step=upload`} className="primary-button" style={{ display: "inline" }}>
              Upload step
            </a>{" "}
            to generate domain scores and a recommendation.
          </p>
        </div>
      );
    }

    return (
      <>
        {isFallback && (
          <section
            style={{
              background: "#FEF3C7",
              border: "1px solid #F59E0B",
              borderRadius: 8,
              padding: "12px 20px",
            }}
          >
            <p style={{ margin: 0, fontWeight: 600, color: "#B45309" }}>
              ⚠ Provisional scorecard — generated by a deterministic fallback.
            </p>
            <p style={{ margin: "4px 0 0", fontSize: "0.9rem", color: "#6B7280" }}>
              Re-run the assessment from the Upload step to get full framework-grounded scores.
            </p>
          </section>
        )}

        <ScorecardStatusBar
          scorecard={scorecard}
          actions={actions}
          review={shellReview}
          onExport={handleExport}
          exportLoading={exportLoading}
        />

        <SummaryHero scorecard={scorecard} openActionCount={openActions.length} />

        <StrengthsSection strengths={scorecard.strengths ?? []} />

        <ConditionsToClose actions={openActions} />

        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 20px" }}>
          {sortedDomains.map((ds) => (
            <DomainSection
              key={ds.domain}
              domainScore={ds}
              findings={findings}
              reviewId={reviewId}
              defaultExpanded={getDomainScorePercent(ds) < 70}
            />
          ))}
        </div>

        <ReviewerOverrideSection
          reviewerOverride={scorecard.reviewerOverride}
          reviewId={reviewId}
        />

        <NextActionsSection nextActions={scorecard.nextActions ?? []} />

        <ExportSection
          reviewId={reviewId}
          exportArtifacts={exports}
          onRegenerate={handleRegenerate}
          onDownload={handleDownload}
          regenerating={regenerating}
          downloadingId={downloadingId}
          error={exportError}
        />
      </>
    );
  }

  return (
    <div className={styles.fullWidthShell}>
      <ArbReviewShell
        review={shellReview}
        steps={getArbReviewSteps(reviewId)}
        activeStep="scorecard"
        title="Scorecard"
        description="Review the weighted rationale, open conditions, and recommendation before final sign-off."
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
          <div style={{ padding: 24 }}>
            <p>{error}</p>
            {authRequired ? (
              <div className="review-command-bar">
                <p>
                  Sign in to access scorecard data for this review.
                </p>
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
          <div className={styles.scorecardLayout}>{renderContent()}</div>
        )}
      </ArbReviewShell>
    </div>
  );
}
