"use client";

import type { ArbAssessmentRunMeta } from "@/arb/types";

interface RunHistoryBannerProps {
  runs: ArbAssessmentRunMeta[];
  reviewId: string;
}

export function RunHistoryBanner({ runs, reviewId }: RunHistoryBannerProps) {
  if (runs.length < 2) return null;

  const latest = runs[runs.length - 1];
  const previous = runs[runs.length - 2];
  const delta = latest.delta;

  const scoreDiff =
    latest.overallScore !== null && previous.overallScore !== null
      ? latest.overallScore - previous.overallScore
      : null;

  const scorePart =
    scoreDiff !== null
      ? scoreDiff > 0
        ? `+${scoreDiff} pts`
        : scoreDiff < 0
          ? `${scoreDiff} pts`
          : "score unchanged"
      : null;

  const parts: string[] = [];
  if (delta) {
    if (delta.newCount > 0) parts.push(`${delta.newCount} new`);
    if (delta.resolvedCount > 0) parts.push(`${delta.resolvedCount} resolved`);
    if (delta.escalatedCount > 0) parts.push(`${delta.escalatedCount} escalated`);
    if (delta.improvedCount > 0) parts.push(`${delta.improvedCount} improved`);
  }

  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px",
        background: "#EFF6FF",
        border: "1px solid #BFDBFE",
        borderRadius: 6,
        marginBottom: 12,
        fontSize: "0.875rem",
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontWeight: 600, color: "#1D4ED8" }}>
        Assessment run {latest.runNumber} of {runs.length}
      </span>

      {parts.length > 0 && (
        <span style={{ color: "#374151" }}>
          Since run {previous.runNumber}:{" "}
          {parts.join(" · ")}
        </span>
      )}

      {scorePart && (
        <span
          style={{
            color: scoreDiff! > 0 ? "#166534" : scoreDiff! < 0 ? "#991B1B" : "#374151",
            fontWeight: 500,
          }}
        >
          {scorePart}
        </span>
      )}

      <span style={{ marginLeft: "auto", color: "#6B7280", fontSize: "0.8rem" }}>
        {runs.length} total run{runs.length !== 1 ? "s" : ""}
      </span>
    </div>
  );
}
