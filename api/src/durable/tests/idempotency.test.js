'use strict';

/**
 * C8 — Durable Functions idempotency tests.
 *
 * Covers gaps not exercised by the existing replay tests:
 *   1. orchestratorExtraction timer-race paths (success / timeout / error)
 *   2. Replay determinism — identical inputs always produce identical call sequences
 *   3. computeInstanceId — deterministic, collision-resistant, correct format
 *   4. selectFilesForExtraction — all non-null file statuses are included (reruns)
 *   5. Retry policy backoff coefficient on both orchestrators
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ── Mock harness (same pattern as existing orchestrator tests) ─────────────

function makeTask(result) {
  const task = { result, _isCancelled: false };
  task.cancel = () => { task._isCancelled = true; };
  return task;
}

/**
 * Mock context for orchestratorExtraction (outer orchestrator).
 * Supports injecting which task wins the Task.any race.
 */
function createOuterContext(input, { timerWins = false, workflowResult = { extractionCompleted: true, fileCount: 1, successCount: 1, errorCount: 0, indexedChunks: 5 } } = {}) {
  const calls = [];
  let timerTaskRef = null;
  let workflowTaskRef = null;

  const df = {
    getInput: () => input,
    currentUtcDateTime: new Date('2026-01-01T00:00:00.000Z'),
    callActivity: (name, activityInput) => {
      const task = makeTask({});
      calls.push({ type: 'callActivity', name, input: activityInput, task });
      return task;
    },
    callSubOrchestrator: (name, orchInput) => {
      workflowTaskRef = makeTask(workflowResult);
      calls.push({ type: 'callSubOrchestrator', name, input: orchInput });
      return workflowTaskRef;
    },
    createTimer: (date) => {
      timerTaskRef = makeTask(null);
      calls.push({ type: 'createTimer', date });
      return timerTaskRef;
    },
    Task: {
      any: (tasks) => {
        calls.push({ type: 'Task.any', count: tasks.length });
        // tasks = [workflowTask, timerTask]
        const winner = timerWins ? tasks[1] : tasks[0];
        return makeTask(winner);
      }
    }
  };

  const context = { df, log: () => {} };
  return {
    context,
    calls,
    getTimerTask: () => timerTaskRef,
    getWorkflowTask: () => workflowTaskRef,
  };
}

/** Mock context for the inner extraction workflow (mirrors existing tests). */
function createInnerContext(input, activityResults = {}) {
  const calls = [];
  const df = {
    getInput: () => input,
    currentUtcDateTime: new Date('2026-01-01T00:00:00.000Z'),
    callActivityWithRetry: (name, _retryOptions, activityInput) => {
      calls.push({ type: 'callActivityWithRetry', name, input: activityInput });
      return makeTask(activityResults[name] ?? {});
    },
    Task: {
      all: (tasks) => {
        calls.push({ type: 'Task.all', count: tasks.length });
        const results = activityResults['extractSingleFile_all'] ||
          tasks.map((_, i) => ({ fileId: `f-00${i + 1}`, extractionStatus: 'Completed' }));
        return makeTask(results);
      }
    }
  };
  return { context: { df, log: () => {} }, calls };
}

/** Mock context for the agent review workflow (mirrors existing tests). */
function createAgentContext(input, activityResults = {}) {
  const calls = [];
  const df = {
    getInput: () => input,
    currentUtcDateTime: new Date('2026-01-01T00:00:00.000Z'),
    callActivityWithRetry: (name, _retryOptions, activityInput) => {
      calls.push({ type: 'callActivityWithRetry', name, input: activityInput });
      return makeTask(activityResults[name] ?? {});
    },
    callActivity: (name, activityInput) => {
      calls.push({ type: 'callActivity', name, input: activityInput });
      return makeTask(activityResults[name] ?? {});
    },
    Task: {
      any: (tasks) => makeTask(tasks[0]),
      all: (tasks) => makeTask(tasks.map(t => t.result))
    }
  };
  return { context: { df, log: () => {} }, calls };
}

// ── Sample fixtures ────────────────────────────────────────────────────────

