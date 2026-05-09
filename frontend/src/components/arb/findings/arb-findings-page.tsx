"use client";

import { useEffect, useState } from "react";
import {
  createArbExport,
  createArbAction,
  fetchArbActions,
  fetchArbFindings,
  fetchArbReview,
  fetchArbScorecard,
  updateArbAction,
  updateArbFinding,
} from "@/arb/api";
import { getArbReviewSteps } from "@/arb/mock-review";
import { getArbStepHref } from "@/arb/routes";
import { ENABLED_AUTH_PROVIDERS, buildLoginUrl } from "@/lib/review-cloud";
import type {
  ArbAction,
  ArbFinding,
  ArbReviewSummary,
  ArbScorecard,
} from "@/arb/types";
import type { FindingsFilterState } from "./findings-utils";
import { ArbPlaceholderPage } from "@/components/arb/placeholder-page";
import { ArbReviewShell } from "@/components/arb/review-shell";
import { FindingsStatusBar } from "./findings-status-bar";
import { FindingsListPanel } from "./findings-list-panel";
import { FindingDetailPanel } from "./finding-detail-panel";
import styles from "./arb-findings-page.module.css";

export function ArbFindingsPage({ reviewId }: { reviewId: string }) {
  const [review, setReview] = useState<ArbReviewSummary | null>(null);
  const [findings, setFindings] = useState<ArbFinding[]>([]);
  const [actions, setActions] = useState<ArbAction[]>([]);
  const [scorecard, setScorecard] = useState<ArbScorecard | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FindingsFilterState>({
    severities: new Set(),
    domains: new Set(),
    statuses: new Set(),
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingFindingId, setSavingFindingId] = useState<string | null>(null);
  const [savingActionId, setSavingActionId] = useState<string | null>(null);
  const [creatingActionForFindingId, setCreatingActionForFindingId] = useState<string | null>(null);
  const [findingError, setFindingError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  const authRequired = error?.includes("Sign in is required") ?? false;

  // ── Data fetching ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [reviewRes, findingsRes, actionsRes, scorecardRes] = await Promise.all([
          fetchArbReview(reviewId),
          fetchArbFindings(reviewId),
          fetchArbActions(reviewId),
          fetchArbScorecard(reviewId),
        ]);

        if (!cancelled) {
          setReview(reviewRes);
          setFindings(findingsRes);
          setActions(actionsRes);
          setScorecard(scorecardRes);
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
    return () => { cancelled = true; };
  }, [reviewId]);

  // ── Auto-select first non-fallback finding ─────────────────────────
  useEffect(() => {
    setSelectedFindingId((current) => {
      const nonFallback = findings.filter((f) => !f.findingId.startsWith("fallback-"));
      if (current && nonFallback.some((f) => f.findingId === current)) {
        return current;
      }
      return nonFallback[0]?.findingId ?? null;
    });
  }, [findings]);

  // ── Handlers ───────────────────────────────────────────────────────
  async function handleSaveFinding(finding: ArbFinding) {
    try {
      setSavingFindingId(finding.findingId);
      setFindingError(null);

      const saved = await updateArbFinding({
        reviewId,
        findingId: finding.findingId,
        status: finding.status,
        owner: finding.owner,
        dueDate: finding.dueDate,
        reviewerNote: finding.reviewerNote,
        criticalBlocker: finding.criticalBlocker,
      });

      setFindings((prev) =>
        prev.map((f) => (f.findingId === saved.findingId ? saved : f)),
      );
    } catch (err) {
      setFindingError(err instanceof Error ? err.message : "Unable to update the finding.");
    } finally {
      setSavingFindingId(null);
    }
  }

  async function handleCreateAction(finding: ArbFinding) {
    try {
      setCreatingActionForFindingId(finding.findingId);
      setFindingError(null);

      const created = await createArbAction({
        reviewId,
        sourceFindingId: finding.findingId,
      });

      setActions((prev) => [...prev, created]);
    } catch (err) {
      setFindingError(err instanceof Error ? err.message : "Unable to create the action.");
    } finally {
      setCreatingActionForFindingId(null);
    }
  }

  async function handleSaveAction(action: ArbAction) {
    try {
      setSavingActionId(action.actionId);
      setFindingError(null);

      const saved = await updateArbAction({
        reviewId,
        actionId: action.actionId,
        owner: action.owner,
        dueDate: action.dueDate,
        status: action.status,
        closureNotes: action.closureNotes,
        reviewerVerificationRequired: action.reviewerVerificationRequired,
      });

      setActions((prev) =>
        prev.map((a) => (a.actionId === saved.actionId ? saved : a)),
      );
    } catch (err) {
      setFindingError(err instanceof Error ? err.message : "Unable to update the action.");
    } finally {
      setSavingActionId(null);
    }
  }

  async function handleExport() {
    try {
      setExportLoading(true);
      await createArbExport({
        reviewId,
        format: "markdown",
        includeFindings: true,
        includeScorecard: true,
        includeActions: true,
      });
    } catch {
      // Export error is non-blocking
    } finally {
      setExportLoading(false);
    }
  }

  function handleUpdateFinding(updated: ArbFinding) {
    setFindings((prev) =>
      prev.map((f) => (f.findingId === updated.findingId ? updated : f)),
    );
  }

  function handleUpdateAction(updated: ArbAction) {
    setActions((prev) =>
      prev.map((a) => (a.actionId === updated.actionId ? updated : a)),
    );
  }

  // ── Derived data ───────────────────────────────────────────────────
  const nonFallbackFindings = findings.filter((f) => !f.findingId.startsWith("fallback-"));
  const allFallback = findings.length > 0 && nonFallbackFindings.length === 0;
  const someFallback = findings.length > 0 && nonFallbackFindings.length > 0 && nonFallbackFindings.length < findings.length;

  const selectedFinding = nonFallbackFindings.find((f) => f.findingId === selectedFindingId) ?? null;
  const selectedAction = selectedFinding
    ? actions.find((a) => a.sourceFindingId === selectedFinding.findingId) ?? null
    : null;

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
    // Empty state
    if (nonFallbackFindings.length === 0 && !allFallback) {
      return (
        <ArbPlaceholderPage
          intro="No findings yet — the automated assessment hasn't run for this review."
          bullets={[
            "Go back to the Upload step and click 'Run assessment →' to generate findings",
            "Documents are validated against WAF, CAF, ALZ, HA/DR, Security, Networking, and Monitoring",
            "Findings appear here automatically — typically 1–3 minutes",
          ]}
          footer={
            <a href={getArbStepHref(reviewId, "upload", "upload-documents")} className="primary-button">
              Go to Upload — Run assessment →
            </a>
          }
        />
      );
    }

    // All fallback — retry prompt
    if (allFallback) {
      return (
        <ArbPlaceholderPage
          intro="Provisional assessment — the automated model was unavailable. These findings were generated by a deterministic fallback."
          bullets={[
            "Re-run the assessment from the Upload step to get full framework-grounded findings",
            "Fallback findings are not displayed as real findings",
          ]}
          footer={
            <a href={getArbStepHref(reviewId, "upload", "upload-documents")} className="primary-button">
              Go to Upload — Re-run assessment →
            </a>
          }
        />
      );
    }

    return (
      <>
        {/* Fallback warning banner */}
        {someFallback && (
          <section
            style={{
              background: "var(--med-dim, #FEF3C7)",
              border: "1px solid var(--med, #F59E0B)",
              borderRadius: 8,
              padding: "12px 20px",
              marginBottom: 0,
            }}
          >
            <p style={{ margin: 0, fontWeight: 600, color: "var(--med, #B45309)" }}>
              ⚠ Some findings were generated by a deterministic fallback and have been excluded.
            </p>
            <p style={{ margin: "4px 0 0", fontSize: "0.9rem", color: "var(--text-secondary, #6B7280)" }}>
              Re-run the assessment from the Upload step to replace fallback findings with full framework-grounded results.
            </p>
          </section>
        )}

        <FindingsStatusBar
          findings={nonFallbackFindings}
          actions={actions}
          scorecard={scorecard}
          review={shellReview}
          onExport={handleExport}
          exportLoading={exportLoading}
        />

        <div className={styles.masterDetail}>
          <FindingsListPanel
            findings={nonFallbackFindings}
            selectedFindingId={selectedFindingId}
            onSelectFinding={setSelectedFindingId}
            filters={filters}
            onFiltersChange={setFilters}
          />

          {selectedFinding ? (
            <FindingDetailPanel
              finding={selectedFinding}
              action={selectedAction}
              findingError={findingError}
              onUpdateFinding={handleUpdateFinding}
              onSaveFinding={handleSaveFinding}
              onCreateAction={handleCreateAction}
              onUpdateAction={handleUpdateAction}
              onSaveAction={handleSaveAction}
              savingFindingId={savingFindingId}
              savingActionId={savingActionId}
              creatingActionForFindingId={creatingActionForFindingId}
            />
          ) : (
            <div className={styles.detailPanel}>
              <p style={{ color: "var(--text-secondary, #6B7280)" }}>
                Select a finding from the list to view its details.
              </p>
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <div className={styles.fullWidthShell}>
      <ArbReviewShell
        review={shellReview}
        steps={getArbReviewSteps(reviewId)}
        activeStep="findings"
        title="Review Findings"
        description="Work from blockers, missing evidence, owners, and remediation actions before scoring."
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
          <div className={styles.findingsLayout}>
            {renderContent()}
          </div>
        )}
      </ArbReviewShell>
    </div>
  );
}
