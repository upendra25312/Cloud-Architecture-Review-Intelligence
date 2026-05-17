'use strict';

const df = require('durable-functions');
const { getSearchConfiguration, indexArbDocumentChunks } = require('../../shared/arb-search');
const { persistAggregatedExtractionResults } = require('../../shared/arb-review-store');

/**
 * Activity: persistExtractionResults
 *
 * Aggregates per-file fan-out results, derives requirements and evidence,
 * and writes all entities to Table Storage. Also handles search indexing
 * (deferred from extractSingleFile to avoid per-file storage round-trips).
 *
 * Input:  { reviewId, principal, results, jobId, startedAt }
 * Output: { persisted: true, indexedChunks, successCount, errorCount }
 */
async function persistExtractionResultsHandler(input, context) {
  const { reviewId, principal, results, jobId, startedAt } = input || {};

  if (!reviewId) {
    throw Object.assign(new Error('reviewId is required.'), { statusCode: 400 });
  }
  if (!principal || !principal.userId) {
    throw Object.assign(new Error('principal with userId is required.'), { statusCode: 400 });
  }
  if (!Array.isArray(results)) {
    throw Object.assign(new Error('results must be an array.'), { statusCode: 400 });
  }

  // Search indexing: fire-and-forget, best-effort
  const searchConfig = getSearchConfiguration();
  if (searchConfig && searchConfig.configured) {
    for (const r of results) {
      if (r.extractedText && r.fileResult) {
        const { fileId, fileName, logicalCategory } = r.fileResult;
        indexArbDocumentChunks(reviewId, fileId, fileName, logicalCategory, r.extractedText)
          .catch((err) => {
            if (context && typeof context.log === 'function') {
              context.log(`[search-index] Failed to index "${fileName}": ${err?.message ?? err}`);
            }
          });
      }
    }
  }

  const extraction = await persistAggregatedExtractionResults({
    reviewId,
    principal,
    fileResults: results,
    jobId: jobId || `${reviewId}-durable-${Date.now()}`,
    startedAt: startedAt || new Date().toISOString()
  });

  const successCount = results.filter(
    (r) => r.fileResult?.extractionStatus === 'Completed' || r.fileResult?.extractionStatus === 'CompletedWithIssues'
  ).length;
  const errorCount = results.filter(
    (r) => r.fileResult?.extractionStatus === 'Failed'
  ).length;

  if (context && typeof context.log === 'function') {
    context.log(JSON.stringify({
      activity: 'persistExtractionResults',
      reviewId,
      extractionState: extraction.state,
      fileCount: results.length,
      successCount,
      errorCount
    }));
  }

  return {
    persisted: true,
    indexedChunks: (extraction.completedSteps || []).length,
    successCount,
    errorCount
  };
}

df.app.activity('persistExtractionResults', { handler: persistExtractionResultsHandler });

module.exports = { persistExtractionResultsHandler };
