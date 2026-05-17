"use client";

import type React from "react";
import type { ArbExportArtifact } from "@/arb/types";
import styles from "./arb-export-panel.module.css";

// ─── Format metadata ───────────────────────────────────────────────────────────

const FORMAT_META: Record<string, { label: string; bg: string; color: string }> = {
  docx:     { label: "DOCX",     bg: "#EFF4FC", color: "#2B579A" },
  xlsx:     { label: "XLSX",     bg: "#EBF5EF", color: "#217346" },
  pptx:     { label: "PPTX",     bg: "#FEF0EC", color: "#C43E1C" },
  csv:      { label: "CSV",      bg: "#F0F9FF", color: "#0369A1" },
  html:     { label: "HTML",     bg: "#F5F3FF", color: "#6D28D9" },
  markdown: { label: "MD",       bg: "#F9FAFB", color: "#374151" },
};

function formatRelativeTime(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── SVG icons ─────────────────────────────────────────────────────────────────

function IconPptx() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect width="20" height="20" rx="4" fill="#C43E1C" />
      <text x="10" y="14" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="700" fontFamily="system-ui,sans-serif">P</text>
    </svg>
  );
}

function IconXlsx() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect width="20" height="20" rx="4" fill="#217346" />
      <text x="10" y="14" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="700" fontFamily="system-ui,sans-serif">X</text>
    </svg>
  );
}

function IconDocx() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect width="20" height="20" rx="4" fill="#2B579A" />
      <text x="10" y="14" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="700" fontFamily="system-ui,sans-serif">W</text>
    </svg>
  );
}

function IconDownload() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M6 1v7M3 6l3 3 3-3M1 10h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconRefresh({ spinning }: { spinning: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ animation: spinning ? "spin 0.8s linear infinite" : undefined }}>
      <path d="M11.5 6.5A5 5 0 1 1 9 2.07" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9 1v3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ArbExportPanelProps {
  exportArtifacts: ArbExportArtifact[];
  onRegenerate: () => void;
  onDownload: (artifact: ArbExportArtifact) => void;
  onDownloadPptx?: () => void;
  onDownloadExcel: () => void;
  onDownloadDocx: () => void;
  regenerating: boolean;
  downloadingId: string | null;
  downloadingPptx?: boolean;
  downloadingExcel: boolean;
  downloadingDocx: boolean;
  error: string | null;
  secondaryFormats?: string[];
}

// ─── Export Panel ──────────────────────────────────────────────────────────────

export function ArbExportPanel({
  exportArtifacts,
  onRegenerate,
  onDownload,
  onDownloadPptx,
  onDownloadExcel,
  onDownloadDocx,
  regenerating,
  downloadingId,
  downloadingPptx = false,
  downloadingExcel,
  downloadingDocx,
  error,
  secondaryFormats = ["Markdown", "CSV", "HTML"],
}: ArbExportPanelProps) {

  interface CardDef {
    key: string;
    icon: React.ReactNode;
    iconBg: string;
    title: string;
    desc: string;
    loading: boolean;
    onClick: () => void;
  }

  const primaryCards: CardDef[] = [
    ...(onDownloadPptx ? [{
      key: "pptx",
      icon: <IconPptx />,
      iconBg: "rgba(196,62,28,0.10)",
      title: "PowerPoint",
      desc: "Executive board deck with brand template, scorecard, and findings",
      loading: downloadingPptx,
      onClick: onDownloadPptx,
    }] : []),
    {
      key: "xlsx",
      icon: <IconXlsx />,
      iconBg: "rgba(33,115,70,0.10)",
      title: "Excel Workbook",
      desc: "12-tab workbook — findings, risks, actions, scorecard, traceability",
      loading: downloadingExcel,
      onClick: onDownloadExcel,
    },
    {
      key: "docx",
      icon: <IconDocx />,
      iconBg: "rgba(43,87,154,0.10)",
      title: "Word Document",
      desc: "Structured board pack — cover, executive summary, findings, actions",
      loading: downloadingDocx,
      onClick: onDownloadDocx,
    },
  ];

  return (
    <section className={styles.panel}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerText}>
          <p className={styles.title}>Export Board Pack</p>
          <p className={styles.subtitle}>Generate review outputs for board sign-off, project records, and audit</p>
        </div>
        <button className={styles.regenerateBtn} onClick={onRegenerate} disabled={regenerating}>
          <IconRefresh spinning={regenerating} />
          {regenerating ? "Regenerating…" : "Regenerate all"}
        </button>
      </div>

      {/* ── Primary format cards ── */}
      <div className={styles.cards}>
        {primaryCards.map((card) => (
          <button
            key={card.key}
            className={styles.card}
            onClick={card.onClick}
            disabled={card.loading}
          >
            <div className={styles.cardIcon} style={{ background: card.iconBg }}>
              {card.icon}
            </div>
            <div className={styles.cardBody}>
              <p className={styles.cardTitle}>{card.title}</p>
              <p className={styles.cardDesc}>{card.desc}</p>
            </div>
            <span className={styles.cardAction}>
              {card.loading
                ? <><span className={styles.cardActionSpinner} /> Generating…</>
                : <><IconDownload /> Export</>
              }
            </span>
          </button>
        ))}
      </div>

      {/* ── Secondary formats ── */}
      {secondaryFormats.length > 0 && (
        <div className={styles.secondaryRow}>
          <span className={styles.secondaryLabel}>Also available:</span>
          {secondaryFormats.map((fmt) => (
            <span key={fmt} className={styles.formatPill}>{fmt}</span>
          ))}
          <span className={styles.secondaryLabel} style={{ marginLeft: 4, fontStyle: "italic" }}>
            — via Regenerate all
          </span>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className={styles.error}>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
            <circle cx="7.5" cy="7.5" r="6.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M7.5 4.5v3.5M7.5 10h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          {error}
        </div>
      )}

      {/* ── Artifact history ── */}
      {exportArtifacts.length > 0 && (
        <div className={styles.artifactList}>
          {exportArtifacts.map((artifact) => {
            const meta = FORMAT_META[artifact.format] ?? FORMAT_META.markdown;
            const isDownloading = downloadingId === artifact.exportId;
            return (
              <div key={artifact.exportId} className={styles.artifactRow}>
                <span
                  className={styles.artifactFormatBadge}
                  style={{ background: meta.bg, color: meta.color }}
                >
                  {meta.label}
                </span>
                <span className={styles.artifactName} title={artifact.fileName}>
                  {artifact.fileName}
                </span>
                <span className={styles.artifactTime}>
                  {formatRelativeTime(artifact.generatedAt)}
                </span>
                <button
                  className={styles.artifactDownloadBtn}
                  onClick={() => onDownload(artifact)}
                  disabled={isDownloading}
                >
                  {isDownloading ? (
                    <><span className={styles.cardActionSpinner} /> Downloading…</>
                  ) : (
                    <><IconDownload /> Download</>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
