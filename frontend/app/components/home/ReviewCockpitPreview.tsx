/**
 * ReviewCockpitPreview — dashboard-style cockpit visual (Req 4).
 *
 * Composite of semantic tiles rendered from native HTML + inline SVG.
 * Every element named in Req 4.2 is surfaced via a named child tile with
 * its own accessible name (see design § ReviewCockpitPreview).
 */

import { HOME_COPY } from "./home-copy";

type WafStatus = "aligned" | "partial" | "at-risk";
type CafCoverage = "covered" | "partial" | "gap";

interface WafPillarStatus {
  pillar:
    | "Reliability"
    | "Security"
    | "Cost Optimization"
    | "Operational Excellence"
    | "Performance Efficiency";
  status: WafStatus;
}

interface CafAreaCoverage {
  area: string;
  coverage: CafCoverage;
}

export interface CockpitSampleData {
  reviewScore: number;
  findingsBySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  wafPillars: ReadonlyArray<WafPillarStatus>;
  cafAreas: ReadonlyArray<CafAreaCoverage>;
  heatmap: ReadonlyArray<ReadonlyArray<number>>;
  evidenceConfidence: "High" | "Medium" | "Low";
  decisionTallies: { approved: number; rejected: number; pending: number };
  overallStatus:
    | "In Review"
    | "Pending Decision"
    | "Approved"
    | "Needs Revision";
  openRisks: number;
}

export interface ReviewCockpitPreviewProps {
  sample?: CockpitSampleData;
}

const DEFAULT_SAMPLE: CockpitSampleData = {
  reviewScore: 78,
  findingsBySeverity: { critical: 2, high: 4, medium: 7, low: 3 },
  wafPillars: [
    { pillar: "Reliability", status: "aligned" },
    { pillar: "Security", status: "partial" },
    { pillar: "Cost Optimization", status: "aligned" },
    { pillar: "Operational Excellence", status: "partial" },
    { pillar: "Performance Efficiency", status: "aligned" },
  ],
  cafAreas: [
    { area: "Identity and access management", coverage: "covered" },
    { area: "Resource organization", coverage: "covered" },
    { area: "Network topology and connectivity", coverage: "partial" },
    { area: "Security", coverage: "partial" },
    { area: "Management", coverage: "covered" },
    { area: "Governance", coverage: "partial" },
    { area: "Platform automation and DevOps", coverage: "gap" },
  ],
  // 5 rows (CAF subset) x 6 cols (WAF pillars + overall) tint matrix, values 0..3
  heatmap: [
    [1, 2, 1, 2, 1],
    [2, 3, 2, 1, 2],
    [1, 2, 1, 2, 1],
    [2, 3, 2, 2, 1],
    [0, 1, 1, 2, 1],
  ],
  evidenceConfidence: "Medium",
  decisionTallies: { approved: 6, rejected: 1, pending: 3 },
  overallStatus: "In Review",
  openRisks: 5,
};

