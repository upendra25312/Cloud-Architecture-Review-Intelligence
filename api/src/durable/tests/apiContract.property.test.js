'use strict';

/**
 * Property-based tests for the API contract validators.
 *
 * Uses fast-check to verify:
 * 1. Valid payloads always pass their validators (no false negatives)
 * 2. Corrupted payloads with missing/invalid required fields are rejected
 * 3. Arbitrary non-object values are always rejected
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');
const {
  validateRunAgentReview202,
  validateAgentStatusIdle,
  validateAgentStatusRunning,
  validateAgentStatusCompleted,
  validateAgentStatusFailed,
  validateExtract202,
  validateErrorResponse
} = require('./contract.test.js');

// ── Arbitrary generators ──────────────────────────────────────────────────

const nonEmptyString = fc.string({ minLength: 1 });
const isoDateString = fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') })
  .map(d => d.toISOString());

// ── runAgentReview202 ─────────────────────────────────────────────────────

describe('Property: validateRunAgentReview202', () => {
  it('accepts any valid 202 payload (min 100 iterations)', () => {
    fc.assert(
      fc.property(
        fc.record({
          reviewId: nonEmptyString,
          traceId: nonEmptyString,
          startedAt: isoDateString,
          message: nonEmptyString
        }),
        (fields) => {
          return validateRunAgentReview202({ ...fields, status: 'running' });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects any payload where status is not exactly "running"', () => {
    fc.assert(
      fc.property(
        fc.string().filter(s => s !== 'running'),
        (badStatus) => {
          const payload = {
            reviewId: 'r-1', traceId: 't-1',
            startedAt: '2026-01-01T00:00:00.000Z',
            message: 'Started', status: badStatus
          };
          return !validateRunAgentReview202(payload);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('rejects non-object values (null, number, array, string)', () => {
    for (const bad of [null, 42, 'string', [], true, undefined]) {
      assert.equal(validateRunAgentReview202(bad), false, `Expected false for ${JSON.stringify(bad)}`);
    }
  });

  it('Property: removing any required field invalidates the payload', () => {
    const base = {
      status: 'running',
      reviewId: 'r-1',
      traceId: 't-1',
      startedAt: '2026-01-01T00:00:00.000Z',
      message: 'msg'
    };
    for (const field of ['status', 'reviewId', 'traceId', 'startedAt', 'message']) {
      const bad = { ...base };
      delete bad[field];
      assert.equal(validateRunAgentReview202(bad), false, `Should reject missing ${field}`);
    }
  });
});

// ── agentStatusRunning ────────────────────────────────────────────────────

describe('Property: validateAgentStatusRunning', () => {
  it('accepts any valid running payload (min 100 iterations)', () => {
    fc.assert(
      fc.property(
        fc.record({
          reviewId: nonEmptyString,
          traceId: nonEmptyString,
          startedAt: nonEmptyString,
          message: nonEmptyString,
          elapsedMs: fc.integer({ min: 0, max: 3_600_000 })
        }),
        (fields) => {
          return validateAgentStatusRunning({ ...fields, status: 'running' });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property: negative elapsedMs always fails (min 50 iterations)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: -1 }),
        (negMs) => {
          const payload = {
            status: 'running', reviewId: 'r-1', traceId: 't-1',
            startedAt: '2026-01-01T00:00:00.000Z', message: 'Running', elapsedMs: negMs
          };
          return !validateAgentStatusRunning(payload);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ── agentStatusCompleted ──────────────────────────────────────────────────

describe('Property: validateAgentStatusCompleted', () => {
  it('accepts any valid completed payload (min 100 iterations)', () => {
    fc.assert(
      fc.property(
        fc.record({
          reviewId: nonEmptyString,
          traceId: nonEmptyString,
          startedAt: nonEmptyString,
          completedAt: nonEmptyString
        }),
        (fields) => {
          return validateAgentStatusCompleted({ ...fields, status: 'completed' });
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── agentStatusFailed ─────────────────────────────────────────────────────

describe('Property: validateAgentStatusFailed', () => {
  it('accepts any valid failed payload with non-empty error (min 100 iterations)', () => {
    fc.assert(
      fc.property(
        fc.record({
          reviewId: nonEmptyString,
          traceId: nonEmptyString,
          startedAt: nonEmptyString,
          completedAt: nonEmptyString,
          error: nonEmptyString
        }),
        (fields) => {
          return validateAgentStatusFailed({ ...fields, status: 'failed' });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property: empty error string always fails', () => {
    fc.assert(
      fc.property(nonEmptyString, nonEmptyString, (startedAt, completedAt) => {
        return !validateAgentStatusFailed({
          status: 'failed', reviewId: 'r-1', traceId: 't-1',
          startedAt, completedAt, error: ''
        });
      }),
      { numRuns: 50 }
    );
  });
});

// ── validateExtract202 ────────────────────────────────────────────────────

describe('Property: validateExtract202', () => {
  it('accepts queued and running statuses (min 100 iterations)', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant('queued'), fc.constant('running')),
        fc.integer({ min: 0, max: 100 }),
        (status, fileCount) => {
          return validateExtract202({
            reviewId: 'r-1', status, fileCount,
            extraction: { status: 'Queued' }
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property: any status other than queued/running always fails', () => {
    fc.assert(
      fc.property(
        fc.string().filter(s => s !== 'queued' && s !== 'running'),
        (badStatus) => {
          return !validateExtract202({
            reviewId: 'r-1', status: badStatus, fileCount: 0,
            extraction: { status: 'Queued' }
          });
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ── validateErrorResponse ─────────────────────────────────────────────────

describe('Property: validateErrorResponse', () => {
  it('accepts any object with a non-empty error string (min 100 iterations)', () => {
    fc.assert(
      fc.property(nonEmptyString, (error) => {
        return validateErrorResponse({ error });
      }),
      { numRuns: 100 }
    );
  });

  it('Property: any object without error field is rejected', () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.string().filter(k => k !== 'error'),
          fc.anything()
        ),
        (obj) => !validateErrorResponse(obj)
      ),
      { numRuns: 50 }
    );
  });

  it('Property: non-object primitives are always rejected', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer(), fc.float(), fc.boolean(), fc.string()),
        (primitive) => !validateErrorResponse(primitive)
      ),
      { numRuns: 50 }
    );
  });
});

// ── Cross-validator property ──────────────────────────────────────────────

describe('Property: status cross-contamination', () => {
  it('a completed payload is rejected by the running validator and vice versa', () => {
    const completed = {
      status: 'completed', reviewId: 'r-1', traceId: 't-1',
      startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:01:00.000Z'
    };
    const running = {
      status: 'running', reviewId: 'r-1', traceId: 't-1',
      startedAt: '2026-01-01T00:00:00.000Z', elapsedMs: 5000, message: 'Running'
    };
    assert.equal(validateAgentStatusRunning(completed), false);
    assert.equal(validateAgentStatusCompleted(running), false);
  });
});
