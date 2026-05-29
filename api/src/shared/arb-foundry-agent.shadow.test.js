'use strict';

/**
 * TRK-022 unit tests — Phase 3 shadow comparison per Section 28 thresholds.
 *
 * Contracts verified:
 *   1. compareShadowResults — Section 28 gate logic (domain coverage, crit/high delta,
 *      rule retention, score deltas, learn links, missing evidence)
 *   2. Exported function shape
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { compareShadowResults } = require('./arb-foundry-agent');

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeDomainResult(domain, overrides = {}) {
  return {
    domain,
    findings: overrides.findings ?? [],
    scorecardDimension: { name: domain, score: overrides.score ?? 70, rationale: '', blockers: [] },
    missingEvidence: overrides.missingEvidence ?? [],
    criticalBlockers: []
  };
}

function makeRuleFinding(ruleId, severity = 'High') {
  return { findingId: ruleId, ruleId, severity, source: 'rule', title: ruleId, learnMoreUrl: '' };
}

function makeAgentFinding(id, severity = 'High', learnMoreUrl = 'https://learn.microsoft.com/azure/test') {
  return { findingId: id, severity, source: 'agent', title: id, learnMoreUrl };
}

const DOMAINS = ['Security', 'Networking', 'Identity', 'Reliability', 'Operations', 'CostGovernance', 'Governance'];

function makeBaseline(scoreOverride = 70) {
  return DOMAINS.map((d) => makeDomainResult(d, { score: scoreOverride }));
}

// ── 1. compareShadowResults ───────────────────────────────────────────────────

describe('compareShadowResults (TRK-022)', () => {
  it('returns pass=true for identical empty domain arrays', () => {
    const report = compareShadowResults([], []);
    assert.equal(report.pass, true);
  });

  it('returns pass=true when Phase 3 results exactly match Phase 2', () => {
    const p2 = makeBaseline(72);
    const p3 = makeBaseline(72);
    const report = compareShadowResults(p2, p3);
    assert.equal(report.pass, true);
    assert.equal(report.critHighDelta.pass, true);
    assert.equal(report.ruleRetention.pass, true);
    assert.equal(report.scoreDeltas.pass, true);
    assert.equal(report.domainCoverage.pass, true);
  });

  it('fails critHighDelta when Phase 3 adds 3 more Critical/High findings', () => {
    const p2 = makeBaseline();
    const p3 = makeBaseline();
    // Phase 3 has 3 extra High findings in Security
    p3[0].findings = [
      makeAgentFinding('f1', 'High'),
      makeAgentFinding('f2', 'High'),
      makeAgentFinding('f3', 'Critical')
    ];
    const report = compareShadowResults(p2, p3);
    assert.equal(report.critHighDelta.pass, false, 'delta of 3 should fail');
    assert.equal(report.critHighDelta.delta, 3);
  });

  it('passes critHighDelta when difference is exactly 2', () => {
    const p2 = makeBaseline();
    const p3 = makeBaseline();
    p3[0].findings = [makeAgentFinding('f1', 'High'), makeAgentFinding('f2', 'High')];
    const report = compareShadowResults(p2, p3);
    assert.equal(report.critHighDelta.pass, true, 'delta of 2 is on the boundary — should pass');
  });

  it('fails ruleRetention when a Phase 2 rule finding is absent in Phase 3', () => {
    const p2 = makeBaseline();
    p2[0].findings = [makeRuleFinding('rule-001'), makeRuleFinding('rule-002')];
    const p3 = makeBaseline();
    p3[0].findings = [makeRuleFinding('rule-001')]; // rule-002 missing
    const report = compareShadowResults(p2, p3);
    assert.equal(report.ruleRetention.pass, false);
    assert.ok(report.ruleRetention.missingRuleIds.includes('rule-002'));
  });

  it('fails scoreDeltas when a domain score differs by more than 5 points', () => {
    const p2 = makeBaseline(70);
    const p3 = makeBaseline(70);
    p3[1].scorecardDimension.score = 63; // delta = 7
    const report = compareShadowResults(p2, p3);
    assert.equal(report.scoreDeltas.pass, false);
    assert.ok(report.scoreDeltas.maxScoreDelta > 5);
  });

  it('passes scoreDeltas when all domain score deltas are within 5 points', () => {
    const p2 = makeBaseline(70);
    const p3 = makeBaseline(70);
    p3[2].scorecardDimension.score = 75; // delta = 5, exactly on boundary
    const report = compareShadowResults(p2, p3);
    assert.equal(report.scoreDeltas.pass, true);
  });

  it('fails learnLinks when Phase 3 finding has a non-learn.microsoft.com URL', () => {
    const p2 = makeBaseline();
    const p3 = makeBaseline();
    p3[0].findings = [makeAgentFinding('f1', 'Medium', 'https://example.com/bad-url')];
    const report = compareShadowResults(p2, p3);
    assert.equal(report.learnLinks.pass, false);
    assert.equal(report.learnLinks.invalidCount, 1);
  });

  it('fails missingEvidence when a Phase 2 missing-evidence category is absent in Phase 3', () => {
    const p2 = makeBaseline();
    p2[0].missingEvidence = ['Network topology diagram', 'Firewall policy'];
    const p3 = makeBaseline();
    p3[0].missingEvidence = ['Network topology diagram']; // 'Firewall policy' lost
    const report = compareShadowResults(p2, p3);
    assert.equal(report.missingEvidence.pass, false);
    assert.ok(report.missingEvidence.lostCategories.includes('Firewall policy'));
  });

  it('fails domainCoverage when Phase 3 is missing a domain present in Phase 2', () => {
    const p2 = makeBaseline();
    const p3 = makeBaseline().slice(0, 6); // drop last domain
    const report = compareShadowResults(p2, p3);
    assert.equal(report.domainCoverage.pass, false);
    assert.equal(report.domainCoverage.missingDomains.length, 1);
  });
});

// ── 2. Exported function shape ────────────────────────────────────────────────

describe('compareShadowResults — exported shape (TRK-022)', () => {
  it('is exported as a function', () => {
    assert.equal(typeof compareShadowResults, 'function');
  });
});
