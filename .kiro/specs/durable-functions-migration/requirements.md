# Requirements Document

## Introduction

This specification defines the migration of two long-running Azure Functions workflows to Azure Durable Functions orchestrations:

1. **Agent Review Pipeline** — currently uses fire-and-forget background promises with `arbjobs` Table Storage polling. Migrates to a sequential Durable Functions orchestration with 6 activity phases.

2. **Extraction Fan-out** — currently processes all files sequentially in a single queue-triggered function. Migrates to a fan-out/fan-in Durable Functions orchestrator that processes files in parallel with bounded concurrency.

The migration must preserve the existing public API contract, stay within the Azure Functions Consumption plan (Y1) budget ceiling of $60/month, and be feature-flag gated for safe rollout.

## Glossary

- **Orchestrator**: A Durable Functions orchestrator function that coordinates the execution of activity functions in a defined sequence or pattern
- **Activity_Function**: A Durable Functions activity function that performs a single unit of work within an orchestration
- **Feature_Flag**: The `USE_DURABLE_ORCHESTRATION` application setting that controls whether requests route to the legacy or durable implementation (values: `ON`, `OFF`, `DRAIN`)
- **Task_Hub**: The Azure Storage-backed state store for Durable Functions orchestration instances, named `arb{env}v1`
- **Instance_ID**: A SHA-256 hashed identifier used to uniquely identify a Durable Functions orchestration instance
- **Fan_Out_Fan_In**: A Durable Functions pattern where multiple activity functions execute in parallel and results are aggregated upon completion
- **Timer_Race**: A pattern where an orchestration races a durable timer against the main workflow to enforce a maximum execution timeout
- **DI_Quota_Gate**: The per-user Document Intelligence hourly usage quota check that must execute before extraction activities begin
- **API_Gateway**: The HTTP-triggered Azure Functions that serve as the public API surface (`POST /run-agent-review`, `GET /agent-status`, `POST /extract`, `GET /extraction-status`)
- **Drain_Mode**: A Feature_Flag state where new orchestrations use the legacy path while in-flight durable orchestrations are allowed to complete
- **Contract_Test**: An automated test that validates the HTTP response shape and status codes of the public API remain byte-compatible with the frontend expectations

## Requirements

### Requirement 1: Feature Flag Routing

**User Story:** As a platform operator, I want to control whether requests use the legacy or durable orchestration path via a configuration toggle, so that I can safely roll out and roll back the migration without code deployments.

#### Acceptance Criteria

1. WHEN the `USE_DURABLE_ORCHESTRATION` app setting is set to `ON`, THE API_Gateway SHALL route incoming requests to the Durable Functions orchestration path
2. WHEN the `USE_DURABLE_ORCHESTRATION` app setting is set to `OFF`, THE API_Gateway SHALL route incoming requests to the legacy fire-and-forget path
3. WHEN the `USE_DURABLE_ORCHESTRATION` app setting is set to `DRAIN`, THE API_Gateway SHALL route new requests to the legacy path AND allow in-flight durable orchestrations to complete
4. IF the `USE_DURABLE_ORCHESTRATION` app setting is absent or contains an unrecognized value, THEN THE API_Gateway SHALL default to the `OFF` behavior
5. THE API_Gateway SHALL read the Feature_Flag value at request time without requiring a function app restart

### Requirement 2: Agent Review Durable Orchestration

**User Story:** As a platform engineer, I want the agent review pipeline to run as a Durable Functions orchestration with discrete activity phases, so that the workflow gains automatic checkpointing, replay resilience, and observable execution history.

#### Acceptance Criteria

1. WHEN a review request is accepted with Feature_Flag `ON`, THE Orchestrator SHALL execute six sequential Activity_Functions: load review data, search documents, run rules engine, invoke AI agent, persist results, and sync outputs
2. THE Orchestrator SHALL use a Timer_Race pattern with a 30-minute durable timer to enforce a maximum orchestration execution time
3. IF the Timer_Race expires before the workflow completes, THEN THE Orchestrator SHALL mark the job status as `failed` with a timeout error message
4. THE Orchestrator SHALL generate the Instance_ID by computing a SHA-256 hash of the review ID combined with the user ID
5. IF an orchestration with the same Instance_ID is already running, THEN THE API_Gateway SHALL return the existing orchestration status instead of starting a duplicate
6. THE Activity_Function that invokes the AI agent SHALL NOT add retry policies because the Foundry agent client already implements internal 3-retry logic with exponential backoff
7. WHEN the orchestration completes successfully, THE Orchestrator SHALL write the job result to the `arbjobs` Table Storage with status `completed`
8. IF any Activity_Function throws an unhandled error, THEN THE Orchestrator SHALL catch the error, write status `failed` to `arbjobs` Table Storage, and terminate gracefully

