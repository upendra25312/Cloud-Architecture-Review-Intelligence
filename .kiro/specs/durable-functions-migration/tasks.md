# Implementation Plan: Durable Functions Migration

## Overview

Migrate the Agent Review and Document Extraction workflows from fire-and-forget/queue-triggered patterns to Azure Durable Functions orchestrations. Implementation follows a 4-phase incremental approach: Foundation → Agent Review Orchestration → Extraction Fan-Out → Observability & Infrastructure. Each phase is independently testable and gated behind the `USE_DURABLE_ORCHESTRATION` feature flag.

## Tasks

- [x] 1. Foundation — Dependencies, Configuration, and Shared Modules
  - [x] 1.1 Add `durable-functions` dependency and update host.json
    - Add `durable-functions` ^3.0.0 to `api/package.json` dependencies
    - Update `api/host.json` to include `durableTask` extension config with `hubName`, `maxConcurrentActivityFunctions: 3`, and `maxConcurrentOrchestratorFunctions: 5`
    - Verify extension bundle range `[4.*, 5.0.0)` remains unchanged
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 7.1, 7.2, 7.3_

  - [x] 1.2 Create feature flag module (`api/src/durable/shared/featureFlag.js`)
    - Implement `getDurableFlag()` that reads `USE_DURABLE_ORCHESTRATION` from `process.env` at call time
    - Return `'ON'` or `'DRAIN'` if value matches exactly; default to `'OFF'` for any other value (absent, empty, unrecognized, mixed case)
    - Implement `shouldUseDurable()` that returns `true` only when flag is `'ON'`
    - Export both functions
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ]* 1.3 Write property test for feature flag module (`api/src/durable/tests/featureFlag.property.test.js`)
    - **Property 2: Unrecognized feature flag values default to OFF**
    - **Validates: Requirements 1.4**
    - Use fast-check to generate arbitrary strings and verify all non-"ON"/non-"DRAIN" values produce `'OFF'` behavior
    - Minimum 100 iterations

  - [x] 1.4 Create instance ID module (`api/src/durable/shared/instanceId.js`)
    - Implement `computeInstanceId(prefix, reviewId, userId)` using Node.js `crypto.createHash('sha256')`
    - Hash the string `"{prefix}:{reviewId}:{userId}"`, take first 48 hex chars
    - Export the function
    - _Requirements: 2.4, 6.1, 6.2, 6.3_

  - [ ]* 1.5 Write property test for instance ID module (`api/src/durable/tests/instanceId.property.test.js`)
    - **Property 1: Instance ID determinism and hex format**
    - **Validates: Requirements 2.4, 6.1, 6.2, 6.3**
    - Use fast-check to generate arbitrary prefix/reviewId/userId strings
    - Verify output is exactly 48 chars, all hex `[0-9a-f]`, and deterministic (same inputs → same output)
    - Minimum 100 iterations

  - [x] 1.6 Add `USE_DURABLE_ORCHESTRATION` app setting to Terraform
    - Add a Terraform variable `use_durable_orchestration` with default `"OFF"`
    - Add the app setting to `infrastructure/terraform/functions.tf` in the `app_settings` block
    - _Requirements: 12.1_

