'use strict';

const df = require('durable-functions');
const { getTableClient, encodeTableKey } = require('../../shared/table-storage');

const ARBJOBS_TABLE_NAME = 'arbjobs';

/**
 * Activity: writeArbJobStatus
 *
 * Writes a single job status row to the `arbjobs` Table Storage table. This
 * table is the backward-compatibility polling surface for the legacy
 * `GET /api/arb/reviews/{reviewId}/agent-status` endpoint. Both the legacy
 * fire-and-forget path and the durable orchestrator path write here, so the
 * status endpoint works unchanged for either path.
 *
 * Input:
 *   {
 *     reviewId:    string,
 *     principal:   { userId: string, ... },
 *     status:      'running' | 'completed' | 'failed',
 *     traceId:     string,
 *     startedAt:   string (ISO 8601),
 *     completedAt: string | null,
 *     result?:     object   // optional success payload; stored as resultJson
 *     error?:      string   // optional failure message
 *   }
 *
 * Output: { written: true }
 */
async function writeArbJobStatusHandler(input, context) {
  const {
    reviewId,
    principal,
    status,
    traceId,
    startedAt,
    completedAt,
    result,
    error
  } = input || {};

  if (!reviewId) {
    throw Object.assign(new Error('reviewId is required.'), { statusCode: 400 });
  }
  if (!principal || !principal.userId) {
    throw Object.assign(new Error('principal with userId is required.'), { statusCode: 400 });
  }
  if (!status) {
    throw Object.assign(new Error('status is required.'), { statusCode: 400 });
  }

  const client = await getTableClient(ARBJOBS_TABLE_NAME);

  await client.upsertEntity(
    {
      partitionKey: encodeTableKey(reviewId),
      rowKey: encodeTableKey(principal.userId),
      status,
      traceId: traceId ?? null,
      startedAt: startedAt ?? null,
      completedAt: completedAt ?? null,
      resultJson: result ? JSON.stringify(result) : null,
      error: error ?? null
    },
    'Replace'
  );

  if (context && typeof context.log === 'function') {
    context.log(
      JSON.stringify({
        activity: 'writeArbJobStatus',
        reviewId,
        status,
        traceId: traceId ?? null
      })
    );
  }

  return { written: true };
}

df.app.activity('writeArbJobStatus', { handler: writeArbJobStatusHandler });

module.exports = { writeArbJobStatusHandler, ARBJOBS_TABLE_NAME };
