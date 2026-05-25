"use client";

import { useEffect, useRef } from "react";
import type { ArbFinding, ArbAction } from "@/arb/types";
import { FindingEditor } from "./finding-editor";
import { FindingActionEditor } from "./finding-action-editor";
import { SeverityBadge } from "@/components/severity-badge";
import { WhyCariSaysThis } from "./why-cari-says-this";
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

      {/* Why CARI says this — collapsible evidence + guidance panel */}
      <WhyCariSaysThis finding={finding} />

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
