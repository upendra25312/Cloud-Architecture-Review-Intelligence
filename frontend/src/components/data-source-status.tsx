import type { CommercialDataSourceInfo } from "@/types";

type DataSourceStatusCardProps = {
  label: string;
  dataSource?: CommercialDataSourceInfo;
  loadingSummary?: string;
  fallbackSummary?: string;
};

function formatTimestamp(value?: string) {
  if (!value) {
    return null;
  }

  return new Date(value).toLocaleString("en-US");
}

function resolveStatusCopy(
  dataSource: CommercialDataSourceInfo | undefined,
  loadingSummary: string,
  fallbackSummary: string
) {
  const refreshedAt = formatTimestamp(dataSource?.refreshedAt);

  switch (dataSource?.mode) {
    case "live":
      return {
        tone: "live",
        badge: "Live refresh",
        title: "Using a fresh Microsoft-backed refresh.",
        summary: refreshedAt
          ? `The latest public source refresh completed at ${refreshedAt}.`
          : "The panel is using a fresh backend refresh from the public source."
      };
    case "cache":
      return {
        tone: "cache",
        badge: "Scheduled cache",
        title: "Using the scheduled backend cache.",
        summary: refreshedAt
          ? `The backend is serving the last successful cache captured at ${refreshedAt}.`
          : "The panel is using the scheduled backend cache instead of a just-in-time refresh."
      };
    case "stale-cache":
      return {
        tone: "fallback",
        badge: "Fallback cache",
        title: "Using stale cache because the live refresh did not complete.",
        summary: refreshedAt
          ? `${dataSource.lastError ?? "The live refresh did not complete."} The panel stayed on the last successful cache from ${refreshedAt}.`
          : dataSource.lastError ?? fallbackSummary
      };
    default:
      return {
        tone: "loading",
        badge: "Source loading",
        title: "Resolving backend source state.",
        summary: loadingSummary
      };
  }
}

export function DataSourceStatusCard({
  label,
  dataSource,
  loadingSummary = "The panel is still resolving whether the backend can serve a fresh refresh, scheduled cache, or fallback state.",
  fallbackSummary = "The panel stayed on the last successful backend result so the review can continue."
}: DataSourceStatusCardProps) {
  const copy = resolveStatusCopy(dataSource, loadingSummary, fallbackSummary);

  return (
    <div className="filter-card data-source-status-card">
      <div className="data-source-status-head">
        <div>
          <p className="eyebrow">{label}</p>
          <h3>{copy.title}</h3>
        </div>
        <span className={`data-source-status-pill data-source-status-pill-${copy.tone}`}>
          {copy.badge}
        </span>
      </div>
      <p className="microcopy">{copy.summary}</p>
    </div>
  );
}