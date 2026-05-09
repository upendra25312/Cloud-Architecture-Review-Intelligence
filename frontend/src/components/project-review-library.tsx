"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuthSession } from "@/components/auth-session-provider";
import {
  ENABLED_AUTH_PROVIDERS,
  activateCloudProjectReview,
  archiveCloudProjectReview,
  buildLoginUrl,
  buildLogoutUrl,
  deleteCloudProjectReview,
  formatIdentityProvider,
  listCloudProjectReviews,
  purgeCloudProjectReview,
  restoreDeletedCloudProjectReview
} from "@/lib/review-cloud";
import { trackReviewTelemetry } from "@/lib/review-telemetry";
import type {
  ProjectReviewLibraryResponse,
  SavedProjectReviewSummary,
  StaticWebAppClientPrincipal
} from "@/types";

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-US");
}

function getReviewLifecycleLabel(review: SavedProjectReviewSummary) {
  if (review.isDeleted) {
    return "Deleted";
  }

  if (review.isArchived) {
    return "Archived";
  }

  if (review.pendingCount > 0) {
    return "In review";
  }

  if (review.recordCount > 0) {
    return "Ready to export";
  }

  return "Draft";
}

function getReviewLifecycleTone(review: SavedProjectReviewSummary) {
  if (review.isDeleted) {
    return "danger";
  }

  if (review.isArchived) {
    return "neutral";
  }

  if (review.pendingCount > 0) {
    return "warning";
  }

  return "good";
}

type ReviewSortMode = "updated-desc" | "created-desc" | "name-asc" | "pending-desc";
type ReviewFilterMode = "active" | "archived" | "deleted" | "all";
type ReviewAction = "archive" | "delete" | "purge";

