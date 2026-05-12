'use strict';

const df = require('durable-functions');
const { runDeterministicRules } = require('../../shared/arb-rules-engine');

/**
 * Activity: runRules
 *
 * Runs the deterministic ARB rules engine against review data and returns
 * rule findings, blockers, and the count of critical blockers.
 *
 * Input:  { review, requirements, evidence, files }
 * Output: { ruleFindings, ruleBlockers, criticalBlockerCount }
 */
async function runRulesHandler(input, context) {
  const { review, requirements, evidence, files } = input || {};

  const result = runDeterministicRules({
    review: review || {},
    requirements: Array.isArray(requirements) ? requirements : [],
    evidence: Array.isArray(evidence) ? evidence : [],
    files: Array.isArray(files) ? files : []
  });

  const ruleFindings = Array.isArray(result.ruleFindings) ? result.ruleFindings : [];
  const ruleBlockers = Array.isArray(result.ruleBlockers) ? result.ruleBlockers : [];
  const criticalBlockerCount = Number(result.criticalBlockerCount) || 0;

  if (context && typeof context.log === 'function') {
    context.log(
      JSON.stringify({
        activity: 'runRules',
        reviewId: review && review.reviewId,
        ruleFindings: ruleFindings.length,
        criticalBlockerCount
      })
    );
  }

  return { ruleFindings, ruleBlockers, criticalBlockerCount };
}

df.app.activity('runRules', { handler: runRulesHandler });

module.exports = { runRulesHandler };
