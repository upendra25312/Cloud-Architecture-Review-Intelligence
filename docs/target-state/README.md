# Target-State Documentation

## Purpose

This section documents the intended future direction of the repository, platform, and architecture.

It should answer:

- where the system is intended to go
- what modernization goals are desired
- what improvements are planned
- what constraints apply to reaching that future state

This section describes direction, not current production truth.

---

## Target-state principle

Target-state documentation should clearly distinguish desired future architecture from the system that is live today.

Target-state content must not be written in a way that implies the future design is already fully implemented or production-proven.

---

## What belongs in target-state docs

Examples include:
- future architecture direction
- desired platform simplification
- planned migration phases
- desired repo organization
- intended deployment model improvements
- future-state reliability, security, and UX goals

---

## What does not belong here

Do not use this section to describe current operational truth unless it is explicitly included as context for migration planning.

Current reality belongs in `docs/current-state/`.

---

## Migration expectation

Target-state improvements should be pursued through staged, production-safe evolution.

Target-state planning must respect:
- live-site protection
- rollback readiness
- current-state validation
- production-sensitive change control
- practical sequencing

Modernization is expected to be incremental, not reckless.

---

## Relationship to current-state

Target-state work should start from documented current-state reality.

A good target-state plan:
- acknowledges the current system honestly
- identifies why change is needed
- defines a staged path forward
- avoids pretending the migration is already complete

---

## Documentation rule

If content describes future intent, desired architecture, or planned improvement, it belongs in target-state documentation.

If content describes what is currently live or operationally true, it belongs in current-state documentation.

If a document contains both, split it.

---

## Expected maintenance behavior

Target-state docs should be updated when:
- the future architecture direction changes
- migration sequencing changes
- platform goals change
- new constraints or dependencies affect the modernization path

---

## Governance alignment

Target-state planning should remain aligned with:
- `standards/architecture/architecture-standards.md`
- `standards/release/production-change-control.md`
- `standards/release/release-standards.md`

A strong target-state design is valuable only if it can be reached safely.
