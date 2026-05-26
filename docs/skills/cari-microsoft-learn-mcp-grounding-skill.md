# CARI Microsoft Learn MCP Grounding Skill Specification

_Design spec — Mode B output, 2026-05-26. See `.claude/skills/cari-microsoft-learn-mcp-grounding/SKILL.md` for the Claude Code skill._

---

## Purpose

Ensure CARI uses the Microsoft Learn MCP server correctly as the official Microsoft guidance layer for WAF, CAF, ALZ, and Azure service-specific grounding. Persist MCP metadata for audit trail. Handle MCP failure gracefully without blocking the review workflow.

---

## Trigger Conditions

- Implementing or reviewing MCP query logic in the ARB agent pipeline
- Investigating incorrect or missing `learnMoreUrl` values in findings
- Debugging MCP timeout or fallback scenarios
- Adding new finding domains (must have MCP query template)
- Reviewing MCP metadata persistence in Table Storage

---

## Inputs

- ARB finding domain and severity (drives MCP query template selection)
- Azure service names extracted from customer evidence
- `fetchMicrosoftLearnGrounding.js` configuration (timeout, fallback URLs)
- MS Learn MCP server connection (via Claude Code MCP integration)

---

## Process

1. **Query template selection:** Map finding domain (Security, Reliability, Cost, Operations, Governance) to a specific WAF/CAF/ALZ MS Learn query
2. **Query sanitization:** Strip customer project names, IP ranges, and sensitive architecture terms from query text before sending and before persistence
3. **MCP call:** Call `microsoft_docs_search` tool with sanitized query; capture title, URL, rank, relevance score
4. **Metadata persistence:** Store `mcpMetadata` object in Table Storage alongside the review result (implemented in C4)
5. **Fallback handling:** On MCP timeout or failure, use approved fallback `learn.microsoft.com` URLs; set `fallbackUsed: true`, `mcpStatus: "timeout"|"failed"`
6. **Relevance scoring:** If relevance score is below threshold (0.5), downgrade to fallback rather than using low-quality result
7. **Cache check:** If same query was made within TTL for this reviewId, reuse cached result; do not call MCP twice for the same finding

---

## Required MCP Metadata Model

```json
{
  "query": "sanitized query text",
  "queryHash": "sha256-hex",
  "resultTitle": "string",
  "resultUrl": "https://learn.microsoft.com/...",
  "resultRank": 1,
  "retrievedAt": "2026-05-26T00:00:00.000Z",
  "relevanceScore": 0.85,
  "usedForFindingId": "finding-001",
  "fallbackUsed": false,
  "mcpStatus": "success",
  "promptVersion": "v6",
  "rulesVersion": "1.1"
}
```

---

## Outputs

- `{docs, mcpMetadata}` returned from `fetchMicrosoftLearnGrounding`
- `learnMoreUrl` populated in each finding (never invented; always from MCP or approved fallback)
- `mcpMetadata` persisted to Table Storage for audit
- `mcpStatus` in telemetry for observability

---

## CARI Runtime Mapping

| Step | File |
|---|---|
| MCP orchestration | `api/src/shared/fetchMicrosoftLearnGrounding.js` |
| Metadata persistence | `api/src/shared/runAgent.js` (stores mcpMetadata after agent run) |
| Foundry agent grounding context | ARB agent system instructions |
| Board-pack references | `api/src/shared/arb-pptx-export.js` → references slide |
| Telemetry | `api/src/shared/review-telemetry.js` |

---

## Guardrails

- Never invent a `learn.microsoft.com` URL — only use MCP results or approved fallbacks
- Never persist raw customer-sensitive query text — sanitize first, persist queryHash
- Never block reviewer workflow on MCP failure — fallback must always succeed
- Never use MCP to read customer evidence — MCP is for Microsoft guidance only
- Do not call MCP more than once per finding per review run — cache within the run

---

## Approved Fallback URLs (by domain)

| Domain | Fallback URL |
|---|---|
| Security | `https://learn.microsoft.com/azure/security/fundamentals/overview` |
| Reliability | `https://learn.microsoft.com/azure/reliability/overview` |
| Cost | `https://learn.microsoft.com/azure/cost-management-billing/` |
| Operations | `https://learn.microsoft.com/azure/azure-monitor/overview` |
| Governance | `https://learn.microsoft.com/azure/governance/` |
| Architecture | `https://learn.microsoft.com/azure/architecture/framework/` |

---

## Acceptance Criteria

- [ ] `fetchMicrosoftLearnGrounding` returns `{docs, mcpMetadata}` (not just `docs`)
- [ ] `mcpMetadata` is persisted to Table Storage on every agent run
- [ ] `fallbackUsed: true` and `mcpStatus: "timeout"` set when MCP times out
- [ ] No `learn.microsoft.com` URL is invented — all come from MCP or fallback list
- [ ] Query text persisted does not contain customer project name or IP range
- [ ] MCP call appears in `review-telemetry.js` with `durationMs` and `mcpStatus`

---

## Risks

- MCP timeout during peak load → fallback handles gracefully
- MS Learn content changes → stale MCP results possible; `retrievedAt` timestamp enables cache invalidation
- Customer-sensitive terms in query → mitigated by query sanitization (P1 backlog item)
