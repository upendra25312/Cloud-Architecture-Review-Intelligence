'use strict';

const df = require('durable-functions');
const {
  getTableClient,
  ARB_REVIEW_TABLE_NAME,
  encodeTableKey
} = require('../../shared/table-storage');

function getPartitionKey(reviewId) {
  return encodeTableKey(reviewId);
}

function getRowKey(baseKey, userId) {
  return `${baseKey}|${encodeTableKey(userId)}`;
}

/**
 * Activity: persistResults
 *
 * Persists the merged agent findings and scorecard to ARB_REVIEW_TABLE_NAME.
 * Writes two rows with a composite row key of `{baseKey}|{encodedUserId}`:
 *   - FINDINGS — serialized findings array
 *   - SCORECARD — flattened scorecard with JSON-stringified nested fields
 *
 * Input:  { reviewId, principal, agentResult, review }
 * Output: { persisted: true, findingsCount, overallScore, recommendation }
 */
async function persistResultsHandler(input, context) {
  const { reviewId, principal, agentResult, review } = input || {};

  if (!reviewId) {
    throw Object.assign(new Error('reviewId is required.'), { statusCode: 400 });
  }
  if (!principal || !principal.userId) {
    throw Object.assign(new Error('principal with userId is required.'), { statusCode: 400 });
  }
  if (!agentResult) {
    throw Object.assign(new Error('agentResult is required.'), { statusCode: 400 });
  }

  const userId = principal.userId;
  const partitionKey = getPartitionKey(reviewId);
  const now = new Date().toISOString();

  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);

  const findings = Array.isArray(agentResult.findings) ? agentResult.findings : [];
  if (findings.length > 0) {
    await client.upsertEntity(
      {
        partitionKey,
        rowKey: getRowKey('FINDINGS', userId),
        findingsJson: JSON.stringify(findings)
      },
      'Replace'
    );
  }

  const scorecard = agentResult.scorecard || null;
  if (scorecard) {
    await client.upsertEntity(
      {
        partitionKey,
        rowKey: getRowKey('SCORECARD', userId),
        overallScore: scorecard.overallScore,
        recommendation: scorecard.recommendation,
        criticalBlockerCount: scorecard.criticalBlockerCount,
        missingEvidenceCount: scorecard.missingEvidenceCount,
        confidenceLevel: scorecard.confidenceLevel,
        dimensionScoresJson: JSON.stringify(scorecard.dimensionScores ?? []),
        reviewSummary: scorecard.reviewSummary,
        strengthsJson: JSON.stringify(scorecard.strengths ?? []),
        missingEvidenceJson: JSON.stringify(scorecard.missingEvidence ?? []),
        criticalBlockersJson: JSON.stringify(scorecard.criticalBlockers ?? []),
        nextActionsJson: JSON.stringify(scorecard.nextActions ?? []),
        evidenceReadinessState: (review && review.evidenceReadinessState) ?? null,
        source: 'agent',
        generatedAt: now
      },
      'Replace'
    );
  }

  if (context && typeof context.log === 'function') {
    context.log(
      JSON.stringify({
        activity: 'persistResults',
        reviewId,
        findingsCount: findings.length,
        overallScore: scorecard && scorecard.overallScore,
        recommendation: scorecard && scorecard.recommendation
      })
    );
  }

  return {
    persisted: true,
    findingsCount: findings.length,
    overallScore: scorecard ? scorecard.overallScore ?? null : null,
    recommendation: scorecard ? scorecard.recommendation ?? null : null
  };
}

df.app.activity('persistResults', { handler: persistResultsHandler });

module.exports = { persistResultsHandler };
