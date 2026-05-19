'use strict';

const df = require('durable-functions');
const { getArbFiles, markArbExtractionRunning } = require('../../shared/arb-review-store');

function selectFilesForExtraction(files) {
  return Array.isArray(files) ? files.filter(Boolean) : [];
}

/**
 * Activity: loadFilesForExtraction
 *
 * Loads the file metadata for a review and returns the subset of files that
 * still need extraction. Runs as a single pre-fan-out activity so the
 * orchestrator knows how many parallel `extractSingleFile` activities to
 * schedule.
 *
 * Input:  { reviewId, principal }
 * Output: { files, totalCount }
 * Throws: 400 when no files have been uploaded yet
 */
async function loadFilesForExtractionHandler(input, context) {
  const { reviewId, principal } = input || {};

  if (!reviewId) {
    throw Object.assign(new Error('reviewId is required.'), { statusCode: 400 });
  }
  if (!principal || !principal.userId) {
    throw Object.assign(new Error('principal with userId is required.'), { statusCode: 400 });
  }

  const files = await getArbFiles(principal, reviewId);

  if (!Array.isArray(files) || files.length === 0) {
    throw Object.assign(new Error('Upload files before starting extraction.'), {
      statusCode: 400
    });
  }

  // An explicit Start/Retry analysis request must rebuild extraction outputs
  // from the current package. Do not skip files previously marked Completed:
  // zombie or partial runs can leave all file rows Completed while evidence,
  // requirements, or workflow state remain stale.
  const filesForExtraction = selectFilesForExtraction(files);

  // Mark extraction as Running so the UI shows progress immediately
  await markArbExtractionRunning(principal, reviewId);

  if (context && typeof context.log === 'function') {
    context.log(JSON.stringify({
      activity: 'loadFilesForExtraction',
      reviewId,
      totalCount: files.length,
      pendingCount: filesForExtraction.length
    }));
  }

  return { files: filesForExtraction, totalCount: files.length };
}

df.app.activity('loadFilesForExtraction', { handler: loadFilesForExtractionHandler });

module.exports = { loadFilesForExtractionHandler, selectFilesForExtraction };
