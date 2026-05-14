'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');
const { computeInstanceId } = require('../shared/instanceId');

const HEX_48_RE = /^[0-9a-f]{48}$/;

describe('instanceId — property tests', () => {

  it('Property 1: output is exactly 48 lowercase hex chars for any string inputs (min 100 iterations) — validates req 2.4, 6.1, 6.2, 6.3', () => {
    fc.assert(
      fc.property(
        fc.string(), fc.string(), fc.string(),
        (prefix, reviewId, userId) => {
          const id = computeInstanceId(prefix, reviewId, userId);
          return HEX_48_RE.test(id);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 2: same inputs always produce the same output — determinism (min 100 iterations)', () => {
    fc.assert(
      fc.property(
        fc.string(), fc.string(), fc.string(),
        (prefix, reviewId, userId) => {
          return computeInstanceId(prefix, reviewId, userId) === computeInstanceId(prefix, reviewId, userId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('different prefix produces a different ID', () => {
    assert.notEqual(
      computeInstanceId('review', 'rid-001', 'user-001'),
      computeInstanceId('extraction', 'rid-001', 'user-001')
    );
  });

  it('different reviewId produces a different ID', () => {
    assert.notEqual(
      computeInstanceId('review', 'rid-001', 'user-001'),
      computeInstanceId('review', 'rid-002', 'user-001')
    );
  });

  it('different userId produces a different ID', () => {
    assert.notEqual(
      computeInstanceId('review', 'rid-001', 'user-001'),
      computeInstanceId('review', 'rid-001', 'user-002')
    );
  });

  it('empty string inputs produce a valid 48-char hex ID', () => {
    const id = computeInstanceId('', '', '');
    assert.match(id, HEX_48_RE);
  });

  it('Unicode and special characters produce a valid 48-char hex ID', () => {
    const id = computeInstanceId('review/v2', 'rid-日本語-001', 'user@domain.com');
    assert.match(id, HEX_48_RE);
  });

  it('Property: no two distinct (prefix, reviewId, userId) tuples collide in 500 samples', () => {
    const seen = new Set();
    let collisions = 0;
    fc.assert(
      fc.property(
        fc.tuple(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), fc.string({ minLength: 1 })),
        ([prefix, reviewId, userId]) => {
          const id = computeInstanceId(prefix, reviewId, userId);
          const key = `${prefix}:${reviewId}:${userId}`;
          if (seen.has(key)) return true; // same input, same output is fine
          seen.add(key);
          if (seen.has(id)) { collisions++; }
          seen.add(id);
          return true; // We track collisions separately; SHA-256 truncation is still collision-resistant
        }
      ),
      { numRuns: 500 }
    );
    // With SHA-256 truncated to 48 hex chars (192 bits), collision probability is negligible
    assert.equal(collisions, 0, `Unexpected collision count: ${collisions}`);
  });
});
