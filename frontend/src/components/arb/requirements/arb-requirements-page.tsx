"use client";

import { useEffect, useState } from "react";
import {
  createArbExport,
  downloadArbExport,
  fetchArbExports,
  fetchArbRequirements,
  fetchArbReview,
} from "@/arb/api";
import { getArbReviewSteps } from "@/arb/mock-review";
import { getArbStepHref } from "@/arb/routes";
import { ENABLED_AUTH_PROVIDERS, buildLoginUrl } from "@/lib/review-cloud";
import type {
  ArbExportArtifact,
  ArbExportFormat,
  ArbRequirement,
  ArbReviewSummary,
} from "@/arb/types";
import type { RequirementsFilterState } from "./requirements-utils";
import {
  computeRequirementsMetrics,
  filterRequirements,
  getDistinctCategories,
  groupRequirementsByCategory,
  groupRequirementsBySourceFile,
} from "./requirements-utils";
import { ArbReviewShell } from "@/components/arb/review-shell";
import { RequirementsStatusBar } from "./requirements-status-bar";
import { RequirementsSummaryMetrics } from "./requirements-summary-metrics";
import { RequirementsFilterChips } from "./requirements-filter-chips";
import { RequirementsGroupToggle } from "./requirements-group-toggle";
import { RequirementsGroup } from "./requirements-group";
import { RequirementsExportSection } from "./requirements-export-section";
import styles from "./arb-requirements-page.module.css";

export function ArbRequirementsPage({ reviewId }: { reviewId: string }) {
  const [review, setReview] = useState<ArbReviewSummary | null>(null);
  const [requirements, setRequirements] = useState<ArbRequirement[]>([]);
  const [exportArtifacts, setExportArtifacts] = useState<ArbExportArtifact[]>([]);
  const [filters, setFilters] = useState<RequirementsFilterState>({
    criticalities: new Set(),
    categories: new Set(),
    statuses: new Set(),
  });
  const [groupMode, setGroupMode] = useState<"category" | "sourceFile">("category");
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

        const [reviewRes, requirementsRes, exportsRes] = await Promise.all([
          fetchArbReview(reviewId),
          fetchArbRequirements(reviewId),
          fetchArbExports(reviewId),
        ]);

        if (!cancelled) {
          setReview(reviewRes);
          setRequirements(requirementsRes);
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
  const metrics = computeRequirementsMetrics(requirements);
  const categories = getDistinctCategories(requirements);
  const filtered = filterRequirements(requirements, filters);
  const grouped: Map<string, ArbRequirement[]> =
    groupMode === "category"
      ? groupRequirementsByCategory(filtered)
      : groupRequirementsBySourceFile(filtered);

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
    if (requirements.length === 0) {
      return (
        <div style={{ padding: 20, textAlign: "center" }}>
          <p style={{ fontSize: "1rem", color: "var(--t1)", marginBottom: 8 }}>
            No requirements have been extracted yet.
          </p>
          <p style={{ fontSize: "0.9rem", color: "var(--t2)", marginBottom: 16 }}>
            Upload files and start extraction from the Upload step to generate requirements.
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
        <RequirementsStatusBar
          requirements={requirements}
          review={shellReview}
          onExport={handleExport}
          exportLoading={exportLoading}
        />

        <RequirementsSummaryMetrics metrics={metrics} />

        <div className={styles.filterRow}>
          <RequirementsFilterChips
            filters={filters}
            onFiltersChange={setFilters}
            requirements={requirements}
            categories={categories}
          />
          <div style={{ marginLeft: "auto" }}>
            <RequirementsGroupToggle mode={groupMode} onModeChange={setGroupMode} />
          </div>
        </div>

        {groupEntries.length === 0 && (
          <p style={{ padding: "20px", color: "var(--t2)", textAlign: "center" }}>
            No requirements match the current filters.
          </p>
        )}

        {groupEntries.map(([name, items], index) => (
          <RequirementsGroup
            key={name}
            groupName={name}
            requirements={items}
            defaultExpanded={index < 3}
          />
        ))}

        <RequirementsExportSection
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
        activeStep="requirements"
        title="Extract Requirements"
        description="Review the inferred scope, category, and criticality before findings are generated."
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
          <div className={styles.requirementsLayout}>
            {renderContent()}
          </div>
        )}
      </ArbReviewShell>
    </div>
  );
}