function reviewMatchesSearch(review: SavedProjectReviewSummary, query: string) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  return [
    review.name,
    review.audience,
    review.businessScope,
    review.targetRegions.join(" ")
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

function compareReviews(left: SavedProjectReviewSummary, right: SavedProjectReviewSummary, sortMode: ReviewSortMode) {
  switch (sortMode) {
    case "created-desc":
      return String(right.createdAt).localeCompare(String(left.createdAt));
    case "name-asc":
      return left.name.localeCompare(right.name);
    case "pending-desc":
      return right.pendingCount - left.pendingCount || String(right.updatedAt).localeCompare(String(left.updatedAt));
    case "updated-desc":
    default:
      return String(right.updatedAt).localeCompare(String(left.updatedAt));
  }
}

export function ProjectReviewLibrary() {
  const { principal, resolved } = useAuthSession();
  const [payload, setPayload] = useState<ProjectReviewLibraryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activatingReviewId, setActivatingReviewId] = useState<string | null>(null);
  const [workingReviewId, setWorkingReviewId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<ReviewSortMode>("updated-desc");
  const [filterMode, setFilterMode] = useState<ReviewFilterMode>("active");
  const [confirmAction, setConfirmAction] = useState<{
    reviewId: string;
    action: ReviewAction;
  } | null>(null);

  async function refreshLibrary() {
    const nextPayload = await listCloudProjectReviews();
    setPayload(nextPayload);
  }

  useEffect(() => {
    let active = true;

    if (!resolved) {
      return () => {
        active = false;
      };
    }

    if (!principal) {
      setPayload(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    async function loadLibrary() {
      try {
        const nextPayload = await listCloudProjectReviews();

        if (!active) {
          return;
        }

        setPayload(nextPayload);
      } catch (nextError) {
        if (!active) {
          return;
        }

        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load your saved project reviews."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadLibrary();

    return () => {
      active = false;
    };
  }, [principal, resolved]);

  const filteredReviews = useMemo(() => {
    const reviews = payload?.reviews ?? [];

    return reviews
      .filter((review) => {
        if (filterMode === "active") {
          return !review.isArchived && !review.isDeleted;
        }

        if (filterMode === "archived") {
          return review.isArchived && !review.isDeleted;
        }

        if (filterMode === "deleted") {
          return review.isDeleted;
        }

        return true;
      })
      .filter((review) => reviewMatchesSearch(review, search))
      .sort((left, right) => compareReviews(left, right, sortMode));
  }, [filterMode, payload?.reviews, search, sortMode]);

  const reviewStateCounts = useMemo(() => {
    const reviews = payload?.reviews ?? [];

    return {
      active: reviews.filter((review) => !review.isArchived && !review.isDeleted).length,
      archived: reviews.filter((review) => review.isArchived && !review.isDeleted).length,
      deleted: reviews.filter((review) => review.isDeleted).length
    };
  }, [payload?.reviews]);

  const commandMetrics = [
    {
      label: "Active library",
      value: reviewStateCounts.active.toLocaleString(),
      detail: "Saved reviews ready to resume from the main workspace."
    },
    {
      label: "Archived",
      value: reviewStateCounts.archived.toLocaleString(),
      detail: "Reviews kept in Azure but hidden from the active working set."
    },
    {
      label: "Deleted",
      value: reviewStateCounts.deleted.toLocaleString(),
      detail: "Recoverable reviews waiting for restore or permanent purge."
    },
    {
      label: "Account state",
      value: payload?.user?.email ?? (principal ? principal.userDetails || "Signed in" : "Sign in required"),
      detail: payload?.user?.activeReviewId
        ? `Active saved review is ${payload.user.activeReviewId}.`
        : principal
          ? "Signed in, but no active Azure-backed review is set yet."
          : "Sign in to load and manage saved project reviews."
    }
  ];

  async function openReview(review: SavedProjectReviewSummary) {
    try {
      setActivatingReviewId(review.id);
      setError(null);
      await activateCloudProjectReview(review.id);
      void trackReviewTelemetry({
        name: "review_cloud_action",
        category: "continuity",
        route: "/my-project-reviews",
        reviewId: review.id,
        properties: {
          action: "resume",
          audience: review.audience,
          pendingCount: review.pendingCount,
          serviceCount: review.serviceCount
        }
      });
      window.location.href = `/review-package?cloudReviewId=${encodeURIComponent(review.id)}`;
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to activate the selected project review."
      );
      setActivatingReviewId(null);
    }
  }

  async function handleArchiveToggle(review: SavedProjectReviewSummary, archived: boolean) {
    try {
      setWorkingReviewId(review.id);
      setError(null);
      await archiveCloudProjectReview(review.id, archived);
      void trackReviewTelemetry({
        name: "review_cloud_action",
        category: "continuity",
        route: "/my-project-reviews",
        reviewId: review.id,
        properties: {
          action: archived ? "archive" : "restore-archive",
          pendingCount: review.pendingCount,
          serviceCount: review.serviceCount
        }
      });
      await refreshLibrary();
      setConfirmAction(null);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : archived
            ? "Unable to archive the selected project review."
            : "Unable to restore the selected project review."
      );
    } finally {
      setWorkingReviewId(null);
    }
  }

  async function handleDelete(review: SavedProjectReviewSummary) {
    try {
      setWorkingReviewId(review.id);
      setError(null);
      await deleteCloudProjectReview(review.id);
      void trackReviewTelemetry({
        name: "review_cloud_action",
        category: "continuity",
        route: "/my-project-reviews",
        reviewId: review.id,
        properties: {
          action: "delete",
          pendingCount: review.pendingCount,
          serviceCount: review.serviceCount
        }
      });
      await refreshLibrary();
      setConfirmAction(null);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to delete the selected project review."
      );
    } finally {
      setWorkingReviewId(null);
    }
  }

  async function handleRestoreDeleted(review: SavedProjectReviewSummary) {
    try {
      setWorkingReviewId(review.id);
      setError(null);
      await restoreDeletedCloudProjectReview(review.id);
      void trackReviewTelemetry({
        name: "review_cloud_action",
        category: "continuity",
        route: "/my-project-reviews",
        reviewId: review.id,
        properties: {
          action: "restore",
          pendingCount: review.pendingCount,
          serviceCount: review.serviceCount
        }
      });
      await refreshLibrary();
      setConfirmAction(null);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to restore the deleted project review."
      );
    } finally {
      setWorkingReviewId(null);
    }
  }

  async function handlePurge(review: SavedProjectReviewSummary) {
    try {
      setWorkingReviewId(review.id);
      setError(null);
      await purgeCloudProjectReview(review.id);
      void trackReviewTelemetry({
        name: "review_cloud_action",
        category: "continuity",
        route: "/my-project-reviews",
        reviewId: review.id,
        properties: {
          action: "purge",
          pendingCount: review.pendingCount,
          serviceCount: review.serviceCount
        }
      });
      await refreshLibrary();
      setConfirmAction(null);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to permanently delete the selected project review."
      );
    } finally {
      setWorkingReviewId(null);
    }
  }

  return (
    <main className="section-stack">
      <section className="review-command-panel library-command-panel">
        <div className="review-command-copy">
          <p className="eyebrow">Reviews dashboard</p>
          <h1 className="review-command-title">Start, resume, and manage saved Azure reviews.</h1>
          <p className="review-command-summary">
            Use this dashboard to reopen active reviews, compare progress, and manage saved review
            history without rebuilding the same project context from scratch.
          </p>
        </div>

        <div className="review-command-metrics">
          {commandMetrics.map((metric) => (
            <article className="review-command-metric" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <p>{metric.detail}</p>
            </article>
          ))}
        </div>

        <div className="review-command-band">
          <div className="review-command-band-actions">
            <Link href="/review-package" className="home-init-button review-command-button">
              Start a new review
            </Link>
            {!principal ? (
              ENABLED_AUTH_PROVIDERS.map((provider) => (
                <a
                  key={provider.id}
                  href={buildLoginUrl(provider.id)}
                  className="secondary-button review-command-secondary"
                >
                  Sign in with {provider.label}
                </a>
              ))
            ) : (
              <a href={buildLogoutUrl("/")} className="secondary-button review-command-secondary">
                Sign out
              </a>
            )}
          </div>
        </div>
      </section>

      {loading ? (
        <section className="filter-card board-stage-panel library-state-card">
          <p className="eyebrow">Loading</p>
          <h3>Checking your sign-in state and saved project reviews.</h3>
          <p className="microcopy">
            Once you sign in, this page lists the project reviews saved against your account.
          </p>
        </section>
      ) : null}

      {!loading && !principal ? (
        <section className="library-state-grid">
          <section className="filter-card board-stage-panel library-state-card">
            <p className="eyebrow">Sign in</p>
            <h3>Sign in to sync saved reviews across sessions.</h3>
            <p className="microcopy">
              You can still explore services and outputs without sign-in. Saving, resuming, and
              restoring reviews from Azure requires an authenticated identity.
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
            </div>
          </section>
          <section className="filter-card board-stage-panel library-state-card">
            <p className="eyebrow">What unlocks after sign-in</p>
            <h3>Saved reviews become a real working queue instead of a one-browser draft.</h3>
            <p className="microcopy">
              Resume active reviews, restore archived ones, recover deleted reviews before purge,
              and reopen the exact project context in the scoped review workspace.
            </p>
          </section>
        </section>
      ) : null}

      {!loading && payload?.user ? (
        <section className="library-state-grid">
          <section className="filter-card board-stage-panel library-state-card">
            <p className="eyebrow">Signed in identity</p>
            <h3>{payload.user.email}</h3>
            <p className="microcopy">
              Signed in with {formatIdentityProvider(payload.user.provider)}. The active saved review is{" "}
              {payload.user.activeReviewId ?? "not set"}.
            </p>
            <div className="chip-row board-summary-row">
              <span className="chip">Provider {formatIdentityProvider(payload.user.provider)}</span>
              <span className="chip">
                Active review {payload.user.activeReviewId ?? "not set"}
              </span>
            </div>
          </section>

          <section className="filter-card board-stage-panel library-state-card">
            <p className="eyebrow">Review lifecycle</p>
            <h3>Archive hides a review from the active library. Delete moves it into a recoverable holding state.</h3>
            <p className="microcopy">
              Use archive for work you want to keep but pause. Use deleted when the review should
              leave the main library. Permanently delete only after you are sure it should no longer
              be recoverable.
            </p>
            <div className="chip-row board-summary-row">
              <span className="chip">Active {reviewStateCounts.active.toLocaleString()}</span>
              <span className="chip">Archived {reviewStateCounts.archived.toLocaleString()}</span>
              <span className="chip">Deleted {reviewStateCounts.deleted.toLocaleString()}</span>
            </div>
          </section>
        </section>
      ) : null}

      {!loading && payload && payload.reviews.length === 0 ? (
        <section className="filter-card board-stage-panel library-state-card">
          <p className="eyebrow">No saved reviews yet</p>
          <h3>Your saved review queue will appear here after the first sync.</h3>
          <p className="microcopy">
            Once you save a review to Azure, it appears here so you can reopen it later without
            rebuilding the full context.
          </p>
        </section>
      ) : null}

      {!loading && payload && payload.reviews.length > 0 ? (
        <>
          <section className="filter-card workspace-toolbar board-toolbar-card">
            <div className="workspace-toolbar-main">
              <input
                className="search-input"
                type="search"
                placeholder="Search reviews by name, audience, scope, or target region"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <p className="microcopy">
                {filteredReviews.length.toLocaleString()} review
                {filteredReviews.length === 1 ? "" : "s"} shown from {payload.reviews.length.toLocaleString()} saved in Azure.
              </p>
            </div>
            <div className="workspace-toolbar-side">
              <label className="filter-field">
                <span className="microcopy">Filter</span>
                <select
                  className="field-select"
                  value={filterMode}
                  onChange={(event) => setFilterMode(event.target.value as ReviewFilterMode)}
                >
                  <option value="active">Active library</option>
                  <option value="archived">Archived</option>
                  <option value="deleted">Deleted</option>
                  <option value="all">All reviews</option>
                </select>
              </label>
              <label className="filter-field">
                <span className="microcopy">Sort</span>
                <select
                  className="field-select"
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as ReviewSortMode)}
                >
                  <option value="updated-desc">Last updated</option>
                  <option value="created-desc">Created date</option>
                  <option value="pending-desc">Most pending items</option>
                  <option value="name-asc">Name A-Z</option>
                </select>
              </label>
            </div>
          </section>

          {filteredReviews.length === 0 ? (
            <section className="filter-card board-stage-panel library-state-card">
              <p className="eyebrow">No matches</p>
              <h3>No saved reviews match the current search or filter.</h3>
              <p className="microcopy">
                Clear the search term, switch the archive filter, or open the main workspace to save a new review.
              </p>
            </section>
          ) : null}

          <section className="surface-panel reviews-table-shell" aria-label="Saved project review library">
            <div className="section-head">
              <div>
                <p className="eyebrow">Recent reviews</p>
                <h2 className="section-title">Saved reviews</h2>
                <p className="section-copy">
                  Compare progress, reopen the right review quickly, and manage lifecycle state from one table.
                </p>
              </div>
            </div>

            <div className="reviews-table-scroll">
              <table className="enterprise-table">
                <thead>
                  <tr>
                    <th scope="col">Review</th>
                    <th scope="col">Status</th>
                    <th scope="col">Scope</th>
                    <th scope="col">Last modified</th>
                    <th scope="col">Quick actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReviews.map((review) => (
                    <tr key={review.id}>
                      <td>
                        <div className="enterprise-table-primary">
                          <strong>{review.name}</strong>
                          <p>{review.businessScope || "No architecture notes captured yet."}</p>
                          <div className="enterprise-table-inline-meta">
                            <span>{review.audience}</span>
                            <span>{review.isActive ? "Active review" : "Saved review"}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="enterprise-status-stack">
                          <span
                            className={`dashboard-status-badge dashboard-status-badge-${getReviewLifecycleTone(review)}`}
                          >
                            {getReviewLifecycleLabel(review)}
                          </span>
                          <p>
                            {review.pendingCount.toLocaleString()} pending · {review.recordCount.toLocaleString()} saved findings
                          </p>
                        </div>
                      </td>
                      <td>
                        <div className="enterprise-table-metric-stack">
                          <strong>{review.serviceCount.toLocaleString()} services</strong>
                          <p>{review.targetRegions.join(", ") || "Regions not captured"}</p>
                        </div>
                      </td>
                      <td>
                        <div className="enterprise-table-metric-stack">
                          <strong>{formatDate(review.updatedAt)}</strong>
                          <p>
                            {review.isDeleted
                              ? `Deleted ${review.deletedAt ? formatDate(review.deletedAt) : "in Azure"}`
                              : review.isArchived
                                ? `Archived ${review.archivedAt ? formatDate(review.archivedAt) : "in Azure"}`
                                : `Created ${formatDate(review.createdAt)}`}
                          </p>
                        </div>
                      </td>
                      <td>
                        <div className="enterprise-action-stack">
                          {!review.isArchived && !review.isDeleted ? (
                            <button
                              type="button"
                              className="primary-button"
                              disabled={activatingReviewId === review.id || workingReviewId === review.id}
                              onClick={() => void openReview(review)}
                            >
                              {activatingReviewId === review.id ? "Opening..." : "Open review"}
                            </button>
                          ) : null}
                          <div className="button-row board-action-row-compact">
                            {confirmAction?.reviewId === review.id && confirmAction.action === "archive" ? (
                              <>
                                <button
                                  type="button"
                                  className="secondary-button"
                                  disabled={workingReviewId === review.id}
                                  onClick={() => void handleArchiveToggle(review, true)}
                                >
                                  {workingReviewId === review.id ? "Archiving..." : "Confirm archive"}
                                </button>
                                <button type="button" className="ghost-button" onClick={() => setConfirmAction(null)}>
                                  Cancel
                                </button>
                              </>
                            ) : null}
                            {confirmAction?.reviewId === review.id && confirmAction.action === "delete" ? (
                              <>
                                <button
                                  type="button"
                                  className="secondary-button"
                                  disabled={workingReviewId === review.id}
                                  onClick={() => void handleDelete(review)}
                                >
                                  {workingReviewId === review.id ? "Deleting..." : "Confirm delete"}
                                </button>
                                <button type="button" className="ghost-button" onClick={() => setConfirmAction(null)}>
                                  Cancel
                                </button>
                              </>
                            ) : null}
                            {confirmAction?.reviewId === review.id && confirmAction.action === "purge" ? (
                              <>
                                <button
                                  type="button"
                                  className="secondary-button"
                                  disabled={workingReviewId === review.id}
                                  onClick={() => void handlePurge(review)}
                                >
                                  {workingReviewId === review.id ? "Purging..." : "Confirm permanent delete"}
                                </button>
                                <button type="button" className="ghost-button" onClick={() => setConfirmAction(null)}>
                                  Cancel
                                </button>
                              </>
                            ) : null}
                            {confirmAction?.reviewId !== review.id ? (
                              <>
                                {review.isDeleted ? (
                                  <button
                                    type="button"
                                    className="secondary-button"
                                    disabled={workingReviewId === review.id}
                                    onClick={() => void handleRestoreDeleted(review)}
                                  >
                                    {workingReviewId === review.id ? "Restoring..." : "Restore"}
                                  </button>
                                ) : review.isArchived ? (
                                  <button
                                    type="button"
                                    className="secondary-button"
                                    disabled={workingReviewId === review.id}
                                    onClick={() => void handleArchiveToggle(review, false)}
                                  >
                                    {workingReviewId === review.id ? "Restoring..." : "Restore"}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="secondary-button"
                                    disabled={workingReviewId === review.id}
                                    onClick={() => setConfirmAction({ reviewId: review.id, action: "archive" })}
                                  >
                                    Archive
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="ghost-button"
                                  disabled={workingReviewId === review.id}
                                  onClick={() =>
                                    setConfirmAction({
                                      reviewId: review.id,
                                      action: review.isDeleted ? "purge" : "delete"
                                    })
                                  }
                                >
                                  {review.isDeleted ? "Delete permanently" : "Move to deleted"}
                                </button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {error ? (
        <section className="filter-card board-stage-panel library-state-card">
          <p className="eyebrow">Project review library</p>
          <h3>The saved project review list could not be loaded.</h3>
          <p className="microcopy">{error}</p>
        </section>
      ) : null}
    </main>
  );
}
