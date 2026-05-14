'use strict';

/**
 * Replay tests for orchestratorAgentReviewWorkflow.
 *
 * Tests the generator function directly by driving it step-by-step with a
 * mock `context.df` object — the canonical approach for Durable Functions
 * orchestrator testing outside a live Functions host.
 *
 * Each `gen.next(value)` call resumes the generator and provides the result
 * that the previous `yield` expression evaluates to, mirroring what the
 * Durable Functions runtime does during orchestration replay.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  orchestratorAgentReviewWorkflow,
  DEFAULT_RETRY_OPTIONS,
  ORCHESTRATION_TIMEOUT_MINUTES
} = require('../orchestratorAgentReview');

// ── Mock harness ───────────────────────────────────────────────────────────

function makeTask(result) {
  const task = { result, _isCancelled: false };
  task.cancel = () => { task._isCancelled = true; };
  return task;
}

/**
 * Creates a mock context.df with recorded calls.
 * activityResults maps activity name → result value returned to the orchestrator.
 */
function createMockContext(input, activityResults = {}) {
  const calls = [];

  const df = {
    getInput: () => input,
    currentUtcDateTime: new Date('2026-01-01T00:00:00.000Z'),
    callActivityWithRetry: (name, retryOptions, activityInput) => {
      calls.push({ type: 'callActivityWithRetry', name, input: activityInput });
      return makeTask(activityResults[name] ?? {});
    },
    callActivity: (name, activityInput) => {
      calls.push({ type: 'callActivity', name, input: activityInput });
      return makeTask(activityResults[name] ?? {});
    },
    callSubOrchestrator: (name, orchInput) => {
      calls.push({ type: 'callSubOrchestrator', name, input: orchInput });
      return makeTask(activityResults[name] ?? {});
    },
    createTimer: (date) => {
      calls.push({ type: 'createTimer', date });
      return makeTask(null);
    },
    Task: {
      any: (tasks) => {
        calls.push({ type: 'Task.any', count: tasks.length });
        // Default: first task wins (workflow wins over timer)
        return makeTask(tasks[0]);
      },
      all: (tasks) => {
        calls.push({ type: 'Task.all', count: tasks.length });
        return makeTask(tasks.map(t => t.result));
      }
    }
  };

  const context = { df, log: () => {} };
  return { context, calls };
}

// ── Sample data ────────────────────────────────────────────────────────────

const SAMPLE_INPUT = {
  reviewId: 'test-review-001',
  principal: { userId: 'user-001', name: 'Test User' },
  traceId: 'trace-abc-123'
};

const SAMPLE_REVIEW_DATA = {
  review: { reviewId: 'test-review-001', workflowState: 'Review In Progress' },
  files: [{ fileId: 'f-001', fileName: 'arch.pdf', extractionStatus: 'Completed' }],
  requirements: [{ id: 'req-001', text: 'Must use Managed Identity' }],
  evidence: [{ id: 'ev-001', text: 'Managed Identity configured' }],
  visualEvidence: [],
  actions: []
};

const SAMPLE_SEARCH_RESULT = { searchChunks: ['chunk-1', 'chunk-2'] };

const SAMPLE_RULES_RESULT = {
  ruleFindings: [{ id: 'rule-001', severity: 'High', domain: 'Security' }],
  ruleBlockers: [],
  criticalBlockerCount: 0
};

const SAMPLE_AGENT_RESULT_WRAPPER = {
  agentResult: {
    findings: [],
    scorecard: { overallScore: 85, confidenceLevel: 'High' },
    recommendation: 'Approved',
    fallbackUsed: false
  }
};

const SAMPLE_PERSIST_RESULT = {
  persisted: true,
  findingsCount: 1,
  overallScore: 85,
  recommendation: 'Approved'
};

const SAMPLE_SYNC_RESULT = { artifactsGenerated: 3 };

// ── Helper: drive workflow to completion ──────────────────────────────────