### Requirement 3: API Contract Preservation

**User Story:** As a frontend developer, I want the public API responses to remain identical after the migration, so that no changes are required to the Static Web App or frontend polling logic.

#### Acceptance Criteria

1. WHEN a `POST /api/arb/reviews/{reviewId}/run-agent-review` request is accepted, THE API_Gateway SHALL return HTTP 202 with a JSON body containing `reviewId`, `traceId`, `status: "running"`, `startedAt`, and `message` fields
2. WHEN a `GET /api/arb/reviews/{reviewId}/agent-status` request is made for a running orchestration, THE API_Gateway SHALL return HTTP 200 with a JSON body containing `reviewId`, `traceId`, `status: "running"`, `startedAt`, `elapsedMs`, and `message` fields
3. WHEN a `GET /api/arb/reviews/{reviewId}/agent-status` request is made for a completed orchestration, THE API_Gateway SHALL return HTTP 200 with a JSON body containing `reviewId`, `traceId`, `status: "completed"`, `startedAt`, `completedAt`, `agentReviewCompleted`, `findingsCount`, `recommendation`, `overallScore`, and `confidenceLevel` fields
4. WHEN a `GET /api/arb/reviews/{reviewId}/agent-status` request is made for a failed orchestration, THE API_Gateway SHALL return HTTP 200 with a JSON body containing `reviewId`, `traceId`, `status: "failed"`, `startedAt`, `completedAt`, and `error` fields
5. THE API_Gateway SHALL return identical HTTP status codes and Content-Type headers as the legacy implementation for all success and error scenarios

### Requirement 4: Extraction Fan-Out Orchestration

**User Story:** As a platform engineer, I want the document extraction workflow to process files in parallel using a fan-out/fan-in pattern, so that extraction completes faster while respecting Document Intelligence concurrency limits.

#### Acceptance Criteria

1. WHEN an extraction request is accepted with Feature_Flag `ON`, THE Orchestrator SHALL first execute the DI_Quota_Gate as a single Activity_Function before fanning out to file processing activities
2. IF the DI_Quota_Gate Activity_Function returns a quota exceeded error, THEN THE Orchestrator SHALL fail the extraction with a 429-equivalent status and quota reset information
3. AFTER the DI_Quota_Gate passes, THE Orchestrator SHALL fan out by scheduling one Activity_Function per file for extraction processing
4. EACH extraction Activity_Function SHALL return a self-contained result object including extracted text, evidence records, and any errors, without relying on shared mutable state
5. WHEN all file extraction activities complete, THE Orchestrator SHALL aggregate results and persist the combined extraction state to Table Storage
6. THE Orchestrator SHALL enforce a maximum concurrent activity execution limit of 3 for extraction activities via the `maxConcurrentActivityFunctions` host.json setting
7. THE Orchestrator SHALL use a Timer_Race pattern with a 30-minute durable timer to enforce a maximum extraction orchestration execution time

### Requirement 5: Task Hub Configuration

**User Story:** As a platform operator, I want the Durable Functions task hub to be properly configured for the Consumption plan environment, so that orchestration state is reliably stored and isolated per environment.

#### Acceptance Criteria

1. THE Task_Hub SHALL be named using the pattern `arb{env}v1` where `{env}` is the deployment environment identifier (e.g., `arbprodv1`, `arbstagingv1`)
2. THE Task_Hub SHALL use the default Azure Storage provider for Durable Functions state persistence
3. THE host.json SHALL configure `maxConcurrentActivityFunctions` to `3` for the extraction fan-out concurrency limit
4. THE host.json SHALL configure the `durableTask` extension within the existing extension bundle version range `[4.*, 5.0.0)`

### Requirement 6: Instance ID Generation

**User Story:** As a platform engineer, I want orchestration instance IDs to be deterministic and safe for Azure Storage, so that duplicate orchestrations are prevented and no character-encoding issues occur.

#### Acceptance Criteria

1. THE Instance_ID for agent review orchestrations SHALL be computed as the hex-encoded SHA-256 hash of the string `review:{reviewId}:{userId}`
2. THE Instance_ID for extraction orchestrations SHALL be computed as the hex-encoded SHA-256 hash of the string `extraction:{reviewId}:{userId}`
3. THE Instance_ID SHALL contain only hexadecimal characters (0-9, a-f) to avoid Azure Storage key encoding issues

### Requirement 7: Dependency and Runtime Configuration

