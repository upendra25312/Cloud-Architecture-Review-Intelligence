'use strict';

/**
 * Reads USE_DURABLE_ORCHESTRATION from process.env at call time.
 * Returns 'ON' if value is exactly "ON", 'DRAIN' if value is exactly "DRAIN",
 * otherwise returns 'OFF' (for absent, empty, unrecognized, or mixed case values).
 * @returns {'ON' | 'OFF' | 'DRAIN'}
 */
function getDurableFlag() {
  const value = process.env.USE_DURABLE_ORCHESTRATION;
  if (value === 'ON') return 'ON';
  if (value === 'DRAIN') return 'DRAIN';
  return 'OFF';
}

/**
 * Returns true only when getDurableFlag() returns 'ON'.
 * @returns {boolean}
 */
function shouldUseDurable() {
  return getDurableFlag() === 'ON';
}

module.exports = { getDurableFlag, shouldUseDurable };
