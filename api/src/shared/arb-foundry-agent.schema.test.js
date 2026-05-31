'use strict';

/**
 * TRK-018 regression tests — portal/runtime schema drift gates.
 *
 * Three contracts that MUST hold before USE_AGENTS_API=synthesis is enabled:
 *   1. Recommendation label mapping  — portal labels normalize to runtime enums
 *   2. Networking scorecard dimension — present in DOMAIN_CONFIGS at 10% weight
 *   3. visualEvidenceIds contract     — survive parseAgentResponse() unchanged
 *
 * All tests are pure (no I/O, no Azure credentials).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { parseRecommendation, parseAgentResponse, DOMAIN_CONFIGS } = require('./arb-foundry-agent');

// ── 1. Recommendation label mapping ──────────────────────────────────────────

describe('parseRecommendation — portal label normalization (TRK-018)', () => {
  // Portal uses these 4 labels; runtime expects its own 4 labels.
  // parseRecommendation() is the sole bridge — these must never silently break.

  it('maps portal label "Approved" → "Recommended for Approval"', () => {
    assert.equal(parseRecommendation('Approved'), 'Recommended for Approval');
  });

  it('maps portal label "Approved with Conditions" → "Ready with Gaps"', () => {
    assert.equal(parseRecommendation('Approved with Conditions'), 'Ready with Gaps');
  });

  it('maps portal label "Needs Revision" → "Needs Remediation"', () => {
    assert.equal(parseRecommendation('Needs Revision'), 'Needs Remediation');
  });

  it('passes through "Rejected" unchanged', () => {
    assert.equal(parseRecommendation('Rejected'), 'Rejected');
  });

  it('passes through runtime labels unchanged — "Recommended for Approval"', () => {
    assert.equal(parseRecommendation('Recommended for Approval'), 'Recommended for Approval');
  });

  it('passes through runtime labels unchanged — "Ready with Gaps"', () => {
    assert.equal(parseRecommendation('Ready with Gaps'), 'Ready with Gaps');
  });

  it('passes through runtime labels unchanged — "Needs Remediation"', () => {
    assert.equal(parseRecommendation('Needs Remediation'), 'Needs Remediation');
  });

  it('falls back to "Needs Remediation" for unknown values', () => {
    assert.equal(parseRecommendation('Unknown Label'), 'Needs Remediation');
    assert.equal(parseRecommendation(''), 'Needs Remediation');
    assert.equal(parseRecommendation(null), 'Needs Remediation');
    assert.equal(parseRecommendation(undefined), 'Needs Remediation');
  });
});

// ── 2. Networking scorecard dimension ─────────────────────────────────────────

describe('DOMAIN_CONFIGS — Networking dimension presence (TRK-018)', () => {
  it('contains a Networking domain entry', () => {
    const net = DOMAIN_CONFIGS.find((d) => d.id === 'networking');
    assert.ok(net, 'DOMAIN_CONFIGS must include a networking entry');
  });

  it('Networking domain has scorecardDimension "Networking and Connectivity"', () => {
    const net = DOMAIN_CONFIGS.find((d) => d.id === 'networking');
    assert.equal(net.scorecardDimension, 'Networking and Connectivity');
  });

  it('Networking domain is weighted at 10% (0.10)', () => {
    const net = DOMAIN_CONFIGS.find((d) => d.id === 'networking');
    assert.equal(net.weight, 0.10);
  });

  it('domain weights total 0.80 (Requirements 15% + Doc 5% added in synthesis = 100%)', () => {
    // The 7 fan-out domains cover 80% of the weighted scorecard.
    // Requirements Coverage (15%) and Documentation Completeness (5%) are added by synthesis.
    // 0.80 + 0.15 + 0.05 = 1.00
    const fanOutTotal = DOMAIN_CONFIGS.reduce((s, d) => s + d.weight, 0);
    assert.ok(
      Math.abs(fanOutTotal - 0.80) < 0.001,
      `Expected fan-out domain weights to sum to 0.80, got ${fanOutTotal}`
    );
  });

  it('all 7 expected domains are present', () => {
    const ids = DOMAIN_CONFIGS.map((d) => d.id);
    const required = ['networking', 'security', 'governance', 'operations', 'reliability', 'cost', 'performance'];
    for (const id of required) {
      assert.ok(ids.includes(id), `DOMAIN_CONFIGS is missing domain: ${id}`);
    }
    assert.equal(ids.length, 7, `Expected 7 domains, found ${ids.length}`);
  });
});

// ── 3. visualEvidenceIds contract ─────────────────────────────────────────────

describe('parseAgentResponse — visualEvidenceIds survive parsing (TRK-018)', () => {
  const validResponse = JSON.stringify({
    findings: [
      {
        severity: 'Critical',
        domain: 'Networking',
        framework: 'CAF',
        frameworkPillar: 'CAF:Network',
        title: 'No Azure Firewall deployed',
        findingStatement: 'Hub has no firewall.',
        whyItMatters: 'Unfiltered egress traffic.',
        evidenceBasis: 'Architecture diagram shows no firewall.',
        evidenceIds: ['ev-001'],
        visualEvidenceIds: ['vis-001', 'vis-002'],
        evidenceReferences: [{ type: 'visualEvidence', id: 'vis-001' }],
        recommendation: 'Deploy Azure Firewall Premium.',
        learnMoreUrl: 'https://learn.microsoft.com/azure/firewall/',
        criticalBlocker: true
      }
    ],
    scorecard: {
      overallScore: 42,
      recommendation: 'Needs Revision',
      criticalBlockerCount: 1,
      missingEvidenceCount: 0,
      confidenceLevel: 'High',
      dimensions: [
        { name: 'Networking and Connectivity', score: 30, rationale: 'Missing firewall.', blockers: ['No Azure Firewall'] }
      ],
      reviewSummary: 'Critical network gap identified.',
      strengths: ['Hub-spoke topology correctly deployed'],
      criticalBlockers: ['No Azure Firewall'],
      missingEvidence: []
    }
  });

  it('preserves visualEvidenceIds array on findings', () => {
    const result = parseAgentResponse(validResponse);
    assert.ok(result, 'parseAgentResponse should return non-null for valid JSON');
    const finding = result.findings[0];
    assert.deepEqual(finding.visualEvidenceIds, ['vis-001', 'vis-002']);
  });

  it('merges visualEvidence evidenceReferences into visualEvidenceIds (dedup)', () => {
    // vis-001 appears in both visualEvidenceIds array AND evidenceReferences — should be deduped
    const result = parseAgentResponse(validResponse);
    const finding = result.findings[0];
    // vis-001 from evidenceReferences merged in, vis-002 from array — deduped = 2 unique IDs
    assert.equal(finding.visualEvidenceIds.length, 2);
    assert.ok(finding.visualEvidenceIds.includes('vis-001'));
    assert.ok(finding.visualEvidenceIds.includes('vis-002'));
  });

  it('normalizes portal recommendation label through scorecard path', () => {
    // The portal may return "Needs Revision" — parseAgentResponse must normalize it
    const result = parseAgentResponse(validResponse);
    assert.equal(result.scorecard.recommendation, 'Needs Remediation');
  });

  it('returns empty visualEvidenceIds array when field is absent', () => {
    const noVisual = JSON.stringify({
      findings: [
        {
          severity: 'High',
          domain: 'Security',
          framework: 'WAF',
          frameworkPillar: 'WAF:Security',
          title: 'Missing MFA',
          findingStatement: 'No MFA configured.',
          whyItMatters: 'Account takeover risk.',
          evidenceBasis: 'Policy config missing.',
          evidenceIds: ['ev-002'],
          recommendation: 'Enable Entra ID MFA.',
          learnMoreUrl: 'https://learn.microsoft.com/azure/active-directory/authentication/concept-mfa-howitworks',
          criticalBlocker: false
        }
      ],
      scorecard: {
        overallScore: 70,
        recommendation: 'Ready with Gaps',
        criticalBlockerCount: 0,
        missingEvidenceCount: 0,
        confidenceLevel: 'Medium',
        dimensions: [],
        reviewSummary: 'Some gaps noted.',
        strengths: [],
        criticalBlockers: [],
        missingEvidence: []
      }
    });
    const result = parseAgentResponse(noVisual);
    assert.ok(Array.isArray(result.findings[0].visualEvidenceIds));
    assert.equal(result.findings[0].visualEvidenceIds.length, 0);
  });

  it('recovers JSON from markdown code fences', () => {
    const fenced = '```json\n' + validResponse + '\n```';
    const result = parseAgentResponse(fenced);
    assert.ok(result, 'parseAgentResponse must recover JSON from markdown fences');
    assert.ok(Array.isArray(result.findings));
  });

  it('returns null for completely invalid JSON', () => {
    const result = parseAgentResponse('not json at all {{{');
    assert.equal(result, null);
  });
});
