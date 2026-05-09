import type { TechnologySummary } from "@/types";

type QualityBadgeProps = {
  technology: Pick<TechnologySummary, "maturityBucket" | "quality">;
  compact?: boolean;
};

export function QualityBadge({ technology, compact = false }: QualityBadgeProps) {
  return (
    <div
      className={`quality-badge quality-${technology.maturityBucket.toLowerCase()}${
        compact ? " quality-badge-compact" : ""
      }`}
    >
      <span className="quality-badge-title">{technology.quality.label}</span>
      <strong>{technology.quality.qualityScore}/100</strong>
      {!compact ? (
        <span className="quality-badge-copy">
          {technology.quality.metadataCompleteness}% metadata completeness ·{" "}
          {technology.quality.severityConfidence}% severity coverage
        </span>
      ) : null}
    </div>
  );
}
