'use strict';

const df = require('durable-functions');

// Ensure all activity functions referenced by this orchestrator are registered
// when the durable module is loaded. Registration happens as a side effect of
// `require()` for each activity file.
require('./activities/loadReviewData');
require('./activities/runSearch');
require('./activities/runRules');
require('./activities/runAgent');
require('./activities/persistResults');
require('./activities/syncOutputs');
require('./activities/writeArbJobStatus');

/**
 * Default retry policy applied to every activity EXCEPT `runAgent`.
 *
 *   - firstRetryIntervalInMilliseconds: 5000 (5s)
 *   - maxNumberOfAttempts: 3
 *   - backoffCoefficient: 2  → 5s, 10s, 20s
 *
 * The `runAgent` activity deliberately has NO retry policy here because the
 * Foundry agent client already implements a 3-retry with exponential backoff
 * internally; stacking retries would multiply latency with no benefit.
 */
const DEFAULT_RETRY_OPTIONS = new df.RetryOptions(5000, 3);
DEFAULT_RETRY_OPTIONS.backoffCoefficient = 2;

/** Maximum orchestration duration before the timer race fails the run. */
const ORCHESTRATION_TIMEOUT_MINUTES = 30;

/**
 * Sub-orchestrator that runs the actual activity chain.
 *
 * This is invoked by `orchestratorAgentReview` via `callSubOrchestrator` so
 * the parent can race it against a durable timer using `Task.any`. Splitting
 * the workflow into a sub-orchestrator is the canonical Durable Functions
 * pattern for generator-based orchestrators, since a generator itself is not
 * a Task and therefore cannot be raced against a timer directly.
 *
 * Input:  { reviewId, principal, traceId }
 * Output: Final result object with agent review fields.
 */
function* orchestratorAgentReviewWorkflow(context) {
  const input = context.df.getInput() || {};
  const { reviewId, principal } = input;

  const reviewData = yield context.df.callActivityWithRetry(
    'loadReviewData',
    DEFAULT_RETRY_OPTIONS,
    { reviewId, principal }
  );

  const searchResult = yield context.df.callActivityWithRetry(
    'runSearch',
    DEFAULT_RETRY_OPTIONS,
    {
      review: reviewData.review,
      requirements: reviewData.requirements,
      evidence: reviewData.evidence,
      reviewId
    }
  );

  const rulesResult = yield context.df.callActivityWithRetry(
    'runRules',
    DEFAULT_RETRY_OPTIONS,
    {
      review: reviewData.review,
      requirements: reviewData.requirements,
      evidence: reviewData.evidence,
      files: reviewData.files
    }
  );

  // NOTE: `runAgent` intentionally has no retry — Foundry handles retries internally.
  const agentResultWrapper = yield context.df.callActivity('runAgent', {
    review: reviewData.review,
    files: reviewData.files,
    requirements: reviewData.requirements,
    evidence: reviewData.evidence,
    searchChunks: searchResult.searchChunks,
    visualEvidence: reviewData.visualEvidence,
    ruleFindings: rulesResult.ruleFindings
  });

  const persistResult = yield context.df.callActivityWithRetry(
    'persistResults',
    DEFAULT_RETRY_OPTIONS,
    {
      reviewId,
      principal,
      agentResult: agentResultWrapper.agentResult,
      review: reviewData.review
    }
  );

  const syncResult = yield context.df.callActivityWithRetry(
    'syncOutputs',
    DEFAULT_RETRY_OPTIONS,
    {
      reviewId,
      principal,
      review: reviewData.review,
      agentResult: agentResultWrapper.agentResult,
      files: reviewData.files,
      requirements: reviewData.requirements,
      evidence: reviewData.evidence,
      visualEvidence: reviewData.visualEvidence,
      actions: reviewData.actions
    }
  );

  const agentResult = agentResultWrapper.agentResult || {};
  return {
    agentReviewCompleted: true,
    fallbackUsed: agentResult.fallbackUsed === true,
    findingsCount: persistResult.findingsCount ?? 0,
    recommendation:
      persistResult.recommendation ?? agentResult.recommendation ?? null,
    overallScore:
      persistResult.overallScore ??
      (agentResult.scorecard ? agentResult.scorecard.overallScore ?? null : null),
    confidenceLevel: agentResult.scorecard
      ? agentResult.scorecard.confidenceLevel ?? null
      : null,
    generatedAt: new Date().toISOString(),
    artifactsGenerated: syncResult.artifactsGenerated ?? 0
  };
}

