'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ── Schema validators ──────────────────────────────────────────────────────

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

function isIsoDateString(v) {
  if (typeof v !== 'string') return false;
  const d = new Date(v);
  return !isNaN(d.getTime()) && v === d.toISOString();
}

function validateRunAgentReview202(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.status !== 'running') return false;
  if (!isNonEmptyString(payload.reviewId)) return false;
  if (!isNonEmptyString(payload.traceId)) return false;
  if (!isIsoDateString(payload.startedAt)) return false;
  if (!isNonEmptyString(payload.message)) return false;
  return true;
}

function validateAgentStatusIdle(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.status !== 'idle') return false;
  if (!isNonEmptyString(payload.reviewId)) return false;
  if (!isNonEmptyString(payload.message)) return false;
  return true;
}

function validateAgentStatusRunning(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.status !== 'running') return false;
  if (!isNonEmptyString(payload.reviewId)) return false;
  if (!isNonEmptyString(payload.traceId)) return false;
  if (!isNonEmptyString(payload.startedAt)) return false;
  if (typeof payload.elapsedMs !== 'number' || payload.elapsedMs < 0) return false;
  if (!isNonEmptyString(payload.message)) return false;
  return true;
}

function validateAgentStatusCompleted(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.status !== 'completed') return false;
  if (!isNonEmptyString(payload.reviewId)) return false;
  if (!isNonEmptyString(payload.traceId)) return false;
  if (!isNonEmptyString(payload.startedAt)) return false;
  if (!isNonEmptyString(payload.completedAt)) return false;
  return true;
}

function validateAgentStatusFailed(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.status !== 'failed') return false;
  if (!isNonEmptyString(payload.reviewId)) return false;
  if (!isNonEmptyString(payload.traceId)) return false;
  if (!isNonEmptyString(payload.startedAt)) return false;
  if (!isNonEmptyString(payload.completedAt)) return false;
  if (!isNonEmptyString(payload.error)) return false;
  return true;
}

function validateExtract202(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.status !== 'queued' && payload.status !== 'running') return false;
  if (!isNonEmptyString(payload.reviewId)) return false;
  if (typeof payload.fileCount !== 'number' || payload.fileCount < 0) return false;
  if (payload.extraction === undefined) return false;
  return true;
}

function validateErrorResponse(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (!isNonEmptyString(payload.error)) return false;
  return true;
}

// ── Sample payloads ────────────────────────────────────────────────────────

const samples = {
  runAgentReview202: {
    reviewId: 'demo-review',
    traceId: '123e4567-e89b-12d3-a456-426614174000',
    status: 'running',
    startedAt: '2026-05-11T10:00:00.000Z',
    message: 'Assessment started. Poll /api/arb/reviews/{reviewId}/agent-status for progress.'
  },
  agentStatusIdle: {
    reviewId: 'demo-review',
    status: 'idle',
    message: 'No assessment has been started for this review.'
  },
  agentStatusRunning: {
    reviewId: 'demo-review',
    traceId: '123e4567-e89b-12d3-a456-426614174000',
    status: 'running',
    startedAt: '2026-05-11T10:00:00.000Z',
    elapsedMs: 12345,
    message: 'Assessment is in progress.'
  },
  agentStatusCompleted: {
    reviewId: 'demo-review',
    traceId: '123e4567-e89b-12d3-a456-426614174000',
    status: 'completed',
    startedAt: '2026-05-11T10:00:00.000Z',
    completedAt: '2026-05-11T10:02:30.000Z',
    agentReviewCompleted: true,
    fallbackUsed: false,
    findingsCount: 12,
    recommendation: 'Ready with Gaps',
    overallScore: 78,
    confidenceLevel: 'High',
    generatedAt: '2026-05-11T10:02:30.000Z',
    artifactsGenerated: 3
  },
  agentStatusFailed: {
    reviewId: 'demo-review',
    traceId: '123e4567-e89b-12d3-a456-426614174000',
    status: 'failed',
    startedAt: '2026-05-11T10:00:00.000Z',
    completedAt: '2026-05-11T10:30:00.000Z',
    error: 'Orchestration timed out after 30 minutes'
  },
  extract202: {
    reviewId: 'demo-review',
    status: 'queued',
    fileCount: 3,
    extraction: { status: 'Queued', queuedAt: '2026-05-11T10:00:00.000Z' }
  },
  error400: { error: 'Upload files before starting extraction.' },
  error404: { error: 'Review not found.' },
  error429: { error: 'Rate limit exceeded. Retry after 120s.', retryAfterSec: 120 },
  error503: { error: 'Unable to start assessment.' }
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Contract: POST /run-agent-review', () => {
  it('accepts a valid 202 payload', () => {
    assert.equal(validateRunAgentReview202(samples.runAgentReview202), true);
  });

  it('rejects missing traceId', () => {
    const bad = { ...samples.runAgentReview202, traceId: undefined };
    assert.equal(validateRunAgentReview202(bad), false);
  });

  it('rejects wrong status value', () => {
    const bad = { ...samples.runAgentReview202, status: 'completed' };
    assert.equal(validateRunAgentReview202(bad), false);
  });

  it('rejects non-ISO startedAt', () => {
    const bad = { ...samples.runAgentReview202, startedAt: '2026-05-11 10:00:00' };
    assert.equal(validateRunAgentReview202(bad), false);
  });
});

