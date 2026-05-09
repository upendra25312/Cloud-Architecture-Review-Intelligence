"use client";

import { useMemo, useState } from "react";
import { useAuthSession } from "@/components/auth-session-provider";
import type {
  ChecklistItem,
  ProjectReviewCopilotContext,
  ReviewDraft,
  ReviewPackage
} from "@/types";
import {
  ENABLED_AUTH_PROVIDERS,
  buildLoginUrl,
  buildStructuredReviewRecords,
  downloadCloudReviewCsv,
  loadCloudProjectReviewState,
  loadCloudReviewRecords,
  saveCloudProjectReviewState,
  saveCloudReviewRecords,
  structuredRecordsToReviewMap
} from "@/lib/review-cloud";
import { trackReviewTelemetry } from "@/lib/review-telemetry";

type ReviewCloudControlsProps = {
  items: ChecklistItem[];
  reviews: Record<string, ReviewDraft>;
  activePackage: ReviewPackage | null;
  copilotContext: ProjectReviewCopilotContext | null;
  onBeforeCloudSave?: () => ReviewPackage | null;
  onRestoreCloudState: (input: {
    activePackage: ReviewPackage | null;
    reviews: Record<string, ReviewDraft>;
  }) => void;
  continueHref?: string;
};

type BusyAction = "load" | "save" | "download" | null;

