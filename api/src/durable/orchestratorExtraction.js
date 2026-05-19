'use strict';

const df = require('durable-functions');

// Ensure all activities used by this orchestrator are registered when the
// orchestrator module is required by `_durableRegistration.js`.
require('./activities/checkDiQuota');
require('./activities/loadFilesForExtraction');
require('./activities/extractSingleFile');
require('./activities/persistExtractionResults');
require('./activities/writeArbJobStatus');
require('./activities/markExtractionFailed');

/**
 * Default retry policy applied to every activity in the extraction pipeline.
 *   - firstRetryIntervalInMilliseconds: 5000 (5s)
 *   - maxNumberOfAttempts: 3
 *   - backoffCoefficient: 2  → 5s, 10s, 20s
 */
const DEFAULT_RETRY_OPTIONS = new df.RetryOptions(5000, 3);
DEFAULT_RETRY_OPTIONS.backoffCoefficient = 2;

/** Maximum orchestration duration before the timer race fails the run. */
const ORCHESTRATION_TIMEOUT_MINUTES = 40;

/**
 * Sub-orchestrator: runs the extraction activity chain.
 *
 * Sequence:
 *   1. loadFilesForExtraction  (list files needing extraction)
 *   2. checkDiQuota            (reserve DI quota — single gate BEFORE fan-out)
 *   3. extractSingleFile × N   (fan-out, bounded by maxConcurrentActivityFunctions)
 *   4. persistExtractionResults (aggregate + write Table Storage + Search)
 *
 * Input:  { reviewId, principal, traceId, requestedAt }
 * Output: { extractionCompleted, fileCount, successCount, errorCount, indexedChunks }
 */
function* orchestratorExtractionWorkflow(context) {
  const input = context.df.getInput() || {};
  const { reviewId, principal } = input;

  const fileList = yield context.df.callActivityWithRetry(
    'loadFilesForExtraction',
    DEFAULT_RETRY_OPTIONS,
    { reviewId, principal }
  );

  yield context.df.callActivityWithRetry(
    'checkDiQuota',
    DEFAULT_RETRY_OPTIONS,
    { principal, files: fileList.files }
  );

  // Fan-out: one extractSingleFile activity per file. Concurrency is bounded
  // by `maxConcurrentActivityFunctions: 3` in host.json (NOT in orchestrator
  // code), which respects DI quota limits without requiring per-activity
  // coordination.
  const tasks = (fileList.files || []).map((file) =>
    context.df.callActivityWithRetry(
      'extractSingleFile',
      DEFAULT_RETRY_OPTIONS,
      { reviewId, principal, file }
    )
  );

  const results = yield context.df.Task.all(tasks);

  const persistResult = yield context.df.callActivityWithRetry(
    'persistExtractionResults',
    DEFAULT_RETRY_OPTIONS,
    { reviewId, principal, results }
  );

  const successCount = results.filter(
    (r) => r && r.extractionStatus === 'Completed'
  ).length;
  const errorCount = results.filter(
    (r) => r && r.extractionStatus === 'Failed'
  ).length;

  return {
    extractionCompleted: true,
    fileCount: (fileList.files || []).length,
    successCount,
    errorCount,
    indexedChunks: persistResult.indexedChunks ?? 0
  };
}

/**
 * Durable Functions orchestrator: `orchestratorExtraction`.
 *
 * Input:  { reviewId, principal, traceId, requestedAt }
 * Output: { extractionCompleted, fileCount, successCount, errorCount, indexedChunks }
 *
 * Races `orchestratorExtractionWorkflow` against a 30-minute durable timer
 * via `context.df.Task.any()`. All three outcomes (success, timeout, error)
 * persist a row to the `arbjobs` table so extraction status is observable
 * through existing polling endpoints if added later.
 */
