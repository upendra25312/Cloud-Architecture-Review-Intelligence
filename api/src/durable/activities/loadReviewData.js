'use strict';

const df = require('durable-functions');
const {
  getArbReview,
  getArbFiles,
  getArbRequirements,
  getArbEvidence,
  getArbVisualEvidence,
  getArbActions
} = require('../../shared/arb-review-store');

/**
 * Activity: loadReviewData
 *
 * Loads all review-related data in parallel and validates preconditions
 * required for running the agent review pipeline.
 *
 * Input:  { reviewId, principal }
 * Output: { review, files, requirements, evidence, visualEvidence, actions }
 *
 * Throws:
 *   - Error with statusCode 404 if the review does not exist
 *   - Error with statusCode 400 if no files have been uploaded
 *   - Error with statusCode 400 if no files have extractionStatus === "Completed"
 */
async function loadReviewDataHandler(input, context) {
  const { reviewId, principal } = input || {};

  if (!reviewId) {
    throw Object.assign(new Error('reviewId is required.'), { statusCode: 400 });
  }
  if (!principal || !principal.userId) {
    throw Object.assign(new Error('principal with userId is required.'), { statusCode: 400 });
  }

  const [review, files, requirements, evidence, visualEvidence, actions] = await Promise.all([
    getArbReview(principal, reviewId),
    getArbFiles(principal, reviewId),
    getArbRequirements(principal, reviewId),
    getArbEvidence(principal, reviewId),
    getArbVisualEvidence(principal, reviewId),
    getArbActions(principal, reviewId)
  ]);

  if (!review) {
    throw Object.assign(new Error('Review not found.'), { statusCode: 404 });
  }

  if (!Array.isArray(files) || files.length === 0) {
    throw Object.assign(
      new Error('Upload and extract files before running the agent review.'),
      { statusCode: 400 }
    );
  }

  const extractedFiles = files.filter((f) => f && f.extractionStatus === 'Completed');
  if (extractedFiles.length === 0) {
    throw Object.assign(
      new Error('Run extraction before triggering the agent review.'),
      { statusCode: 400 }
    );
  }

  if (context && typeof context.log === 'function') {
    context.log(
      JSON.stringify({
        activity: 'loadReviewData',
        reviewId,
        files: files.length,
        extracted: extractedFiles.length,
        requirements: requirements.length,
        evidence: evidence.length,
        visualEvidence: visualEvidence.length,
        actions: actions.length
      })
    );
  }

  return { review, files, requirements, evidence, visualEvidence, actions };
}

df.app.activity('loadReviewData', { handler: loadReviewDataHandler });

module.exports = { loadReviewDataHandler };
