/**
 * SampleFindingCard — single Finding_Card (Req 5).
 *
 * Renders the 8 documented fields (Finding title, Severity, Affected Service,
 * Framework Mapping, Evidence Source, Recommendation, Reviewer Decision,
 * Export Status) as a labelled <dl>.  Severity is presented through
 * SeverityBadge, which provides an icon + text (non-colour cue).
 *
 * Pure presentational component.
 */

import SeverityBadge, { type Severity } from "./SeverityBadge";
import { HOME_COPY } from "./home-copy";

export interface SampleFinding {
  title: string;
  severity: Severity;
  affectedService: string;
  frameworkMapping: string;
  evidenceSource: string;
  recommendation: string;
  reviewerDecision: "Accepted" | "Rejected" | "Override" | "Pending";
  exportStatus: string;
}

export interface SampleFindingCardProps {
  finding?: SampleFinding;
}

function toDefaultFinding(): SampleFinding {
  const src = HOME_COPY.sampleFinding;
  return {
    title: src.title,
    severity: src.severity as Severity,
    affectedService: src.affectedService,
    frameworkMapping: src.frameworkMapping,
    evidenceSource: src.evidenceSource,
    recommendation: src.recommendation,
    reviewerDecision:
      src.reviewerDecision as SampleFinding["reviewerDecision"],
    exportStatus: src.exportStatus,
  };
}

export default function SampleFindingCard({
  finding = toDefaultFinding(),
}: SampleFindingCardProps) {
  return (
    <section
      className="review-section"
      aria-labelledby="sample-finding-title"
      data-home-section="sample-finding"
    >
      <div className="review-section-head">
        <p className="review-eyebrow">Finding example</p>
        <h2 id="sample-finding-title">{HOME_COPY.sampleFinding.sectionTitle}</h2>
      </div>

      <article className="review-finding-card">
        <h3>Sample architecture finding</h3>
        <dl>
          <div className="review-finding-field">
            <dt className="review-finding-field-label">Finding title</dt>
            <dd className="review-finding-field-value">
              <strong>{finding.title}</strong>
            </dd>
          </div>
          <div className="review-finding-field">
            <dt className="review-finding-field-label">Severity</dt>
            <dd className="review-finding-field-value">
              <SeverityBadge severity={finding.severity} />
            </dd>
          </div>
          <div className="review-finding-field">
            <dt className="review-finding-field-label">Affected service</dt>
            <dd className="review-finding-field-value">{finding.affectedService}</dd>
          </div>
          <div className="review-finding-field">
            <dt className="review-finding-field-label">Framework mapping</dt>
            <dd className="review-finding-field-value">{finding.frameworkMapping}</dd>
          </div>
          <div className="review-finding-field">
            <dt className="review-finding-field-label">Evidence source</dt>
            <dd className="review-finding-field-value">{finding.evidenceSource}</dd>
          </div>
          <div className="review-finding-field">
            <dt className="review-finding-field-label">Recommendation</dt>
            <dd className="review-finding-field-value">{finding.recommendation}</dd>
          </div>
          <div className="review-finding-field">
            <dt className="review-finding-field-label">Reviewer decision</dt>
            <dd className="review-finding-field-value">{finding.reviewerDecision}</dd>
          </div>
          <div className="review-finding-field">
            <dt className="review-finding-field-label">Export status</dt>
            <dd className="review-finding-field-value">{finding.exportStatus}</dd>
          </div>
        </dl>
      </article>
    </section>
  );
}