function* orchestratorExtraction(context) {
  const input = context.df.getInput() || {};
  const { reviewId, principal, traceId } = input;
  const startedAt = new Date().toISOString();
  const startedAtMs = context.df.currentUtcDateTime.getTime();

  const deadline = new Date(
    context.df.currentUtcDateTime.getTime() +
      ORCHESTRATION_TIMEOUT_MINUTES * 60_000
  );
  const timerTask = context.df.createTimer(deadline);
  const workflowTask = context.df.callSubOrchestrator(
    'orchestratorExtractionWorkflow',
    input
  );

  try {
    const winner = yield context.df.Task.any([workflowTask, timerTask]);

    if (winner === timerTask) {
      const completedAt = new Date().toISOString();
      const completedAtMs = context.df.currentUtcDateTime.getTime();
      const orchestrationDuration = completedAtMs - startedAtMs;
      const errorMessage = `Extraction timed out after ${ORCHESTRATION_TIMEOUT_MINUTES} minutes`;

      yield context.df.callActivity('writeArbJobStatus', {
        reviewId,
        principal,
        status: 'failed',
        traceId,
        startedAt,
        completedAt,
        error: errorMessage
      });

      // Update review entity so UI polling stops showing "Extraction Running".
      // Wrapped in try/catch so a storage failure here does not mask the timeout.
      try {
        yield context.df.callActivity('markExtractionFailed', {
          reviewId,
          principal,
          errorMessage
        });
      } catch (_markErr) {
        // best-effort; original timeout error is still thrown below
      }

      // Emit structured log with custom properties for Application Insights
      context.log(JSON.stringify({
        orchestrationDuration,
        fileCount: 0,
        successCount: 0,
        errorCount: 0,
        traceId
      }));

      // Emit custom metric for orchestration duration
      context.log({
        name: 'orchestrationDuration',
        value: orchestrationDuration,
        properties: {
          orchestrationType: 'extraction',
          status: 'timeout',
          traceId
        }
      });

      throw new Error(errorMessage);
    }

    timerTask.cancel();
    const result = workflowTask.result;
    const completedAt = new Date().toISOString();
    const completedAtMs = context.df.currentUtcDateTime.getTime();
    const orchestrationDuration = completedAtMs - startedAtMs;

    yield context.df.callActivity('writeArbJobStatus', {
      reviewId,
      principal,
      status: 'completed',
      traceId,
      startedAt,
      completedAt,
      result
    });

    // Emit structured log with custom properties for Application Insights
    context.log(JSON.stringify({
      orchestrationDuration,
      fileCount: result.fileCount ?? 0,
      successCount: result.successCount ?? 0,
      errorCount: result.errorCount ?? 0,
      traceId
    }));

    // Emit custom metric for orchestration duration
    context.log({
      name: 'orchestrationDuration',
      value: orchestrationDuration,
      properties: {
        orchestrationType: 'extraction',
        status: 'success',
        traceId
      }
    });

    return result;
  } catch (error) {
    const completedAt = new Date().toISOString();
    const completedAtMs = context.df.currentUtcDateTime.getTime();
    const orchestrationDuration = completedAtMs - startedAtMs;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    try {
      timerTask.cancel();
    } catch (_) {
      // Timer already resolved or cancelled; safe to ignore.
    }

    if (!errorMessage.startsWith('Extraction timed out')) {
      yield context.df.callActivity('writeArbJobStatus', {
        reviewId,
        principal,
        status: 'failed',
        traceId,
        startedAt,
        completedAt,
        error: errorMessage
      });

      // Update review entity so UI polling stops showing "Extraction Running".
      try {
        yield context.df.callActivity('markExtractionFailed', {
          reviewId,
          principal,
          errorMessage
        });
      } catch (_markErr) {
        // best-effort; original error is still re-thrown below
      }

      // Emit structured log with custom properties for Application Insights
      context.log(JSON.stringify({
        orchestrationDuration,
        fileCount: 0,
        successCount: 0,
        errorCount: 0,
        traceId
      }));

      // Emit custom metric for orchestration duration
      context.log({
        name: 'orchestrationDuration',
        value: orchestrationDuration,
        properties: {
          orchestrationType: 'extraction',
          status: 'error',
          traceId
        }
      });
    }

    throw error;
  }
}

df.app.orchestration(
  'orchestratorExtractionWorkflow',
  orchestratorExtractionWorkflow
);
df.app.orchestration('orchestratorExtraction', orchestratorExtraction);

module.exports = {
  orchestratorExtraction,
  orchestratorExtractionWorkflow,
  DEFAULT_RETRY_OPTIONS,
  ORCHESTRATION_TIMEOUT_MINUTES
};
