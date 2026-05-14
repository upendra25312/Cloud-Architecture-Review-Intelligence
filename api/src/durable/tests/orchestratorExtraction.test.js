'use strict';

/**
 * Replay tests for orchestratorExtractionWorkflow.
 *
 * Tests the fan-out generator function step-by-step with a mock context.df,
 * verifying that file-list loading → quota check → fan-out → persist occurs
 * in the correct sequence and that the result shape is correct.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  orchestratorExtractionWorkflow,
  DEFAULT_RETRY_OPTIONS,
  ORCHESTRATION_TIMEOUT_MINUTES
} = require('../orchestratorExtraction');

// ── Mock harness ───────────────────────────────────────────────────────────

function makeTask(result) {
  const task = { result, _isCancelled: false };
  task.cancel = () => { task._isCancelled = true; };
  return task;
}

function createMockContext(input, activityResults = {}) {
  const calls = [];
  let taskAllCount = 0;

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
    Task: {
      all: (tasks) => {
        taskAllCount = tasks.length;
        calls.push({ type: 'Task.all', count: tasks.length });
        // Return per-file results, or a default array
        const results = activityResults['extractSingleFile_all'] ||
          tasks.map((_, i) => ({ fileId: `f-00${i + 1}`, extractionStatus: 'Completed' }));
        return makeTask(results);
      }
    }
  };

  const context = { df, log: () => {} };
  return { context, calls, getTaskAllCount: () => taskAllCount };
}

// ── Sample data ────────────────────────────────────────────────────────────

const SAMPLE_INPUT = {
  reviewId: 'ext-review-001',
  principal: { userId: 'user-001' },
  traceId: 'trace-ext-001',
  requestedAt: '2026-01-01T00:00:00.000Z'
};

function makeFiles(count) {
  return Array.from({ length: count }, (_, i) => ({
    fileId: `f-00${i + 1}`,
    fileName: `doc${i + 1}.pdf`,
    extractionStatus: 'Pending'
  }));
}

// ── Helper: drive the extraction workflow ─────────────────────────────────

function driveExtractionWorkflow(gen, files, extractionResults, persistResult) {
  const fileList = { files };
  const quotaResult = { quotaOk: true, diEligibleCount: files.length };

  // Step 1: loadFilesForExtraction
  gen.next();
  // Step 2: checkDiQuota
  gen.next(fileList);
  // Step 3: extractSingleFile fan-out (Task.all)
  gen.next(quotaResult);
  // Step 4: persistExtractionResults
  gen.next(extractionResults || files.map(f => ({ ...f, extractionStatus: 'Completed' })));
  // Return
  const final = gen.next(persistResult || { indexedChunks: 10 });
  return final;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('orchestratorExtractionWorkflow — replay tests', () => {

  it('calls activities in the correct sequence for 3 files', () => {
    const { context, calls } = createMockContext(SAMPLE_INPUT);
    const gen = orchestratorExtractionWorkflow(context);
    driveExtractionWorkflow(gen, makeFiles(3));

    const activityNames = calls.map(c => c.name).filter(Boolean);
    // loadFilesForExtraction → checkDiQuota → extractSingleFile×3 → persistExtractionResults
    assert.equal(activityNames[0], 'loadFilesForExtraction');
    assert.equal(activityNames[1], 'checkDiQuota');
    // fan-out: extractSingleFile scheduled once per file before Task.all yield
    assert.equal(activityNames[2], 'extractSingleFile');
    assert.equal(activityNames[activityNames.length - 1], 'persistExtractionResults');
  });

  it('loadFilesForExtraction is called with reviewId and principal', () => {
    const { context, calls } = createMockContext(SAMPLE_INPUT);
    const gen = orchestratorExtractionWorkflow(context);
    gen.next(); // first yield

    const loadCall = calls.find(c => c.name === 'loadFilesForExtraction');
    assert.ok(loadCall);
    assert.equal(loadCall.input.reviewId, SAMPLE_INPUT.reviewId);
    assert.deepEqual(loadCall.input.principal, SAMPLE_INPUT.principal);
  });

  it('checkDiQuota receives the file list from loadFilesForExtraction', () => {
    const files = makeFiles(2);
    const { context, calls } = createMockContext(SAMPLE_INPUT);
    const gen = orchestratorExtractionWorkflow(context);
    gen.next(); // loadFilesForExtraction
    gen.next({ files }); // checkDiQuota receives file list

    const quotaCall = calls.find(c => c.name === 'checkDiQuota');
    assert.ok(quotaCall);
    assert.deepEqual(quotaCall.input.files, files);
  });

  it('fan-out creates exactly N extractSingleFile tasks for N files', () => {
    const N = 5;
    const { context, getTaskAllCount } = createMockContext(SAMPLE_INPUT);
    const gen = orchestratorExtractionWorkflow(context);
    driveExtractionWorkflow(gen, makeFiles(N));
    assert.equal(getTaskAllCount(), N);
  });

  it('fan-out creates 0 tasks for empty file list', () => {
    const { context, getTaskAllCount } = createMockContext(SAMPLE_INPUT);
    const gen = orchestratorExtractionWorkflow(context);
    driveExtractionWorkflow(gen, []);
    assert.equal(getTaskAllCount(), 0);
  });

  it('returns correct shape with fileCount, successCount, errorCount', () => {
    const files = makeFiles(3);
    const extractionResults = [
      { fileId: 'f-001', extractionStatus: 'Completed' },
      { fileId: 'f-002', extractionStatus: 'Completed' },
      { fileId: 'f-003', extractionStatus: 'Failed' }
    ];
    const { context } = createMockContext(SAMPLE_INPUT, {
      extractSingleFile_all: extractionResults
    });
    const gen = orchestratorExtractionWorkflow(context);
    const final = driveExtractionWorkflow(gen, files, extractionResults, { indexedChunks: 5 });

    assert.equal(final.done, true);
    const result = final.value;
    assert.equal(result.extractionCompleted, true);
    assert.equal(result.fileCount, 3);
    assert.equal(result.successCount, 2);
    assert.equal(result.errorCount, 1);
    assert.equal(result.indexedChunks, 5);
  });

  it('returns fileCount=0 and all counts 0 for empty file list', () => {
    const { context } = createMockContext(SAMPLE_INPUT, {
      extractSingleFile_all: []
    });
    const gen = orchestratorExtractionWorkflow(context);
    const final = driveExtractionWorkflow(gen, [], [], { indexedChunks: 0 });

    assert.equal(final.value.fileCount, 0);
    assert.equal(final.value.successCount, 0);
    assert.equal(final.value.errorCount, 0);
  });

  it('all activities use callActivityWithRetry (except via Task.all)', () => {
    const { context, calls } = createMockContext(SAMPLE_INPUT);
    const gen = orchestratorExtractionWorkflow(context);
    driveExtractionWorkflow(gen, makeFiles(2));

    const namedCalls = calls.filter(c => c.name);
    for (const call of namedCalls) {
      assert.equal(call.type, 'callActivityWithRetry',
        `${call.name} should use callActivityWithRetry`);
    }
  });
});

describe('orchestratorExtraction constants', () => {
  it('DEFAULT_RETRY_OPTIONS has maxNumberOfAttempts = 3', () => {
    assert.equal(DEFAULT_RETRY_OPTIONS.maxNumberOfAttempts, 3);
  });

  it('ORCHESTRATION_TIMEOUT_MINUTES is 30', () => {
    assert.equal(ORCHESTRATION_TIMEOUT_MINUTES, 30);
  });
});
