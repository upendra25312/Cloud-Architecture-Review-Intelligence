# Current-State Documentation

## Purpose

This section documents the current known production-relevant state of the repository and system.

It should answer:

- what is live now
- what is currently relied on
- what is known to be production-sensitive
- what constraints apply before modernization work proceeds

This section should describe reality, not aspiration.

---

## Current-state principle

Current-state documentation must reflect what is actually in use, deployed, or operationally relevant today.

If something is planned, proposed, or only partially implemented, it should not be described here as if it is fully live.

---

## What belongs in current-state docs

Examples include:
- currently used production routes
- currently deployed architecture assumptions
- current release and rollback expectations
- current performance baseline
- current operational constraints
- current dependencies that materially affect production behavior

---

## What does not belong here

Do not place the following here unless clearly labeled as current reality:
- target architecture aspirations
- future-state migration goals
- desired platform end-state
- speculative restructuring plans
- roadmap-only changes

Those belong in `docs/target-state/`.

---

## Current live-site focus

This repository currently supports a live production surface that must be protected during ongoing improvements.

Primary live site:

`https://red-coast-0b2d8700f.7.azurestaticapps.net/`

Changes to current-state assumptions should be treated carefully when they affect:
- production routing
- frontend rendering behavior
- API behavior
- deployment behavior
- recovery/rollback readiness
- performance expectations

---

## Current-state supporting documents

Use the following documents together when evaluating current reality:

- `docs/current-state/performance-baseline.md`
- `standards/release/production-change-control.md`
- `docs/runbooks/rollback-frontend.md`
- `docs/runbooks/rollback-api.md`
- `standards/architecture/architecture-standards.md`

---

## Documentation rule

If a document describes what is true today, it belongs in current-state documentation.

If a document describes what the system should become later, it belongs in target-state documentation.

If a document mixes both, it should be split.

---

## Expected maintenance behavior

Current-state docs should be updated when:
- the live architecture materially changes
- production routes or production dependencies materially change
- release or rollback reality materially changes
- the agreed current baseline is intentionally reset

Accuracy is more important than completeness theater.

---

## Relationship to target-state

Current-state documentation is the baseline for safe modernization.

Target-state planning should build from current-state truth, not replace it.
