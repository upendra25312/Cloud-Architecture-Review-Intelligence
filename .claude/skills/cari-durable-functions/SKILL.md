# cari-durable-functions

## Purpose

Improve CARI backend orchestration reliability. Enforce Durable Functions determinism rules, idempotency contracts, retry policies, and instance ID collision handling across the extraction and agent review orchestrators.

## When to Use

- Implementing or reviewing `orchestratorExtraction.js` or `orchestratorAgentReview.js`
- Debugging stuck or zombie orchestration instances
- Adding new activities to either orchestrator
- Investigating timer-race or timeout path behavior
- Reviewing idempotency tests in `api/src/durable/tests/`

## When Not to Use

- Designing new Azure infrastructure (Terraform is frozen)
- Reviewing frontend components
- Reviewing evidence extraction quality (use `cari-document-intelligence` instead)

## Inputs

- `api/src/durable/orchestratorExtraction.js`
- `api/src/durable/orchestratorAgentReview.js`
- `api/src/durable/tests/idempotency.test.js`
- `api/src/shared/review-telemetry.js` (traceId threading)

## Critical Rules for Durable Orchestrators

1. **Determinism:** Orchestrators must be deterministic. No `Date.now()`, `Math.random()`, or I/O outside activities. Use `context.df.currentUtcDateTime` for timestamps.
2. **Instance ID:** Use `computeInstanceId(prefix, reviewId, userId)` — SHA-256 of `"${prefix}:${reviewId}:${userId}"`, first 48 hex chars. Never use raw reviewId as instance ID (collision risk across users).
3. **Timer race:** Both orchestrators use `Task.any([workflowTask, timerTask])`. The winning task determines success vs timeout path. The timer task must be cancelled if the workflow task wins.
4. **Idempotency:** Starting an orchestration with the same instance ID while it's running must not create a duplicate — use `startNew` with the computed instance ID and check for existing instances first.
5. **Retry policy:** `DEFAULT_RETRY_OPTIONS = new df.RetryOptions(5000, 3)` with `backoffCoefficient = 2`. Applied to all activity calls. Do not change without updating idempotency tests.
6. **Timeout:** `host.json` sets `functionTimeout: 00:45:00` for Flex Consumption. `activityFunctionTimeout` is not a valid setting — do not add it.
7. **workflowState values:** `"Draft"` → `"Evidence Ready"` → `"Extraction Queued"` → `"Extraction Running"` → `"Review In Progress"` → `"Extraction Failed"`. State transitions must only go forward.
8. **Failure handling:** On timeout, call `markExtractionFailed` and then `throw` to terminate the orchestration. The throw is expected — callers must handle it.

## computeInstanceId Contract

```javascript
// SHA-256 of `${prefix}:${reviewId}:${userId}`, first 48 hex chars
function computeInstanceId(prefix, reviewId, userId) {
  return crypto.createHash('sha256')
    .update(`${prefix}:${reviewId}:${userId}`)
    .digest('hex')
    .slice(0, 48);
}
```

## Outputs

- Reliable orchestration with no stuck instances
- `traceId` threaded from upload through extraction through agent review through export
- Idempotency tests covering timer-race success path, timeout path, error path, and replay determinism

## CARI Runtime Mapping

| Component | File |
|---|---|
| Extraction orchestrator | `api/src/durable/orchestratorExtraction.js` |
| Agent review orchestrator | `api/src/durable/orchestratorAgentReview.js` |
| Idempotency tests | `api/src/durable/tests/idempotency.test.js` |
| Telemetry / traceId | `api/src/shared/review-telemetry.js` |
| Function timeout config | `api/host.json` → `functionTimeout: "00:45:00"` |

## Guardrails

- NEVER use `Date.now()` or `Math.random()` inside an orchestrator generator function
- NEVER add `activityFunctionTimeout` to `host.json` — it is invalid for Durable Functions
- NEVER use raw `reviewId` as instance ID — always use `computeInstanceId`
- NEVER ignore the timer task result — if workflow wins, cancel the timer
- NEVER add a yield inside a catch block without confirming the orchestrator generator flow
- Do NOT change `DEFAULT_RETRY_OPTIONS` without updating idempotency tests

## Acceptance Criteria

- All 24 tests in `idempotency.test.js` pass (part of 253-test suite)
- Timer-race success path: workflow task wins, timer cancelled, `workflowState` set to `"Review In Progress"`
- Timer-race timeout path: timer wins, `writeArbJobStatus("failed")` called, orchestration terminates with throw
- `computeInstanceId` produces deterministic 48-char hex for same inputs
- `traceId` present in all telemetry events from extraction start through export complete
- `host.json` `functionTimeout` remains `"00:45:00"` on Flex Consumption
