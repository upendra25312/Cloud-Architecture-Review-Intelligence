"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useAuthSession } from "@/components/auth-session-provider";
import {
  listArbProjectReviews,
  updateArbProject,
  deleteArbProject,
} from "@/arb/api";
import type { ArbProjectReviewsResponse } from "@/arb/types";

function formatDate(value: string | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function workflowStateColor(state: string): string {
  if (state === "Approved") return "#16a34a";
  if (state === "Needs Revision" || state === "Rejected") return "#c41230";
  if (state === "Review In Progress" || state === "Evidence Ready") return "#d97706";
  if (state === "Decision Recorded" || state === "Review Complete" || state === "Closed") return "#2563eb";
  return "#94a3b8";
}

export function ArbProjectDetailView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { signedIn, resolved } = useAuthSession();

  const [data, setData] = useState<ArbProjectReviewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editName, setEditName] = useState("");
  const [editCustomer, setEditCustomer] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    if (!resolved) return;
    if (!signedIn || !projectId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listArbProjectReviews(projectId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Unable to load project.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [signedIn, resolved, projectId]);

  function openEdit() {
    setEditName(data?.name ?? "");
    setEditCustomer(data?.customerName ?? "");
    setEditDesc(data?.description ?? "");
    setSaveError(null);
    setEditing(true);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      await updateArbProject(projectId, {
        name: editName.trim() || undefined,
        customerName: editCustomer.trim() || undefined,
        description: editDesc.trim(),
      });
      setData((prev) => prev ? {
        ...prev,
        name: editName.trim() || prev.name,
        customerName: editCustomer.trim() || prev.customerName,
        description: editDesc.trim(),
      } : prev);
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    setArchiving(true);
    try {
      await deleteArbProject(projectId);
      router.push("/arb/projects");
    } catch {
      setArchiving(false);
      setConfirmArchive(false);
    }
  }

  return (
    <main className="arb-page">
      <div className="arb-page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <Link href="/arb/projects" style={{ color: "var(--t3)", fontSize: "0.88rem" }}>
            ← Projects
          </Link>
        </div>

        {loading ? (
          <h1 className="arb-page-title">Loading…</h1>
        ) : loadError ? (
          <>
            <h1 className="arb-page-title" style={{ color: "var(--danger, #c41230)" }}>Error</h1>
            <p className="arb-page-sub">{loadError}</p>
          </>
        ) : editing ? (
          <form onSubmit={handleSaveEdit} className="arb-project-edit-form">
            <input
              className="arb-form-input arb-project-title-input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Project name"
              required
              autoFocus
            />
            <input
              className="arb-form-input"
              value={editCustomer}
              onChange={(e) => setEditCustomer(e.target.value)}
              placeholder="Customer name"
              required
            />
            <textarea
              className="arb-form-input"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
            />
            {saveError && <p className="arb-form-error">{saveError}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button type="button" className="outline-button" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
            <div>
              <h1 className="arb-page-title">{data?.name ?? projectId.slice(0, 12).toLowerCase()}</h1>
              {data?.customerName && (
                <p className="arb-page-sub" style={{ marginBottom: 2 }}>{data.customerName}</p>
              )}
              <p className="arb-page-sub">
                {(data?.reviews?.length ?? 0)} review{(data?.reviews?.length ?? 0) !== 1 ? "s" : ""} in this project
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0, marginTop: 4 }}>
              <Link
                href={`/arb?newReview=1&projectId=${encodeURIComponent(projectId)}` as Route}
                className="primary-button"
              >
                + New review
              </Link>
              {!confirmArchive && (
                <button
                  className="outline-button"
                  onClick={openEdit}
                  style={{ color: "var(--t2)" }}
                >
                  Edit
                </button>
              )}
              {!confirmArchive ? (
                <button
                  className="outline-button"
                  style={{ color: "var(--t3)" }}
                  onClick={() => setConfirmArchive(true)}
                >
                  Archive project
                </button>
              ) : (
                <>
                  <button
                    className="outline-button"
                    style={{ color: "#c41230", borderColor: "#c41230" }}
                    onClick={handleArchive}
                    disabled={archiving}
                  >
                    {archiving ? "Archiving…" : "Confirm archive"}
                  </button>
                  <button className="outline-button" onClick={() => setConfirmArchive(false)} disabled={archiving}>
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="arb-library-stack">
        {!loading && !loadError && (data?.reviews?.length ?? 0) === 0 && (
          <div className="arb-create-card">
            <div className="arb-create-copy">
              <h2 className="arb-create-title">No reviews yet</h2>
              <p className="arb-create-sub">
                Create a review to begin the architecture assessment cycle for this project.
              </p>
            </div>
            <Link
              href={`/arb?newReview=1&projectId=${encodeURIComponent(projectId)}` as Route}
              className="primary-button"
              style={{ alignSelf: "flex-start" }}
            >
              Create first review
            </Link>
          </div>
        )}

        {!loading && !loadError && (data?.reviews ?? []).length > 0 && (
          <div className="arb-review-table-scroll">
            <table className="arb-review-table">
              <thead>
                <tr>
                  <th>Review name</th>
                  <th>Customer</th>
                  <th>Workflow state</th>
                  <th>Score</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(data?.reviews ?? []).map((review) => (
                  <tr key={review.reviewId}>
                    <td>
                      <Link
                        href={`/arb/${encodeURIComponent(review.reviewId)}/overview` as Route}
                        style={{ color: "var(--t1)", fontWeight: 600 }}
                      >
                        {review.projectName}
                      </Link>
                    </td>
                    <td style={{ color: "var(--t2)" }}>{review.customerName ?? "—"}</td>
                    <td>
                      <span
                        className="arb-status-badge"
                        style={{
                          background: `${workflowStateColor(review.workflowState ?? "")}18`,
                          color: workflowStateColor(review.workflowState ?? ""),
                          border: `1px solid ${workflowStateColor(review.workflowState ?? "")}40`,
                        }}
                      >
                        {review.workflowState ?? "—"}
                      </span>
                    </td>
                    <td style={{ color: "var(--t1)" }}>
                      {review.overallScore != null ? `${review.overallScore}` : "—"}
                    </td>
                    <td style={{ color: "var(--t3)", whiteSpace: "nowrap" }}>
                      {formatDate(review.createdAt)}
                    </td>
                    <td>
                      <Link
                        href={`/arb/${encodeURIComponent(review.reviewId)}/overview` as Route}
                        className="outline-button"
                        style={{ fontSize: "0.82rem", padding: "4px 10px" }}
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