const OUTER_INPUT = {
  reviewId: 'idm-review-001',
  principal: { userId: 'idm-user-001' },
  traceId: 'trace-idm-001',
  requestedAt: '2026-01-01T00:00:00.000Z'
};

const INNER_INPUT = { ...OUTER_INPUT };

const AGENT_INPUT = {
  reviewId: 'idm-review-002',
  principal: { userId: 'idm-user-001' },
  traceId: 'trace-idm-002'
};

const AGENT_RESULTS = {
  loadReviewData: {
    review: { reviewId: 'idm-review-002', workflowState: 'Review In Progress' },
    files: [{ fileId: 'f-001', extractionStatus: 'Completed' }],
    requirements: [], evidence: [], visualEvidence: [], actions: []
  },
  runSearch: { searchChunks: [] },
  runRules: { ruleFindings: [], ruleBlockers: [], criticalBlockerCount: 0 },
  runAgent: { agentResult: { findings: [], scorecard: { overallScore: 80, criticalBlockerCount: 0 }, recommendation: 'Ready with Gaps', fallbackUsed: false } },
  persistResults: { persisted: true, findingsCount: 0, overallScore: 80, recommendation: 'Ready with Gaps' },
  syncOutputs: { artifactsGenerated: 2 }
};

function makeFiles(count, status = 'Pending') {
  return Array.from({ length: count }, (_, i) => ({
    fileId: `f-00${i + 1}`,
    fileName: `doc${i + 1}.pdf`,
    extractionStatus: status
  }));
}

// ── 1. orchestratorExtraction — success path ───────────────────────────────

describe('orchestratorExtraction — success path (workflow wins race)', () => {
  const { orchestratorExtraction } = require('../orchestratorExtraction');

  it('calls writeArbJobStatus with status="completed" when workflow wins', () => {
    const { context, calls } = createOuterContext(OUTER_INPUT, { timerWins: false });
    const gen = orchestratorExtraction(context);

    gen.next();                    // → createTimer + callSubOrchestrator + yield Task.any
    gen.next(calls.find(c => c.type === 'callSubOrchestrator') ? context.df._lastWorkflow : null);

    // Provide the workflowTask as the winner (workflow wins)
    const { getWorkflowTask } = createOuterContext(OUTER_INPUT, { timerWins: false });
    const ctx2 = createOuterContext(OUTER_INPUT, { timerWins: false });
    const gen2 = orchestratorExtraction(ctx2.context);
    gen2.next();                                  // setup + yield Task.any
    gen2.next(ctx2.getWorkflowTask());            // winner = workflowTask
    gen2.next({});                                // writeArbJobStatus result

    const statusCall = ctx2.calls.find(c => c.name === 'writeArbJobStatus');
    assert.ok(statusCall, 'writeArbJobStatus must be called on success');
    assert.equal(statusCall.input.status, 'completed');
    assert.equal(statusCall.input.reviewId, OUTER_INPUT.reviewId);
  });

  it('cancels the timer task when workflow wins', () => {
    const ctx = createOuterContext(OUTER_INPUT, { timerWins: false });
    const gen = orchestratorExtraction(ctx.context);
    gen.next();
    gen.next(ctx.getWorkflowTask());   // workflow wins → timerTask.cancel() called
    gen.next({});                       // writeArbJobStatus completes

    assert.equal(ctx.getTimerTask()?._isCancelled, true, 'timer must be cancelled on workflow success');
  });

  it('does not call markExtractionFailed on success', () => {
    const ctx = createOuterContext(OUTER_INPUT, { timerWins: false });
    const gen = orchestratorExtraction(ctx.context);
    gen.next();
    gen.next(ctx.getWorkflowTask());
    gen.next({});

    const failCall = ctx.calls.find(c => c.name === 'markExtractionFailed');
    assert.equal(failCall, undefined, 'markExtractionFailed must not be called on success');
  });
});

// ── 2. orchestratorExtraction — timeout path ───────────────────────────────

