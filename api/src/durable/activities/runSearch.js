'use strict';

const df = require('durable-functions');
const { searchArbDocuments, ensureArbSearchIndex } = require('../../shared/arb-search');

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'at',
  'is', 'are', 'be', 'with', 'from', 'that', 'this', 'by', 'as', 'its',
  'it', 'will', 'we', 'our', 'all', 'any', 'not', 'have', 'has', 'can'
]);

/**
 * Build the search query used to retrieve relevant Azure architecture context
 * for the ARB agent. Logic mirrors `buildArbSearchQuery` in arbRunAgentReview.js.
 */
function buildArbSearchQuery(review, requirements, evidence) {
  const terms = new Set();
  if (review && review.projectName) {
    review.projectName.split(/\s+/).forEach((t) => terms.add(t));
  }
  if (review && review.customerName) {
    review.customerName.split(/\s+/).forEach((t) => terms.add(t));
  }
  const targetRegions = (review && review.targetRegions) || [];
  targetRegions.forEach((r) => terms.add(r));

  const allText = [
    ...requirements.slice(0, 20).map((r) => r.normalizedText ?? ''),
    ...evidence.slice(0, 15).map((e) => e.summary ?? '')
  ].join(' ');

  allText.split(/\W+/).forEach((tok) => {
    const t = tok.trim().toLowerCase();
    if (t.length >= 5 && !STOP_WORDS.has(t)) {
      terms.add(tok.trim());
    }
  });

  const base = 'Azure architecture security reliability WAF CAF';
  const extra = [...terms].slice(0, 20).join(' ');
  return `${base} ${extra}`.slice(0, 200).trim();
}

/**
 * Activity: runSearch
 *
 * Ensures the ARB search index exists, builds the search query, and returns
 * the top-N matching chunks for the review.
 *
 * Input:  { review, requirements, evidence, reviewId }
 * Output: { searchChunks, searchQuery }
 */
async function runSearchHandler(input, context) {
  const { review, requirements, evidence, reviewId } = input || {};

  if (!reviewId) {
    throw Object.assign(new Error('reviewId is required.'), { statusCode: 400 });
  }

  const requirementsList = Array.isArray(requirements) ? requirements : [];
  const evidenceList = Array.isArray(evidence) ? evidence : [];

  const searchQuery = buildArbSearchQuery(review || {}, requirementsList, evidenceList);

  await ensureArbSearchIndex();
  const searchChunks = await searchArbDocuments(reviewId, searchQuery, 12);

  if (context && typeof context.log === 'function') {
    context.log(
      JSON.stringify({
        activity: 'runSearch',
        reviewId,
        query: searchQuery.slice(0, 80),
        chunks: Array.isArray(searchChunks) ? searchChunks.length : 0
      })
    );
  }

  return { searchChunks: searchChunks || [], searchQuery };
}

df.app.activity('runSearch', { handler: runSearchHandler });

module.exports = { runSearchHandler, buildArbSearchQuery };