describe('Contract: GET /agent-status (idle)', () => {
  it('accepts a valid idle payload', () => {
    assert.equal(validateAgentStatusIdle(samples.agentStatusIdle), true);
  });

  it('rejects missing message', () => {
    const bad = { ...samples.agentStatusIdle };
    delete bad.message;
    assert.equal(validateAgentStatusIdle(bad), false);
  });
});

describe('Contract: GET /agent-status (running)', () => {
  it('accepts a valid running payload', () => {
    assert.equal(validateAgentStatusRunning(samples.agentStatusRunning), true);
  });

  it('rejects negative elapsedMs', () => {
    const bad = { ...samples.agentStatusRunning, elapsedMs: -1 };
    assert.equal(validateAgentStatusRunning(bad), false);
  });

  it('rejects non-numeric elapsedMs', () => {
    const bad = { ...samples.agentStatusRunning, elapsedMs: '100' };
    assert.equal(validateAgentStatusRunning(bad), false);
  });
});

describe('Contract: GET /agent-status (completed)', () => {
  it('accepts a valid completed payload', () => {
    assert.equal(validateAgentStatusCompleted(samples.agentStatusCompleted), true);
  });

  it('rejects missing completedAt', () => {
    const bad = { ...samples.agentStatusCompleted };
    delete bad.completedAt;
    assert.equal(validateAgentStatusCompleted(bad), false);
  });
});

describe('Contract: GET /agent-status (failed)', () => {
  it('accepts a valid failed payload', () => {
    assert.equal(validateAgentStatusFailed(samples.agentStatusFailed), true);
  });

  it('rejects missing error field', () => {
    const bad = { ...samples.agentStatusFailed };
    delete bad.error;
    assert.equal(validateAgentStatusFailed(bad), false);
  });

  it('rejects empty error string', () => {
    const bad = { ...samples.agentStatusFailed, error: '' };
    assert.equal(validateAgentStatusFailed(bad), false);
  });
});

describe('Contract: POST /extract', () => {
  it('accepts a valid 202 queued payload', () => {
    assert.equal(validateExtract202(samples.extract202), true);
  });

  it('accepts a running status (already in progress)', () => {
    const running = { ...samples.extract202, status: 'running' };
    assert.equal(validateExtract202(running), true);
  });

  it('rejects missing extraction object', () => {
    const bad = { ...samples.extract202 };
    delete bad.extraction;
    assert.equal(validateExtract202(bad), false);
  });

  it('rejects negative fileCount', () => {
    const bad = { ...samples.extract202, fileCount: -1 };
    assert.equal(validateExtract202(bad), false);
  });
});

describe('Contract: Error responses', () => {
  it('accepts 400 error shape', () => {
    assert.equal(validateErrorResponse(samples.error400), true);
  });

  it('accepts 404 error shape', () => {
    assert.equal(validateErrorResponse(samples.error404), true);
  });

  it('accepts 429 error shape (with retryAfterSec)', () => {
    assert.equal(validateErrorResponse(samples.error429), true);
  });

  it('accepts 503 error shape', () => {
    assert.equal(validateErrorResponse(samples.error503), true);
  });

  it('rejects payload without error field', () => {
    assert.equal(validateErrorResponse({ message: 'Something failed' }), false);
  });

  it('rejects payload with empty error string', () => {
    assert.equal(validateErrorResponse({ error: '' }), false);
  });
});

describe('Property: JSON serialization round-trip', () => {
  it('all valid samples round-trip equal', () => {
    for (const [key, sample] of Object.entries(samples)) {
      const roundTripped = JSON.parse(JSON.stringify(sample));
      assert.deepEqual(roundTripped, sample, `Sample "${key}" did not round-trip`);
    }
  });
});

module.exports = {
  validateRunAgentReview202,
  validateAgentStatusIdle,
  validateAgentStatusRunning,
  validateAgentStatusCompleted,
  validateAgentStatusFailed,
  validateExtract202,
  validateErrorResponse
};