describe('orchestratorExtraction — timeout path (timer wins race)', () => {
  const { orchestratorExtraction } = require('../orchestratorExtraction');

  it('calls writeArbJobStatus with status="failed" when timer wins', () => {
    const ctx = createOuterContext(OUTER_INPUT, { timerWins: true });
    const gen = orchestratorExtraction(ctx.context);
    gen.next();                                // setup + yield Task.any
    gen.next(ctx.getTimerTask());              // timer wins → yield writeArbJobStatus
    gen.next({});                              // writeArbJobStatus result → yield markExtractionFailed
    try { gen.next({}); } catch (_) {}        // markExtractionFailed → throw (expected, caught here)

    const statusCall = ctx.calls.find(c => c.name === 'writeArbJobStatus');
    assert.ok(statusCall, 'writeArbJobStatus must be called on timeout');
    assert.equal(statusCall.input.status, 'failed');
    assert.ok(
      typeof statusCall.input.error === 'string' && statusCall.input.error.length > 0,
      'error message must be present'
    );
  });

  it('calls markExtractionFailed when timer wins', () => {
    const ctx = createOuterContext(OUTER_INPUT, { timerWins: true });
    const gen = orchestratorExtraction(ctx.context);
    gen.next();
    gen.next(ctx.getTimerTask());
    gen.next({});                         // writeArbJobStatus
    try { gen.next({}); } catch (_) {}   // markExtractionFailed → generator throws at end

    const failCall = ctx.calls.find(c => c.name === 'markExtractionFailed');
    assert.ok(failCall, 'markExtractionFailed must be called on timeout');
    assert.equal(failCall.input.reviewId, OUTER_INPUT.reviewId);
  });

  it('throws after timeout so the orchestration is marked failed', () => {
    const ctx = createOuterContext(OUTER_INPUT, { timerWins: true });
    const gen = orchestratorExtraction(ctx.context);
    gen.next();
    gen.next(ctx.getTimerTask());
    gen.next({});
    assert.throws(() => gen.next({}), /timed out/i);
  });

  it('passes reviewId and principal to writeArbJobStatus on timeout', () => {
    const ctx = createOuterContext(OUTER_INPUT, { timerWins: true });
    const gen = orchestratorExtraction(ctx.context);
    gen.next();
    gen.next(ctx.getTimerTask());
    gen.next({});
    try { gen.next({}); } catch (_) {}

    const statusCall = ctx.calls.find(c => c.name === 'writeArbJobStatus');
    assert.equal(statusCall.input.reviewId, OUTER_INPUT.reviewId);
    assert.deepEqual(statusCall.input.principal, OUTER_INPUT.principal);
    assert.equal(statusCall.input.traceId, OUTER_INPUT.traceId);
  });
});

// ── 3. orchestratorExtraction — error path ────────────────────────────────

describe('orchestratorExtraction — unexpected error path', () => {
  const { orchestratorExtraction } = require('../orchestratorExtraction');

  it('calls writeArbJobStatus with status="failed" when sub-orchestrator throws', () => {
    const ctx = createOuterContext(OUTER_INPUT, { timerWins: false });
    const gen = orchestratorExtraction(ctx.context);
    gen.next();
    gen.throw(new Error('storage transient failure'));  // inject error after Task.any yield
    try { gen.next({}); } catch (_) {}                 // writeArbJobStatus result
    try { gen.next({}); } catch (_) {}                 // markExtractionFailed

    const statusCall = ctx.calls.find(c => c.name === 'writeArbJobStatus');
    assert.ok(statusCall, 'writeArbJobStatus must be called on unexpected error');
    assert.equal(statusCall.input.status, 'failed');
  });

  it('re-throws the original error after writing status', () => {
    const ctx = createOuterContext(OUTER_INPUT, { timerWins: false });
    const gen = orchestratorExtraction(ctx.context);
    gen.next();
    gen.throw(new Error('storage transient failure'));
    try { gen.next({}); } catch (_) {}
    assert.throws(() => gen.next({}), /storage transient failure/);
  });
});

// ── 4. Replay determinism — extraction workflow ───────────────────────────

