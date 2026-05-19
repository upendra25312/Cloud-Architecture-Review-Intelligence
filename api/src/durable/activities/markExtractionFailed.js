'use strict';

const df = require('durable-functions');
const { markArbExtractionFailed } = require('../../shared/arb-review-store');

/**
 * Activity: markExtractionFailed
 *
 * Updates the review entity's workflowState and extraction snapshot to
 * "Extraction Failed" so the UI polling endpoint stops showing "Running".
 *
 * Called by orchestratorExtraction on both timeout and unhandled-error paths.
 * Wrapped in try/catch at the call site so a failure here does not mask the
 * original orchestration error.
 *
 * Input:  { reviewId, principal, errorMessage }
 * Output: { marked: true }
 */
async function markExtractionFailedHandler(input, _context) {
  const { reviewId, principal, errorMessage } = input || {};

  if (!reviewId) {
    throw Object.assign(new Error('reviewId is required.'), { statusCode: 400 });
  }
  if (!principal || !principal.userId) {
    throw Object.assign(new Error('principal with userId is required.'), { statusCode: 400 });
  }

  await markArbExtractionFailed(principal, reviewId, errorMessage || 'Extraction failed.');
  return { marked: true };
}

df.app.activity('markExtractionFailed', { handler: markExtractionFailedHandler });

module.exports = { markExtractionFailedHandler };
