"use client";

import type { ArbExportArtifact } from "@/arb/types";

export interface ExportSectionProps {
  reviewId: string;
  exportArtifacts: ArbExportArtifact[];
  onRegenerate: () => void;
  onDownload: (artifact: ArbExportArtifact) => void;
  regenerating: boolean;
  downloadingId: string | null;
  error: string | null;
}

export function ExportSection({
  exportArtifacts,
  onRegenerate,
  onDownload,
  regenerating,
  downloadingId,
  error,
}: ExportSectionProps) {
  return (
    <section style={{ padding: "12px 20px", borderTop: "1px solid var(--border)" }}>
      <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: "0.82rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--brand)" }}>
        Export
      </p>

      <p style={{ margin: "0 0 8px", fontSize: "0.9rem", color: "var(--t2)" }}>
        Formats: Markdown, CSV, HTML
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button className="secondary-button" onClick={onRegenerate} disabled={regenerating}>
          {regenerating ? "Regenerating…" : "Regenerate reviewed outputs"}
        </button>
      </div>

      {error && (
        <p style={{ margin: "8px 0 0", color: "var(--high)", fontSize: "0.9rem" }}>{error}</p>
      )}

      {exportArtifacts.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {exportArtifacts.map((artifact) => (
            <div
              key={artifact.exportId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "6px 0",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span style={{ flex: 1, fontSize: "0.9rem", color: "var(--t1)" }}>
                {artifact.fileName}
              </span>
              <span style={{ fontSize: "0.8rem", color: "var(--t3)" }}>
                {artifact.format.toUpperCase()}
              </span>
              <span style={{ fontSize: "0.8rem", color: "var(--t3)" }}>
                {new Date(artifact.generatedAt).toLocaleString()}
              </span>
              <button
                className="secondary-button"
                onClick={() => onDownload(artifact)}
                disabled={downloadingId === artifact.exportId}
              >
                {downloadingId === artifact.exportId ? "Downloading…" : "Download"}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
