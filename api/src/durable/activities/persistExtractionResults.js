'use strict';

const df = require('durable-functions');

/**
 * Activity: persistExtractionResults
 *
 * STATUS: STUB — paired with `extractSingleFile` stub. See the note in
 * `extractSingleFile.js` for the follow-up refactor needed.
 *
 * Aggregates per-file extraction results from the fan-out, updates file
 * statuses / evidence records / search index in Table Storage, and writes
 * the final `arbjobs` status row for backward-compatible polling.
 *
 * Input:  { reviewId, principal, results }
 * Output: { persisted: true, indexedChunks, successCount, errorCount }
 */
async function persistExtractionResultsHandler(input, context) {
  const err = new Error(
    'persistExtractionResults activity is not yet implemented. ' +
    'Aggregation of fan-out results requires the extractSingleFile helper to exist. ' +
    'Set USE_DURABLE_ORCHESTRATION=OFF to use the legacy queue-based extraction path.'
  );
  err.statusCode = 501;
  throw err;
}

df.app.activity('persistExtractionResults', { handler: persistExtractionResultsHandler });

module.exports = { persistExtractionResultsHandler };
