'use strict';

const df = require('durable-functions');
const { syncArbReviewedOutputs } = require('../../shared/arb-review-store');
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
 * Activity: syncOutputs
 *
 * Generates the reviewed-output artifacts (markdown, csv, html), writes the
 * EXPORTS row to ARB_REVIEW_TABLE_NAME, and updates the SUMMARY row with the
 * latest workflow state and agent recommendation.
 *
 * Input:  { reviewId, principal, review, agentResult, files, requirements,
 *           evidence, visualEvidence, actions }
 * Output: { artifactsGenerated, exportsList }
 */
async function syncOutputsHandler(input, context) {
  const {
    reviewId,
    principal,
    review,
    agentResult,
    files,
    requirements,
    evidence,
    visualEvidence,
    actions
  } = input || {};

  if (!reviewId) {
    throw Object.assign(new Error('reviewId is required.'), { statusCode: 400 });
  }
  if (!principal || !principal.userId) {
    throw Object.assign(new Error('principal with userId is required.'), { statusCode: 400 });
  }
  if (!review) {
    throw Object.assign(new Error('review is required.'), { statusCode: 400 });
  }

  const userId = principal.userId;
  const filesList = Array.isArray(files) ? files : [];
  const requirementsList = Array.isArray(requirements) ? requirements : [];
  const evidenceList = Array.isArray(evidence) ? evidence : [];
  const visualEvidenceList = Array.isArray(visualEvidence) ? visualEvidence : [];
  const actionsList = Array.isArray(actions) ? actions : [];

  const findings = Array.isArray(agentResult && agentResult.findings)
    ? agentResult.findings
    : [];
  const scorecard = (agentResult && agentResult.scorecard) || null;
  const recommendation = (agentResult && agentResult.recommendation) ?? null;

  const now = new Date().toISOString();

  // Evidence passed to output generation combines regular evidence plus
  // visual evidence mapped into the common evidence shape.
  const evidenceForOutputs = [
    ...evidenceList,
    ...visualEvidenceList.map((v) => ({
      evidenceId: v.visualEvidenceId,
      reviewId: v.reviewId,
      sourceFileId: v.sourceFileId,
      sourceFileName: v.sourceFileName,
      factType: v.factType,
      summary: v.summary,
      sourceExcerpt: v.sourceExcerpt,
      confidence: v.confidence
    }))
  ];

  const syncedOutputs = await syncArbReviewedOutputs({
    principal,
    review: {
      ...review,
      workflowState: 'Review In Progress',
      agentRecommendation: recommendation,
      agentReviewedAt: now,
      lastUpdated: now
    },
    files: filesList,
    requirements: requirementsList,
    evidence: evidenceForOutputs,
    findings,
    scorecard,
    actions: actionsList,
    formats: ['markdown', 'csv', 'html'],
    generatedAt: now,
    existingExports: []
  });

  const exportsList = Array.isArray(syncedOutputs && syncedOutputs.exportsList)
    ? syncedOutputs.exportsList
    : [];
  const artifacts = Array.isArray(syncedOutputs && syncedOutputs.artifacts)
    ? syncedOutputs.artifacts
    : [];

  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const partitionKey = getPartitionKey(reviewId);

  await client.upsertEntity(
    {
      partitionKey,
      rowKey: getRowKey('EXPORTS', userId),
      exportsJson: JSON.stringify(exportsList)
    },
    'Replace'
  );

  await client.upsertEntity(
    {
      partitionKey,
      rowKey: getRowKey('SUMMARY', userId),
      workflowState: 'Review In Progress',
      agentRecommendation: recommendation,
      agentReviewedAt: now,
      lastUpdated: now
    },
    'Merge'
  );

  if (context && typeof context.log === 'function') {
    context.log(
      JSON.stringify({
        activity: 'syncOutputs',
        reviewId,
        artifactsGenerated: artifacts.length,
        exports: exportsList.length
      })
    );
  }

  return {
    artifactsGenerated: artifacts.length,
    exportsList
  };
}

df.app.activity('syncOutputs', { handler: syncOutputsHandler });

module.exports = { syncOutputsHandler };