- [x] 2. Checkpoint — Validate foundation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Agent Review Orchestration — Activities
  - [x] 3.1 Create `loadReviewData` activity (`api/src/durable/activities/loadReviewData.js`)
    - Register as a Durable Functions activity using `df.app.activity()`
    - Accept `{ reviewId, principal }` input
    - Call existing shared modules: `getArbReview`, `getArbFiles`, `getArbRequirements`, `getArbEvidence`, `getArbVisualEvidence`, `getArbActions`
    - Return combined data object `{ review, files, requirements, evidence, visualEvidence, actions }`
    - Validate review exists and files are extracted (throw on failure)
    - _Requirements: 2.1_

  - [x] 3.2 Create `runSearch` activity (`api/src/durable/activities/runSearch.js`)
    - Register as a Durable Functions activity
    - Accept `{ review, requirements, evidence, reviewId }` input
    - Call `ensureArbSearchIndex()` and `searchArbDocuments()`
    - Build search query using the same logic as existing `buildArbSearchQuery`
    - Return `{ searchChunks }`
    - _Requirements: 2.1_

  - [x] 3.3 Create `runRules` activity (`api/src/durable/activities/runRules.js`)
    - Register as a Durable Functions activity
    - Accept `{ review, requirements, evidence, files }` input
    - Call `runDeterministicRules()` from existing shared module
    - Return `{ ruleFindings, ruleBlockers, criticalBlockerCount }`
    - _Requirements: 2.1_

  - [x] 3.4 Create `runAgent` activity (`api/src/durable/activities/runAgent.js`)
    - Register as a Durable Functions activity
    - Accept `{ review, files, requirements, evidence, searchChunks, visualEvidence, ruleFindings }` input
    - Call `runArbAgentReview()` from existing shared module
    - If agent returns failure, use `buildFallbackAgentReview()` as fallback
    - Merge rule findings with agent findings (rule findings are authoritative)
    - Apply `deriveGovernedRecommendation()` to set final recommendation
    - Resolve evidence traceability (same logic as existing handler)
    - Return `{ agentResult }` with merged findings, scorecard, and recommendation
    - **NO retry policy** — Foundry agent has internal 3-retry with exponential backoff
    - _Requirements: 2.1, 2.6_

  - [x] 3.5 Create `persistResults` activity (`api/src/durable/activities/persistResults.js`)
    - Register as a Durable Functions activity
    - Accept `{ reviewId, principal, agentResult, review }` input
    - Write findings, scorecard, and summary to `ARB_REVIEW_TABLE_NAME` (same logic as existing handler)
    - Write job status `completed` to `arbjobs` table for backward compatibility
    - Return `{ persisted: true }`
    - _Requirements: 2.1, 2.7_

  - [x] 3.6 Create `syncOutputs` activity (`api/src/durable/activities/syncOutputs.js`)
    - Register as a Durable Functions activity
    - Accept `{ reviewId, principal, review, agentResult, files, requirements, evidence, visualEvidence, actions }` input
    - Call `syncArbReviewedOutputs()` from existing shared module
    - Write exports list to table storage
    - Return `{ artifactsGenerated, exportsList }`
    - _Requirements: 2.1_

  - [ ]* 3.7 Write unit tests for activity functions (`api/src/durable/tests/activities.test.js`)
    - Test each activity with mocked dependencies (Table Storage, Search, Foundry)
    - Verify correct return shapes
    - Verify error propagation
    - _Requirements: 2.1, 2.6, 2.7, 2.8_

- [x] 4. Agent Review Orchestration — Orchestrator and HTTP Wiring
  - [x] 4.1 Create `orchestratorAgentReview` (`api/src/durable/orchestratorAgentReview.js`)
    - Register as a Durable Functions orchestrator using `df.app.orchestration()`
    - Accept `AgentReviewOrchInput` as input: `{ reviewId, principal, traceId }`
    - Call activities sequentially: loadReviewData → runSearch → runRules → runAgent → persistResults → syncOutputs
    - Apply `DEFAULT_RETRY_OPTIONS` (3 attempts, 5s first, backoff 2) to all activities EXCEPT `runAgent`
    - Implement timer race: create 30-min durable timer, use `context.df.Task.any()` to race timer against workflow
    - On timeout: write `status: "failed"` with timeout message to `arbjobs` table
    - On activity error: catch, write `status: "failed"` with error message to `arbjobs` table
    - On success: return result object with `agentReviewCompleted`, `findingsCount`, `recommendation`, `overallScore`, `confidenceLevel`, `generatedAt`, `artifactsGenerated`
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.7, 2.8_

  - [x] 4.2 Modify `arbRunAgentReview.js` to branch on feature flag
    - Import `shouldUseDurable` from feature flag module
    - Import `computeInstanceId` from instance ID module
    - Import `durable-functions` client
    - When `shouldUseDurable()` returns true:
      - Compute instance ID using `computeInstanceId('review', reviewId, userId)`
      - Check if orchestration already running via `client.getStatus(instanceId)`
      - If running, return existing status (HTTP 200 with running state)
      - Otherwise, start new orchestration via `client.startNew('orchestratorAgentReview', { instanceId, input })`
      - Return HTTP 202 with `{ reviewId, traceId, status: "running", startedAt, message }`
    - When `shouldUseDurable()` returns false: preserve existing fire-and-forget logic unchanged
    - _Requirements: 1.1, 1.2, 2.4, 2.5, 3.1_

  - [x] 4.3 Verify `arbAgentStatus` backward compatibility
    - Confirm GET /agent-status reads from `arbjobs` table (same as before)
    - Both legacy and durable paths write to `arbjobs`, so status endpoint works unchanged
    - No code changes needed if arbjobs write is correct in orchestrator
    - _Requirements: 3.2, 3.3, 3.4, 9.4_

  - [ ]* 4.4 Write orchestrator replay tests (`api/src/durable/tests/orchestratorAgentReview.test.js`)
    - Mock `context.df` to verify activity call sequence
    - Verify retry policies applied to all activities except `runAgent`
    - Test timer race: workflow wins (success path)
    - Test timer race: timer wins (timeout path)
    - Test error handling: activity throws → writes failed to arbjobs
    - Test duplicate instance detection
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 2.8_

