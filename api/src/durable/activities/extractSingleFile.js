'use strict';

const df = require('durable-functions');
const {
  ARB_INPUT_CONTAINER_NAME,
  ARB_OUTPUT_CONTAINER_NAME,
  getContainerClient
} = require('../../shared/storage');
const { getFoundryConfiguration } = require('../../shared/arb-foundry-agent');
const { extractSingleFileContent } = require('../../shared/arb-review-store');

/**
 * Activity: extractSingleFile
 *
 * Extracts content from a single uploaded file (text + visual evidence).
 * Runs as a parallel fan-out activity — one per file in the review package.
 * Visual artifacts are written to blob storage during this activity; the
 * returned result contains only JSON-serializable metadata.
 *
 * Input:  { reviewId, principal, file }
 * Output: { fileResult, extractedText, visualRecords, visualExtractionErrors, extractionErrors }
 */
async function extractSingleFileHandler(input, context) {
  const { reviewId, principal, file } = input || {};

  if (!reviewId) {
    throw Object.assign(new Error('reviewId is required.'), { statusCode: 400 });
  }
  if (!principal || !principal.userId) {
    throw Object.assign(new Error('principal with userId is required.'), { statusCode: 400 });
  }
  if (!file || !file.fileId) {
    throw Object.assign(new Error('file with fileId is required.'), { statusCode: 400 });
  }

  const [inputContainer, outputContainer] = await Promise.all([
    getContainerClient(ARB_INPUT_CONTAINER_NAME),
    getContainerClient(ARB_OUTPUT_CONTAINER_NAME)
  ]);
  const visionAvailable = getFoundryConfiguration().configured;

  const result = await extractSingleFileContent(file, {
    reviewId,
    principal,
    inputContainer,
    outputContainer,
    visionAvailable,
    searchIndexed: false // search indexing is deferred to persistExtractionResults
  });

  if (context && typeof context.log === 'function') {
    context.log(JSON.stringify({
      activity: 'extractSingleFile',
      reviewId,
      fileId: file.fileId,
      fileName: file.fileName,
      extractionStatus: result.fileResult?.extractionStatus,
      visualRecordCount: (result.visualRecords || []).length,
      errorCount: (result.extractionErrors || []).length
    }));
  }

  return result;
}

df.app.activity('extractSingleFile', { handler: extractSingleFileHandler });

module.exports = { extractSingleFileHandler };
