'use strict';

/**
 * TRK-021 unit tests — Phase 3 shadow domain fan-out via Agents API.
 *
 * Contracts verified:
 *   1. buildDomainAgentInput — produces a well-formed Responses API input array
 *   2. runDomainFanOutViaAgentsApi — exported as async function, returns a Promise
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDomainAgentInput,
  runDomainFanOutViaAgentsApi,
  DOMAIN_CONFIGS
} = require('./arb-foundry-agent');

const minimalReview = {
  reviewId: 'rev-trk021',
  projectName: 'Contoso Landing Zone',
  customerName: 'Contoso',
  targetRegions: ['UK South'],
  workflowState: 'review',
  evidenceReadinessState: 'Ready for Review'
};

// ── 1. buildDomainAgentInput ──────────────────────────────────────────────────

describe('buildDomainAgentInput (TRK-021)', () => {
  const networkingConfig = DOMAIN_CONFIGS.find((c) => c.id === 'networking');
  const securityConfig = DOMAIN_CONFIGS.find((c) => c.id === 'security');

  it('returns an array with exactly one user-role message', () => {
    const input = buildDomainAgentInput(networkingConfig, minimalReview, [], [], [], []);
    assert.ok(Array.isArray(input), 'input must be an array');
    assert.equal(input.length, 1, 'must contain exactly one message');
    assert.equal(input[0].role, 'user', 'message role must be "user"');
  });

  it('message content is a non-empty string', () => {
    const input = buildDomainAgentInput(networkingConfig, minimalReview, [], [], [], []);
    const { content } = input[0];
    assert.ok(typeof content === 'string' && content.length > 0, 'content must be non-empty string');
  });

  it('message content includes the domain name from config', () => {
    const input = buildDomainAgentInput(networkingConfig, minimalReview, [], [], [], []);
    assert.ok(input[0].content.includes('Networking'), 'content must include the domain name');
  });

  it('message content includes the config instruction keyword', () => {
    const input = buildDomainAgentInput(networkingConfig, minimalReview, [], [], [], []);
    assert.ok(
      input[0].content.toLowerCase().includes('hub-spoke') ||
      input[0].content.toLowerCase().includes('network'),
      'content must include a networking instruction keyword'
    );
  });

  it('message content includes the project name', () => {
    const input = buildDomainAgentInput(securityConfig, minimalReview, [], [], [], []);
    assert.ok(input[0].content.includes('Contoso Landing Zone'), 'content must include project name');
  });

  it('message content includes Domain Analysis Task header', () => {
    const input = buildDomainAgentInput(networkingConfig, minimalReview, [], [], [], []);
    assert.ok(
      input[0].content.includes('CARI ARB Domain Analysis Task'),
      'content must include the domain task header'
    );
  });

  it('works for all 7 domain configs without throwing', () => {
    for (const cfg of DOMAIN_CONFIGS) {
      const input = buildDomainAgentInput(cfg, minimalReview, [], [], [], []);
      assert.ok(Array.isArray(input) && input.length === 1, `should produce one message for domain ${cfg.domain}`);
      assert.ok(input[0].content.includes(cfg.domain), `content must include domain name ${cfg.domain}`);
    }
  });

  it('handles null learnDocs gracefully', () => {
    const input = buildDomainAgentInput(networkingConfig, minimalReview, [], [], [], [], null);
    assert.ok(Array.isArray(input) && input.length === 1, 'should not throw for null learnDocs');
  });
});

// ── 2. runDomainFanOutViaAgentsApi — shape ────────────────────────────────────

describe('runDomainFanOutViaAgentsApi — exported shape (TRK-021)', () => {
  it('is exported as a function', () => {
    assert.equal(typeof runDomainFanOutViaAgentsApi, 'function');
  });

  it('returns a Promise when called', () => {
    const result = runDomainFanOutViaAgentsApi({
      review: minimalReview,
      files: [],
      requirements: [],
      evidence: [],
      visualEvidence: [],
      learnDocs: []
    });
    assert.ok(result instanceof Promise, 'must return a Promise');
    result.catch(() => {}); // suppress unhandled rejection — testing shape only
  });
});
