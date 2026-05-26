'use strict';

const df = require('durable-functions');
const {
  runArbAgentReview,
  buildFallbackAgentReview
} = require('../../shared/arb-foundry-agent');
const { loadArbRules } = require('../../shared/arb-rules-engine');

const RECOMMENDED_APPROVAL_SCORE = 80;
// Must be below the 30-min Durable orchestration timer so the activity always resolves
// (with a clean error) before the parent orchestrator's Task.any timeout fires.
const AGENT_ACTIVITY_TIMEOUT_MS = 25 * 60 * 1000;

const EVIDENCE_STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'at',
  'is', 'are', 'be', 'with', 'from', 'that', 'this', 'by', 'as', 'its',
  'it', 'will', 'we', 'our', 'all', 'any', 'not', 'have', 'has', 'can',
  'was', 'were'
]);

function isActiveFinding(finding) {
  return finding && finding.status !== 'Closed' && finding.status !== 'Not Applicable';
}

// Landing-zone design-phase patterns that are always out of scope for the PS delivery team.
// OPS operational ownership (runbook owners, incident owners, day-2 accountability) belongs to
// the Managed Services / Operations team, not the architecture design package.
const OPS_OWNERSHIP_PATTERNS = [
  /runbook\s+ownership/i,
  /runbook\s+accountab/i,
  /runbook\s+owner/i,
  /operational\s+ownership/i,
  /incident\s+ownership/i,
  /incident\s+owner/i,
  /deployment\s+ownership/i,
  /day.?2\s+owner/i,
  /managed\s+services\s+owner/i,
  /ownership\s+needs\s+clarif/i,
  /ownership\s+not\s+(clear|defined|explicit|document)/i,
];

// ALZ boundary-control: hub-spoke + Azure Firewall IS the boundary control pattern.
// Any of these terms in the evidence means the control is evidenced.
const BOUNDARY_CONTROL_EVIDENCE_TERMS = [
  'hub-spoke', 'hub spoke', 'hub and spoke', 'azure firewall', 'azfw', 'az fw',
  'application gateway', 'front door', 'waf', 'nsg', 'network security group',
  'forced tunnel', 'forced tunneling', 'forced tunnelling', 'egress control',
  'boundary control', 'perimeter', 'dmz', 'connectivity hub', 'hub subscription',
  'hub vnet', 'hub virtual network', 'firewall', 'apim',
];

function suppressContraindicatedLlmFindings(findings, evidenceCorpus) {
  if (!evidenceCorpus || !Array.isArray(findings) || findings.length === 0) return findings;
  const rules = loadArbRules();
  const corpus = evidenceCorpus.toLowerCase();
  const hasKeyword = (terms) => terms.some((t) => corpus.includes(t.toLowerCase()));

  return findings.filter((finding) => {
    if (finding.source === 'rules-engine') return true;
    const findingText = `${finding.title ?? ''} ${finding.findingStatement ?? ''} ${finding.evidenceBasis ?? ''}`.toLowerCase();

    // 1. OPS operational ownership findings are out of scope for design-phase PS reviews.
    //    Managed Services / Operations team owns these, not the landing zone design package.
    if (OPS_OWNERSHIP_PATTERNS.some((re) => re.test(findingText))) return false;

    // 2. ALZ boundary-control: if any boundary evidence term is present, suppress the finding.
    //    Hub-spoke + Azure Firewall IS the boundary control pattern for landing zones.
    if (/boundary.control|boundary control|not yet explicit/i.test(findingText)) {
      if (BOUNDARY_CONTROL_EVIDENCE_TERMS.some((t) => corpus.includes(t))) return false;
    }

    // 3. General rule-based suppression: if a rule's absence terms appear in the finding AND
    //    are also present in the evidence corpus, the control is evidenced — suppress the gap.
    for (const rule of rules) {
      const absenceTerms = rule.triggerPatterns?.requiresEvidenceAbsence ?? [];
      if (absenceTerms.length === 0) continue;
      if (!absenceTerms.some((t) => findingText.includes(t.toLowerCase()))) continue;
      if (hasKeyword(absenceTerms)) return false;
    }
    return true;
  });
}

function hasSowArtifact(files, review) {
  const uploadedSow = (files || []).some(
    (file) => String((file && file.logicalCategory) ?? '').toLowerCase() === 'sow'
  );
  if (uploadedSow) return true;

  const missingRequired = Array.isArray(review && review.missingRequiredItems)
    ? review.missingRequiredItems
    : [];
  return Boolean(review && review.requiredEvidencePresent) && !missingRequired.includes('sow');
}

