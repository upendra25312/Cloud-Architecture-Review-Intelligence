"use client";

import { useEffect, useState } from "react";
import {
  fetchArbDecision,
  fetchArbReview,
  fetchArbScorecard,
  recordArbDecision,
  downloadArbPptxExport,
} from "@/arb/api";
import { getArbReviewSteps } from "@/arb/routes";
import { ENABLED_AUTH_PROVIDERS, buildLoginUrl } from "@/lib/review-cloud";
import type { ArbDecision, ArbReviewSummary, ArbScorecard } from "@/arb/types";
import { ArbReviewShell } from "@/components/arb/review-shell";
import styles from "./arb-decision-page.module.css";

const DECISION_OPTIONS = [
  {
    value: "Approved",
    label: "Approved",
    description: "Architecture meets all requirements. Approved to proceed.",
    color: "green",
  },
  {
    value: "Approved with Conditions",
    label: "Approved with Conditions",
    description: "Architecture approved subject to conditions being met before deployment.",
    color: "teal",
  },
  {
    value: "Needs Revision",
    label: "Needs Revision",
    description: "Architecture requires revisions before re-submission.",
    color: "amber",
  },
  {
    value: "Rejected",
    label: "Rejected",
    description: "Architecture does not meet requirements. Not approved to proceed.",
    color: "red",
  },
];

function getRecClass(rec: string): string {
  if (rec === "Recommended for Approval") return "approved";
  if (rec === "Approved with Conditions") return "conditions";
  if (rec === "Needs Revision") return "revision";
  if (rec === "Not Recommended") return "rejected";
  return "neutral";
}

function getDecisionClass(dec: string): string {
  if (dec === "Approved") return "approved";
  if (dec === "Approved with Conditions") return "conditions";
  if (dec === "Needs Revision") return "revision";
  if (dec === "Rejected") return "rejected";
  return "neutral";
}

function aiRecToDecision(rec: string): string {
  if (rec === "Recommended for Approval") return "Approved";
  if (rec === "Approved with Conditions") return "Approved with Conditions";
  if (rec === "Needs Revision") return "Needs Revision";
  if (rec === "Not Recommended") return "Rejected";
  return "Approved";
}

