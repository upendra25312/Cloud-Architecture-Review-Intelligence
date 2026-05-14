# Release Standards

## Purpose

This document defines baseline release expectations for a repository that supports a live production-backed application.

The goal is controlled change delivery, not unnecessary ceremony.

---

## Core principles

Release work should be:

- deliberate
- traceable
- validated
- reversible
- proportionate to risk
- protective of the live site

---

## Live-site rule

The live production experience must be protected during all release activity.

No release should proceed casually if it can affect:
- route availability
- core workflow behavior
- deployment recoverability
- production correctness
- user-perceived performance

---

## Change classification

Releases should follow the repository’s production change control guidance:

- safe internal refactor
- production-sensitive change
- blocked change until safeguards exist

If risk is unclear, classify at the higher level.

---

## Release readiness expectation

Before releasing a production-sensitive change, confirm:
- scope is clear
- validation is defined
- rollback approach exists
- impacted routes or services are known
- production impact has been considered

---

## Validation expectation

Validation should be proportionate to risk.

Examples:
- documentation-only updates: review only
- isolated low-risk changes: targeted checks
- runtime-affecting changes: smoke validation
- deployment/infrastructure-sensitive changes: stronger validation and rollback readiness

A successful build alone does not prove release readiness.

---

## Rollback expectation

Production-sensitive releases must have a practical rollback path.

At minimum, the team should know:
- what to revert
- how to redeploy or restore the last known good state
- what to validate after rollback

If rollback is unclear, readiness is incomplete.

---

## Traceability

Release-affecting work should be traceable to:
- a documented issue or decision
- a branch/commit
- a review path
- a known validation outcome

Operational ambiguity increases release risk.

---

## Small-batch preference

Prefer smaller, well-understood releases over large bundled changes.

Smaller releases improve:
- review quality
- fault isolation
- rollback confidence
- production safety

---

## Post-release checks

After any production-affecting release, verify at minimum:
- homepage is reachable
- `/arb` is reachable
- one representative business flow still works
- no obvious blocking error is present

Add API/service checks where relevant.

---

## Documentation expectation

Important release assumptions, workflows, and recovery expectations should be documented and discoverable in the repository.