/**
 * Derives the governed recommendation string from the current scorecard/findings.
 * Logic mirrors `deriveGovernedRecommendation` in arbRunAgentReview.js.
 */
function deriveGovernedRecommendation({ review, files, findings, scorecard, visualEvidence }) {
  const overallScore = Number(scorecard && scorecard.overallScore);
  const activeFindings = Array.isArray(findings) ? findings.filter(isActiveFinding) : [];
  const unresolvedCritical = activeFindings.filter(
    (finding) => finding.criticalBlocker || finding.severity === 'Critical'
  ).length;
  const unresolvedHigh = activeFindings.filter((finding) => finding.severity === 'High').length;
  const sowPresent = hasSowArtifact(files, review || {});
  const visualEvidenceProcessed = Array.isArray(visualEvidence) && visualEvidence.length > 0;
  const readiness = review && review.evidenceReadinessState;

  if (!Number.isFinite(overallScore)) {
    return 'Needs Remediation';
  }

  if (readiness === 'Insufficient Evidence') {
    return 'Ready with Gaps';
  }

  if (unresolvedCritical > 0 || unresolvedHigh > 0 || overallScore < 70) {
    return 'Needs Remediation';
  }

  if (
    overallScore >= RECOMMENDED_APPROVAL_SCORE &&
    readiness === 'Ready for Review' &&
    sowPresent &&
    visualEvidenceProcessed
  ) {
    return 'Recommended for Approval';
  }

  return 'Ready with Gaps';
}

/**
 * Resolves evidence traceability for each finding. Mirrors logic in
 * arbRunAgentReview.js — builds evidenceById / visualEvidenceById maps,
 * populates `evidenceFound`, and falls back to Jaccard-similarity matching
 * when a finding has no explicit evidence IDs but does have evidenceBasis text.
 */
function resolveEvidenceTraceability(agentResult, evidenceList, visualEvidenceList) {
  const findings = Array.isArray(agentResult && agentResult.findings) ? agentResult.findings : [];
  if (findings.length === 0) return;
  if (evidenceList.length === 0 && visualEvidenceList.length === 0) return;

  const evidenceById = new Map(evidenceList.map((e) => [e.evidenceId, e]));
  const visualEvidenceById = new Map(
    visualEvidenceList.map((e) => [e.visualEvidenceId, e])
  );

  for (const finding of findings) {
    const ids = Array.isArray(finding.evidenceIds) ? finding.evidenceIds : [];
    const visualIds = Array.isArray(finding.visualEvidenceIds) ? finding.visualEvidenceIds : [];

    finding.evidenceFound = [
      ...ids
        .map((id) => evidenceById.get(id))
        .filter(Boolean)
        .map((e) => ({
          evidenceId: e.evidenceId,
          summary: e.summary,
          sourceFileName: e.sourceFileName,
          sourceFileId: e.sourceFileId,
          factType: e.factType
        })),
      ...visualIds
        .map((id) => visualEvidenceById.get(id))
        .filter(Boolean)
        .map((e) => ({
          evidenceId: e.visualEvidenceId,
          visualEvidenceId: e.visualEvidenceId,
          summary: e.summary,
          sourceFileName: e.sourceFileName,
          sourceFileId: e.sourceFileId,
          factType: e.factType,
          imageUri: e.imageUri,
          extractionSource: e.extractionSource
        }))
    ];

    if (
      finding.evidenceFound.length === 0 &&
      finding.evidenceBasis &&
      evidenceList.length > 0
    ) {
      const tokenize = (text) =>
        new Set(
          String(text ?? '')
            .toLowerCase()
            .split(/\W+/)
            .filter((t) => t.length > 3 && !EVIDENCE_STOP_WORDS.has(t))
        );
      const basisTokens = tokenize(`${finding.evidenceBasis} ${finding.title ?? ''}`);
      finding.evidenceFound = evidenceList
        .map((e) => {
          const eTokens = tokenize(`${e.summary ?? ''} ${e.sourceExcerpt ?? ''}`);
          const intersection = [...basisTokens].filter((t) => eTokens.has(t)).length;
          const union = new Set([...basisTokens, ...eTokens]).size;
          return { e, score: union > 0 ? intersection / union : 0 };
        })
        .filter(({ score }) => score >= 0.12)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(({ e }) => ({
          evidenceId: e.evidenceId,
          summary: e.summary,
          sourceFileName: e.sourceFileName,
          sourceFileId: e.sourceFileId,
          factType: e.factType
        }));
    }

    delete finding.evidenceIds;
    delete finding.visualEvidenceIds;
  }
}

