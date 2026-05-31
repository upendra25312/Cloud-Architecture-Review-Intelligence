'use strict';

/**
 * TRK-019 unit tests — Phase 2 synthesis call migration.
 *
 * Contracts verified:
 *   1. parseSynthesisResponse — pure JSON parsing with clamping, recovery, and null handling
 *   2. buildSynthesisAgentInput — produces a well-formed Responses API input array
 *   3. runSynthesisViaAgentsApi / runSynthesisViaChatCompletions — exported as async functions
 *
 * All tests are pure or network-free (no Azure credentials required).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  parseSynthesisResponse,
  buildSynthesisAgentInput,
  runSynthesisViaAgentsApi,
  runSynthesisViaChatCompletions
} = require('./arb-foundry-agent');

// ── 1. parseSynthesisResponse ─────────────────────────────────────────────────

describe('parseSynthesisResponse (TRK-019)', () => {
  it('returns null for empty string', () => {
    assert.equal(parseSynthesisResponse(''), null);
  });

  it('returns null for null', () => {
    assert.equal(parseSynthesisResponse(null), null);
  });

  it('returns null for invalid JSON with no recoverable braces', () => {
    assert.equal(parseSynthesisResponse('not json at all'), null);
  });

  it('parses a complete valid synthesis JSON object', () => {
    const payload = JSON.stringify({
      reviewSummary: 'Strong landing zone with some gaps.',
      strengths: ['Hub-spoke topology', 'Azure Firewall deployed'],
      recommendation: 'Ready with Gaps',
      nextActions: ['Address backup strategy (Reliability Lead)', 'Add DR runbook (Ops Lead)'],
      requirementsCoverage: { score: 75, rationale: '6 of 8 requirements validated.', blockers: [] },
      documentationCompleteness: { score: 60, rationale: '3 docs uploaded.', blockers: [] }
    });
    const result = parseSynthesisResponse(payload);
    assert.ok(result, 'Should return non-null for valid JSON');
    assert.equal(result.reviewSummary, 'Strong landing zone with some gaps.');
    assert.deepEqual(result.strengths, ['Hub-spoke topology', 'Azure Firewall deployed']);
    assert.equal(result.recommendation, 'Ready with Gaps');
    assert.equal(result.nextActions.length, 2);
  });

  it('parses requirementsCoverage and documentationCompleteness dimensions', () => {
    const payload = JSON.stringify({
      reviewSummary: 'Test.',
      recommendation: 'Ready with Gaps',
      requirementsCoverage: { score: 75, rationale: 'Six of eight validated.', blockers: [] },
      documentationCompleteness: { score: 60, rationale: 'Three docs.', blockers: ['Missing DR runbook'] }
    });
    const result = parseSynthesisResponse(payload);
    assert.equal(result.requirementsCoverage.score, 75);
    assert.equal(result.requirementsCoverage.rationale, 'Six of eight validated.');
    assert.equal(result.documentationCompleteness.score, 60);
    assert.deepEqual(result.documentationCompleteness.blockers, ['Missing DR runbook']);
  });

  it('clamps requirementsCoverage score above 100 to 100', () => {
    const payload = JSON.stringify({
      reviewSummary: 'Test.',
      recommendation: 'Recommended for Approval',
      requirementsCoverage: { score: 150, rationale: 'Over cap.', blockers: [] },
      documentationCompleteness: { score: 80, rationale: 'Good docs.', blockers: [] }
    });
    const result = parseSynthesisResponse(payload);
    assert.equal(result.requirementsCoverage.score, 100);
  });

  it('clamps documentationCompleteness score below 0 to 0', () => {
    const payload = JSON.stringify({
      reviewSummary: 'Test.',
      recommendation: 'Needs Remediation',
      requirementsCoverage: { score: 50, rationale: 'Half covered.', blockers: [] },
      documentationCompleteness: { score: -10, rationale: 'Under floor.', blockers: [] }
    });
    const result = parseSynthesisResponse(payload);
    assert.equal(result.documentationCompleteness.score, 0);
  });

  it('returns null dimensions when fields are absent', () => {
    const payload = JSON.stringify({
      reviewSummary: 'Minimal synthesis.',
      recommendation: 'Needs Remediation'
    });
    const result = parseSynthesisResponse(payload);
    assert.ok(result, 'Should return result for minimal valid JSON');
    assert.equal(result.requirementsCoverage, null);
    assert.equal(result.documentationCompleteness, null);
    assert.deepEqual(result.strengths, []);
    assert.deepEqual(result.nextActions, []);
  });

  it('recovers JSON from markdown code fences', () => {
    const inner = JSON.stringify({
      reviewSummary: 'Fenced test.',
      strengths: ['Hub-spoke confirmed'],
      recommendation: 'Needs Remediation',
      nextActions: []
    });
    const fenced = '```json\n' + inner + '\n```';
    const result = parseSynthesisResponse(fenced);
    assert.ok(result, 'Should recover JSON from markdown fences');
    assert.equal(result.recommendation, 'Needs Remediation');
    assert.deepEqual(result.strengths, ['Hub-spoke confirmed']);
  });

  it('recovers JSON when prose surrounds the object', () => {
    const inner = JSON.stringify({
      reviewSummary: 'Prose test.',
      recommendation: 'Ready with Gaps'
    });
    const withProse = 'Here is my analysis:\n' + inner + '\n— end of response.';
    const result = parseSynthesisResponse(withProse);
    assert.ok(result, 'Should recover JSON from prose-wrapped response');
    assert.equal(result.recommendation, 'Ready with Gaps');
  });

  it('treats strengths and nextActions as empty arrays when missing', () => {
    const payload = JSON.stringify({ reviewSummary: 'Test.', recommendation: 'Ready with Gaps' });
    const result = parseSynthesisResponse(payload);
    assert.ok(Array.isArray(result.strengths), 'strengths should be an array');
    assert.ok(Array.isArray(result.nextActions), 'nextActions should be an array');
    assert.equal(result.strengths.length, 0);
    assert.equal(result.nextActions.length, 0);
  });
});

// ── 2. buildSynthesisAgentInput ───────────────────────────────────────────────

describe('buildSynthesisAgentInput (TRK-019)', () => {
  const minimalReview = {
    reviewId: 'rev-001',
    projectName: 'Contoso Landing Zone',
    customerName: 'Contoso',
    evidenceReadinessState: 'Ready for Review'
  };

  it('returns an array with exactly one user-role message', () => {
    const input = buildSynthesisAgentInput([], minimalReview, [], []);
    assert.ok(Array.isArray(input), 'input must be an array');
    assert.equal(input.length, 1, 'must contain exactly one message');
    assert.equal(input[0].role, 'user', 'message role must be "user"');
  });

  it('message content is a non-empty string', () => {
    const input = buildSynthesisAgentInput([], minimalReview, [], []);
    const { content } = input[0];
    assert.ok(typeof content === 'string' && content.length > 0, 'content must be a non-empty string');
  });

  it('message content includes the project name', () => {
    const input = buildSynthesisAgentInput([], minimalReview, [], []);
    assert.ok(input[0].content.includes('Contoso Landing Zone'), 'content must include project name');
  });

  it('message content includes a synthesis directive', () => {
    const input = buildSynthesisAgentInput([], minimalReview, [], []);
    assert.ok(
      input[0].content.toLowerCase().includes('synthesis'),
      'content must include a synthesis directive keyword'
    );
  });

  it('message content includes domain scores when domain results are present', () => {
    const domainResults = [{
      domain: 'Security',
      scorecardDimension: { name: 'Security and Compliance', score: 65, rationale: 'Some gaps.', blockers: [] },
      findings: [],
      missingEvidence: ['Key Vault not configured'],
      criticalBlockers: []
    }];
    const input = buildSynthesisAgentInput(domainResults, minimalReview, [], []);
    const { content } = input[0];
    assert.ok(content.includes('Security and Compliance'), 'content must include the domain dimension name');
    assert.ok(content.includes('65'), 'content must include the domain score');
  });

  it('message content includes SOW requirements count when requirements are present', () => {
    const requirements = [
      { normalizedText: 'On-prem connectivity required.', cariStatus: 'Validated' },
      { normalizedText: 'Azure Firewall required.', cariStatus: 'Not Found' }
    ];
    const input = buildSynthesisAgentInput([], minimalReview, requirements, []);
    assert.ok(input[0].content.includes('2'), 'content must include requirements count');
  });
});

// ── 3. runSynthesisViaAgentsApi / runSynthesisViaChatCompletions — shape ──────

describe('runSynthesisViaAgentsApi and runSynthesisViaChatCompletions — exported shape (TRK-019)', () => {
  it('runSynthesisViaAgentsApi is exported as a function', () => {
    assert.equal(typeof runSynthesisViaAgentsApi, 'function');
  });

  it('runSynthesisViaChatCompletions is exported as a function', () => {
    assert.equal(typeof runSynthesisViaChatCompletions, 'function');
  });

  it('runSynthesisViaAgentsApi returns a Promise when called', () => {
    const result = runSynthesisViaAgentsApi([], {}, [], []);
    assert.ok(result instanceof Promise, 'must return a Promise');
    result.catch(() => {}); // suppress unhandled rejection — testing shape only
  });

  it('runSynthesisViaChatCompletions returns a Promise when called', () => {
    const result = runSynthesisViaChatCompletions([], {}, [], []);
    assert.ok(result instanceof Promise, 'must return a Promise');
    result.catch(() => {}); // suppress unhandled rejection — testing shape only
  });
});
