"use client";

import { useEffect, useState } from "react";
import {
  createArbExport,
  downloadArbExport,
  fetchArbEvidence,
  fetchArbExports,
  fetchArbFindings,
  fetchArbReview,
} from "@/arb/api";
import { getArbReviewSteps } from "@/arb/mock-review";
import { getArbStepHref } from "@/arb/routes";
import { ENABLED_AUTH_PROVIDERS, buildLoginUrl } from "@/lib/review-cloud";
import type {
  ArbEvidenceFact,
  ArbExportArtifact,
  ArbExportFormat,
  ArbFinding,
  ArbReviewSummary,
} from "@/arb/types";
import type { EvidenceFilterState, LinkedFinding } from "./evidence-utils";
import {
  buildLinkageMap,
  computeEvidenceMetrics,
  filterEvidence,
  getDistinctDomains,
  groupEvidenceByDomain,
  groupEvidenceBySourceFile,
} from "./evidence-utils";
import { ArbReviewShell } from "@/components/arb/review-shell";
import { EvidenceStatusBar } from "./evidence-status-bar";
import { EvidenceSummaryMetrics } from "./evidence-summary-metrics";
import { EvidenceFilterChips } from "./evidence-filter-chips";
import { EvidenceGroupToggle } from "./evidence-group-toggle";
import { EvidenceGroup } from "./evidence-group";
import { EvidenceExportSection } from "./evidence-export-section";
import styles from "./arb-evidence-page.module.css";

export function ArbEvidencePage({ reviewId }: { reviewId: string }) {
  const [review, setReview] = useState<ArbReviewSummary | null>(null);
  const [evidence, setEvidence] = useState<ArbEvidenceFact[]>([]);
  const [findings, setFindings] = useState<ArbFinding[]>([]);
  const [exportArtifacts, setExportArtifacts] = useState<ArbExportArtifact[]>([]);
  const [filters, setFilters] = useState<EvidenceFilterState>({
    confidences: new Set(),
    domains: new Set(),
  });
  const [groupMode, setGroupMode] = useState<"domain" | "sourceFile">("domain");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportRegenerating, setExportRegenerating] = useState(false);
  const [exportDownloadingId, setExportDownloadingId] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const authRequired = error?.includes("Sign in is required") ?? false;

  // ── Data fetching ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [reviewRes, evidenceRes, findingsRes, exportsRes] = await Promise.all([
          fetchArbReview(reviewId),
          fetchArbEvidence(reviewId),
          fetchArbFindings(reviewId),
          fetchArbExports(reviewId),
        ]);

        if (!cancelled) {
          setReview(reviewRes);
          setEvidence(evidenceRes);
          setFindings(findingsRes);
          setExportArtifacts(exportsRes);
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

  // ── Derived data ───────────────────────────────────────────────────
  const linkageMap: Map<string, LinkedFinding[]> = buildLinkageMap(findings);
  const metrics = computeEvidenceMetrics(evidence);
  const domains = getDistinctDomains(evidence);
  const filtered = filterEvidence(evidence, filters);
  const grouped: Map<string, ArbEvidenceFact[]> =
    groupMode === "domain"
      ? groupEvidenceByDomain(filtered)
      : groupEvidenceBySourceFile(filtered);

  const allLowConfidence =
    evidence.length > 0 && evidence.every((e) => e.confidence === "Low");

  // ── Handlers ───────────────────────────────────────────────────────
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

  async function handleRegenerate() {
    const formats: ArbExportFormat[] = ["markdown", "csv", "html"];
    try {
      setExportRegenerating(true);
      setExportError(null);
      await Promise.all(
        formats.map((format) =>
          createArbExport({ reviewId, format, includeFindings: true, includeScorecard: true, includeActions: true }),
        ),
      );
      const nextExports = await fetchArbExports(reviewId);
      setExportArtifacts(nextExports);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Unable to regenerate the reviewed outputs.");
    } finally {
      setExportRegenerating(false);
    }
  }

  async function handleDownload(artifact: ArbExportArtifact) {
    try {
      setExportDownloadingId(artifact.exportId);
      setExportError(null);
      await downloadArbExport(reviewId, artifact);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Unable to download the reviewed output.");
    } finally {
      setExportDownloadingId(null);
    }
  }

  // ── Shell fallback ─────────────────────────────────────────────────
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

  // ── Render content ─────────────────────────────────────────────────
  function renderContent() {
    // Empty state
    if (evidence.length === 0) {
      return (
        <div style={{ padding: 20, textAlign: "center" }}>
          <p style={{ fontSize: "1rem", color: "var(--t1)", marginBottom: 8 }}>
            No evidence has been extracted yet.
          </p>
          <p style={{ fontSize: "0.9rem", color: "var(--t2)", marginBottom: 16 }}>
            Upload files and start extraction from the Upload step to generate evidence facts.
          </p>
          <a
            href={getArbStepHref(reviewId, "upload")}
            className="primary-button"
          >
            Go to Upload step
          </a>
        </div>
      );
    }

    const groupEntries = [...grouped.entries()];

    return (
      <>
        {/* All-low-confidence warning */}
        {allLowConfidence && (
          <section
            style={{
              background: "#FEF3C7",
              border: "1px solid #F59E0B",
              borderRadius: 8,
              padding: "12px 20px",
            }}
          >
            <p style={{ margin: 0, fontWeight: 600, color: "#B45309" }}>
              ⚠ All evidence has low confidence. Consider uploading additional source documents to improve coverage.
            </p>
          </section>
        )}

        <EvidenceStatusBar
          evidence={evidence}
          review={shellReview}
          onExport={handleExport}
          exportLoading={exportLoading}
        />

        <EvidenceSummaryMetrics metrics={metrics} />

        <div className={styles.filterRow}>
          <EvidenceFilterChips
            filters={filters}
            onFiltersChange={setFilters}
            evidence={evidence}
            domains={domains}
          />
          <div style={{ marginLeft: "auto" }}>
            <EvidenceGroupToggle mode={groupMode} onModeChange={setGroupMode} />
          </div>
        </div>

        {groupEntries.length === 0 && (
          <p style={{ padding: "20px", color: "var(--t2)", textAlign: "center" }}>
            No evidence matches the current filters.
          </p>
        )}

        {groupEntries.map(([name, items], index) => (
          <EvidenceGroup
            key={name}
            groupName={name}
            evidenceItems={items}
            linkageMap={linkageMap}
            defaultExpanded={index < 3}
            reviewId={reviewId}
          />
        ))}

        <EvidenceExportSection
          reviewId={reviewId}
          exportArtifacts={exportArtifacts}
          onRegenerate={handleRegenerate}
          onDownload={handleDownload}
          regenerating={exportRegenerating}
          downloadingId={exportDownloadingId}
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
        activeStep="evidence"
        title="Map Design Evidence"
        description="Compare each requirement with the supporting architecture evidence and expose weak or missing proof."
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
          <div className={styles.evidenceLayout}>
            {renderContent()}
          </div>
        )}
      </ArbReviewShell>
    </div>
  );
}