const VALID_SEVERITIES = new Set(['Critical', 'High', 'Medium', 'Low']);
const VALID_RECOMMENDATIONS = new Set([
  'Recommended for Approval', 'Ready with Gaps', 'Needs Remediation', 'Rejected'
]);

/**
 * Validates the structural integrity of an assembled agent result before storage.
 * Returns { valid, issues, learnUrlMissing, titleMissing } — never throws.
 * Logs a structured warning when issues are found so they appear in App Insights.
 */
function validateArbOutput(result, context, reviewId) {
  const issues = [];
  const findings = Array.isArray(result && result.findings) ? result.findings : [];

  if (!Array.isArray(result && result.findings)) issues.push('findings is not an array');

  let learnUrlMissing = 0;
  let titleMissing = 0;
  for (const f of findings) {
    if (!f.title || !String(f.title).trim()) titleMissing++;
    if (!f.learnMoreUrl || !String(f.learnMoreUrl).includes('learn.microsoft.com')) learnUrlMissing++;
    if (!VALID_SEVERITIES.has(f.severity)) issues.push(`finding has invalid severity: "${f.severity}"`);
  }

  const sc = result && result.scorecard;
  if (!sc) {
    issues.push('scorecard missing');
  } else {
    const score = Number(sc.overallScore);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      issues.push(`overallScore out of range: ${sc.overallScore}`);
    }
    const actualCritical = findings.filter((f) => f.criticalBlocker).length;
    const reportedCritical = Number(sc.criticalBlockerCount);
    if (Number.isFinite(reportedCritical) && reportedCritical !== actualCritical) {
      issues.push(`criticalBlockerCount mismatch: scorecard=${reportedCritical}, actual=${actualCritical}`);
    }
  }

  if (result && result.recommendation && !VALID_RECOMMENDATIONS.has(result.recommendation)) {
    issues.push(`invalid recommendation enum: "${result.recommendation}"`);
  }

  if (context && typeof context.log === 'function') {
    context.log(JSON.stringify({
      activity: 'validateArbOutput',
      reviewId,
      issueCount: issues.length,
      learnUrlMissing,
      titleMissing,
      findingCount: findings.length,
      ...(issues.length > 0 ? { issues } : {})
    }));
  }

  return { valid: issues.length === 0, issues, learnUrlMissing, titleMissing };
}

/**
 * Strips evidenceIds and visualEvidenceIds from each finding that do not
 * match a known extracted fact. Orphan IDs are logged so the gap is visible
 * without silently inflating evidence confidence.
 */
function stripOrphanEvidenceIds(findings, evidenceList, visualEvidenceList, context, reviewId) {
  const knownEvidenceIds = new Set(evidenceList.map((e) => e.evidenceId).filter(Boolean));
  const knownVisualIds = new Set(visualEvidenceList.map((e) => e.visualEvidenceId).filter(Boolean));

  let totalOrphans = 0;
  for (const finding of findings) {
    if (Array.isArray(finding.evidenceIds)) {
      const before = finding.evidenceIds.length;
      finding.evidenceIds = finding.evidenceIds.filter((id) => knownEvidenceIds.has(id));
      totalOrphans += before - finding.evidenceIds.length;
    }
    if (Array.isArray(finding.visualEvidenceIds)) {
      const before = finding.visualEvidenceIds.length;
      finding.visualEvidenceIds = finding.visualEvidenceIds.filter((id) => knownVisualIds.has(id));
      totalOrphans += before - finding.visualEvidenceIds.length;
    }
    if (Array.isArray(finding.evidenceReferences)) {
      finding.evidenceReferences = finding.evidenceReferences.filter((r) => {
        if (r.type === 'visualEvidence') return knownVisualIds.has(r.id);
        return knownEvidenceIds.has(r.id);
      });
    }
  }

  if (totalOrphans > 0 && context && typeof context.log === 'function') {
    context.log(JSON.stringify({
      activity: 'stripOrphanEvidenceIds',
      reviewId,
      orphanIdsRemoved: totalOrphans
    }));
  }
}

