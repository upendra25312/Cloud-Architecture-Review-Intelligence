'use strict';

const df = require('durable-functions');
const { getArbFiles, markArbExtractionRunning } = require('../../shared/arb-review-store');

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

  // Files already marked Completed are skipped to avoid re-running extraction.
  const pendingFiles = files.filter((f) => f && f.extractionStatus !== 'Completed');

  // Mark extraction as Running so the UI shows progress immediately
  await markArbExtractionRunning(principal, reviewId);

  if (context && typeof context.log === 'function') {
    context.log(JSON.stringify({
      activity: 'loadFilesForExtraction',
      reviewId,
      totalCount: files.length,
      pendingCount: pendingFiles.length
    }));
  }

  return { files: pendingFiles, totalCount: files.length };
}

df.app.activity('loadFilesForExtraction', { handler: loadFilesForExtractionHandler });

module.exports = { loadFilesForExtractionHandler };
