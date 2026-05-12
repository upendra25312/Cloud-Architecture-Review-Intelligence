'use strict';

const crypto = require('crypto');

/**
 * Generates a deterministic, hex-safe instance ID.
 * Computes SHA-256 of "{prefix}:{reviewId}:{userId}" and returns the first 48 hex characters.
 * @param {string} prefix - e.g. 'review' or 'extraction'
 * @param {string} reviewId
 * @param {string} userId
 * @returns {string} First 48 hex chars of the SHA-256 digest
 */
function computeInstanceId(prefix, reviewId, userId) {
  const input = `${prefix}:${reviewId}:${userId}`;
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  return hash.slice(0, 48);
}

module.exports = { computeInstanceId };