describe('orchestratorExtractionWorkflow — replay determinism', () => {
  const { orchestratorExtractionWorkflow } = require('../orchestratorExtraction');

  function runWorkflow(input, files) {
    const { context, calls } = createInnerContext(input);
    const gen = orchestratorExtractionWorkflow(context);
    const fileList = { files };
    const quotaResult = { quotaOk: true, diEligibleCount: files.length };
    const extractionResults = files.map(f => ({ ...f, extractionStatus: 'Completed' }));

    gen.next();
    gen.next(fileList);
    gen.next(quotaResult);
    gen.next(extractionResults);
    gen.next({ indexedChunks: 7 });
    return calls.map(c => c.name).filter(Boolean);
  }

  it('produces the same activity sequence on two independent runs with the same input', () => {
    const files = makeFiles(2);
    const seq1 = runWorkflow(INNER_INPUT, files);
    const seq2 = runWorkflow(INNER_INPUT, files);
    assert.deepEqual(seq1, seq2, 'activity sequence must be identical on replay');
  });

  it('produces the same output value on two independent runs', () => {
    const files = makeFiles(3);
    function runToResult(input, f) {
      const { context } = createInnerContext(input);
      const gen = orchestratorExtractionWorkflow(context);
      const fileList = { files: f };
      const extractionResults = f.map(x => ({ ...x, extractionStatus: 'Completed' }));
      gen.next();
      gen.next(fileList);
      gen.next({ quotaOk: true });
      gen.next(extractionResults);
      return gen.next({ indexedChunks: 4 }).value;
    }
    const r1 = runToResult(INNER_INPUT, files);
    const r2 = runToResult(INNER_INPUT, files);
    assert.deepEqual(r1, r2, 'output value must be identical on replay');
  });

  it('CompletedWithIssues files are not counted as Failed', () => {
    const { context } = createInnerContext(INNER_INPUT);
    const gen = orchestratorExtractionWorkflow(context);
    const files = makeFiles(3);
    const extractionResults = [
      { fileId: 'f-001', extractionStatus: 'Completed' },
      { fileId: 'f-002', extractionStatus: 'CompletedWithIssues' },
      { fileId: 'f-003', extractionStatus: 'Failed' }
    ];
    gen.next();
    gen.next({ files });
    gen.next({ quotaOk: true });
    gen.next(extractionResults);
    const final = gen.next({ indexedChunks: 0 });

    // Only 'Failed' status counts as errorCount; 'CompletedWithIssues' is neither success nor error
    assert.equal(final.value.errorCount, 1, 'only Failed status should increment errorCount');
    assert.equal(final.value.successCount, 1, 'only Completed status should increment successCount');
  });
});

// ── 5. Replay determinism — agent review workflow ─────────────────────────

describe('orchestratorAgentReviewWorkflow — replay determinism', () => {
  const { orchestratorAgentReviewWorkflow } = require('../orchestratorAgentReview');

  function runAgentWorkflow(input, results) {
    const { context, calls } = createAgentContext(input);
    const gen = orchestratorAgentReviewWorkflow(context);
    gen.next();
    gen.next(results.loadReviewData);
    gen.next(results.runSearch);
    gen.next(results.runRules);
    gen.next(results.runAgent);
    gen.next(results.persistResults);
    gen.next(results.syncOutputs);
    return calls.map(c => c.name).filter(Boolean);
  }

  it('produces the same activity sequence on two independent runs', () => {
    const seq1 = runAgentWorkflow(AGENT_INPUT, AGENT_RESULTS);
    const seq2 = runAgentWorkflow(AGENT_INPUT, AGENT_RESULTS);
    assert.deepEqual(seq1, seq2, 'agent workflow sequence must be identical on replay');
  });

  it('output is identical on two independent runs with the same activity results', () => {
    function runToValue(input, results) {
      const { context } = createAgentContext(input);
      const gen = orchestratorAgentReviewWorkflow(context);
      gen.next();
      gen.next(results.loadReviewData);
      gen.next(results.runSearch);
      gen.next(results.runRules);
      gen.next(results.runAgent);
      gen.next(results.persistResults);
      return gen.next(results.syncOutputs).value;
    }
    const v1 = runToValue(AGENT_INPUT, AGENT_RESULTS);
    const v2 = runToValue(AGENT_INPUT, AGENT_RESULTS);
    assert.deepEqual(v1, v2, 'agent workflow output must be identical on replay');
  });
});