function driveWorkflowToCompletion(gen, activityResults) {
  const map = activityResults;
  // Step through each yield in the workflow:
  // 1. loadReviewData
  gen.next();
  // 2. runSearch
  gen.next(map.loadReviewData);
  // 3. runRules
  gen.next(map.runSearch);
  // 4. runAgent
  gen.next(map.runRules);
  // 5. persistResults
  gen.next(map.runAgent);
  // 6. syncOutputs
  gen.next(map.persistResults);
  // Return value
  const final = gen.next(map.syncOutputs);
  return final;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('orchestratorAgentReviewWorkflow — replay tests', () => {

  it('calls activities in the correct sequence', () => {
    const { context, calls } = createMockContext(SAMPLE_INPUT);
    const gen = orchestratorAgentReviewWorkflow(context);

    driveWorkflowToCompletion(gen, {
      loadReviewData: SAMPLE_REVIEW_DATA,
      runSearch: SAMPLE_SEARCH_RESULT,
      runRules: SAMPLE_RULES_RESULT,
      runAgent: SAMPLE_AGENT_RESULT_WRAPPER,
      persistResults: SAMPLE_PERSIST_RESULT,
      syncOutputs: SAMPLE_SYNC_RESULT
    });

    const activityNames = calls.map(c => c.name);
    assert.deepEqual(activityNames, [
      'loadReviewData',
      'runSearch',
      'runRules',
      'runAgent',
      'persistResults',
      'syncOutputs'
    ]);
  });

  it('loadReviewData is called with the correct reviewId and principal', () => {
    const { context, calls } = createMockContext(SAMPLE_INPUT);
    const gen = orchestratorAgentReviewWorkflow(context);
    gen.next(); // trigger first yield

    const loadCall = calls.find(c => c.name === 'loadReviewData');
    assert.ok(loadCall, 'loadReviewData was not called');
    assert.equal(loadCall.input.reviewId, SAMPLE_INPUT.reviewId);
    assert.deepEqual(loadCall.input.principal, SAMPLE_INPUT.principal);
  });

  it('runSearch receives reviewData fields from loadReviewData output', () => {
    const { context, calls } = createMockContext(SAMPLE_INPUT);
    const gen = orchestratorAgentReviewWorkflow(context);
    gen.next(); // loadReviewData yield
    gen.next(SAMPLE_REVIEW_DATA); // runSearch yield — pass loadReviewData result

    const searchCall = calls.find(c => c.name === 'runSearch');
    assert.ok(searchCall);
    assert.deepEqual(searchCall.input.review, SAMPLE_REVIEW_DATA.review);
    assert.deepEqual(searchCall.input.requirements, SAMPLE_REVIEW_DATA.requirements);
    assert.equal(searchCall.input.reviewId, SAMPLE_INPUT.reviewId);
  });

  it('runAgent is called without retry (no retryOptions argument)', () => {
    const { context, calls } = createMockContext(SAMPLE_INPUT);
    const gen = orchestratorAgentReviewWorkflow(context);
    gen.next();
    gen.next(SAMPLE_REVIEW_DATA);
    gen.next(SAMPLE_SEARCH_RESULT);
    gen.next(SAMPLE_RULES_RESULT); // runAgent yield

    const agentCall = calls.find(c => c.name === 'runAgent');
    assert.ok(agentCall);
    // runAgent uses callActivity (not callActivityWithRetry)
    assert.equal(agentCall.type, 'callActivity');
  });

  it('loadReviewData and runRules use callActivityWithRetry', () => {
    const { context, calls } = createMockContext(SAMPLE_INPUT);
    const gen = orchestratorAgentReviewWorkflow(context);
    gen.next();
    gen.next(SAMPLE_REVIEW_DATA);
    gen.next(SAMPLE_SEARCH_RESULT);
    gen.next(SAMPLE_RULES_RESULT);

    const loadCall = calls.find(c => c.name === 'loadReviewData');
    const rulesCall = calls.find(c => c.name === 'runRules');
    assert.equal(loadCall.type, 'callActivityWithRetry');
    assert.equal(rulesCall.type, 'callActivityWithRetry');
  });

  it('returns correct shape on success', () => {
    const { context } = createMockContext(SAMPLE_INPUT);
    const gen = orchestratorAgentReviewWorkflow(context);

    const final = driveWorkflowToCompletion(gen, {
      loadReviewData: SAMPLE_REVIEW_DATA,
      runSearch: SAMPLE_SEARCH_RESULT,
      runRules: SAMPLE_RULES_RESULT,
      runAgent: SAMPLE_AGENT_RESULT_WRAPPER,
      persistResults: SAMPLE_PERSIST_RESULT,
      syncOutputs: SAMPLE_SYNC_RESULT
    });

    assert.equal(final.done, true);
    const result = final.value;
    assert.equal(result.agentReviewCompleted, true);
    assert.equal(typeof result.findingsCount, 'number');
    assert.equal(typeof result.generatedAt, 'string');
    assert.equal(result.fallbackUsed, false);
    assert.equal(result.artifactsGenerated, 3);
  });

  it('reports fallbackUsed:true when agent returns fallback', () => {
    const { context } = createMockContext(SAMPLE_INPUT);
    const gen = orchestratorAgentReviewWorkflow(context);

    const final = driveWorkflowToCompletion(gen, {
      loadReviewData: SAMPLE_REVIEW_DATA,
      runSearch: SAMPLE_SEARCH_RESULT,
      runRules: SAMPLE_RULES_RESULT,
      runAgent: { agentResult: { ...SAMPLE_AGENT_RESULT_WRAPPER.agentResult, fallbackUsed: true } },
      persistResults: SAMPLE_PERSIST_RESULT,
      syncOutputs: SAMPLE_SYNC_RESULT
    });

    assert.equal(final.value.fallbackUsed, true);
  });

  it('propagates findingsCount and recommendation from persistResults', () => {
    const { context } = createMockContext(SAMPLE_INPUT);
    const gen = orchestratorAgentReviewWorkflow(context);

    const final = driveWorkflowToCompletion(gen, {
      loadReviewData: SAMPLE_REVIEW_DATA,
      runSearch: SAMPLE_SEARCH_RESULT,
      runRules: SAMPLE_RULES_RESULT,
      runAgent: SAMPLE_AGENT_RESULT_WRAPPER,
      persistResults: { persisted: true, findingsCount: 17, overallScore: 91, recommendation: 'Approved with Conditions' },
      syncOutputs: SAMPLE_SYNC_RESULT
    });

    assert.equal(final.value.findingsCount, 17);
    assert.equal(final.value.overallScore, 91);
    assert.equal(final.value.recommendation, 'Approved with Conditions');
  });

  it('handles null/undefined agent result gracefully', () => {
    const { context } = createMockContext(SAMPLE_INPUT);
    const gen = orchestratorAgentReviewWorkflow(context);

    assert.doesNotThrow(() => {
      driveWorkflowToCompletion(gen, {
        loadReviewData: SAMPLE_REVIEW_DATA,
        runSearch: SAMPLE_SEARCH_RESULT,
        runRules: SAMPLE_RULES_RESULT,
        runAgent: { agentResult: null },
        persistResults: { persisted: true, findingsCount: 0 },
        syncOutputs: {}
      });
    });
  });
});

describe('orchestratorAgentReview constants', () => {
  it('DEFAULT_RETRY_OPTIONS has maxNumberOfAttempts = 3', () => {
    assert.equal(DEFAULT_RETRY_OPTIONS.maxNumberOfAttempts, 3);
  });

  it('DEFAULT_RETRY_OPTIONS has firstRetryIntervalInMilliseconds = 5000', () => {
    assert.equal(DEFAULT_RETRY_OPTIONS.firstRetryIntervalInMilliseconds, 5000);
  });

  it('ORCHESTRATION_TIMEOUT_MINUTES is 30', () => {
    assert.equal(ORCHESTRATION_TIMEOUT_MINUTES, 30);
  });
});
