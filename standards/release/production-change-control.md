# Production Change Control Standard

## Purpose

This standard defines how changes must be planned, reviewed, validated, and released while the live production site remains in active use.

This repository supports a live Azure-hosted application at:

`https://red-coast-0b2d8700f.7.azurestaticapps.net/`

No restructuring, delivery change, or architectural modification is allowed to put the live site's availability, behavior, or performance at unnecessary risk.

---

## Core production rule

When production is live, **safety takes priority over speed**.

Changes must be classified before implementation as one of the following:

- **Safe internal refactor**
- **Production-sensitive change**
- **Blocked change until safeguards exist**

---

## 1. Safe internal refactors

These changes are normally allowed without staging deployment, provided they do not alter runtime behavior, deployment behavior, routing, configuration resolution, or performance characteristics.

Examples include:

- documentation-only changes
- repository standards and governance files
- issue templates, PR templates, and CODEOWNERS
- internal file moves with no functional behavior change
- comment cleanup
- naming cleanup with no runtime effect
- non-executed test-only documentation updates

### Requirements for safe internal refactors
- must not change public URLs
- must not change rendering behavior
- must not change deployment workflow behavior
- must not change environment variable behavior
- must not change API contracts
- must not change production asset loading behavior
- must remain low-risk and reversible

If any doubt exists, classify the change as production-sensitive.

---

## 2. Production-sensitive changes

These changes may affect production behavior, availability, or performance and therefore require validation before release.

Examples include:

- frontend route behavior changes
- layout or metadata behavior changes
- `next.config` changes
- build output or export behavior changes
- deployment workflow changes
- API request/response behavior changes
- authentication behavior changes
- durable orchestration behavior changes
- file upload behavior changes
- caching changes
- asset-loading changes
- telemetry behavior changes that may impact user experience
- large-scale refactors in critical user flows
- performance-affecting UI or bundle changes

### Requirements for production-sensitive changes
Before merge or release, the following must exist:

1. clear implementation scope
2. identified rollback path
3. validation plan
4. smoke-test plan
5. explicit statement of production impact
6. confirmation that the live site is protected

### Minimum validation expectation
Production-sensitive changes should be validated in a non-production or preview path whenever available.

If preview validation is not available, release risk must be called out explicitly and the change must remain minimal, reversible, and well-scoped.

---

## 3. Blocked changes until safeguards exist

These changes must not proceed until stronger release and validation controls are in place.

Examples include:

- changing hosting model
- changing production routing structure
- changing rendering strategy without validation coverage
- restructuring Terraform state or live infra layout
- replacing deployment architecture in one step
- large backend rewrites without rollback/testing readiness
- changing security model without validation
- changing critical production environment assumptions without documented recovery

### Rule
If the team cannot confidently validate or roll back the change, it must not proceed.

---

## Required production impact statement

Any pull request or implementation proposal affecting runtime behavior must include:

- what is changing
- whether production behavior can change
- whether performance can change
- what routes or APIs are affected
- how the change will be validated
- how the change will be rolled back if needed

---

## Minimum smoke checks after deployment

Any production-affecting release should verify, at minimum:

### Frontend
- homepage loads successfully
- `/arb` loads successfully
- at least one primary review-related path loads successfully

### API
- health endpoint responds successfully, if applicable
- no obvious authentication or request failures appear in critical flows

### User experience
- primary navigation still works
- no obvious broken layout or blocking runtime error is present
- no obvious regression to core production workflow is visible

---

## Performance protection rule

Restructuring must not degrade the live site's perceived performance.

Changes with possible performance impact must be treated as production-sensitive.

Examples:
- bundle growth
- new client-side dependencies
- layout/rendering changes
- image-loading changes
- data-loading changes
- script-loading changes

When possible, compare affected pages against the documented performance baseline before and after the change.

---

## Rollback expectation

Any production-sensitive change must have a rollback approach before release.

At minimum, the owner must know:

- what to revert
- how to revert it
- what systems or files are involved
- how to verify recovery

If rollback is unclear, the change is not ready.

---

## Documentation expectation

Current-state production behavior must be documented separately from target-state architecture or future plans.

The repository must not present aspirational design as if it is already fully live and validated.

---

## Decision rule when uncertainty exists

If there is uncertainty about whether a change is safe, classify it at the higher risk level.

Use this order:

- safe internal refactor
- production-sensitive change
- blocked change

When unsure, do **not** assume the change is safe.

---

## Approval expectation

The following categories should receive deliberate review before release:

- production-sensitive frontend changes
- production-sensitive API changes
- deployment workflow changes
- infrastructure-affecting changes
- authentication/security-sensitive changes
- performance-sensitive changes

---

## Live-site protection statement

The live site is the priority production surface for this repository.

Until stronger automated controls are fully in place, no change should be merged or released if it creates avoidable risk to:

- availability
- correctness
- navigation
- deployment recoverability
- core workflow behavior
- perceived performance

Protect production first. Modernize second.

---

## Related standards

This document should be used together with:

- rollback runbooks
- performance baseline documentation
- release workflow guidance
- architecture current-state documentation
