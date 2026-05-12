'use strict';

const df = require('durable-functions');
const { checkAndReserveQuota } = require('../../shared/arb-extraction-quota');
const {
  getDocumentIntelligenceConfiguration,
  supportsDocumentIntelligenceExtraction
} = require('../../shared/arb-document-intelligence');

/**
 * Activity: checkDiQuota
 *
 * Gates the extraction orchestration by checking per-user hourly Document
 * Intelligence quota BEFORE any fan-out of file-processing activities. This
 * is intentionally a single-activity step to enforce serialized quota
 * reservation (the underlying Table-Storage-backed counter does optimistic
 * concurrency but works best when called once per batch).
 *
 * Input:  { principal, files }
 * Output: { quotaOk: true, diEligibleCount }
 * Throws: 429-equivalent error with quota reset info when over quota
 */
async function checkDiQuotaHandler(input, context) {
  const { principal, files } = input || {};

  if (!principal || !principal.userId) {
    throw Object.assign(new Error('principal with userId is required.'), {
      statusCode: 400
    });
  }

  const config = getDocumentIntelligenceConfiguration();
  if (!config.configured) {
    if (context && typeof context.log === 'function') {
      context.log(JSON.stringify({
        activity: 'checkDiQuota',
        quotaOk: true,
        diEligibleCount: 0,
        reason: 'DI not configured'
      }));
    }
    return { quotaOk: true, diEligibleCount: 0, reason: 'DI not configured' };
  }

  const fileList = Array.isArray(files) ? files : [];
  const diEligibleCount = fileList.filter(
    (f) => f && supportsDocumentIntelligenceExtraction(f.fileName)
  ).length;

  if (diEligibleCount === 0) {
    if (context && typeof context.log === 'function') {
      context.log(JSON.stringify({
        activity: 'checkDiQuota',
        quotaOk: true,
        diEligibleCount: 0
      }));
    }
    return { quotaOk: true, diEligibleCount: 0 };
  }

  // checkAndReserveQuota throws a 429 when reservation would exceed HOURLY_LIMIT.
  await checkAndReserveQuota(principal, diEligibleCount);

  if (context && typeof context.log === 'function') {
    context.log(JSON.stringify({
      activity: 'checkDiQuota',
      quotaOk: true,
      diEligibleCount
    }));
  }

  return { quotaOk: true, diEligibleCount };
}

df.app.activity('checkDiQuota', { handler: checkDiQuotaHandler });

module.exports = { checkDiQuotaHandler };
