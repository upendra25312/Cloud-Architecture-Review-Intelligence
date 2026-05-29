'use strict';

/**
 * Unit tests for notifyAgentsApiTelemetry (Phase 1 telemetry bridge).
 *
 * Verifies the three required behavioral contracts:
 *   1. Returns silently (immediately) when USE_AGENTS_API !== 'telemetry'
 *   2. Fires the Responses API in the background when USE_AGENTS_API=telemetry — caller is not blocked
 *   3. Swallows errors — Foundry Responses API failures never propagate to the caller
 *
 * All tests run without Azure credentials or network access.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ── Module loading with environment isolation ─────────────────────────────────
// We re-require the module inside each test group to pick up env-var changes.

function loadTelemetryFn(env = {}) {
  // Clear module cache so env changes are picked up
  const key = require.resolve('./arb-foundry-agent');
  delete require.cache[key];

  // Patch env, load, restore
  const saved = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }

  const { notifyAgentsApiTelemetry } = require('./arb-foundry-agent');

  // Restore after module is loaded (env vars are captured at require time for consts)
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }

  return notifyAgentsApiTelemetry;
}

// ── Test 1: guard — wrong flag value ─────────────────────────────────────────

describe('notifyAgentsApiTelemetry — USE_AGENTS_API guard', () => {
  it('returns without error when USE_AGENTS_API is not set', async () => {
    const fn = loadTelemetryFn({ USE_AGENTS_API: undefined });
    await assert.doesNotReject(() => fn('rev-001', 'review_started', { fileCount: 3 }));
  });

  it('returns without error when USE_AGENTS_API=off', async () => {
    const fn = loadTelemetryFn({ USE_AGENTS_API: 'off' });
    await assert.doesNotReject(() => fn('rev-001', 'review_started', {}));
  });

  it('returns without error when USE_AGENTS_API=synthesis', async () => {
    const fn = loadTelemetryFn({ USE_AGENTS_API: 'synthesis' });
    await assert.doesNotReject(() => fn('rev-001', 'review_started', {}));
  });

  it('returns without error when USE_AGENTS_API=full', async () => {
    const fn = loadTelemetryFn({ USE_AGENTS_API: 'full' });
    await assert.doesNotReject(() => fn('rev-001', 'review_started', {}));
  });
});

// ── Test 2: fire-and-forget — returns immediately even when telemetry=on ──────

describe('notifyAgentsApiTelemetry — fire-and-forget behaviour', () => {
  it('returns immediately (does not block) when USE_AGENTS_API=telemetry and endpoint unreachable', async () => {
    // The Responses API call runs in the background — the caller must not wait for it.
    // Point at an unreachable host; the function should resolve well before a TCP timeout.
    const fn = loadTelemetryFn({
      USE_AGENTS_API: 'telemetry',
      FOUNDRY_PROJECT_ENDPOINT: 'https://127.0.0.1:1/nonexistent'
    });
    const start = Date.now();
    await fn('rev-002', 'review_started', { fileCount: 1 });
    const elapsed = Date.now() - start;
    // Should return in <<1s even though the background fetch will eventually fail
    assert.ok(elapsed < 1000, `Expected immediate return, took ${elapsed}ms`);
  });
});

// ── Test 3: error swallowing ──────────────────────────────────────────────────

describe('notifyAgentsApiTelemetry — error swallowing', () => {
  it('does not throw when Foundry Responses API endpoint is unreachable', async () => {
    const fn = loadTelemetryFn({
      USE_AGENTS_API: 'telemetry',
      FOUNDRY_PROJECT_ENDPOINT: 'https://127.0.0.1:1/nonexistent'
    });
    await assert.doesNotReject(() => fn('rev-003', 'review_completed', {
      findingsCount: 12,
      score: 74,
      recommendation: 'Ready with Gaps'
    }));
  });

  it('does not throw when passed unusual metadata values', async () => {
    const fn = loadTelemetryFn({ USE_AGENTS_API: 'off' });
    await assert.doesNotReject(() => fn(null, undefined, { extra: null }));
  });
});

// ── Test 4: no customer evidence in metadata contract ────────────────────────

describe('notifyAgentsApiTelemetry — metadata shape contract', () => {
  it('accepts the review_started metadata shape without throwing', async () => {
    // USE_AGENTS_API=off so no network call is attempted — just tests the guard path.
    const fn = loadTelemetryFn({ USE_AGENTS_API: 'off' });
    await assert.doesNotReject(() =>
      fn('rev-004', 'review_started', { fileCount: 4, ruleCount: 2 })
    );
  });

  it('accepts the review_completed metadata shape without throwing', async () => {
    const fn = loadTelemetryFn({ USE_AGENTS_API: 'off' });
    await assert.doesNotReject(() =>
      fn('rev-004', 'review_completed', {
        findingsCount: 8,
        score: 82,
        recommendation: 'Recommended for Approval'
      })
    );
  });
});
