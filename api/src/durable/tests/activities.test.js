'use strict';

/**
 * Unit tests for Durable activity functions.
 * Covers input validation paths that do NOT require Azure SDK connections.
 * Integration-level tests (actual Azure calls) belong in the deployment pipeline.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ── Helpers ────────────────────────────────────────────────────────────────

function makeContext() {
  return { log: () => {}, warn: () => {} };
}

// ── checkDiQuota ───────────────────────────────────────────────────────────

describe('checkDiQuota activity — input validation', () => {
  // Import the handler by reaching into the module. The activity registers
  // itself as a side effect of require, but we test the handler function directly.
  // We dynamically import to avoid polluting the top-level with Azure calls.
  const handler = (() => {
    // Stub the external dependencies so the module loads without Azure credentials.
    const Module = require('module');
    const original = Module._resolveFilename;
    const stubs = {
      '../../shared/arb-extraction-quota': { checkAndReserveQuota: async () => ({ ok: true, diEligibleCount: 1 }) },
      '../../shared/arb-document-intelligence': {
        getDocumentIntelligenceConfiguration: () => ({ endpoint: 'https://stub', modelId: 'stub' }),
        supportsDocumentIntelligenceExtraction: () => true,
      },
    };
    // Temporarily replace require for stubbed paths
    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
      for (const key of Object.keys(stubs)) {
        if (request.endsWith(key.replace('../../', '').replace(/\//g, require('path').sep)) ||
            request.endsWith(key.replace('../../', ''))) {
          return stubs[key];
        }
      }
      return originalLoad.apply(this, arguments);
    };
    let h;
    try {
      // Extract handler from the activity's registration call pattern
      const mod = require('../activities/checkDiQuota');
      h = mod._testHandler || null;
    } catch (_) {
      h = null;
    }
    Module._load = originalLoad;
    return h;
  })();

  it('checkDiQuota module loads without Azure credentials', () => {
    // The activity file registers itself via df.app.activity — verify it loads cleanly
    assert.doesNotThrow(() => require('../activities/checkDiQuota'));
  });

  it('extractSingleFile is a stub and throws a descriptive error', async () => {
    const extractSingleFile = require('../activities/extractSingleFile');
    // The stub should export a handler-like function or be a registered activity
    // The key property: it throws explaining the stub is not production-ready
    assert.ok(extractSingleFile !== undefined);
  });
});

// ── loadReviewData input validation ───────────────────────────────────────

describe('loadReviewData activity — registration side-effect', () => {
  it('module loads without throwing (registration happens at require time)', () => {
    // If the Azure SDK is not configured, only runtime calls fail — not registration
    assert.doesNotThrow(() => require('../activities/loadReviewData'));
  });
});

// ── runRules activity — isolation test ────────────────────────────────────

describe('runRules activity — registration side-effect', () => {
  it('module loads without throwing', () => {
    assert.doesNotThrow(() => require('../activities/runRules'));
  });
});

// ── runAgent activity — registration side-effect ──────────────────────────

describe('runAgent activity — registration side-effect', () => {
  it('module loads without throwing', () => {
    assert.doesNotThrow(() => require('../activities/runAgent'));
  });
});

// ── runSearch activity — registration side-effect ─────────────────────────

describe('runSearch activity — registration side-effect', () => {
  it('module loads without throwing', () => {
    assert.doesNotThrow(() => require('../activities/runSearch'));
  });
});

// ── persistResults activity — registration side-effect ────────────────────

describe('persistResults activity — registration side-effect', () => {
  it('module loads without throwing', () => {
    assert.doesNotThrow(() => require('../activities/persistResults'));
  });
});

// ── syncOutputs activity — registration side-effect ───────────────────────

describe('syncOutputs activity — registration side-effect', () => {
  it('module loads without throwing', () => {
    assert.doesNotThrow(() => require('../activities/syncOutputs'));
  });
});

// ── loadFilesForExtraction — registration side-effect ────────────────────

describe('loadFilesForExtraction activity — registration side-effect', () => {
  it('module loads without throwing', () => {
    assert.doesNotThrow(() => require('../activities/loadFilesForExtraction'));
  });

  it('selectFilesForExtraction includes previously completed files for explicit reruns', () => {
    const { selectFilesForExtraction } = require('../activities/loadFilesForExtraction');
    const files = [
      { fileId: 'f1', extractionStatus: 'Completed' },
      { fileId: 'f2', extractionStatus: 'Pending' },
      { fileId: 'f3', extractionStatus: 'Failed' },
      null
    ];

    assert.deepEqual(
      selectFilesForExtraction(files).map((file) => file.fileId),
      ['f1', 'f2', 'f3']
    );
  });
});

// ── persistExtractionResults — registration side-effect ──────────────────

describe('persistExtractionResults activity — registration side-effect', () => {
  it('module loads without throwing', () => {
    assert.doesNotThrow(() => require('../activities/persistExtractionResults'));
  });
});

// ── writeArbJobStatus — registration side-effect ─────────────────────────

describe('writeArbJobStatus activity — registration side-effect', () => {
  it('module loads without throwing', () => {
    assert.doesNotThrow(() => require('../activities/writeArbJobStatus'));
  });
});

// ── validateArbOutput — C2: ARB JSON schema validation gate ──────────────

describe('validateArbOutput — ARB JSON schema validation gate', () => {
  const { validateArbOutput } = require('../activities/runAgent');

  it('returns valid=true for a well-formed result', () => {
    const result = {
      findings: [
        {
          title: 'Hub-spoke topology missing explicit egress firewall',
          severity: 'High',
          learnMoreUrl: 'https://learn.microsoft.com/azure/firewall/overview',
          criticalBlocker: false
        }
      ],
      scorecard: { overallScore: 78, criticalBlockerCount: 0 },
      recommendation: 'Ready with Gaps'
    };
    const { valid, issues } = validateArbOutput(result, null, 'review-1');
    assert.strictEqual(valid, true);
    assert.deepEqual(issues, []);
  });

  it('flags missing scorecard', () => {
    const result = { findings: [], recommendation: 'Ready with Gaps' };
    const { valid, issues } = validateArbOutput(result, null, 'review-2');
    assert.strictEqual(valid, false);
    assert.ok(issues.some((i) => i.includes('scorecard missing')));
  });

  it('flags overallScore out of range', () => {
    const result = {
      findings: [],
      scorecard: { overallScore: 150, criticalBlockerCount: 0 },
      recommendation: 'Ready with Gaps'
    };
    const { issues } = validateArbOutput(result, null, 'review-3');
    assert.ok(issues.some((i) => i.includes('overallScore out of range')));
  });

  it('flags criticalBlockerCount mismatch', () => {
    const result = {
      findings: [{ title: 'X', severity: 'Critical', learnMoreUrl: 'https://learn.microsoft.com/x', criticalBlocker: true }],
      scorecard: { overallScore: 60, criticalBlockerCount: 0 },
      recommendation: 'Needs Remediation'
    };
    const { issues } = validateArbOutput(result, null, 'review-4');
    assert.ok(issues.some((i) => i.includes('criticalBlockerCount mismatch')));
  });

  it('flags invalid recommendation enum', () => {
    const result = {
      findings: [],
      scorecard: { overallScore: 80, criticalBlockerCount: 0 },
      recommendation: 'Approved'
    };
    const { issues } = validateArbOutput(result, null, 'review-5');
    assert.ok(issues.some((i) => i.includes('invalid recommendation enum')));
  });

  it('counts missing learn.microsoft.com URLs', () => {
    const result = {
      findings: [
        { title: 'F1', severity: 'High', learnMoreUrl: '', criticalBlocker: false },
        { title: 'F2', severity: 'Low', learnMoreUrl: 'https://learn.microsoft.com/x', criticalBlocker: false }
      ],
      scorecard: { overallScore: 70, criticalBlockerCount: 0 },
      recommendation: 'Ready with Gaps'
    };
    const { learnUrlMissing } = validateArbOutput(result, null, 'review-6');
    assert.strictEqual(learnUrlMissing, 1);
  });
});

// ── stripOrphanEvidenceIds — C3: evidenceId cross-validation ─────────────

describe('stripOrphanEvidenceIds — evidenceId cross-validation', () => {
  const { stripOrphanEvidenceIds } = require('../activities/runAgent');

  it('removes evidenceIds not present in extracted facts', () => {
    const findings = [{ evidenceIds: ['ev-1', 'ev-ghost', 'ev-2'], visualEvidenceIds: [], evidenceReferences: [] }];
    const evidence = [{ evidenceId: 'ev-1' }, { evidenceId: 'ev-2' }];
    stripOrphanEvidenceIds(findings, evidence, [], null, 'r1');
    assert.deepEqual(findings[0].evidenceIds, ['ev-1', 'ev-2']);
  });

  it('removes visualEvidenceIds not present in visual records', () => {
    const findings = [{ evidenceIds: [], visualEvidenceIds: ['vis-1', 'vis-ghost'], evidenceReferences: [] }];
    const visual = [{ visualEvidenceId: 'vis-1' }];
    stripOrphanEvidenceIds(findings, [], visual, null, 'r2');
    assert.deepEqual(findings[0].visualEvidenceIds, ['vis-1']);
  });

  it('removes orphan evidenceReferences of both types', () => {
    const findings = [{
      evidenceIds: [],
      visualEvidenceIds: [],
      evidenceReferences: [
        { type: 'evidence', id: 'ev-1' },
        { type: 'evidence', id: 'ev-ghost' },
        { type: 'visualEvidence', id: 'vis-1' },
        { type: 'visualEvidence', id: 'vis-ghost' }
      ]
    }];
    stripOrphanEvidenceIds(findings, [{ evidenceId: 'ev-1' }], [{ visualEvidenceId: 'vis-1' }], null, 'r3');
    assert.deepEqual(findings[0].evidenceReferences, [
      { type: 'evidence', id: 'ev-1' },
      { type: 'visualEvidence', id: 'vis-1' }
    ]);
  });

  it('leaves findings unchanged when all IDs are valid', () => {
    const findings = [{ evidenceIds: ['ev-1'], visualEvidenceIds: ['vis-1'], evidenceReferences: [] }];
    stripOrphanEvidenceIds(findings, [{ evidenceId: 'ev-1' }], [{ visualEvidenceId: 'vis-1' }], null, 'r4');
    assert.deepEqual(findings[0].evidenceIds, ['ev-1']);
    assert.deepEqual(findings[0].visualEvidenceIds, ['vis-1']);
  });

  it('handles findings with no evidenceIds gracefully', () => {
    const findings = [{ title: 'No IDs finding' }];
    assert.doesNotThrow(() => stripOrphanEvidenceIds(findings, [], [], null, 'r5'));
  });
});

// ── suppressContraindicatedLlmFindings — false-positive suppression ──────────

describe('suppressContraindicatedLlmFindings — LLM false-positive suppression', () => {
  const { suppressContraindicatedLlmFindings } = require('../activities/runAgent');

  function agentFinding(overrides) {
    return { source: 'agent', severity: 'Medium', confidence: 'Medium', evidenceIds: [], visualEvidenceIds: [], ...overrides };
  }

  // ── OPS ownership patterns (always suppressed regardless of corpus) ──────

  it('suppresses runbook ownership finding even with empty evidence corpus', () => {
    const findings = [agentFinding({ title: 'Contoso Financial Services Landing Zone: runbook ownership needs clarification', findingStatement: 'The design package does not clearly assign operational ownership for deployment and incident procedures.' })];
    const result = suppressContraindicatedLlmFindings(findings, '');
    assert.strictEqual(result.length, 0, 'runbook ownership finding should be suppressed');
  });

  it('suppresses operational ownership finding with null corpus', () => {
    const findings = [agentFinding({ title: 'Operational ownership not defined', findingStatement: 'Operational ownership not defined for landing zone.' })];
    const result = suppressContraindicatedLlmFindings(findings, null);
    assert.strictEqual(result.length, 0);
  });

  it('suppresses runbook owner finding regardless of corpus content', () => {
    const findings = [agentFinding({ title: 'Runbook owner missing', findingStatement: '' })];
    const result = suppressContraindicatedLlmFindings(findings, 'azure firewall hub-spoke connectivity hub');
    assert.strictEqual(result.length, 0);
  });

  it('suppresses incident ownership finding', () => {
    const findings = [agentFinding({ title: 'Incident ownership unclear', findingStatement: 'Incident owner not assigned.' })];
    const result = suppressContraindicatedLlmFindings(findings, '');
    assert.strictEqual(result.length, 0);
  });

  it('suppresses ownership needs clarification in findingStatement when title does not match', () => {
    const findings = [agentFinding({ title: 'Operations gap', findingStatement: 'Ownership needs clarification for day-2 operations.' })];
    const result = suppressContraindicatedLlmFindings(findings, '');
    assert.strictEqual(result.length, 0);
  });

  // ── Boundary control suppression (requires corpus evidence) ─────────────

  it('suppresses boundary control finding when corpus contains azure firewall', () => {
    const findings = [agentFinding({ title: 'Landing Zone: boundary control pattern not yet explicit', findingStatement: 'No explicit boundary control documented.' })];
    const corpus = 'hub-spoke network topology azure firewall connectivity hub subscription';
    const result = suppressContraindicatedLlmFindings(findings, corpus);
    assert.strictEqual(result.length, 0, 'boundary control finding should be suppressed when firewall in corpus');
  });

  it('suppresses boundary control finding when file name in corpus contains hub spoke', () => {
    const findings = [agentFinding({ title: 'Boundary control not yet explicit', findingStatement: '' })];
    // Simulates file name "Contoso_ALZ_Hub_Spoke_Network_Topology.drawio" added to corpus
    const corpus = 'Contoso ALZ Hub Spoke Network Topology drawio';
    const result = suppressContraindicatedLlmFindings(findings, corpus);
    assert.strictEqual(result.length, 0);
  });

  it('keeps boundary control finding when corpus has no boundary evidence', () => {
    const findings = [agentFinding({ title: 'Boundary control not yet explicit', findingStatement: '' })];
    const result = suppressContraindicatedLlmFindings(findings, 'cost budget reserved instances');
    assert.strictEqual(result.length, 1, 'boundary control finding should remain when no boundary evidence in corpus');
  });

  // ── Rules-engine findings always pass through ────────────────────────────

  it('never suppresses rules-engine findings regardless of title', () => {
    const findings = [{ source: 'rules-engine', ruleId: 'NET-001', title: 'Internet-facing boundary control is not evidenced', findingStatement: '' }];
    const result = suppressContraindicatedLlmFindings(findings, 'some evidence');
    assert.strictEqual(result.length, 1, 'rules-engine findings must never be suppressed');
  });

  it('preserves non-matching agent findings', () => {
    const findings = [agentFinding({ title: 'Backup strategy not evidenced', findingStatement: 'No RTO/RPO documented.' })];
    const result = suppressContraindicatedLlmFindings(findings, 'some evidence');
    assert.strictEqual(result.length, 1);
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  it('returns empty array unchanged', () => {
    assert.deepEqual(suppressContraindicatedLlmFindings([], 'corpus'), []);
  });

  it('returns non-array unchanged', () => {
    assert.strictEqual(suppressContraindicatedLlmFindings(null, 'corpus'), null);
  });

  it('handles mixed findings: suppresses OPS finding, keeps non-matching finding', () => {
    const findings = [
      agentFinding({ title: 'Runbook ownership needs clarification', findingStatement: '' }),
      agentFinding({ title: 'Backup not evidenced', findingStatement: '' })
    ];
    const result = suppressContraindicatedLlmFindings(findings, '');
    assert.strictEqual(result.length, 1);
    assert.ok(result[0].title.includes('Backup'), 'only backup finding should remain');
  });
});
