'use strict';

/**
 * Property-based tests for the extraction fan-out pattern.
 *
 * Validates that for any valid file list, the orchestrator creates exactly
 * one extractSingleFile task per file, and that success/error counts are
 * consistent with the extraction results.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');
const { orchestratorExtractionWorkflow } = require('../orchestratorExtraction');

// ── Helpers ────────────────────────────────────────────────────────────────

function makeTask(result) {
  return { result, cancel: () => {} };
}

/**
 * Creates a mock df context that captures the Task.all fan-out count.
 * @param {object[]} files - file list to return from loadFilesForExtraction
 * @param {object[]} extractionResults - per-file results for Task.all
 * @param {object} persistResult
 */
function createFanoutContext(files, extractionResults, persistResult = { indexedChunks: 0 }) {
  let fanoutCount = 0;

  const df = {
    getInput: () => ({ reviewId: 'prop-review', principal: { userId: 'prop-user' } }),
    currentUtcDateTime: new Date('2026-01-01T00:00:00.000Z'),
    callActivityWithRetry: (name) => {
      if (name === 'loadFilesForExtraction') return makeTask({ files });
      if (name === 'checkDiQuota') return makeTask({ quotaOk: true, diEligibleCount: files.length });
      if (name === 'persistExtractionResults') return makeTask(persistResult);
      return makeTask({});
    },
    callActivity: () => makeTask({}),
    Task: {
      all: (tasks) => {
        fanoutCount = tasks.length;
        return makeTask(extractionResults);
      }
    }
  };

  return { context: { df, log: () => {} }, getFanoutCount: () => fanoutCount };
}

function driveGen(gen, files, extractionResults, persistResult) {
  gen.next();
  gen.next({ files });
  gen.next({ quotaOk: true });
  gen.next(extractionResults);
  return gen.next(persistResult || { indexedChunks: 0 });
}

// ── Properties ─────────────────────────────────────────────────────────────

describe('fanout — property tests', () => {

  it('Property: fan-out task count equals file list length for any list size 0-50', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        (count) => {
          const files = Array.from({ length: count }, (_, i) => ({
            fileId: `f-${i}`,
            fileName: `doc${i}.pdf`,
            extractionStatus: 'Pending'
          }));
          const extractionResults = files.map(f => ({ ...f, extractionStatus: 'Completed' }));
          const { context, getFanoutCount } = createFanoutContext(files, extractionResults);
          const gen = orchestratorExtractionWorkflow(context);
          driveGen(gen, files, extractionResults);
          return getFanoutCount() === count;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('Property: successCount + errorCount = fileCount for any completion pattern', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(fc.constant('Completed'), fc.constant('Failed')),
          { minLength: 0, maxLength: 20 }
        ),
        (statuses) => {
          const files = statuses.map((_, i) => ({
            fileId: `f-${i}`, fileName: `doc${i}.pdf`, extractionStatus: 'Pending'
          }));
          const extractionResults = statuses.map((s, i) => ({
            fileId: `f-${i}`, extractionStatus: s
          }));
          const { context } = createFanoutContext(files, extractionResults, { indexedChunks: 0 });
          const gen = orchestratorExtractionWorkflow(context);
          const final = driveGen(gen, files, extractionResults, { indexedChunks: 0 });
          const r = final.value;
          return r.successCount + r.errorCount === r.fileCount &&
                 r.fileCount === statuses.length;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property: extractionCompleted is always true on successful workflow completion', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 }),
        (count) => {
          const files = Array.from({ length: count }, (_, i) => ({
            fileId: `f-${i}`, extractionStatus: 'Pending'
          }));
          const extractionResults = files.map(f => ({ ...f, extractionStatus: 'Completed' }));
          const { context } = createFanoutContext(files, extractionResults);
          const gen = orchestratorExtractionWorkflow(context);
          const final = driveGen(gen, files, extractionResults);
          return final.value.extractionCompleted === true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('Property: indexedChunks from persistResult propagates to the return value', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10000 }),
        (chunks) => {
          const files = [{ fileId: 'f-0', extractionStatus: 'Pending' }];
          const extractionResults = [{ fileId: 'f-0', extractionStatus: 'Completed' }];
          const { context } = createFanoutContext(files, extractionResults, { indexedChunks: chunks });
          const gen = orchestratorExtractionWorkflow(context);
          const final = driveGen(gen, files, extractionResults, { indexedChunks: chunks });
          return final.value.indexedChunks === chunks;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property: fileCount always equals the number of files passed to loadFilesForExtraction', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 30 }),
        (count) => {
          const files = Array.from({ length: count }, (_, i) => ({ fileId: `f-${i}` }));
          const extractionResults = files.map(f => ({ ...f, extractionStatus: 'Completed' }));
          const { context } = createFanoutContext(files, extractionResults);
          const gen = orchestratorExtractionWorkflow(context);
          const final = driveGen(gen, files, extractionResults);
          return final.value.fileCount === count;
        }
      ),
      { numRuns: 100 }
    );
  });
});
