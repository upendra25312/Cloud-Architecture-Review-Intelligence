import type { ArbEvidenceFact, ArbFinding } from "@/arb/types";

// ── Interfaces ────────────────────────────────────────────────────────

export interface EvidenceFilterState {
  confidences: Set<string>;
  domains: Set<string>;
}

export interface EvidenceMetrics {
  total: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  domainCoverage: number;
  highConfidenceCoverage: number;
  qualityLabel: "Strong" | "Moderate" | "Weak";
}

export interface LinkedFinding {
  findingId: string;
  title: string;
  severity: string;
}

// ── Pure utility functions ────────────────────────────────────────────

export function computeEvidenceMetrics(evidence: ArbEvidenceFact[]): EvidenceMetrics {
  const total = evidence.length;
  const highCount = evidence.filter((e) => e.confidence === "High").length;
  const mediumCount = evidence.filter((e) => e.confidence === "Medium").length;
  const lowCount = evidence.filter((e) => e.confidence === "Low").length;

  // Distinct domains (case-insensitive)
  const domainMap = new Map<string, boolean>();
  const highDomainMap = new Map<string, boolean>();

  for (const e of evidence) {
    const key = (e.factType ?? "").toLowerCase();
    if (key) {
      domainMap.set(key, true);
      if (e.confidence === "High") {
        highDomainMap.set(key, true);
      }
    }
  }

  const totalDomains = domainMap.size;
  const domainCoverage = totalDomains > 0 ? 100 : 0;
  const highConfidenceCoverage =
    totalDomains > 0 ? Math.round((highDomainMap.size / totalDomains) * 100) : 0;

  let qualityLabel: "Strong" | "Moderate" | "Weak";
  if (highConfidenceCoverage >= 80) {
    qualityLabel = "Strong";
  } else if (highConfidenceCoverage >= 50) {
    qualityLabel = "Moderate";
  } else {
    qualityLabel = "Weak";
  }

  return { total, highCount, mediumCount, lowCount, domainCoverage, highConfidenceCoverage, qualityLabel };
}

export function groupEvidenceByDomain(
  evidence: ArbEvidenceFact[],
): Map<string, ArbEvidenceFact[]> {
  const keyToDisplay = new Map<string, string>();
  const groups = new Map<string, ArbEvidenceFact[]>();

  for (const e of evidence) {
    const key = (e.factType ?? "Unknown").toLowerCase();
    if (!keyToDisplay.has(key)) {
      keyToDisplay.set(key, e.factType ?? "Unknown");
    }
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }

  // Sort alphabetically by display name and rebuild with display keys
  const sorted = [...keyToDisplay.entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  );

  const result = new Map<string, ArbEvidenceFact[]>();
  for (const [key, display] of sorted) {
    result.set(display, groups.get(key) ?? []);
  }
  return result;
}

export function groupEvidenceBySourceFile(
  evidence: ArbEvidenceFact[],
): Map<string, ArbEvidenceFact[]> {
  const groups = new Map<string, ArbEvidenceFact[]>();

  for (const e of evidence) {
    const name = e.sourceFileName ?? "Unknown source";
    const list = groups.get(name) ?? [];
    list.push(e);
    groups.set(name, list);
  }

  const sorted = [...groups.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  return new Map(sorted);
}

export function filterEvidence(
  evidence: ArbEvidenceFact[],
  filters: EvidenceFilterState,
): ArbEvidenceFact[] {
  return evidence.filter((e) => {
    if (filters.confidences.size > 0 && !filters.confidences.has(e.confidence)) {
      return false;
    }
    if (filters.domains.size > 0) {
      const key = (e.factType ?? "").toLowerCase();
      const match = [...filters.domains].some((d) => d.toLowerCase() === key);
      if (!match) return false;
    }
    return true;
  });
}

export function buildLinkageMap(
  findings: ArbFinding[],
): Map<string, LinkedFinding[]> {
  const map = new Map<string, LinkedFinding[]>();

  for (const finding of findings) {
    if (!finding.evidenceFound) continue;
    for (const link of finding.evidenceFound) {
      if (!link.evidenceId) continue;
      const list = map.get(link.evidenceId) ?? [];
      list.push({
        findingId: finding.findingId,
        title: finding.title,
        severity: finding.severity,
      });
      map.set(link.evidenceId, list);
    }
  }

  return map;
}

export function getDistinctDomains(evidence: ArbEvidenceFact[]): string[] {
  const seen = new Map<string, string>();
  for (const e of evidence) {
    const key = (e.factType ?? "").toLowerCase();
    if (key && !seen.has(key)) {
      seen.set(key, e.factType ?? "");
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxLength * 0.5) {
    return truncated.slice(0, lastSpace) + "…";
  }
  return truncated + "…";
}
