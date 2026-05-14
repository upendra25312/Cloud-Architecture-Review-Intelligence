# Frontend Production Rollback Runbook

## Purpose

This runbook defines how to respond when a frontend deployment causes production issues for the live site.

Primary production site:

`https://red-coast-0b2d8700f.7.azurestaticapps.net/`

Use this runbook when a frontend release introduces:
- broken routes
- blank pages
- broken static assets
- severe layout regression
- blocking JavaScript/runtime errors
- major UX regression in critical flows
- unacceptable performance degradation after deployment

---

## Trigger conditions

Start rollback evaluation if any of the following occur after deployment:

- homepage fails to load correctly
- `/arb` fails to load correctly
- a key review flow is broken
- production smoke checks fail
- major browser console/runtime errors appear
- a deployment artifact is incomplete or incorrect
- users report immediate blocking issues
- performance degradation is severe enough to affect core usage

---

## Immediate response

1. Stop additional production changes.
2. Confirm whether the issue is frontend-only or shared with backend/API behavior.
3. Record:
   - deployment time
   - commit or build reference
   - affected routes
   - observed symptoms
4. Notify the responsible owner/reviewer.
5. Decide whether rollback is required or whether a fast safe fix is lower risk.

If customer-facing impact is active and not trivial, prefer rollback over speculative hotfixing.

---

## Scope check

Before rollback, confirm the issue is likely caused by the frontend release and not primarily by:
- backend API outage
- authentication failure
- storage/service outage
- DNS/platform issue
- unrelated Azure incident

If uncertain, treat rollback as a stabilization step if the frontend deploy is the most recent likely cause.

---

## Rollback decision rule

Rollback the frontend when:
- the live site is materially degraded
- the issue was introduced by the latest frontend deployment
- the fix is not safer or faster than rollback
- user-facing impact is ongoing

Do not delay rollback waiting for a perfect diagnosis if the site is visibly broken.

---

## Rollback inputs to collect

Before executing rollback, capture:
- current production deployment identifier
- last known good deployment identifier
- branch/commit associated with the bad release
- deployment workflow/run reference if available
- list of affected routes
- screenshot or short symptom summary if helpful

---

## Rollback procedure

The exact rollback mechanism depends on the active deployment workflow and hosting configuration, but the operational goal is always the same:

Restore the last known good frontend artifact/configuration to production.

### Standard rollback sequence

1. Identify the last known good production deployment.
2. Revert or redeploy the last known good frontend artifact.
3. Ensure the production site points to the restored artifact.
4. Confirm no unintended backend/config dependency was introduced with the failed release.
5. Re-run smoke validation immediately after rollback.

### If using workflow-driven deploys
- re-run the last known good deploy, or
- deploy the last known good commit/artifact, or
- revert the breaking frontend change and deploy the reverted state

### If using static artifact deployment
- restore the previously validated static output
- confirm correct asset paths and route behavior after restore

---

## Post-rollback validation

After rollback, verify at minimum:

### Required checks
- homepage loads successfully
- `/arb` loads successfully
- a representative review-related route loads successfully
- core navigation works
- static assets load correctly
- no obvious blocking browser/runtime error remains

### Recommended checks
- verify page shell/layout is intact
- verify API-backed UI still renders expected states
- verify no obvious broken links or missing styles
- compare behavior to last known good expectation

---

## If rollback does not resolve the issue

If the site is still broken after frontend rollback:
1. re-check whether the root cause is backend/API/platform-related
2. review environment/configuration drift
3. inspect any coupled release changes
4. escalate to broader incident handling

At that point, the issue may not be frontend-only.

---

## Recovery confirmation

Rollback is considered successful when:
- critical production routes load correctly
- blocking symptoms are gone
- smoke validation passes
- user-facing impact is reduced or eliminated

---

## Documentation after rollback

Record:
- what triggered the rollback
- what was rolled back
- when rollback happened
- who executed it
- whether rollback fully resolved the issue
- what follow-up fix or prevention work is needed

---

## Prevention follow-up

After recovery, capture follow-up actions such as:
- missing smoke checks
- missing preview validation
- weak artifact traceability
- insufficient route coverage
- poor rollback readiness
- performance regression protections needed

Rollback is not the end state; it is the stabilization step.
