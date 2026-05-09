"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import type { ArbDomainScore, ArbFinding } from "@/arb/types";
import { getDomainScorePercent, getScoreTone } from "./scorecard-utils";
import styles from "./arb-scorecard-page.module.css";

export interface DomainSectionProps {
  domainScore: ArbDomainScore;
  findings: ArbFinding[];
  reviewId: string;
  defaultExpanded: boolean;
}

const FILL_CLASS: Record<string, string> = {
  green: styles.scoreBarFillGreen,
  amber: styles.scoreBarFillAmber,
  red: styles.scoreBarFillRed,
};

const SEVERITY_CLASS: Record<string, string> = {
  High: styles.severityBadgeHigh,
  Medium: styles.severityBadgeMedium,
  Low: styles.severityBadgeLow,
};

export function DomainSection({ domainScore, findings, reviewId, defaultExpanded }: DomainSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const percent = getDomainScorePercent(domainScore);
  const tone = getScoreTone(percent);

  const linkedFindingObjects = domainScore.linkedFindings
    .map((id) => findings.find((f) => f.findingId === id))
    .filter((f): f is ArbFinding => f != null);

  const displayedFindings = linkedFindingObjects.slice(0, 3);
  const totalLinked = linkedFindingObjects.length;
  const findingsHref = `/arb/${reviewId}/findings?domain=${encodeURIComponent(domainScore.domain)}` as Route;

  return (
    <div className={styles.domainSection}>
      <button
        className={styles.domainHeader}
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className={`${styles.chevron} ${expanded ? styles.chevronExpanded : ""}`} aria-hidden="true">
          ▶
        </span>
        <strong style={{ minWidth: 120 }}>{domainScore.domain}</strong>
        <span style={{ fontSize: "0.9rem", color: "var(--t2)" }}>
          {percent}% ({domainScore.score}/{domainScore.weight})
        </span>
        <div
          className={styles.scoreBar}
          role="progressbar"
          aria-label={`${domainScore.domain} score: ${percent}%`}
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`${styles.scoreBarFill} ${FILL_CLASS[tone] ?? ""}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </button>

      {expanded && (
        <div className={styles.domainBody}>
          {domainScore.reason && (
            <p style={{ margin: "0 0 8px", color: "var(--t1)", lineHeight: 1.6 }}>
              {domainScore.reason}
            </p>
          )}

          {displayedFindings.map((f) => (
            <div key={f.findingId} className={styles.inlineFinding}>
              <span className={`${styles.severityBadge} ${SEVERITY_CLASS[f.severity] ?? ""}`}>
                {f.severity}
              </span>
              <span>{f.title}</span>
            </div>
          ))}

          {totalLinked > 3 && (
            <Link href={findingsHref} style={{ fontSize: "0.9rem", color: "var(--brand)", fontWeight: 600 }}>
              View all {totalLinked} findings →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