export function ReviewCloudControls({
  items,
  reviews,
  activePackage,
  copilotContext,
  onBeforeCloudSave,
  onRestoreCloudState,
  continueHref
}: ReviewCloudControlsProps) {
  const { principal, resolved: authResolved } = useAuthSession();
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [statusMessage, setStatusMessage] = useState("Stored in this browser until you save to Azure.");
  const selectedServiceCount = activePackage?.selectedServiceSlugs.length ?? 0;
  const structuredRecords = useMemo(
    () => buildStructuredReviewRecords(items, reviews),
    [items, reviews]
  );

  async function loadFromAzure() {
    try {
      setBusyAction("load");
      const [recordsDocument, stateDocument] = await Promise.all([
        loadCloudReviewRecords(),
        loadCloudProjectReviewState()
      ]);
      const restoredReviews = structuredRecordsToReviewMap(recordsDocument.records);

      onRestoreCloudState({
        activePackage: stateDocument.activePackage,
        reviews: restoredReviews
      });
      void trackReviewTelemetry({
        name: "review_cloud_action",
        category: "continuity",
        route: "/review-package",
        reviewId: stateDocument.activePackage?.id ?? activePackage?.id ?? null,
        properties: {
          action: "load",
          recordCount: recordsDocument.recordCount,
          serviceCount: stateDocument.activePackage?.selectedServiceSlugs.length ?? 0
        }
      });
      setStatusMessage(
        stateDocument.activePackage || recordsDocument.recordCount > 0
          ? `Loaded ${recordsDocument.recordCount.toLocaleString()} scoped review records and the active project review context from Azure Storage.`
          : "No saved Azure review records or active project review context were found for this signed-in user."
      );
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to load saved review records.");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveToAzure() {
    try {
      setBusyAction("save");
      const nextActivePackage = onBeforeCloudSave?.() ?? activePackage;
      const nextSelectedServiceCount = nextActivePackage?.selectedServiceSlugs.length ?? selectedServiceCount;
      const [document] = await Promise.all([
        saveCloudReviewRecords(structuredRecords, nextActivePackage?.id),
        saveCloudProjectReviewState(nextActivePackage, copilotContext)
      ]);

      void trackReviewTelemetry({
        name: "review_cloud_action",
        category: "continuity",
        route: "/review-package",
        reviewId: nextActivePackage?.id ?? null,
        properties: {
          action: "save",
          recordCount: document.recordCount,
          serviceCount: nextSelectedServiceCount
        }
      });
      setStatusMessage(
        `Saved ${document.recordCount.toLocaleString()} scoped review records for "${nextActivePackage?.name ?? "this project review"}" across ${nextSelectedServiceCount.toLocaleString()} service${nextSelectedServiceCount === 1 ? "" : "s"} in scope.`
      );
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to save review records.");
    } finally {
      setBusyAction(null);
    }
  }

  async function downloadCsv() {
    try {
      setBusyAction("download");
      const result = await downloadCloudReviewCsv(structuredRecords, {
        reviewId: activePackage?.id,
        reviewName: activePackage?.name
      });
      const downloadServiceCount = activePackage?.selectedServiceSlugs.length ?? selectedServiceCount;

      void trackReviewTelemetry({
        name: "review_cloud_action",
        category: "continuity",
        route: "/review-package",
        reviewId: activePackage?.id ?? null,
        properties: {
          action: "download-csv",
          artifactPathStored: Boolean(result.artifactPath),
          filename: result.filename,
          serviceCount: downloadServiceCount,
          recordCount: structuredRecords.length
        }
      });
      setStatusMessage(
        result.artifactPath
          ? `Downloaded ${result.filename} for "${activePackage?.name ?? "this project review"}" and stored the scoped CSV artifact in Azure Storage for ${downloadServiceCount.toLocaleString()} service${downloadServiceCount === 1 ? "" : "s"} in scope.`
          : `Downloaded ${result.filename} for "${activePackage?.name ?? "this project review"}" across ${downloadServiceCount.toLocaleString()} service${downloadServiceCount === 1 ? "" : "s"} in scope.`
      );
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to generate the CSV artifact.");
    } finally {
      setBusyAction(null);
    }
  }

  if (!authResolved) {
    return (
      <section className="filter-card cloud-sync-card">
        <p className="eyebrow">Optional cloud save</p>
        <h3>Checking whether Azure-backed save is available.</h3>
        <p className="microcopy">
          Local notes stay in this browser either way. Sign-in is only needed for Azure-backed save,
          reload, and cloud-generated CSV export.
        </p>
      </section>
    );
  }

  if (!principal) {
    return (
      <section className="filter-card cloud-sync-card">
        <p className="eyebrow">Optional cloud save</p>
        <h3>Sign in only when you want to save this review to Azure.</h3>
        <p className="microcopy">
          You can keep browsing services, writing notes, and downloading local exports without
          signing in. Use sign-in only when you want Azure-backed save, reload, automatic copilot
          context restore in later sessions, or a cloud-generated CSV artifact.
        </p>
        <div className="button-row">
          {ENABLED_AUTH_PROVIDERS.map((provider, index) => (
            <a
              key={provider.id}
              href={buildLoginUrl(provider.id)}
              className={index === 0 ? "primary-button" : "secondary-button"}
            >
              Continue with {provider.label}
            </a>
          ))}
          {continueHref ? (
            <a href={continueHref} className="ghost-button">
              Keep working locally
            </a>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="filter-card cloud-sync-card">
      <div className="section-head">
        <div>
          <p className="eyebrow">Optional cloud save</p>
          <h3>Keep this review in Azure when you need continuity across sessions.</h3>
          <p className="microcopy">
            Signed in as {principal.userDetails || principal.userId}. Save when you want this review
            available on another device or in a later session. If not, the local workflow still
            remains valid.
          </p>
        </div>
        <div className="chip-row">
          <span className="chip">{selectedServiceCount.toLocaleString()} services in scope</span>
          <span className="chip">{structuredRecords.length.toLocaleString()} scoped review records</span>
        </div>
      </div>
      <div className="button-row">
        <button
          type="button"
          className="secondary-button"
          onClick={loadFromAzure}
          disabled={busyAction !== null}
        >
          {busyAction === "load" ? "Loading..." : "Load project review"}
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={saveToAzure}
          disabled={busyAction !== null}
        >
          {busyAction === "save" ? "Saving..." : "Save to Azure"}
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={downloadCsv}
          disabled={busyAction !== null}
        >
          {busyAction === "download" ? "Preparing CSV..." : "Download cloud CSV"}
        </button>
        <a href="/.auth/logout" className="ghost-button">
          Sign out
        </a>
      </div>
      <p className="microcopy">{statusMessage}</p>
    </section>
  );
}
