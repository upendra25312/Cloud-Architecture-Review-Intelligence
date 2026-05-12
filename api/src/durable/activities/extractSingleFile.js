'use strict';

const df = require('durable-functions');

/**
 * Activity: extractSingleFile
 *
 * STATUS: STUB — requires follow-up refactor before the durable extraction
 * path can be enabled in production.
 *
 * The existing `startArbExtraction` function in `api/src/shared/arb-review-store.js`
 * processes all files in a single loop with shared mutable state
 * (`visualEvidence[]`, `visualCountsByFile`, `fileTexts`, `extractionErrors[]`,
 * `nextFiles[]`). Converting it to a fan-out Durable pattern requires
 * extracting a self-contained per-file helper that returns:
 *
 *   { fileId, fileName, extractionStatus, extractedText, visualRecords[], errors[], durationMs }
 *
 * This refactor is intentionally deferred to keep the current migration PR
 * focused on orchestration plumbing. Until that refactor lands:
 *   - The `USE_DURABLE_ORCHESTRATION` app setting MUST remain OFF for
 *     extraction to use the legacy queue-based path (which works unchanged)
 *   - The durable extraction orchestration WILL FAIL with this stub error
 *     if someone flips the flag prematurely
 *
 * The agent-review durable orchestration is independent and DOES work with
 * the flag set to ON — only extraction fan-out requires this completion.
 *
 * Input:  { reviewId, principal, file }
 * Output: { fileId, fileName, extractionStatus, extractedText, visualRecords, errors, durationMs }
 */
async function extractSingleFileHandler(input, context) {
  const err = new Error(
    'extractSingleFile activity is not yet implemented. ' +
    'Per-file extraction helper must be refactored out of startArbExtraction ' +
    'before the durable extraction path can be enabled. ' +
    'Set USE_DURABLE_ORCHESTRATION=OFF to use the legacy queue-based extraction path.'
  );
  err.statusCode = 501;
  throw err;
}

df.app.activity('extractSingleFile', { handler: extractSingleFileHandler });

module.exports = { extractSingleFileHandler };
