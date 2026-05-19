'use strict';

const df = require('durable-functions');
const {
  runArbAgentReview,
  buildFallbackAgentReview
} = require('../../shared/arb-foundry-agent');

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

/**
 * Activity: runAgent
 *
 * Invokes the Foundry agent review, merges rule findings (authoritative)
 * with AI findings, applies the governed recommendation, and resolves
 * evidence traceability on each finding.
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
    ruleFindings
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

  resolveEvidenceTraceability(agentResult, evidenceList, visualEvidenceList);

  if (context && typeof context.log === 'function') {
    context.log(
      JSON.stringify({
        activity: 'runAgent',
        reviewId: reviewObj.reviewId,
        findings: (agentResult.findings || []).length,
        ruleFindings: existingRuleFindings.length,
        score: (agentResult.scorecard && agentResult.scorecard.overallScore) ?? null,
        recommendation: agentResult.recommendation,
        fallback: agentResult.fallbackUsed === true
      })
    );
  }

  return { agentResult };
}

df.app.activity('runAgent', { handler: runAgentHandler });

module.exports = {
  runAgentHandler,
  deriveGovernedRecommendation,
  resolveEvidenceTraceability
};
