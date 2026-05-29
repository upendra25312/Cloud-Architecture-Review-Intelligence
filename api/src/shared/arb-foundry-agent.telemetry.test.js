'use strict';

/**
 * Unit tests for notifyAgentsApiTelemetry (Phase 1 telemetry bridge).
 *
 * Verifies the three required behavioral contracts:
 *   1. Returns silently when USE_AGENTS_API !== 'telemetry'
 *   2. Returns silently when FOUNDRY_AGENT_NAME is absent
 *   3. Swallows errors — Foundry failures never propagate to the caller
 *
 * All tests run without Azure credentials or network access.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
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

// ── Test 2: guard — missing agent name ───────────────────────────────────────

describe('notifyAgentsApiTelemetry — FOUNDRY_AGENT_NAME guard', () => {
  it('returns without error when FOUNDRY_AGENT_NAME is empty', async () => {
    const fn = loadTelemetryFn({
      USE_AGENTS_API: 'telemetry',
      FOUNDRY_AGENT_NAME: ''
    });
    await assert.doesNotReject(() => fn('rev-002', 'review_started', { fileCount: 1 }));
  });
});

// ── Test 3: error swallowing ──────────────────────────────────────────────────

describe('notifyAgentsApiTelemetry — error swallowing', () => {
  it('does not throw when Foundry endpoint is unconfigured', async () => {
    // With USE_AGENTS_API=telemetry and a real agent name but no endpoint,
    // the HTTP call will fail — that error must be swallowed.
    const fn = loadTelemetryFn({
      USE_AGENTS_API: 'telemetry',
      FOUNDRY_AGENT_NAME: 'cari-arb-review-agent',
      FOUNDRY_AGENT_VERSION: '7',
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
