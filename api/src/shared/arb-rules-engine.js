const path = require("node:path");

const RULES_DIR = path.resolve(__dirname, "../../data/arb-rules");

let _cachedRules = null;

function loadArbRules() {
  if (_cachedRules) return _cachedRules;
  const waf = require(path.join(RULES_DIR, "waf-rules.json")).rules ?? [];
  const caf = require(path.join(RULES_DIR, "caf-rules.json")).rules ?? [];
  const internal = require(path.join(RULES_DIR, "internal-rules.json")).rules ?? [];
  const migration = require(path.join(RULES_DIR, "migration-rules.json")).rules ?? [];
  _cachedRules = [...waf, ...caf, ...internal, ...migration];
  return _cachedRules;
}

function textFrom(items, ...fields) {
  return items
    .flatMap((item) => fields.map((f) => String(item[f] ?? "")))
    .join(" ")
    .toLowerCase();
}

function hasAnyKeyword(text, keywords) {
  return keywords.some((kw) => text.includes(kw.toLowerCase()));
}

function buildFindingFromRule(rule, reviewId) {
  return {
    findingId: `rule-${rule.ruleId}-${reviewId}`,
    reviewId,
    ruleId: rule.ruleId,
    severity: rule.severity,
    domain: rule.domain,
    findingType: rule.framework,
    framework: rule.framework,
    frameworkPillar: rule.frameworkPillar ?? "",
    title: rule.title,
    findingStatement: rule.failureMessage,
    whyItMatters: `This finding was raised by deterministic rule ${rule.ruleId} based on evidence analysis.`,
    evidenceBasis: rule.failureMessage,
    evidenceIds: [],
    recommendation: rule.recommendation,
    learnMoreUrl: rule.learnMoreUrl ?? "",
    references: rule.learnMoreUrl
      ? [{ title: rule.title, url: rule.learnMoreUrl }]
      : [],
    confidence: "High",
    criticalBlocker: rule.blockerFlag === true,
    suggestedOwner: "",
    suggestedDueDate: null,
    owner: null,
    dueDate: null,
    reviewerNote: null,
    missingEvidence: [],
    evidenceFound: [],
    status: "Open",
    source: "rules-engine"
  };
}

function evaluateKeywordRule(rule, allText) {
  const { requiresEvidencePresence = [], requiresEvidenceAbsence = [] } = rule.triggerPatterns ?? {};

  // Rule only applies if the submission mentions the trigger topic
  if (requiresEvidencePresence.length > 0 && !hasAnyKeyword(allText, requiresEvidencePresence)) {
    return false; // topic not relevant — don't generate a false positive
  }

  // If the required control/evidence IS present, rule passes
  if (requiresEvidenceAbsence.length > 0 && hasAnyKeyword(allText, requiresEvidenceAbsence)) {
    return false;
  }

  // For IAM-001 style rules with empty presence list: fire when absence not found across all evidence
  if (requiresEvidencePresence.length === 0 && requiresEvidenceAbsence.length > 0) {
    return !hasAnyKeyword(allText, requiresEvidenceAbsence);
  }

  return true;
}

function evaluateDocRule(rule, files, requirements, evidence) {
  const { ruleId, minimumFileCount, minimumRequirementCount, minimumEvidenceCount } = rule;

  if (ruleId === "DOC-001") {
    const fileCount = (files ?? []).length;
    const reqCount = (requirements ?? []).length;
    return fileCount < (minimumFileCount ?? 1) || reqCount < (minimumRequirementCount ?? 1);
  }

  if (ruleId === "DOC-002") {
    const evidenceCount = (evidence ?? []).length;
    const reqCount = (requirements ?? []).length;
    return evidenceCount < (minimumEvidenceCount ?? 3) || reqCount < (minimumRequirementCount ?? 2);
  }

  return false;
}

/**
 * Runs all deterministic ARB rules against extracted review data.
 * Returns an array of findings shaped identically to AI-generated findings.
 *
 * @param {{ review: object, requirements: object[], evidence: object[], files: object[] }} input
 * @returns {{ ruleFindings: object[], ruleBlockers: string[], criticalBlockerCount: number }}
 */
function runDeterministicRules({ review, requirements, evidence, files }) {
  const rules = loadArbRules();
  const reviewId = review?.reviewId ?? "unknown";

  const reqText = textFrom(requirements ?? [], "normalizedText", "category", "sourceText");
  const evidText = textFrom(evidence ?? [], "summary", "sourceExcerpt", "category");
  const allText = `${reqText} ${evidText}`;

  const ruleFindings = [];

  for (const rule of rules) {
    try {
      let fires = false;

      if (rule.ruleId === "DOC-001" || rule.ruleId === "DOC-002") {
        fires = evaluateDocRule(rule, files, requirements, evidence);
      } else {
        fires = evaluateKeywordRule(rule, allText);
      }

      if (fires) {
        ruleFindings.push(buildFindingFromRule(rule, reviewId));
      }
    } catch {
      // Never let a single rule failure block the pipeline
    }
  }

  const ruleBlockers = ruleFindings
    .filter((f) => f.criticalBlocker)
    .map((f) => f.title);

  return {
    ruleFindings,
    ruleBlockers,
    criticalBlockerCount: ruleBlockers.length
  };
}

module.exports = { runDeterministicRules, loadArbRules };