- [x] 5. Checkpoint — Validate agent review orchestration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Extraction Fan-Out — Activities
  - [x] 6.1 Create `checkDiQuota` activity (`api/src/durable/activities/checkDiQuota.js`)
    - Register as a Durable Functions activity
    - Accept `{ principal, fileCount }` input
    - Call existing `arb-extraction-quota` shared module to check per-user hourly DI quota
    - If quota OK, return `{ quotaOk: true, remaining }`
    - If quota exceeded, throw error with quota reset information (429-equivalent)
    - _Requirements: 4.1, 4.2_

  - [x] 6.2 Create `loadFilesForExtraction` activity (`api/src/durable/activities/loadFilesForExtraction.js`)
    - Register as a Durable Functions activity
    - Accept `{ reviewId, principal }` input
    - Call `getArbFiles()` to load file metadata
    - Filter to files needing extraction (not already completed)
    - Return `{ files }` array of file metadata objects
    - _Requirements: 4.3_

  - [x] 6.3 Create `extractSingleFile` activity (`api/src/durable/activities/extractSingleFile.js`)
    - Register as a Durable Functions activity
    - Accept `{ reviewId, principal, file }` input
    - Call Document Intelligence extraction for the single file
    - Return self-contained result: `{ fileId, fileName, extractionStatus, extractedText, visualRecords, errors, durationMs }`
    - No shared mutable state — result is fully self-contained
    - _Requirements: 4.3, 4.4_

  - [x] 6.4 Create `persistExtractionResults` activity (`api/src/durable/activities/persistExtractionResults.js`)
    - Register as a Durable Functions activity
    - Accept `{ reviewId, principal, results }` input (array of per-file results)
    - Aggregate results and write combined extraction state to Table Storage
    - Update file statuses, write evidence records, update search index
    - Write job status to `arbjobs` table for backward compatibility
    - Return `{ persisted: true, indexedChunks }`
    - _Requirements: 4.5_

  - [ ]* 6.5 Write unit tests for extraction activities (`api/src/durable/tests/activities.test.js`)
    - Test `checkDiQuota` with quota OK and quota exceeded scenarios
    - Test `loadFilesForExtraction` with various file states
    - Test `extractSingleFile` with success, failure, and skip scenarios
    - Test `persistExtractionResults` with mixed results
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 7. Extraction Fan-Out — Orchestrator and HTTP Wiring
  - [x] 7.1 Create `orchestratorExtraction` (`api/src/durable/orchestratorExtraction.js`)
    - Register as a Durable Functions orchestrator using `df.app.orchestration()`
    - Accept `ExtractionOrchInput` as input: `{ reviewId, principal, requestedAt }`
    - Sequence: checkDiQuota → loadFilesForExtraction → fan-out extractSingleFile × N → persistExtractionResults
    - Apply `DEFAULT_RETRY_OPTIONS` to all activities
    - Fan-out: use `context.df.Task.all()` to schedule one `extractSingleFile` per file
    - Concurrency bounded by `maxConcurrentActivityFunctions=3` in host.json
    - Implement timer race: 30-min durable timer via `context.df.Task.any()`
    - On quota exceeded: catch error from `checkDiQuota`, write failure with 429 info
    - On timeout: write `status: "failed"` with timeout message
    - On success: return `{ extractionCompleted, fileCount, successCount, errorCount }`
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 4.7_

  - [x] 7.2 Modify `arbStartExtraction.js` to branch on feature flag
    - Import `shouldUseDurable` from feature flag module
    - Import `computeInstanceId` from instance ID module
    - Import `durable-functions` client
    - When `shouldUseDurable()` returns true:
      - Compute instance ID using `computeInstanceId('extraction', reviewId, userId)`
      - Check if orchestration already running via `client.getStatus(instanceId)`
      - If running, return existing status
      - Otherwise, start new orchestration via `client.startNew('orchestratorExtraction', { instanceId, input })`
      - Return HTTP 202 with `{ reviewId, status: "queued", fileCount, extraction }`
    - When `shouldUseDurable()` returns false: preserve existing queue-based logic unchanged
    - _Requirements: 1.1, 1.2, 4.1_

  - [x] 7.3 Modify `arbProcessExtractionJob.js` to start orchestration when flag ON
    - Import `shouldUseDurable` from feature flag module
    - When queue message arrives and `shouldUseDurable()` is true:
      - Start the extraction orchestration (for cases where queue was already populated)
      - Or skip processing (orchestration already started by HTTP handler)
    - When `shouldUseDurable()` is false: preserve existing sequential logic unchanged
    - _Requirements: 1.1, 1.2_

  - [ ]* 7.4 Write orchestrator replay tests (`api/src/durable/tests/orchestratorExtraction.test.js`)
    - Mock `context.df` to verify activity call sequence
    - Test DI quota gate: passes → fan-out proceeds
    - Test DI quota gate: fails → orchestration fails with 429 info
    - Test fan-out: N files → N extractSingleFile calls
    - Test timer race: workflow wins (success path)
    - Test timer race: timer wins (timeout path)
    - Test error aggregation from mixed file results
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.7_

  - [ ]* 7.5 Write fan-out property tests (`api/src/durable/tests/fanout.property.test.js`)
    - **Property 6: Fan-out activity count equals file count**
    - **Validates: Requirements 4.3**
    - Use fast-check to generate arbitrary file lists (1-50 files)
    - Verify orchestrator schedules exactly N activities for N files
    - **Property 7: extractSingleFile result completeness**
    - **Validates: Requirements 4.4**
    - Use fast-check to generate arbitrary file inputs
    - Verify result always contains all required fields with correct types
    - Minimum 100 iterations per property