export function ArbDecisionPage({ reviewId }: { reviewId: string }) {
  const [review, setReview] = useState<ArbReviewSummary | null>(null);
  const [scorecard, setScorecard] = useState<ArbScorecard | null>(null);
  const [decision, setDecision] = useState<ArbDecision | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDecision, setSelectedDecision] = useState("Approved");
  const [rationale, setRationale] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerRole, setReviewerRole] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const authRequired = error?.includes("Sign in is required") ?? false;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [reviewRes, scorecardRes, decisionRes] = await Promise.all([
          fetchArbReview(reviewId),
          fetchArbScorecard(reviewId).catch(() => null),
          fetchArbDecision(reviewId).catch(() => null),
        ]);

        if (!cancelled) {
          setReview(reviewRes);
          setScorecard(scorecardRes);
          setDecision(decisionRes);

          if (decisionRes?.reviewerDecision) {
            setSelectedDecision(decisionRes.reviewerDecision);
            setRationale(decisionRes.rationale ?? "");
            setReviewerName(decisionRes.reviewerName ?? "");
            setReviewerRole(decisionRes.reviewerRole ?? "");
          } else if (reviewRes.recommendation && reviewRes.recommendation !== "Loading") {
            setSelectedDecision(aiRecToDecision(reviewRes.recommendation));
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load the decision.");
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rationale.trim()) return;
    try {
      setSubmitting(true);
      const result = await recordArbDecision({
        reviewId,
        finalDecision: selectedDecision,
        rationale: rationale.trim(),
        reviewerName: reviewerName.trim() || undefined,
        reviewerRole: reviewerRole.trim() || undefined,
      });
      setDecision(result);
    } catch {
      setError("Failed to record decision. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleExport() {
    try {
      setExportLoading(true);
      await downloadArbPptxExport(reviewId);
    } catch {
      // non-blocking
    } finally {
      setExportLoading(false);
    }
  }

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

  return (
    <div className={styles.fullWidthShell}>
      <ArbReviewShell
        review={shellReview}
        steps={getArbReviewSteps(reviewId)}
        activeStep="decision"
        title="Decision and Sign-off"
        description="Capture the reviewer decision, rationale, and sign-off details for the ARB board package."
        reviewSummary={null}
      >
        {loading ? (
          <div className="arb-loading-skeleton">
            <div className="arb-skeleton-bar arb-skeleton-bar--wide" />
            <div className="arb-skeleton-bar arb-skeleton-bar--medium" />
            <div className="arb-skeleton-bar arb-skeleton-bar--narrow" />
            <div className="arb-skeleton-bar arb-skeleton-bar--wide" />
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
          <div className={styles.decisionLayout}>
            {/* Automated recommendation panel */}
            {(scorecard !== null || (review?.recommendation && review.recommendation !== "Loading")) && (
              <div className={styles.aiPanel}>
                <p className={styles.aiPanelLabel}>Automated Recommendation</p>
                <div className={styles.aiPanelContent}>
                  <span className={`${styles.aiRecommendation} ${styles[`aiRec--${getRecClass(review?.recommendation ?? "")}`]}`}>
                    {review?.recommendation ?? "—"}
                  </span>
                  {scorecard?.overallScore != null && (
                    <span className={styles.aiScore}>Overall score: {scorecard.overallScore}/100</span>
                  )}
                </div>
                {scorecard?.reviewSummary && (
                  <p className={styles.aiSummary}>{scorecard.reviewSummary}</p>
                )}
              </div>
            )}

            {decision ? (
              /* ── Recorded state ─────────────────────────────── */
              <div className={styles.recordedCard}>
                <div className={styles.recordedHeader}>
                  <span className={`${styles.recordedBadge} ${styles[`badge--${getDecisionClass(decision.reviewerDecision)}`]}`}>
                    {decision.reviewerDecision}
                  </span>
                  <span className={styles.recordedAt}>
                    Recorded {new Date(decision.recordedAt).toLocaleString()}
                  </span>
                </div>

                {(decision.reviewerName ?? decision.reviewerRole) && (
                  <p className={styles.reviewerLine}>
                    {[decision.reviewerName, decision.reviewerRole].filter(Boolean).join(" · ")}
                  </p>
                )}

                <blockquote className={styles.recordedRationale}>
                  {decision.rationale}
                </blockquote>

                <div className={styles.recordedActions}>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void handleExport()}
                    disabled={exportLoading}
                  >
                    {exportLoading ? "Generating…" : "Export Board Pack (PPTX)"}
                  </button>
                  <a
                    href={`/arb?reviewId=${encodeURIComponent(reviewId)}&step=overview`}
                    className="secondary-button"
                  >
                    Back to Overview
                  </a>
                </div>
              </div>
            ) : (
              /* ── Decision form ──────────────────────────────── */
              <form onSubmit={(e) => void handleSubmit(e)} className={styles.decisionForm}>
                <div>
                  <p className={styles.formSectionLabel}>Reviewer Decision</p>
                  <div className={styles.decisionOptions}>
                    {DECISION_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        className={[
                          styles.decisionOption,
                          selectedDecision === opt.value ? styles.decisionOptionSelected : "",
                          styles[`option--${opt.color}`],
                        ].join(" ")}
                      >
                        <input
                          type="radio"
                          name="decision"
                          value={opt.value}
                          checked={selectedDecision === opt.value}
                          onChange={() => setSelectedDecision(opt.value)}
                          className={styles.radioInput}
                        />
                        <div>
                          <span className={styles.optionLabel}>{opt.label}</span>
                          <span className={styles.optionDesc}>{opt.description}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <p className={styles.formSectionLabel}>
                    Rationale <span className={styles.required}>*</span>
                  </p>
                  <textarea
                    className={styles.rationaleInput}
                    placeholder="Provide the justification for this decision, including any conditions or exceptions…"
                    value={rationale}
                    onChange={(e) => setRationale(e.target.value)}
                    rows={5}
                    required
                  />
                </div>

                <div className={styles.reviewerRow}>
                  <div className={styles.reviewerField}>
                    <p className={styles.formSectionLabel}>Reviewer Name</p>
                    <input
                      type="text"
                      className={styles.textInput}
                      placeholder="Your name"
                      value={reviewerName}
                      onChange={(e) => setReviewerName(e.target.value)}
                    />
                  </div>
                  <div className={styles.reviewerField}>
                    <p className={styles.formSectionLabel}>Reviewer Role</p>
                    <input
                      type="text"
                      className={styles.textInput}
                      placeholder="e.g. Principal Architect"
                      value={reviewerRole}
                      onChange={(e) => setReviewerRole(e.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.formActions}>
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={submitting || !rationale.trim()}
                  >
                    {submitting ? "Recording…" : "Record Decision"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </ArbReviewShell>
    </div>
  );
}