/**
 * Durable Functions orchestrator: `orchestratorAgentReview`.
 *
 * Input:  { reviewId, principal, traceId }
 * Output: {
 *   agentReviewCompleted, fallbackUsed, findingsCount, recommendation,
 *   overallScore, confidenceLevel, generatedAt, artifactsGenerated
 * }
 *
 * Races `orchestratorAgentReviewWorkflow` (the full activity chain) against a
 * 30-minute durable timer via `context.df.Task.any()`. Whichever Task wins
 * the race determines the outcome:
 *   - workflow wins → cancel the timer, write `completed` to arbjobs, return result
 *   - timer wins    → write `failed` with timeout message, throw
 *   - sub-orch throws → catch, cancel timer, write `failed`, rethrow
 *
 * All three outcomes persist a row to the `arbjobs` table so the legacy
 * `GET /agent-status` polling endpoint works unchanged.
 */
function* orchestratorAgentReview(context) {
  const input = context.df.getInput() || {};
  const { reviewId, principal, traceId } = input;

  const startedAt = new Date().toISOString();
  const startedAtMs = context.df.currentUtcDateTime.getTime();

  const deadline = new Date(
    context.df.currentUtcDateTime.getTime() + ORCHESTRATION_TIMEOUT_MINUTES * 60_000
  );
  const timerTask = context.df.createTimer(deadline);
  const workflowTask = context.df.callSubOrchestrator(
    'orchestratorAgentReviewWorkflow',
    input
  );

  try {
    const winner = yield context.df.Task.any([workflowTask, timerTask]);

    if (winner === timerTask) {
      // Timer won the race → orchestration timed out.
      const completedAt = new Date().toISOString();
      const completedAtMs = context.df.currentUtcDateTime.getTime();
      const orchestrationDuration = completedAtMs - startedAtMs;
      const errorMessage = `Orchestration timed out after ${ORCHESTRATION_TIMEOUT_MINUTES} minutes`;

      yield context.df.callActivity('writeArbJobStatus', {
        reviewId,
        principal,
        status: 'failed',
        traceId,
        startedAt,
        completedAt,
        error: errorMessage
      });

      // Emit structured log with custom properties for Application Insights
      context.log(JSON.stringify({
        orchestrationDuration,
        activityCount: 6, // loadReviewData, runSearch, runRules, runAgent, persistResults, syncOutputs
        completionStatus: 'timeout',
        traceId
      }));

      // Emit custom metric for orchestration duration
      context.log({
        name: 'orchestrationDuration',
        value: orchestrationDuration,
        properties: {
          orchestrationType: 'agentReview',
          status: 'timeout',
          traceId
        }
      });

      throw new Error(errorMessage);
    }

    // Workflow won the race → cancel the pending timer and record success.
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
      activityCount: 6, // loadReviewData, runSearch, runRules, runAgent, persistResults, syncOutputs
      completionStatus: 'success',
      traceId
    }));

    // Emit custom metric for orchestration duration
    context.log({
      name: 'orchestrationDuration',
      value: orchestrationDuration,
      properties: {
        orchestrationType: 'agentReview',
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

    // Best-effort timer cancellation if the sub-orchestrator failed before
    // the timer fired. Safe to call even if the timer already completed.
    try {
      timerTask.cancel();
    } catch (_) {
      // ignore — timer already resolved or cancelled
    }

    // If the failure path is reached after a timeout, we already wrote the
    // failed row above; writing again is harmless (same partition/row key,
    // Replace semantics) but we only write when the error wasn't a timeout.
    if (!errorMessage.startsWith('Orchestration timed out')) {
      yield context.df.callActivity('writeArbJobStatus', {
        reviewId,
        principal,
        status: 'failed',
        traceId,
        startedAt,
        completedAt,
        error: errorMessage
      });

      // Emit structured log with custom properties for Application Insights
      context.log(JSON.stringify({
        orchestrationDuration,
        activityCount: 6, // loadReviewData, runSearch, runRules, runAgent, persistResults, syncOutputs
        completionStatus: 'error',
        traceId
      }));

      // Emit custom metric for orchestration duration
      context.log({
        name: 'orchestrationDuration',
        value: orchestrationDuration,
        properties: {
          orchestrationType: 'agentReview',
          status: 'error',
          traceId
        }
      });
    }

    throw error;
  }
}

df.app.orchestration('orchestratorAgentReviewWorkflow', orchestratorAgentReviewWorkflow);
df.app.orchestration('orchestratorAgentReview', orchestratorAgentReview);

module.exports = {
  orchestratorAgentReview,
  orchestratorAgentReviewWorkflow,
  DEFAULT_RETRY_OPTIONS,
  ORCHESTRATION_TIMEOUT_MINUTES
};