**User Story:** As a platform engineer, I want the durable-functions npm package properly integrated into the existing Node.js 20 runtime, so that orchestrations execute reliably on the Consumption plan.

#### Acceptance Criteria

1. THE package.json SHALL include `durable-functions` version `^3.0.0` as a production dependency
2. THE implementation SHALL be compatible with `@azure/functions` version `^4.14.0` and the Node.js v4 programming model
3. THE implementation SHALL be compatible with the existing extension bundle version range `[4.*, 5.0.0)` without requiring additional extension installations
4. THE Function App SHALL remain on the Linux Consumption plan (Y1 SKU) without requiring a plan upgrade

### Requirement 8: Observability and Cost Guards

**User Story:** As a platform operator, I want monitoring alerts and budget guards for durable orchestration storage transactions, so that I can detect cost anomalies and prevent budget overruns from the additional storage operations.

#### Acceptance Criteria

1. THE monitoring infrastructure SHALL include an alert rule that triggers when Azure Storage transaction count exceeds a defined threshold within a 15-minute window
2. THE monitoring infrastructure SHALL preserve the existing $60/month budget ceiling with alert notifications at 67% and 92% thresholds
3. WHEN an orchestration completes, THE Orchestrator SHALL emit a structured log entry containing orchestration duration, activity count, and completion status for Application Insights correlation
4. THE Orchestrator SHALL emit a custom metric for orchestration duration to enable latency alerting

### Requirement 9: Rollback Strategy

**User Story:** As a platform operator, I want a tiered rollback plan for the durable functions migration, so that I can revert to the legacy implementation at multiple levels of severity without data loss.

#### Acceptance Criteria

1. WHEN a rollback is initiated at tier 1 (config toggle), THE platform operator SHALL set the Feature_Flag to `DRAIN` to stop new durable orchestrations while allowing in-flight ones to complete
2. WHEN a rollback is initiated at tier 2 (drain complete), THE platform operator SHALL set the Feature_Flag to `OFF` after all in-flight orchestrations have completed or timed out
3. WHEN a rollback is initiated at tier 3 (code rollback), THE platform operator SHALL deploy the previous code version which removes the durable orchestration code paths
4. THE legacy `arbjobs` Table Storage polling mechanism SHALL remain functional and unmodified while the Feature_Flag is `OFF` or `DRAIN`
5. THE legacy queue-based extraction path SHALL remain functional and unmodified while the Feature_Flag is `OFF` or `DRAIN`

### Requirement 10: Contract Testing

**User Story:** As a platform engineer, I want automated contract tests that validate both success and error response shapes, so that API compatibility regressions are caught before deployment.

#### Acceptance Criteria

1. THE test suite SHALL include contract tests that validate the HTTP 202 response shape from `POST /run-agent-review` matches the frontend expectation
2. THE test suite SHALL include contract tests that validate the HTTP 200 response shapes for `running`, `completed`, `failed`, and `idle` statuses from `GET /agent-status`
3. THE test suite SHALL include contract tests that validate the HTTP 202 response shape from `POST /extract` matches the frontend expectation
4. THE test suite SHALL include contract tests that validate error responses (400, 404, 429, 503) return the expected `{ error: string }` shape
5. FOR ALL valid response payloads, parsing then serializing then parsing the JSON SHALL produce an equivalent object (round-trip property)

### Requirement 11: Staged Rollout

**User Story:** As a platform operator, I want a staged rollout plan progressing from dev through canary to full production, so that the migration is validated at each stage before broader exposure.

#### Acceptance Criteria

1. THE rollout plan SHALL progress through stages: dev environment validation, staging environment validation, canary 10% traffic, canary 50% traffic, and full 100% production
2. WHILE in canary stages, THE platform operator SHALL monitor orchestration success rate, latency p95, and storage transaction costs before advancing to the next stage
3. IF orchestration failure rate exceeds 5% during any canary stage, THEN THE platform operator SHALL initiate the tier 1 rollback procedure
4. THE staging validation stage SHALL run for a minimum of 5 days with representative workloads before advancing to canary

### Requirement 12: Terraform Infrastructure Updates

**User Story:** As a platform engineer, I want the Terraform configuration updated to include the `USE_DURABLE_ORCHESTRATION` app setting and task hub configuration, so that the feature flag and durable functions settings are managed as infrastructure-as-code.

#### Acceptance Criteria

1. THE functions.tf SHALL include the `USE_DURABLE_ORCHESTRATION` app setting with a default value of `OFF` managed via a Terraform variable
2. THE host.json configuration SHALL include the `durableTask` section with the environment-specific Task_Hub name
3. THE monitoring.tf SHALL include a storage transaction alert rule scoped to the Function App's storage account
