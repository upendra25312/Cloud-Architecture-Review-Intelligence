"use client";

import { useEffect, useRef } from "react";
import type { ArbFinding, ArbAction } from "@/arb/types";
import { FindingEditor } from "./finding-editor";
import { FindingActionEditor } from "./finding-action-editor";
import { SeverityBadge } from "@/components/severity-badge";
import styles from "./arb-findings-page.module.css";

export interface FindingDetailPanelProps {
  finding: ArbFinding;
  action: ArbAction | null;
  findingError: string | null;
  onUpdateFinding: (finding: ArbFinding) => void;
  onSaveFinding: (finding: ArbFinding) => void;
  onCreateAction: (finding: ArbFinding) => void;
  onUpdateAction: (action: ArbAction) => void;
  onSaveAction: (action: ArbAction) => void;
  savingFindingId: string | null;
  savingActionId: string | null;
  creatingActionForFindingId: string | null;
}

function toSeverityLevel(value: string | undefined): "High" | "Medium" | "Low" | undefined {
  if (value === "High" || value === "Medium" || value === "Low") {
    return value;
  }
  return undefined;
}

const CONFIDENCE_CLASS: Record<string, string> = {
  High: styles.confidenceHigh,
  Medium: styles.confidenceMedium,
  Low: styles.confidenceLow,
};

function isLowCoverage(finding: ArbFinding): boolean {
  const thinEvidence =
    (!finding.evidenceFound || finding.evidenceFound.length === 0) &&
    finding.missingEvidence &&
    finding.missingEvidence.length > 0;
  return finding.confidence === "Low" || thinEvidence;
}

export function FindingDetailPanel({
  finding,
  action,
  findingError,
  onUpdateFinding,
  onSaveFinding,
  onCreateAction,
  onUpdateAction,
  onSaveAction,
  savingFindingId,
  savingActionId,
  creatingActionForFindingId,
}: FindingDetailPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Focus the heading when the finding changes (e.g. via keyboard nav)
  useEffect(() => {
    headingRef.current?.focus();
  }, [finding.findingId]);

  return (
    <div className={styles.detailPanel}>
      {/* Header */}
      <div className={styles.detailHeader}>
        <h2 ref={headingRef} tabIndex={-1} className={styles.detailTitle}>
          {finding.title}
        </h2>
        <div className={styles.detailHeaderMeta}>
          <SeverityBadge severity={toSeverityLevel(finding.severity)} />
          <span className={styles.domainTag}>{finding.domain}</span>
          <span className={styles.referenceRelevance}>{finding.findingType}</span>
          {finding.confidence && (
            <span className={`${styles.confidenceBadge} ${CONFIDENCE_CLASS[finding.confidence] ?? ""}`}>
              {finding.confidence} confidence
            </span>
          )}
        </div>
      </div>

      {/* Low-coverage warning */}
      {isLowCoverage(finding) && (
        <div className={styles.lowCoverageBanner} role="alert">
          ⚠ This finding has thin evidence backing. Verify the assessment against uploaded documents before treating it as a hard blocker.
        </div>
      )}

      {/* Assessment Finding */}
      <section className={styles.detailSection}>
        <h3 className={styles.sectionHeading}>Assessment Finding</h3>
        <p className={styles.sectionBody}>{finding.findingStatement}</p>
      </section>

      {/* Business Impact */}
      <section className={styles.detailSection}>
        <h3 className={styles.sectionHeading}>Business Impact</h3>
        <p className={styles.sectionBody}>{finding.whyItMatters}</p>
      </section>

      {/* Recommended Action */}
      <section className={styles.detailSection}>
        <h3 className={styles.sectionHeading}>Recommended Action</h3>
        <p className={styles.sectionBody}>{finding.recommendation}</p>
      </section>

      {/* Evidence Basis */}
      <section className={styles.detailSection}>
        <h3 className={styles.sectionHeading}>Evidence Basis</h3>
        <p className={styles.sectionBody}>{finding.evidenceBasis}</p>
      </section>

      {/* Microsoft Learn Guidance */}
      {finding.learnMoreUrl && (
        <section className={styles.detailSection}>
          <a
            href={finding.learnMoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.learnMoreLink}
          >
            Microsoft Learn Guidance ↗
          </a>
        </section>
      )}

      {/* Missing Evidence */}
      {finding.missingEvidence && finding.missingEvidence.length > 0 && (
        <section className={styles.detailSection}>
          <h3 className={styles.sectionHeadingDanger}>Missing Evidence</h3>
          <ul className={styles.sectionList}>
            {finding.missingEvidence.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Grounding References */}
      {finding.references && finding.references.length > 0 && (
        <section className={styles.detailSection}>
          <h3 className={styles.sectionHeading}>Grounding References</h3>
          <ul className={styles.sectionList}>
            {finding.references.map((ref, i) => (
              <li key={i}>
                {ref.url ? (
                  <a href={ref.url} target="_blank" rel="noopener noreferrer" className={styles.learnMoreLink}>
                    {ref.title}
                  </a>
                ) : (
                  <span>{ref.title}</span>
                )}
                {ref.relevance && (
                  <span className={styles.referenceRelevance}> — {ref.relevance}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Linked Evidence */}
      {finding.evidenceFound && finding.evidenceFound.length > 0 && (
        <section className={styles.detailSection}>
          <h3 className={styles.sectionHeading}>Linked Evidence</h3>
          <ul className={styles.sectionList}>
            {finding.evidenceFound.map((ev, i) => (
              <li key={i}>
                {ev.summary}
                {ev.sourceFileName && (
                  <span className={styles.evidenceSource}> — {ev.sourceFileName}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Review Action section */}
      <hr className={styles.sectionDivider} />

      <FindingEditor
        finding={finding}
        onUpdate={onUpdateFinding}
        onSave={onSaveFinding}
        saving={savingFindingId === finding.findingId}
        error={findingError}
      />

      <FindingActionEditor
        finding={finding}
        action={action}
        onCreate={onCreateAction}
        onUpdate={onUpdateAction}
        onSave={onSaveAction}
        creating={creatingActionForFindingId === finding.findingId}
        saving={savingActionId === action?.actionId}
      />
    </div>
  );
}
