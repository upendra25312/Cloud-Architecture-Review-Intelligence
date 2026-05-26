"use client";

import { useState } from "react";
import type { ArbFinding } from "@/arb/types";
import styles from "./arb-findings-page.module.css";

const CONFIDENCE_CLASS: Record<string, string> = {
  High: styles.confidenceHigh,
  Medium: styles.confidenceMedium,
  Low: styles.confidenceLow,
};

interface Props {
  finding: ArbFinding;
}

export function WhyCariSaysThis({ finding }: Props) {
  const hasEvidence =
    !!finding.evidenceBasis ||
    !!finding.learnMoreUrl ||
    (finding.evidenceFound?.length ?? 0) > 0 ||
    (finding.missingEvidence?.length ?? 0) > 0 ||
    (finding.references?.length ?? 0) > 0;

  const visualEvidenceCount = finding.evidenceFound?.filter(
    (ev) => ev.visualEvidenceId || ev.imageUri
  ).length ?? 0;

  // Auto-expand when confidence is Low so reviewers immediately see thin evidence
  const [expanded, setExpanded] = useState(finding.confidence === "Low");

  if (!hasEvidence) return null;

  return (
    <div className={styles.whySection}>
      <button
        type="button"
        className={styles.whyToggle}
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <span className={styles.whyToggleLabel}>Why CARI says this</span>
        {finding.confidence && (
          <span className={`${styles.confidenceBadge} ${CONFIDENCE_CLASS[finding.confidence] ?? ""}`}>
            {finding.confidence} confidence
          </span>
        )}
        <span className={styles.whyChevron} aria-hidden="true">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div className={styles.whyBody}>
          {finding.evidenceBasis && (
            <div className={styles.whySubsection}>
              <h4 className={styles.whySubheading}>Evidence Basis</h4>
              <p className={styles.sectionBody}>{finding.evidenceBasis}</p>
            </div>
          )}

          {(finding.evidenceFound?.length ?? 0) > 0 && (
            <div className={styles.whySubsection}>
              <h4 className={styles.whySubheading}>
                Linked Evidence ({finding.evidenceFound!.length}
                {visualEvidenceCount > 0 && ` · ${visualEvidenceCount} visual`})
              </h4>
              <ul className={styles.sectionList}>
                {finding.evidenceFound!.map((ev, i) => (
                  <li key={i}>
                    {(ev.visualEvidenceId || ev.imageUri) && (
                      <span className={styles.visualEvidenceBadge} title="Visual evidence (diagram/image)">
                        &#128444;&#xFE0F;{" "}
                      </span>
                    )}
                    <span>{ev.summary}</span>
                    {ev.factType && (
                      <span className={styles.evidenceFactType}> [{ev.factType}]</span>
                    )}
                    {ev.sourceFileName && (
                      <span className={styles.evidenceSource}> — {ev.sourceFileName}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(finding.missingEvidence?.length ?? 0) > 0 && (
            <div className={styles.whySubsection}>
              <h4 className={`${styles.whySubheading} ${styles.whySubheadingDanger}`}>
                Missing Evidence
              </h4>
              <ul className={styles.sectionList}>
                {finding.missingEvidence!.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {(finding.references?.length ?? 0) > 0 && (
            <div className={styles.whySubsection}>
              <h4 className={styles.whySubheading}>Grounding References</h4>
              <ul className={styles.sectionList}>
                {finding.references!.map((ref, i) => (
                  <li key={i}>
                    {ref.url ? (
                      <a
                        href={ref.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.learnMoreLink}
                      >
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
            </div>
          )}

          {finding.learnMoreUrl && (
            <div className={styles.whySubsection}>
              <a
                href={finding.learnMoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.learnMoreLink}
              >
                Microsoft Learn Guidance ↗
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
