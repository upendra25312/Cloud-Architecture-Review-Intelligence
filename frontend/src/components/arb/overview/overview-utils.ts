import type {
  ArbEvidenceFact,
  ArbFinding,
  ArbRequirement,
  ArbReviewSummary,
  ArbScorecard,
} from "@/arb/types";

// ── Workflow step interface ───────────────────────────────────────────

export interface WorkflowStep {
  step: string;
  label: string;
  status: "complete" | "active" | "pending";
}

// ── Workflow progress computation ─────────────────────────────────────

export function getWorkflowProgress(
  review: ArbReviewSummary,
  findings: ArbFinding[],
  scorecard: ArbScorecard | null,
  evidence: ArbEvidenceFact[],
  requirements: ArbRequirement[],
): WorkflowStep[] {
  const hasDocuments = (review.documentCount ?? 0) > 0;
  const hasRequirements = requirements.length > 0;
  const hasEvidence = evidence.length > 0;
  const hasFindings = findings.length > 0;
  const hasScorecard = scorecard !== null && scorecard.overallScore !== null;
  const hasDecision = review.finalDecision != null && review.finalDecision !== "";

  const steps: WorkflowStep[] = [
    {
      step: "upload",
      label: "Upload",
      status: hasDocuments ? "complete" : "active",
    },
    {
      step: "requirements",
      label: "Requirements",
      status: hasRequirements
        ? "complete"
        : hasDocuments
          ? "active"
          : "pending",
    },
    {
      step: "evidence",
      label: "Evidence",
      status: hasEvidence
        ? "complete"
        : hasRequirements
          ? "active"
          : "pending",
    },
    {
      step: "findings",
      label: "Findings",
      status: hasFindings
        ? "complete"
        : hasEvidence
          ? "active"
          : "pending",
    },
    {
      step: "scorecard",
      label: "Scorecard",
      status: hasScorecard
        ? "complete"
        : hasFindings
          ? "active"
          : "pending",
    },
    {
      step: "decision",
      label: "Decision",
      status: hasDecision
        ? "complete"
        : hasScorecard
          ? "active"
          : "pending",
    },
  ];

  return steps;
}

// ── Severity distribution ─────────────────────────────────────────────

export function getSeverityDistribution(
  findings: ArbFinding[],
): { high: number; medium: number; low: number } {
  let high = 0;
  let medium = 0;
  let low = 0;

  for (const f of findings) {
    const sev = f.severity?.toLowerCase();
    if (sev === "high") high++;
    else if (sev === "medium") medium++;
    else low++;
  }

  return { high, medium, low };
}

// ── Evidence coverage percent ─────────────────────────────────────────

export function getEvidenceCoveragePercent(
  evidence: ArbEvidenceFact[],
): number {
  if (evidence.length === 0) return 0;

  const domains = new Set<string>();
  for (const e of evidence) {
    const key = (e.factType ?? "").toLowerCase();
    if (key) domains.add(key);
  }

  // Coverage is based on how many distinct domains have evidence.
  // We use a baseline of 7 standard WAF domains.
  const EXPECTED_DOMAINS = 7;
  return Math.min(100, Math.round((domains.size / EXPECTED_DOMAINS) * 100));
}
