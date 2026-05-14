# API Production Rollback Runbook

## Purpose

This runbook defines how to respond when an API deployment causes production issues.

Use this runbook when the API release introduces:
- failed health checks
- broken request handling
- unexpected error spikes
- authentication or authorization breakage
- upload/process failures
- durable workflow failures
- contract regressions that break frontend behavior

---

## Trigger conditions

Start rollback evaluation if any of the following occur after API deployment:

- API health endpoint fails
- critical endpoints begin returning errors unexpectedly
- authentication-related failures increase after release
- frontend flows break because of API regressions
- durable or background processing stops behaving correctly
- deployment validation fails
- user-facing impact is active in core workflows

---

## Immediate response

1. Stop additional production changes.
2. Confirm whether the issue is isolated to API behavior or includes frontend/platform symptoms.
3. Record:
   - deployment time
   - commit/build reference
   - affected endpoints or workflows
   - observed symptoms and error patterns
4. Notify the responsible owner/reviewer.
5. Decide whether rollback is safer than attempting a hotfix in place.

If core workflows are broken, prefer rollback over speculative debugging in production.

---

## Scope check

Before rollback, assess whether the issue is primarily caused by:
- API deployment changes
- configuration drift
- auth/identity issues
- dependent Azure service outage
- storage/search/AI service issue
- unrelated platform incident

If the latest API deployment is the most likely cause, rollback should be treated as the stabilization path.

---

## Rollback decision rule

Rollback the API when:
- health or critical endpoint behavior is degraded
- the issue was introduced by the latest API deployment
- the fix is not lower risk than rollback
- production impact is ongoing

Do not keep a bad API release live while diagnosis is incomplete if rollback is available.

---

## Rollback inputs to collect

Before executing rollback, capture:
- current production deployment identifier
- last known good API deployment identifier
- branch/commit associated with the bad release
- affected endpoints and workflows
- error samples or log indicators if available
- any config/app-setting changes deployed with the release

---

## Rollback procedure

The exact rollback mechanism depends on the deployment path in use, but the operational goal is the same:

Restore the last known good API package/configuration to production.

### Standard rollback sequence

1. Identify the last known good API deployment.
2. Revert or redeploy the last known good API package.
3. Restore any required matching configuration if the failed release introduced config drift.
4. Confirm the service starts correctly.
5. Re-run health and critical-flow validation immediately.

### If using workflow-driven deploys
- redeploy the last known good package/artifact, or
- revert the breaking API change and deploy the reverted state

### Important caution
If the failed release included storage schema, contract, or configuration changes, confirm rollback compatibility before redeploying.

---

## Post-rollback validation

After rollback, verify at minimum:

### Required checks
- API health endpoint responds successfully
- critical endpoints respond as expected
- authentication/authorization still functions for expected flows
- affected frontend workflows recover if they depended on the API
- no immediate severe error pattern remains

### Recommended checks
- verify one representative upload/process flow if applicable
- verify durable/background execution path if applicable
- inspect logs for persistent failures after rollback
- confirm no missing app settings or broken dependencies remain

---

## If rollback does not resolve the issue

If API rollback does not restore stability:
1. inspect platform/service dependencies
2. inspect secrets/config/app settings
3. inspect storage/search/AI dependency health
4. review whether another release changed a coupled dependency
5. escalate incident response

At that point, the issue may be environmental or cross-service.

---

## Recovery confirmation

Rollback is considered successful when:
- health validation passes
- critical API flows recover
- dependent frontend behavior recovers where expected
- severe release-related symptoms are removed or reduced

---

## Documentation after rollback

Record:
- what triggered the rollback
- what deployment/package/config was rolled back
- when rollback happened
- who executed it
- whether recovery was complete
- what follow-up remediation is required

---

## Prevention follow-up

After recovery, capture follow-up work such as:
- stronger health validation
- clearer artifact traceability
- contract validation gaps
- config drift prevention
- stronger smoke coverage
- safer deployment sequencing

Rollback restores service; prevention reduces repeat failure.
