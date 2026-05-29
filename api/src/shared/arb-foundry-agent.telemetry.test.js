'use strict';

/**
 * Unit tests for notifyAgentsApiTelemetry (Phase 1 telemetry bridge).
 *
 * Verifies the three required behavioral contracts:
 *   1. Returns silently when USE_AGENTS_API !== 'telemetry'
 *   2. Returns silently when FOUNDRY_AGENT_ID is absent (Agents API requires the actual GUID)
 *   3. Swallows errors — Foundry Agents API failures never propagate to the caller
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

// ── Test 2: guard — missing agent ID ─────────────────────────────────────────

describe('notifyAgentsApiTelemetry — FOUNDRY_AGENT_ID guard', () => {
  it('returns without error when FOUNDRY_AGENT_ID is empty', async () => {
    // The Agents API requires the actual agent GUID (from KeyVault). If the
    // GUID is absent (e.g. KeyVault reference not yet resolved), telemetry
    // must be a no-op rather than attempting an unauthenticated API call.
    const fn = loadTelemetryFn({
      USE_AGENTS_API: 'telemetry',
      FOUNDRY_AGENT_ID: ''
    });
    await assert.doesNotReject(() => fn('rev-002', 'review_started', { fileCount: 1 }));
  });
});

// ── Test 3: error swallowing ──────────────────────────────────────────────────

describe('notifyAgentsApiTelemetry — error swallowing', () => {
  it('does not throw when Foundry Agents API endpoint is unreachable', async () => {
    // FOUNDRY_AGENT_ID must be set to pass the guard so the HTTP calls are
    // actually attempted. The connection to 127.0.0.1:1 will fail — that
    // network error must be swallowed and never propagate to the caller.
    const fn = loadTelemetryFn({
      USE_AGENTS_API: 'telemetry',
      FOUNDRY_AGENT_ID: 'test-agent-guid-0000',
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
