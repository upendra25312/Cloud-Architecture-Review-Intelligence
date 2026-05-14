'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');

describe('featureFlag — property tests', () => {
  let saved;

  before(() => { saved = process.env.USE_DURABLE_ORCHESTRATION; });
  after(() => {
    if (saved === undefined) delete process.env.USE_DURABLE_ORCHESTRATION;
    else process.env.USE_DURABLE_ORCHESTRATION = saved;
  });

  // Re-require inside each test so the module re-reads process.env at call time.
  // featureFlag reads env at call time (not at require time), so a single require is fine.
  const { getDurableFlag, shouldUseDurable } = require('../shared/featureFlag');

  it('returns ON for exact string "ON"', () => {
    process.env.USE_DURABLE_ORCHESTRATION = 'ON';
    assert.equal(getDurableFlag(), 'ON');
    assert.equal(shouldUseDurable(), true);
  });

  it('returns DRAIN for exact string "DRAIN"', () => {
    process.env.USE_DURABLE_ORCHESTRATION = 'DRAIN';
    assert.equal(getDurableFlag(), 'DRAIN');
    assert.equal(shouldUseDurable(), false);
  });

  it('returns OFF when env var is absent', () => {
    delete process.env.USE_DURABLE_ORCHESTRATION;
    assert.equal(getDurableFlag(), 'OFF');
    assert.equal(shouldUseDurable(), false);
  });

  it('returns OFF for empty string', () => {
    process.env.USE_DURABLE_ORCHESTRATION = '';
    assert.equal(getDurableFlag(), 'OFF');
    assert.equal(shouldUseDurable(), false);
  });

  it('Property: all non-"ON"/non-"DRAIN" strings return OFF (min 100 iterations) — validates req 1.4', () => {
    fc.assert(
      fc.property(
        fc.string().filter(s => s !== 'ON' && s !== 'DRAIN'),
        (s) => {
          process.env.USE_DURABLE_ORCHESTRATION = s;
          return getDurableFlag() === 'OFF' && shouldUseDurable() === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property: case-insensitive and padded variants are treated as OFF', () => {
    const variants = ['on', 'On', 'oN', 'drain', 'Drain', ' ON', 'ON ', '\tON', 'ON\n'];
    for (const v of variants) {
      process.env.USE_DURABLE_ORCHESTRATION = v;
      assert.equal(getDurableFlag(), 'OFF', `Expected OFF for "${JSON.stringify(v)}"`);
      assert.equal(shouldUseDurable(), false);
    }
  });

  it('Property: integer and numeric strings return OFF', () => {
    fc.assert(
      fc.property(fc.integer(), (n) => {
        process.env.USE_DURABLE_ORCHESTRATION = String(n);
        return getDurableFlag() === 'OFF';
      }),
      { numRuns: 50 }
    );
  });
});
