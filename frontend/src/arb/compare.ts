import type {
  ArbReviewSummary,
  ArbScorecard,
  ArbFinding,
  ArbDomainDelta,
  ArbFindingDiff,
  ArbReviewComparison,
} from "./types";

const SEVERITY_ORDER: Record<string, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
  Informational: 0,
};

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function computeArbComparison(
  base: ArbReviewSummary,
  head: ArbReviewSummary,
  baseScorecard: ArbScorecard | null,
  headScorecard: ArbScorecard | null,
  baseFindings: ArbFinding[],
  headFindings: ArbFinding[],
): ArbReviewComparison {
  const overallDelta =
    headScorecard?.overallScore != null && baseScorecard?.overallScore != null
      ? headScorecard.overallScore - baseScorecard.overallScore
      : null;

  const criticalBlockersDelta =
    headScorecard != null && baseScorecard != null
      ? (headScorecard.criticalBlockers ?? 0) - (baseScorecard.criticalBlockers ?? 0)
      : null;

  const baseDomainMap = new Map(
    (baseScorecard?.domainScores ?? []).map((d) => [d.domain, d])
  );
  const headDomainMap = new Map(
    (headScorecard?.domainScores ?? []).map((d) => [d.domain, d])
  );

  const allDomains = new Set([
    ...Array.from(baseDomainMap.keys()),
    ...Array.from(headDomainMap.keys()),
  ]);

  const domainDeltas: ArbDomainDelta[] = Array.from(allDomains).map((domain) => {
    const b = baseDomainMap.get(domain);
    const h = headDomainMap.get(domain);
    const baseScore = b?.score ?? 0;
    const headScore = h?.score ?? 0;
    return {
      domain,
      weight: h?.weight ?? b?.weight ?? 0,
      baseScore,
      headScore,
      delta: headScore - baseScore,
      baseReason: b?.reason ?? "",
      headReason: h?.reason ?? "",
    };
  });

  // Sort domains by weight descending
  domainDeltas.sort((a, b) => b.weight - a.weight);

  const baseMap = new Map<string, ArbFinding>();
  for (const f of baseFindings) {
    baseMap.set(`${f.domain}|${normalizeTitle(f.title)}`, f);
  }

  const headMap = new Map<string, ArbFinding>();
  for (const f of headFindings) {
    headMap.set(`${f.domain}|${normalizeTitle(f.title)}`, f);
  }

  const findingDiffs: ArbFindingDiff[] = [];

  for (const [key, baseFinding] of baseMap) {
    const headFinding = headMap.get(key);
    if (!headFinding) {
      findingDiffs.push({
        change: "resolved",
        domain: baseFinding.domain,
        severity: baseFinding.severity,
        title: baseFinding.title,
        baseFinding,
        headFinding: null,
      });
    } else {
      const baseSev = SEVERITY_ORDER[baseFinding.severity] ?? 2;
      const headSev = SEVERITY_ORDER[headFinding.severity] ?? 2;
      let change: ArbFindingDiff["change"] = "unchanged";
      if (headSev < baseSev) {
        change = "improved";
      } else if (headSev > baseSev) {
        change = "degraded";
      } else if (
        headFinding.status !== baseFinding.status &&
        (headFinding.status === "Closed" || headFinding.status === "Resolved")
      ) {
        change = "improved";
      }

      findingDiffs.push({
        change,
        domain: headFinding.domain,
        severity: headFinding.severity,
        title: headFinding.title,
        baseFinding,
        headFinding,
      });
    }
  }

  for (const [key, headFinding] of headMap) {
    if (!baseMap.has(key)) {
      findingDiffs.push({
        change: "new",
        domain: headFinding.domain,
        severity: headFinding.severity,
        title: headFinding.title,
        baseFinding: null,
        headFinding,
      });
    }
  }

  return {
    base,
    head,
    baseScorecard,
    headScorecard,
    baseFindings,
    headFindings,
    overallDelta,
    domainDeltas,
    findingDiffs,
    criticalBlockersDelta,
    newFindingsCount: findingDiffs.filter((d) => d.change === "new").length,
    resolvedFindingsCount: findingDiffs.filter((d) => d.change === "resolved").length,
  };
}