// ── 6. computeInstanceId — deterministic & collision-resistant ────────────

describe('computeInstanceId — deterministic instance ID generation', () => {
  const { computeInstanceId } = require('../shared/instanceId');

  it('returns the same ID for the same inputs on repeated calls', () => {
    const id1 = computeInstanceId('review', 'review-abc', 'user-xyz');
    const id2 = computeInstanceId('review', 'review-abc', 'user-xyz');
    assert.equal(id1, id2, 'same inputs must always produce the same ID');
  });

  it('returns different IDs when prefix differs', () => {
    const id1 = computeInstanceId('review', 'review-abc', 'user-xyz');
    const id2 = computeInstanceId('extraction', 'review-abc', 'user-xyz');
    assert.notEqual(id1, id2, 'different prefixes must produce different IDs');
  });

  it('returns different IDs when reviewId differs', () => {
    const id1 = computeInstanceId('review', 'review-001', 'user-xyz');
    const id2 = computeInstanceId('review', 'review-002', 'user-xyz');
    assert.notEqual(id1, id2, 'different reviewIds must produce different IDs');
  });

  it('returns different IDs when userId differs', () => {
    const id1 = computeInstanceId('review', 'review-abc', 'user-001');
    const id2 = computeInstanceId('review', 'review-abc', 'user-002');
    assert.notEqual(id1, id2, 'different userIds must produce different IDs');
  });

  it('returns exactly 48 hex characters', () => {
    const id = computeInstanceId('review', 'any-review', 'any-user');
    assert.equal(id.length, 48, 'ID must be exactly 48 characters');
    assert.match(id, /^[0-9a-f]+$/, 'ID must contain only hex characters');
  });
});

// ── 7. selectFilesForExtraction — all statuses included (rerun safety) ────

describe('selectFilesForExtraction — rerun idempotency', () => {
  const { selectFilesForExtraction } = require('../activities/loadFilesForExtraction');

  it('includes files with every non-null status (Pending, Completed, Failed, CompletedWithIssues)', () => {
    const files = [
      { fileId: 'f1', extractionStatus: 'Pending' },
      { fileId: 'f2', extractionStatus: 'Completed' },
      { fileId: 'f3', extractionStatus: 'Failed' },
      { fileId: 'f4', extractionStatus: 'CompletedWithIssues' },
    ];
    const selected = selectFilesForExtraction(files);
    const ids = selected.map(f => f.fileId);
    assert.deepEqual(ids, ['f1', 'f2', 'f3', 'f4'],
      'all non-null files must be selected (reruns rebuild all)');
  });

  it('removes null entries from the file list', () => {
    const files = [null, { fileId: 'f1' }, null, { fileId: 'f2' }];
    const selected = selectFilesForExtraction(files);
    assert.equal(selected.length, 2);
    assert.ok(selected.every(f => f !== null));
  });
});

// ── 8. Retry policy backoff coefficient ───────────────────────────────────

describe('Retry policy — backoff coefficient on both orchestrators', () => {
  it('orchestratorExtraction DEFAULT_RETRY_OPTIONS has backoffCoefficient = 2', () => {
    const { DEFAULT_RETRY_OPTIONS } = require('../orchestratorExtraction');
    assert.equal(DEFAULT_RETRY_OPTIONS.backoffCoefficient, 2);
  });

  it('orchestratorAgentReview DEFAULT_RETRY_OPTIONS has backoffCoefficient = 2', () => {
    const { DEFAULT_RETRY_OPTIONS } = require('../orchestratorAgentReview');
    assert.equal(DEFAULT_RETRY_OPTIONS.backoffCoefficient, 2);
  });

  it('orchestratorExtraction firstRetryIntervalInMilliseconds = 5000', () => {
    const { DEFAULT_RETRY_OPTIONS } = require('../orchestratorExtraction');
    assert.equal(DEFAULT_RETRY_OPTIONS.firstRetryIntervalInMilliseconds, 5000);
  });
});
