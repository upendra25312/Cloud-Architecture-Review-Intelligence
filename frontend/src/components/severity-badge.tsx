export function SeverityBadge({
  severity,
  compact = false,
}: {
  severity?: "High" | "Medium" | "Low";
  compact?: boolean;
}) {
  const tone = (severity ?? "none").toLowerCase();
  return (
    <span
      className={`sev-badge sev-badge--${tone}${compact ? " sev-badge--compact" : ""}`}
      aria-label={`Severity: ${severity ?? "unspecified"}`}
    >
      {severity ?? "—"}
    </span>
  );
}
