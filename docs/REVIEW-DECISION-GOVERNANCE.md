# Review Decision Governance

**Applies to:** ARB review workflow in CARI  
**Enforced by:** `deriveGovernanceDecision()` in `arb-normalize-review.js`

---

## Two Decision Signals

Every ARB export carries two distinct decision signals. Renderers must display both when they differ.

| Signal | Field | Source |
|---|---|---|
| Reviewer Decision | `decision.reviewerDecision` | Human reviewer input via CARI UI |
| Governance Posture | `decision.governancePosture` | Computed from open finding severity |

---

## Governance Posture Derivation

The posture is derived deterministically from the finding set at export time:

```
Open Critical findings present → "Needs Remediation"  (riskAcceptanceRequired = true)
Open High findings present     → "Approved with Conditions"  (riskAcceptanceRequired = true)
Open Medium findings present   → "Approved with Conditions"
Recommendation includes "Needs Remediation" or "Needs Revision" → "Review Required"
No blocking findings           → reviewerDecision (if recorded), else "Review Required"
```

**The posture cannot be overridden by the reviewer decision.** It is always re-derived at export generation time.

---

## Governance Warning

A `governanceWarning` is set when:

1. `reviewerDecision === "Approved"` AND `governancePosture !== "Approved"`
   - Message: *"Reviewer approval exists, but open findings require remediation..."*

2. Rationale references customer sign-off without formal risk acceptance when High/Critical findings are open
   - Message: *"Customer sign-off is not sufficient architecture risk acceptance unless..."*

Renderers must display this warning prominently when set.

---

## Risk Acceptance

`riskAcceptanceRequired: true` is set when open Critical or High findings exist.

This means the architecture team must formally record:
- The risk owner
- Accepted residual risk
- Approval conditions

CARI exports flag this requirement via `pack.exportWarnings` when `riskAcceptances` is empty and `riskAcceptanceRequired` is true.

---

## Decision Canonicalization

Raw reviewer decision strings are canonicalized to one of:

| Canonical | Recognized inputs |
|---|---|
| `"Approved"` | "approved", "approve", "yes" |
| `"Conditionally Approved"` | "conditionally approved", "conditional" |
| `"Needs Revision"` | "needs revision", "revision required", "revise" |
| `"Needs Remediation"` | "needs remediation", "remediation required", "remediate" |
| `"Rejected"` | "rejected", "reject", "no" |
| `"Not Recorded"` | null, undefined, unrecognized strings |

---

## Reviewer Override Legacy Fields

Older reviews stored decisions in `scorecard.reviewerOverride`. The normalizer reads from both locations, preferring the canonical `decision` entity:

| Legacy path | Canonical path |
|---|---|
| `scorecard.reviewerOverride.overrideDecision` | `decision.reviewerDecision` |
| `scorecard.reviewerOverride.reviewerName` | `decision.reviewerName` |
| `scorecard.reviewerOverride.overriddenAt` | `decision.recordedAt` |
| `scorecard.reviewerOverride.overrideRationale` | `decision.rationale` |

Do not read legacy paths directly in renderers — always use `pack.decision.*`.