function ScoreRing({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const progress = (clamped / 100) * circumference;
  return (
    <span className="review-cockpit-score-ring">
      <svg viewBox="0 0 72 72" aria-hidden="true" focusable="false">
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="6"
        />
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          stroke="var(--heatmap-3)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          transform="rotate(-90 36 36)"
        />
        <text
          x="36"
          y="41"
          textAnchor="middle"
          fontSize="17"
          fontWeight="800"
          fill="#0f172a"
        >
          {clamped}
        </text>
      </svg>
      <span>
        <strong className="review-cockpit-tile-value">{clamped}/100</strong>
      </span>
    </span>
  );
}

const WAF_ROW_LABELS = ["Reliability", "Security", "Cost", "Ops", "Perf"] as const;
const CAF_ROW_LABELS = [
  "Identity",
  "Network",
  "Security",
  "Governance",
  "Platform DevOps",
] as const;

function wafLabel(status: WafStatus): string {
  if (status === "aligned") return "Aligned";
  if (status === "partial") return "Partial";
  return "At risk";
}

export default function ReviewCockpitPreview({
  sample = DEFAULT_SAMPLE,
}: ReviewCockpitPreviewProps) {
  const copy = HOME_COPY.cockpit;
  const { findingsBySeverity: sev, wafPillars, cafAreas, heatmap, decisionTallies: dec } = sample;

  return (
    <section
      className="review-section"
      aria-labelledby="cockpit-title"
      data-home-section="cockpit"
    >
      <div className="review-section-head">
        <p className="review-eyebrow">Review cockpit</p>
        <h2 id="cockpit-title">{copy.sectionTitle}</h2>
      </div>

      <div className="review-cockpit">
        <div className="review-cockpit-grid">
          {/* Review score */}
          <div
            className="review-cockpit-tile review-cockpit-tile--score"
            aria-label={`${copy.tileLabels.score}: ${sample.reviewScore} out of 100`}
          >
            <p className="review-cockpit-tile-label">{copy.tileLabels.score}</p>
            <ScoreRing value={sample.reviewScore} />
            <p className="review-cockpit-tile-sub">Overall review score</p>
          </div>

          {/* Severity */}
          <div className="review-cockpit-tile review-cockpit-tile--severity">
            <p className="review-cockpit-tile-label">{copy.tileLabels.severity}</p>
            <div className="review-cockpit-sev-row">
              <div className="review-cockpit-sev-cell review-cockpit-sev-cell--critical">
                <span>Critical</span>
                <strong>{sev.critical}</strong>
              </div>
              <div className="review-cockpit-sev-cell review-cockpit-sev-cell--high">
                <span>High</span>
                <strong>{sev.high}</strong>
              </div>
              <div className="review-cockpit-sev-cell review-cockpit-sev-cell--medium">
                <span>Medium</span>
                <strong>{sev.medium}</strong>
              </div>
              <div className="review-cockpit-sev-cell review-cockpit-sev-cell--low">
                <span>Low</span>
                <strong>{sev.low}</strong>
              </div>
            </div>
          </div>

          {/* Evidence confidence */}
          <div className="review-cockpit-tile review-cockpit-tile--confidence">
            <p className="review-cockpit-tile-label">{copy.tileLabels.confidence}</p>
            <p className="review-cockpit-tile-value">{sample.evidenceConfidence}</p>
            <p className="review-cockpit-tile-sub">Based on uploaded evidence</p>
          </div>

          {/* WAF pillar status */}
          <div className="review-cockpit-tile review-cockpit-tile--waf">
            <p className="review-cockpit-tile-label">{copy.tileLabels.waf}</p>
            <div className="review-cockpit-pillar-row">
              {wafPillars.map((p) => (
                <div key={p.pillar} className="review-cockpit-pillar">
                  <span>{p.pillar}</span>
                  <span
                    className={`review-cockpit-pillar-status review-cockpit-pillar-status--${p.status}`}
                    title={`${p.pillar}: ${wafLabel(p.status)}`}
                  >
                    {wafLabel(p.status)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* CAF design area coverage */}
          <div className="review-cockpit-tile review-cockpit-tile--caf">
            <p className="review-cockpit-tile-label">{copy.tileLabels.caf}</p>
            <ul className="review-cockpit-caf-list">
              {cafAreas.map((a) => (
                <li key={a.area} style={{ display: "contents" }}>
                  <span>{a.area}</span>
                  <span
                    className={`review-cockpit-caf-dot review-cockpit-caf-dot--${a.coverage}`}
                    role="img"
                    aria-label={`${a.area}: ${a.coverage}`}
                    title={`${a.area}: ${a.coverage}`}
                  />
                </li>
              ))}
            </ul>
          </div>

          {/* Heatmap */}
          <div className="review-cockpit-tile review-cockpit-tile--heatmap">
            <p className="review-cockpit-tile-label">{copy.tileLabels.heatmap}</p>
            <div
              className="review-cockpit-heatmap"
              role="img"
              aria-label="Risk heatmap: CAF areas by WAF pillar"
            >
              <div className="review-cockpit-heatmap-corner" aria-hidden="true" />
              {WAF_ROW_LABELS.map((label) => (
                <div key={label} className="review-cockpit-heatmap-col-label">
                  {label}
                </div>
              ))}
              {heatmap.map((row, rowIdx) => (
                <ROW
                  key={CAF_ROW_LABELS[rowIdx] ?? String(rowIdx)}
                  rowLabel={CAF_ROW_LABELS[rowIdx] ?? String(rowIdx)}
                  row={row}
                  colLabels={WAF_ROW_LABELS}
                />
              ))}
            </div>
          </div>

          {/* Reviewer decisions */}
          <div className="review-cockpit-tile review-cockpit-tile--decisions">
            <p className="review-cockpit-tile-label">{copy.tileLabels.decisions}</p>
            <div className="review-cockpit-decisions">
              <div>
                <small>Approved</small>
                <strong>{dec.approved}</strong>
              </div>
              <div>
                <small>Rejected</small>
                <strong>{dec.rejected}</strong>
              </div>
              <div>
                <small>Pending</small>
                <strong>{dec.pending}</strong>
              </div>
            </div>
          </div>

          {/* Overall status */}
          <div className="review-cockpit-tile review-cockpit-tile--status">
            <p className="review-cockpit-tile-label">{copy.tileLabels.status}</p>
            <p className="review-cockpit-tile-value">{sample.overallStatus}</p>
          </div>

          {/* Open risks */}
          <div className="review-cockpit-tile review-cockpit-tile--risks">
            <p className="review-cockpit-tile-label">{copy.tileLabels.risks}</p>
            <p className="review-cockpit-tile-value">{sample.openRisks}</p>
            <p className="review-cockpit-tile-sub">Open items across findings</p>
          </div>

          {/* Export controls */}
          <div className="review-cockpit-tile review-cockpit-tile--exports">
            <p className="review-cockpit-tile-label">{copy.tileLabels.exports}</p>
            <div className="review-cockpit-export-controls">
              {copy.exportFormats.map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  disabled
                  aria-describedby="cockpit-export-note"
                  data-cockpit-export-format={fmt}
                >
                  {`Export ${fmt}`}
                </button>
              ))}
            </div>
            <span id="cockpit-export-note" className="review-cockpit-export-note">
              {copy.exportDisabledNote}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function ROW({
  rowLabel,
  row,
  colLabels,
}: {
  rowLabel: string;
  row: ReadonlyArray<number>;
  colLabels: ReadonlyArray<string>;
}) {
  return (
    <>
      <div className="review-cockpit-heatmap-row-label">{rowLabel}</div>
      {row.map((value, colIdx) => {
        const level = Math.max(0, Math.min(3, value)) as 0 | 1 | 2 | 3;
        const pair = `${rowLabel} × ${colLabels[colIdx] ?? ""}`;
        return (
          <div
            key={`${rowLabel}-${colIdx}`}
            className={`review-cockpit-heatmap-cell review-cockpit-heatmap-cell--${level}`}
            title={`${pair}: level ${level}`}
            role="img"
            aria-label={`${pair}, level ${level}`}
          />
        );
      })}
    </>
  );
}