- [x] 8. Checkpoint — Validate extraction orchestration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Contract Tests and API Shape Validation
  - [x] 9.1 Write contract tests (`api/src/durable/tests/contract.test.js`)
    - Validate POST /run-agent-review 202 response shape: `{ reviewId, traceId, status, startedAt, message }`
    - Validate GET /agent-status response shapes for idle, running, completed, failed states
    - Validate POST /extract 202 response shape: `{ reviewId, status, fileCount, extraction }`
    - Validate error responses (400, 404, 429, 503) return `{ error: string }` shape
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 10.1, 10.2, 10.3, 10.4_

  - [ ]* 9.2 Write API contract property tests (`api/src/durable/tests/apiContract.property.test.js`)
    - **Property 3: API contract response shape completeness**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
    - Use fast-check to generate arbitrary field values for each status type
    - Verify all required fields present with correct types
    - **Property 4: Error response shape invariant**
    - **Validates: Requirements 10.4**
    - Use fast-check to generate arbitrary error messages
    - Verify response body contains only `error` field of type string
    - **Property 5: JSON serialization round-trip**
    - **Validates: Requirements 10.5**
    - Use fast-check to generate arbitrary response payloads
    - Verify `JSON.parse(JSON.stringify(payload))` deep-equals original
    - Minimum 100 iterations per property

- [x] 10. Observability and Infrastructure
  - [x] 10.1 Add storage transaction alert to `infrastructure/terraform/monitoring.tf`
    - Add `azurerm_monitor_metric_alert` resource for Storage transaction count
    - Scope to the Function App's storage account
    - Trigger when transactions exceed threshold in 15-minute window
    - Wire to existing action group
    - _Requirements: 8.1, 12.3_

  - [x] 10.2 Add orchestration failure alert to `infrastructure/terraform/monitoring.tf`
    - Add alert rule for orchestration failures using Application Insights custom metrics
    - Trigger on orchestration failure rate exceeding threshold
    - Wire to existing action group
    - _Requirements: 8.1_

  - [x] 10.3 Add structured logging with custom properties to orchestrators
    - In `orchestratorAgentReview.js`: emit structured log on completion with `{ orchestrationDuration, activityCount, completionStatus, traceId }`
    - In `orchestratorExtraction.js`: emit structured log on completion with `{ orchestrationDuration, fileCount, successCount, errorCount, traceId }`
    - Use `context.log()` with JSON-structured messages for Application Insights correlation
    - Emit custom metric for orchestration duration
    - _Requirements: 8.3, 8.4_

  - [x] 10.4 Update `ARCHITECTURE.md` with durable functions documentation
    - Add section describing the durable orchestration architecture
    - Document the feature flag routing mechanism
    - Document the timer race pattern and retry policies
    - Document the fan-out/fan-in pattern for extraction
    - Reference the rollback strategy
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 10.5 Create rollback runbook document (`docs/durable-functions-rollback-runbook.md`)
    - Document tier 1 rollback: set flag to DRAIN
    - Document tier 2 rollback: set flag to OFF after drain completes
    - Document tier 3 rollback: deploy previous code version
    - Include verification steps for each tier
    - Include monitoring queries to check in-flight orchestration status
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 11. Final Checkpoint — Full validation
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major phase
- Property tests validate universal correctness properties from the design document
- The `runAgent` activity intentionally has NO retry policy (Foundry agent handles retries internally)
- All activities are self-contained with no shared mutable state
- The legacy path remains fully functional and unmodified when the feature flag is OFF or DRAIN
- Instance IDs are deterministic SHA-256 hex (first 48 chars) to prevent duplicates and avoid Storage key encoding issues
- Fan-out concurrency is bounded by `maxConcurrentActivityFunctions=3` in host.json, not in orchestrator code
