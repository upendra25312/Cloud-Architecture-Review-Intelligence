# ADR-002: Azure Durable Functions for workflow orchestration

**Status:** Accepted  
**Date:** 2026-05  
**Deciders:** Platform team

---

## Context

The CARI platform runs multi-step AI review workflows involving document extraction, agent reasoning, rules evaluation, search indexing, and result persistence. These workflows can take minutes per submission and involve multiple asynchronous activities. The original implementation used direct HTTP-triggered functions, which could not reliably recover from transient failures or scale activity parallelism.

## Decision

Adopt **Azure Durable Functions** (SDK v3) for orchestrating Agent Review and Document Extraction workflows, with feature flag control (`USE_DURABLE_ORCHESTRATION`) for gradual rollout.

## Alternatives considered

| Option | Reason not chosen |
|--------|------------------|
| Azure Logic Apps | Higher latency, less control over retry logic, harder to test locally |
| Azure Service Bus + independent consumers | More infrastructure to manage, harder to trace end-to-end workflow state |
| Direct chained HTTP calls | No built-in retry, no state persistence across restarts |
| Azure Container Apps Jobs | Heavier infrastructure footprint for this workload size |

## Consequences

### Positive
- Automatic retry with configurable back-off on transient failures
- Workflow state persisted in Azure Storage — survives restarts and scaling events
- Fan-out/fan-in pattern enables parallel document processing (max 3 concurrent activities)
- Feature flag allows instant rollback to direct execution path
- Full workflow history queryable via Durable Task Framework
- No additional infrastructure beyond existing Azure Storage

### Negative / trade-offs
- Durable Functions require Azure Storage (table + queue + blob) for task hub
- Cold start latency slightly higher than direct HTTP calls
- Debugging orchestration state requires familiarity with Durable Task concepts
- Feature flag adds code complexity during transition period

### Risks
- `USE_DURABLE_ORCHESTRATION` must remain OFF until full validation is complete in production
- Task hub name (`arbprodv1`) is fixed — renaming requires draining in-flight orchestrations

## Related decisions
- [ADR-003](./adr-003-managed-identity-no-keys.md) — storage access via Managed Identity
