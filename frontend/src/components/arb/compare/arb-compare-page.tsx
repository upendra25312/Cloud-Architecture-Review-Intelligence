"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  fetchArbReview,
  fetchArbScorecard,
  fetchArbFindings,
} from "@/arb/api";
import { getArbStepHref } from "@/arb/routes";
import { computeArbComparison } from "@/arb/compare";
import type {
  ArbReviewSummary,
  ArbScorecard,
  ArbFinding,
  ArbReviewComparison,
  ArbFindingDiff,
} from "@/arb/types";
import styles from "./arb-compare-page.module.css";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function scoreColor(score: number | null) {
  if (score == null) return "var(--t3)";
  if (score >= 80) return "var(--ok, #16A34A)";
  if (score >= 60) return "var(--warn, #D97706)";
  return "var(--high, #D92B2B)";
}

function deltaClass(delta: number | null, inverse = false): string {
  if (delta == null || delta === 0) return styles.deltaNeutral;
  const positive = inverse ? delta < 0 : delta > 0;
  return positive ? styles.deltaPositive : styles.deltaNegative;
}

function deltaSign(delta: number | null): string {
  if (delta == null) return "—";
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

function changeLabel(change: ArbFindingDiff["change"]): string {
  switch (change) {
    case "new": return "New";
    case "resolved": return "Resolved";
    case "improved": return "Improved";
    case "degraded": return "Degraded";
    default: return "Unchanged";
  }
}

function changeClass(change: ArbFindingDiff["change"]): string {
  switch (change) {
    case "new": return styles.changeBadgeNew;
    case "resolved": return styles.changeBadgeResolved;
    case "improved": return styles.changeBadgeImproved;
    case "degraded": return styles.changeBadgeDegraded;
    default: return styles.changeBadgeUnchanged;
  }
}

function severityClass(severity: string): string {
  switch (severity) {
    case "Critical": return styles.sevCritical;
    case "High": return styles.sevHigh;
    case "Medium": return styles.sevMedium;
    case "Low": return styles.sevLow;
    default: return styles.sevInfo;
  }
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ScoreHero({ comparison }: { comparison: ArbReviewComparison }) {
  const { base, head, baseScorecard, headScorecard, overallDelta } = comparison;
  const baseScore = baseScorecard?.overallScore ?? null;
  const headScore = headScorecard?.overallScore ?? null;

  return (
    <div className={styles.scoreHero}>
      <div className={styles.scoreTile}>
        <p className={styles.scoreTileLabel}>Baseline</p>
        <p className={styles.scoreTileProject}>{base.projectName}</p>
        <p className={styles.scoreTileDate}>{formatDate(base.lastUpdated)}</p>
        <p className={styles.scoreTileScore} style={{ color: scoreColor(baseScore) }}>
          {baseScore ?? "—"}
        </p>
        <p className={styles.scoreTileRec}>{baseScorecard?.recommendation ?? base.recommendation ?? "—"}</p>
        <Link href={getArbStepHref(base.reviewId, "scorecard")} className={styles.scoreTileLink}>
          Open scorecard →
        </Link>
      </div>

      <div className={styles.scoreDivider}>
        <span className={`${styles.overallDelta} ${deltaClass(overallDelta)}`}>
          {deltaSign(overallDelta)}
        </span>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <div className={styles.scoreTile}>
        <p className={styles.scoreTileLabel}>Current</p>
        <p className={styles.scoreTileProject}>{head.projectName}</p>
        <p className={styles.scoreTileDate}>{formatDate(head.lastUpdated)}</p>
        <p className={styles.scoreTileScore} style={{ color: scoreColor(headScore) }}>
          {headScore ?? "—"}
        </p>
        <p className={styles.scoreTileRec}>{headScorecard?.recommendation ?? head.recommendation ?? "—"}</p>
        <Link href={getArbStepHref(head.reviewId, "scorecard")} className={styles.scoreTileLink}>
          Open scorecard →
        </Link>
      </div>
    </div>
  );
}

function DomainTable({ comparison }: { comparison: ArbReviewComparison }) {
  const { domainDeltas, criticalBlockersDelta, baseScorecard, headScorecard } = comparison;

  if (domainDeltas.length === 0) {
    return (
      <p className={styles.emptyNote}>No domain scores available for comparison.</p>
    );
  }

  return (
    <div className={styles.domainTable}>
      <div className={styles.domainTableHeader}>
        <span>Domain</span>
        <span className={styles.colCenter}>Baseline</span>
        <span className={styles.colCenter}>Current</span>
        <span className={styles.colCenter}>Delta</span>
      </div>
      {domainDeltas.map((d) => (
        <div key={d.domain} className={styles.domainRow}>
          <span className={styles.domainName}>{d.domain}</span>
          <span className={`${styles.colCenter} ${styles.domainScore}`} style={{ color: scoreColor(d.baseScore) }}>
            {d.baseScore}
          </span>
          <span className={`${styles.colCenter} ${styles.domainScore}`} style={{ color: scoreColor(d.headScore) }}>
            {d.headScore}
          </span>
          <span className={`${styles.colCenter} ${styles.domainDelta} ${deltaClass(d.delta)}`}>
            {deltaSign(d.delta)}
          </span>
        </div>
      ))}
      {criticalBlockersDelta != null && (
        <div className={`${styles.domainRow} ${styles.domainRowBlockers}`}>
          <span className={styles.domainName}>Critical Blockers</span>
          <span className={`${styles.colCenter} ${styles.domainScore}`}>
            {(baseScorecard?.criticalBlockers ?? 0)}
          </span>
          <span className={`${styles.colCenter} ${styles.domainScore}`}>
            {(headScorecard?.criticalBlockers ?? 0)}
          </span>
          <span className={`${styles.colCenter} ${styles.domainDelta} ${deltaClass(criticalBlockersDelta, true)}`}>
            {deltaSign(criticalBlockersDelta)}
          </span>
        </div>
      )}
    </div>
  );
}

type FindingTab = "all" | "new" | "resolved" | "changed";

function FindingsDiff({ comparison }: { comparison: ArbReviewComparison }) {
  const [tab, setTab] = useState<FindingTab>("all");
  const { findingDiffs, newFindingsCount, resolvedFindingsCount } = comparison;

  const changedCount = findingDiffs.filter(
    (d) => d.change === "improved" || d.change === "degraded"
  ).length;

  const visible = useMemo(() => {
    if (tab === "new") return findingDiffs.filter((d) => d.change === "new");
    if (tab === "resolved") return findingDiffs.filter((d) => d.change === "resolved");
    if (tab === "changed") return findingDiffs.filter((d) => d.change === "improved" || d.change === "degraded");
    return findingDiffs.filter((d) => d.change !== "unchanged");
  }, [tab, findingDiffs]);

  const tabs: { key: FindingTab; label: string; count: number }[] = [
    { key: "all", label: "All changes", count: findingDiffs.filter((d) => d.change !== "unchanged").length },
    { key: "new", label: "New", count: newFindingsCount },
    { key: "resolved", label: "Resolved", count: resolvedFindingsCount },
    { key: "changed", label: "Changed", count: changedCount },
  ];

  if (findingDiffs.length === 0) {
    return <p className={styles.emptyNote}>No findings data available for comparison.</p>;
  }

  return (
    <div className={styles.findingsDiff}>
      <div className={styles.findingsTabs} role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`${styles.findingsTab} ${tab === t.key ? styles.findingsTabActive : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <span className={styles.findingsTabCount}>{t.count}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className={styles.emptyNote}>No findings in this category.</p>
      ) : (
        <div className={styles.findingsList}>
          {visible.map((diff, i) => (
            <div key={i} className={styles.findingRow}>
              <span className={`${styles.changeBadge} ${changeClass(diff.change)}`}>
                {changeLabel(diff.change)}
              </span>
              <span className={`${styles.severityBadge} ${severityClass(diff.severity)}`}>
                {diff.severity}
              </span>
              <span className={styles.findingDomain}>{diff.domain}</span>
              <span className={styles.findingTitle}>{diff.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export function ArbComparePage({ baseId, headId }: { baseId: string; headId: string }) {
  const [comparison, setComparison] = useState<ArbReviewComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [
          baseReview, headReview,
          baseScorecard, headScorecard,
          baseFindings, headFindings,
        ] = await Promise.all([
          fetchArbReview(baseId),
          fetchArbReview(headId),
          fetchArbScorecard(baseId).catch(() => null as ArbScorecard | null),
          fetchArbScorecard(headId).catch(() => null as ArbScorecard | null),
          fetchArbFindings(baseId).catch(() => [] as ArbFinding[]),
          fetchArbFindings(headId).catch(() => [] as ArbFinding[]),
        ]);

        if (!cancelled) {
          setComparison(
            computeArbComparison(
              baseReview, headReview,
              baseScorecard, headScorecard,
              baseFindings, headFindings,
            )
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load comparison data.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [baseId, headId]);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingState}>
          <span className={styles.loadingSpinner} />
          <p>Loading comparison…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.errorState}>{error}</div>
      </div>
    );
  }

  if (!comparison) return null;

  return (
    <div className={styles.page}>
      {/* ── Nav ── */}
      <div className={styles.nav}>
        <Link href="/arb" className={styles.navBack}>
          ← Back to library
        </Link>
        <div className={styles.navActions}>
          <Link href={getArbStepHref(baseId, "scorecard")} className={styles.navLink}>
            {comparison.base.projectName} scorecard
          </Link>
          <Link href={getArbStepHref(headId, "scorecard")} className={styles.navLink}>
            {comparison.head.projectName} scorecard
          </Link>
        </div>
      </div>

      {/* ── Header ── */}
      <div className={styles.header}>
        <p className={styles.kicker}>Review Comparison</p>
        <h1 className={styles.title}>
          {comparison.base.projectName}
          <span className={styles.titleVs}>vs</span>
          {comparison.head.projectName}
        </h1>
        <p className={styles.subtitle}>
          Side-by-side delta across scores, domain breakdown, and findings — showing what improved, what's new, and what was resolved.
        </p>
      </div>

      {/* ── Score hero ── */}
      <ScoreHero comparison={comparison} />

      {/* ── Domain table ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Domain Score Delta</h2>
        <DomainTable comparison={comparison} />
      </section>

      {/* ── Findings diff ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          Findings Changes
          <span className={styles.sectionMeta}>
            {comparison.newFindingsCount} new · {comparison.resolvedFindingsCount} resolved
          </span>
        </h2>
        <FindingsDiff comparison={comparison} />
      </section>
    </div>
  );
}
