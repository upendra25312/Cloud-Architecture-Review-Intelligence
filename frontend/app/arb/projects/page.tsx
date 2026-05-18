"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthSession } from "@/components/auth-session-provider";
import {
  listArbProjects,
  createArbProject,
  deleteArbProject,
} from "@/arb/api";
import type { ArbProject } from "@/arb/types";
import { PRIMARY_AUTH_PROVIDER, buildLoginUrl } from "@/lib/review-cloud";

function formatDate(value: string | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusBadge(status: string) {
  if (status === "active") return { label: "Active", color: "#16a34a" };
  if (status === "archived") return { label: "Archived", color: "#94a3b8" };
  return { label: status, color: "#94a3b8" };
}

function CreateProjectModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (project: { projectId: string; blobPrefix: string; createdAt: string }) => void;
}) {
  const [name, setName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [description, setDescription] = useState("");
  const [framework, setFramework] = useState("azure");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !customerName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const result = await createArbProject({
        name: name.trim(),
        customerName: customerName.trim(),
        description: description.trim(),
        reviewFramework: framework,
      });
      onCreate(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create project.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="arb-modal-backdrop" onClick={onClose}>
      <div
        className="arb-modal-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-project-title"
      >
        <div className="arb-modal-header">
          <h2 id="create-project-title" className="arb-modal-title">New project</h2>
          <button className="arb-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="arb-modal-body">
          <label className="arb-form-label">
            Project name <span aria-hidden="true" style={{ color: "#c41230" }}>*</span>
            <input
              className="arb-form-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Contoso Migration Q2 2026"
              required
              autoFocus
              maxLength={120}
            />
          </label>
          <label className="arb-form-label">
            Customer name <span aria-hidden="true" style={{ color: "#c41230" }}>*</span>
            <input
              className="arb-form-input"
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Contoso Ltd"
              required
              maxLength={120}
            />
          </label>
          <label className="arb-form-label">
            Description
            <textarea
              className="arb-form-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional — brief scope or context"
              rows={3}
              maxLength={500}
            />
          </label>
          <label className="arb-form-label">
            Review framework
            <select
              className="arb-form-input"
              value={framework}
              onChange={(e) => setFramework(e.target.value)}
            >
              <option value="azure">Azure (CAF + WAF)</option>
              <option value="aws">AWS Well-Architected</option>
              <option value="gcp">GCP Architecture Framework</option>
              <option value="hybrid">Hybrid / Multi-cloud</option>
            </select>
          </label>
          {error && <p className="arb-form-error">{error}</p>}
          <div className="arb-modal-actions">
            <button type="button" className="outline-button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={saving || !name.trim() || !customerName.trim()}
            >
              {saving ? "Creating…" : "Create project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  onDelete,
}: {
  project: ArbProject;
  onDelete: (projectId: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const badge = statusBadge(project.status);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteArbProject(project.projectId);
      onDelete(project.projectId);
    } catch {
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <div className="arb-review-card arb-project-card">
      <div className="arb-review-card-head">
        <div className="arb-review-card-meta">
          <span className="arb-review-card-project">{project.name}</span>
          <span className="arb-review-card-customer">{project.customerName}</span>
          {project.description && (
            <span style={{ color: "var(--t3)", fontSize: "0.88rem", marginTop: 2 }}>
              {project.description}
            </span>
          )}
        </div>
        <div className="arb-review-card-actions">
          <span
            className="arb-status-badge"
            style={{
              background: `${badge.color}18`,
              color: badge.color,
              border: `1px solid ${badge.color}40`,
            }}
          >
            {badge.label}
          </span>
          <span className="arb-review-updated">Created {formatDate(project.createdAt)}</span>
        </div>
      </div>

      <div className="arb-review-metrics">
        <div className="arb-review-metric">
          <span className="arb-review-metric-label">Reviews</span>
          <span className="arb-review-metric-value">{project.reviewCount}</span>
        </div>
        <div className="arb-review-metric">
          <span className="arb-review-metric-label">Framework</span>
          <span className="arb-review-metric-value">{project.reviewFramework.toUpperCase()}</span>
        </div>
        <div className="arb-review-metric">
          <span className="arb-review-metric-label">Last updated</span>
          <span className="arb-review-metric-value">{formatDate(project.updatedAt)}</span>
        </div>
        <div className="arb-review-metric">
          <span className="arb-review-metric-label">Project ID</span>
          <span className="arb-review-metric-value" style={{ fontFamily: "monospace", fontSize: "0.78rem" }}>
            {project.projectId.slice(0, 8).toLowerCase()}…
          </span>
        </div>
      </div>

      <div className="arb-review-links">
        <Link
          href={`/arb/projects/view?projectId=${encodeURIComponent(project.projectId)}`}
          className="primary-button"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          Open project →
        </Link>
        <div style={{ display: "flex", gap: 8 }}>
          {confirming ? (
            <>
              <span style={{ color: "var(--t2)", fontSize: "0.88rem", alignSelf: "center" }}>
                Archive this project?
              </span>
              <button
                className="outline-button"
                style={{ color: "#c41230", borderColor: "#c41230" }}
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "Archiving…" : "Confirm"}
              </button>
              <button className="outline-button" onClick={() => setConfirming(false)} disabled={deleting}>
                Cancel
              </button>
            </>
          ) : (
            <button
              className="outline-button"
              onClick={() => setConfirming(true)}
              style={{ color: "var(--t3)", fontSize: "0.85rem" }}
            >
              Archive
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ArbProjectsPage() {
  const { signedIn, resolved } = useAuthSession();
  const [projects, setProjects] = useState<ArbProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const isAuthenticated = signedIn;

  useEffect(() => {
    if (!resolved) return;
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listArbProjects()
      .then((data) => {
        if (!cancelled) setProjects(data.projects ?? []);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Unable to load projects.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [isAuthenticated, resolved]);

  function handleCreated(_result: { projectId: string; blobPrefix: string; createdAt: string }) {
    setShowCreate(false);
    setLoading(true);
    listArbProjects()
      .then((data) => setProjects(data.projects ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  function handleDeleted(projectId: string) {
    setProjects((prev) => prev.filter((p) => p.projectId !== projectId));
  }

  if (!isAuthenticated) {
    return (
      <main className="arb-page">
        <div className="arb-page-header">
          <h1 className="arb-page-title">Projects</h1>
          <p className="arb-page-sub">Sign in to manage your architecture review projects.</p>
        </div>
        <div className="arb-library-stack">
          <a href={buildLoginUrl(PRIMARY_AUTH_PROVIDER)} className="primary-button" style={{ alignSelf: "flex-start" }}>
            Sign in
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="arb-page">
      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreated}
        />
      )}

      <div className="arb-page-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <h1 className="arb-page-title">Projects</h1>
            <p className="arb-page-sub">
              Group architecture reviews by customer engagement. Each project tracks review cycles, scores, and export history.
            </p>
          </div>
          <button
            className="primary-button"
            style={{ flexShrink: 0, marginTop: 4 }}
            onClick={() => setShowCreate(true)}
          >
            + New project
          </button>
        </div>
      </div>

      <div className="arb-library-stack">
        {loading && (
          <div className="arb-library-loading">
            <p>Loading projects…</p>
          </div>
        )}

        {!loading && loadError && (
          <div className="arb-library-loading">
            <p style={{ color: "var(--danger, #c41230)" }}>{loadError}</p>
          </div>
        )}

        {!loading && !loadError && projects.length === 0 && (
          <div className="arb-create-card">
            <div className="arb-create-copy">
              <h2 className="arb-create-title">No projects yet</h2>
              <p className="arb-create-sub">
                Create your first project to group ARB review cycles for a customer engagement.
                Each project can contain multiple reviews (initial, re-review, board sign-off).
              </p>
            </div>
            <button className="primary-button" style={{ alignSelf: "flex-start" }} onClick={() => setShowCreate(true)}>
              Create your first project
            </button>
          </div>
        )}

        {!loading && !loadError && projects.map((project) => (
          <ProjectCard
            key={project.projectId}
            project={project}
            onDelete={handleDeleted}
          />
        ))}
      </div>
    </main>
  );
}
