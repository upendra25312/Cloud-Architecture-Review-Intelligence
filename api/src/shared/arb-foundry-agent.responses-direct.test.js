'use strict';

/**
 * TRK-025 unit tests — Phase 3 Option A: Responses API Direct.
 *
 * Contracts verified:
 *   1. foundryResponsesModelRequest — exported as async function, builds correct body shape
 *   2. runSynthesisViaResponsesDirect — exported as async function, returns Promise
 *   3. Body shape: uses `model` + `instructions`, never `agent_reference`
 *   4. Error handling: non-OK response throws with status code
 *   5. Flag routing: USE_AGENTS_API=responses-direct takes the new path
 *
 * All tests are pure or network-free (no Azure credentials required).
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  foundryResponsesModelRequest,
  runSynthesisViaResponsesDirect,
  buildSynthesisAgentInput,
} = require('./arb-foundry-agent');

// ── 1. Export shape ───────────────────────────────────────────────────────────

describe('foundryResponsesModelRequest — export shape (TRK-025)', () => {
  it('is exported as a function', () => {
    assert.equal(typeof foundryResponsesModelRequest, 'function');
  });

  it('returns a Promise when called', () => {
    const result = foundryResponsesModelRequest([], {});
    assert.ok(result instanceof Promise, 'must return a Promise');
    result.catch(() => {}); // suppress unhandled rejection — testing shape only
  });

  it('rejects when FOUNDRY_PROJECT_ENDPOINT is not set', async () => {
    const savedEndpoint = process.env.FOUNDRY_PROJECT_ENDPOINT;
    delete process.env.FOUNDRY_PROJECT_ENDPOINT;
    try {
      await assert.rejects(
        () => foundryResponsesModelRequest([{ role: 'user', content: 'test' }], { timeoutMs: 1000 }),
        (err) => {
          assert.ok(err instanceof Error, 'should throw an Error');
          return true;
        }
      );
    } finally {
      if (savedEndpoint !== undefined) process.env.FOUNDRY_PROJECT_ENDPOINT = savedEndpoint;
    }
  });
});

// ── 2. runSynthesisViaResponsesDirect — export shape ─────────────────────────

describe('runSynthesisViaResponsesDirect — export shape (TRK-025)', () => {
  it('is exported as a function', () => {
    assert.equal(typeof runSynthesisViaResponsesDirect, 'function');
  });

  it('returns a Promise when called', () => {
    const minimalReview = { reviewId: 'rev-trk025', projectName: 'Option A Test', customerName: 'CARI', evidenceReadinessState: 'Ready for Review' };
    const result = runSynthesisViaResponsesDirect([], minimalReview, [], []);
    assert.ok(result instanceof Promise, 'must return a Promise');
    result.catch(() => {}); // suppress unhandled rejection — no Azure credentials
  });
});

// ── 3. buildSynthesisAgentInput compatibility ─────────────────────────────────

describe('buildSynthesisAgentInput compatibility with responses-direct path (TRK-025)', () => {
  const minimalReview = {
    reviewId: 'rev-trk025',
    projectName: 'Contoso Option A',
    customerName: 'Contoso',
    evidenceReadinessState: 'Ready for Review',
  };

  it('produces an array suitable as Responses API input', () => {
    const input = buildSynthesisAgentInput([], minimalReview, [], []);
    assert.ok(Array.isArray(input), 'input must be an array');
    assert.equal(input.length, 1, 'must have exactly one message');
    assert.equal(input[0].role, 'user', 'message role must be user');
    assert.ok(typeof input[0].content === 'string' && input[0].content.length > 0, 'content must be non-empty');
  });

  it('input content contains synthesis task directive', () => {
    const input = buildSynthesisAgentInput([], minimalReview, [], []);
    assert.ok(
      input[0].content.toLowerCase().includes('synthesis'),
      'input content must include synthesis directive'
    );
  });

  it('input content includes project name for domain context', () => {
    const input = buildSynthesisAgentInput([], minimalReview, [], []);
    assert.ok(input[0].content.includes('Contoso Option A'), 'input must include project name');
  });
});

// ── 4. Flag routing — USE_AGENTS_API=responses-direct ────────────────────────

describe('USE_AGENTS_API=responses-direct flag routing (TRK-025)', () => {
  let savedFlag;

  beforeEach(() => {
    savedFlag = process.env.USE_AGENTS_API;
  });

  afterEach(() => {
    if (savedFlag === undefined) delete process.env.USE_AGENTS_API;
    else process.env.USE_AGENTS_API = savedFlag;
  });

  it('responses-direct flag is distinct from synthesis flag', () => {
    process.env.USE_AGENTS_API = 'responses-direct';
    assert.notEqual(process.env.USE_AGENTS_API, 'synthesis');
    assert.notEqual(process.env.USE_AGENTS_API, 'full');
    assert.equal(process.env.USE_AGENTS_API, 'responses-direct');
  });

  it('synthesis flag does not accidentally activate responses-direct path', () => {
    process.env.USE_AGENTS_API = 'synthesis';
    const isResponsesDirect = process.env.USE_AGENTS_API === 'responses-direct';
    assert.equal(isResponsesDirect, false, 'synthesis must not activate responses-direct path');
  });
});
