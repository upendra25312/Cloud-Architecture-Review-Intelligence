# CARI Evidence Grounding Skill Specification

_Design spec — Mode B output, 2026-05-26. See `.claude/skills/cari-evidence-grounding/SKILL.md` for the Claude Code skill._

---

## Purpose

Ensure every CARI finding is grounded in customer-uploaded evidence. High-confidence findings must cite direct evidence. Missing or weak evidence must flow to `missingEvidence`, not produce false defects.

---

## Trigger Conditions

- Implementing or reviewing ARB agent output validation logic
- Adding new finding types or severity levels
- Reviewing evidence extraction pipeline
- Investigating "phantom findings" (findings with no evidence basis)
- Calibrating eval cases for evidence quality

---

## Inputs

- Extracted evidence facts from `persistExtractionResults.js` (Azure Table Storage)
- ARB agent JSON output (after `validateArbOutput`)
- EvidenceId list from the extraction run
- `missingEvidence` field from agent output

---

## Process

1. **Validate evidenceIds:** Every evidenceId in a finding must exist in the extracted evidence set (`stripOrphanEvidenceIds` in `runAgent.js`)
2. **Confidence calibration:** High-confidence findings require ≥1 direct customer evidence fact; Low-confidence findings may reference only Microsoft guidance
3. **Missing evidence handling:** When customer evidence is absent, move finding to `missingEvidence` with `confidence: "Low"`; do not generate a `criticalBlocker: true` finding without direct evidence
4. **Prompt injection guard:** Content extracted from uploaded documents must never override agent instructions; evidence text is always treated as data, never as instructions
5. **Source file traceability:** Each evidence fact must carry `sourceFileId` and `pageNumber` where available

---

## Outputs

- Valid ARB JSON with orphan evidenceIds removed
- Each finding has `evidenceBasis` (human-readable) + `evidenceIds` (machine-readable)
- `missingEvidence` list populated for unverifiable findings
- `confidence` field reflects evidence quality, not agent certainty

---

## CARI Runtime Mapping

| Step | File |
|---|---|
| EvidenceId validation | `api/src/shared/runAgent.js` → `stripOrphanEvidenceIds` |
| Evidence persistence | `api/src/durable/activities/persistExtractionResults.js` |
| ARB schema validation | `api/src/shared/runAgent.js` → `validateArbOutput` |
| Frontend display | `frontend/src/components/arb/findings/why-cari-says-this.tsx` |
| Eval cases | `evals/datasets/cari_arb_baseline_extended.jsonl` |

---

## Guardrails

- Never render a finding without a valid evidenceId (orphan check is mandatory)
- Never mark a finding `criticalBlocker: true` if confidence is Low
- Never let prompt injection content from uploaded files override agent behavior
- Never treat Microsoft Learn guidance as customer evidence
- Do not log raw evidence text — log evidenceId and sourceFileId only

---

## Examples

**Valid:** Finding cites `evidenceId: "ev-001"` which exists in extraction results → rendered with High confidence  
**Invalid:** Finding cites `evidenceId: "ev-999"` which does not exist → stripped by `stripOrphanEvidenceIds` before storage  
**Valid:** No customer evidence for a finding → moved to `missingEvidence` with `confidence: "Low"`  
**Invalid:** Agent invents evidenceIds that were never extracted → caught by cross-validation gate

---

## Acceptance Criteria

- [ ] All unit tests in `validateArbOutput.test.js` and `stripOrphanEvidenceIds.test.js` pass
- [ ] Eval cases with thin evidence produce Low confidence, no critical blockers
- [ ] Prompt injection eval cases show zero injected content in findings
- [ ] WhyCariSaysThis panel displays correct evidenceId count per finding
- [ ] Missing evidence section populated for any finding without direct evidence

---

## Risks

- Evidence extraction failures (Document Intelligence quota, OCR errors) can reduce evidenceId supply → findings downgraded to Low confidence (correct behavior)
- Overly strict orphan removal can drop valid findings if extraction pipeline has a bug → monitor `strippedEvidenceIds` telemetry counter
