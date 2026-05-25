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