/**
 * Activity: runAgent
 *
 * Invokes the Foundry agent review, merges rule findings (authoritative)
 * with AI findings, applies the governed recommendation, validates the
 * output structure, strips orphan evidenceIds, and resolves evidence
 * traceability on each finding.
 *
 * NOTE: No retry policy should be applied by the orchestrator — the Foundry
 * client already implements a 3-retry with exponential backoff internally.
 *
 * Input:  { review, files, requirements, evidence, searchChunks, visualEvidence, ruleFindings }
 * Output: { agentResult }
 */
async function runAgentHandler(input, context) {
  const {
    review,
    files,
    requirements,
    evidence,
    searchChunks,
    visualEvidence,
    ruleFindings,
    traceId
  } = input || {};

  const reviewObj = review || {};
  const filesList = Array.isArray(files) ? files : [];
  const requirementsList = Array.isArray(requirements) ? requirements : [];
  const evidenceList = Array.isArray(evidence) ? evidence : [];
  const visualEvidenceList = Array.isArray(visualEvidence) ? visualEvidence : [];
  const existingRuleFindings = Array.isArray(ruleFindings) ? ruleFindings : [];
  const ruleCriticalCount = existingRuleFindings.filter((f) => f && f.criticalBlocker).length;
  const ruleBlockers = existingRuleFindings
    .filter((f) => f && f.criticalBlocker)
    .map((f) => f.title);

  let agentResult = await Promise.race([
    runArbAgentReview({
      review: reviewObj,
      files: filesList,
      requirements: requirementsList,
      evidence: evidenceList,
      searchChunks: searchChunks || [],
      visualEvidence: visualEvidenceList,
      existingRuleFindings
    }),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`runArbAgentReview timed out after ${AGENT_ACTIVITY_TIMEOUT_MS / 60000} minutes`)),
        AGENT_ACTIVITY_TIMEOUT_MS
      )
    )
  ]);

  if (!agentResult || agentResult.success === false) {
    const reason =
      (agentResult && agentResult.reason) || 'Automated assessment unavailable';
    if (context && typeof context.log === 'function') {
      context.log(
        JSON.stringify({
          activity: 'runAgent',
          reviewId: reviewObj.reviewId,
          fallback: true,
          reason
        })
      );
    }
    agentResult = {
      ...buildFallbackAgentReview({
        review: reviewObj,
        requirements: requirementsList,
        evidence: evidenceList,
        reason
      }),
      success: true,
      fallbackUsed: true
    };
  }

  // Merge: rule findings are authoritative; AI fills remaining findings
  // without ruleId overlap.
  if (existingRuleFindings.length > 0) {
    const existingRuleIds = new Set(existingRuleFindings.map((f) => f.ruleId));
    const aiOnlyFindings = (agentResult.findings || []).filter(
      (f) => !existingRuleIds.has(f.ruleId)
    );
    agentResult = {
      ...agentResult,
      findings: [...existingRuleFindings, ...aiOnlyFindings]
    };
    if (agentResult.scorecard && ruleCriticalCount > 0) {
      agentResult.scorecard.criticalBlockerCount = Math.max(
        agentResult.scorecard.criticalBlockerCount || 0,
        ruleCriticalCount
      );
      agentResult.scorecard.criticalBlockers = [
        ...((agentResult.scorecard.criticalBlockers) || []),
        ...ruleBlockers
      ].filter((v, i, a) => a.indexOf(v) === i);
    }
  }

  // Evidence-aware suppression: remove LLM findings contradicted by extracted evidence.
  // Build corpus from evidence summaries + excerpts + visual + requirements so literal
  // keywords from uploaded documents (e.g. "hub-spoke", "azure firewall", "runbook") can
  // override LLM hallucinations about those controls being absent.
  if (!agentResult.fallbackUsed && Array.isArray(agentResult.findings) && agentResult.findings.length > 0) {
    const evidenceCorpus = [
      ...evidenceList.map((e) => `${e.summary ?? ''} ${e.sourceExcerpt ?? ''}`),
      ...visualEvidenceList.map((e) => `${e.summary ?? ''} ${e.sourceExcerpt ?? ''}`),
      ...requirementsList.map((r) => r.normalizedText ?? '')
    ].join(' ');
    const before = agentResult.findings.length;
    agentResult = {
      ...agentResult,
      findings: suppressContraindicatedLlmFindings(agentResult.findings, evidenceCorpus)
    };
    const suppressed = before - agentResult.findings.length;
    if (suppressed > 0 && context && typeof context.log === 'function') {
      context.log(JSON.stringify({ activity: 'runAgent', reviewId: reviewObj.reviewId, suppressed, message: 'Suppressed contradicted LLM findings' }));
    }
  }

  if (agentResult.scorecard) {
    const governedRecommendation = deriveGovernedRecommendation({
      review: reviewObj,
      files: filesList,
      findings: agentResult.findings || [],
      scorecard: agentResult.scorecard,
      visualEvidence: visualEvidenceList
    });
    agentResult.scorecard.recommendation = governedRecommendation;
    agentResult.recommendation = governedRecommendation;
  }

  // C2: schema validation gate — logs issues before storage, triggers fallback on critical failures
  const validation = validateArbOutput(agentResult, context, reviewObj.reviewId);
  if (!validation.valid && !Array.isArray(agentResult.findings)) {
    agentResult = {
      ...buildFallbackAgentReview({
        review: reviewObj,
        requirements: requirementsList,
        evidence: evidenceList,
        reason: `Schema validation failed: ${validation.issues.join('; ')}`
      }),
      success: true,
      fallbackUsed: true,
      validationFailed: true
    };
  }

  // C3: evidenceId cross-validation — strip IDs not present in extracted facts
  stripOrphanEvidenceIds(
    agentResult.findings || [],
    evidenceList,
    visualEvidenceList,
    context,
    reviewObj.reviewId
  );

  // C3b: Severity gate — downgrade High AI findings that have no grounded evidence after
  // orphan-ID stripping. A High finding with zero evidenceIds + zero visualEvidenceIds and
  // non-High confidence must not drive "Needs Remediation" on its own. Rule-engine findings
  // (which carry a ruleId) are never touched here; they are authoritative by design.
  let thinEvidenceDowngrades = 0;
  for (const finding of (agentResult.findings || [])) {
    if (
      finding.severity === 'High' &&
      finding.source === 'agent' &&
      !finding.ruleId &&
      finding.confidence !== 'High' &&
      (!Array.isArray(finding.evidenceIds) || finding.evidenceIds.length === 0) &&
      (!Array.isArray(finding.visualEvidenceIds) || finding.visualEvidenceIds.length === 0)
    ) {
      finding.severity = 'Medium';
      finding.findingStatement = `[Evidence not grounded in submitted documents — verify before acting] ${finding.findingStatement || ''}`.trim();
      thinEvidenceDowngrades += 1;
    }
  }

  if (thinEvidenceDowngrades > 0) {
    // Re-derive recommendation after downgrade since severity totals changed
    if (agentResult.scorecard) {
      const governedRecommendation = deriveGovernedRecommendation({
        review: reviewObj,
        files: filesList,
        findings: agentResult.findings || [],
        scorecard: agentResult.scorecard,
        visualEvidence: visualEvidenceList
      });
      agentResult.scorecard.recommendation = governedRecommendation;
      agentResult.recommendation = governedRecommendation;
    }
    if (context && typeof context.log === 'function') {
      context.log(JSON.stringify({
        activity: 'runAgent',
        reviewId: reviewObj.reviewId,
        thinEvidenceDowngrades,
        message: 'High findings downgraded to Medium due to no grounded evidence IDs after orphan strip'
      }));
    }
  }

  resolveEvidenceTraceability(agentResult, evidenceList, visualEvidenceList);

  if (context && typeof context.log === 'function') {
    context.log(
      JSON.stringify({
        activity: 'runAgent',
        reviewId: reviewObj.reviewId,
        traceId: traceId ?? null,
        findings: (agentResult.findings || []).length,
        ruleFindings: existingRuleFindings.length,
        score: (agentResult.scorecard && agentResult.scorecard.overallScore) ?? null,
        recommendation: agentResult.recommendation,
        fallback: agentResult.fallbackUsed === true,
        validationIssues: validation.issues.length,
        learnUrlMissing: validation.learnUrlMissing,
        mcp: agentResult.learnMcpMeta ?? null
      })
    );
  }

  return { agentResult };
}

df.app.activity('runAgent', { handler: runAgentHandler });

module.exports = {
  runAgentHandler,
  deriveGovernedRecommendation,
  resolveEvidenceTraceability,
  validateArbOutput,
  stripOrphanEvidenceIds
};
