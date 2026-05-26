# cari-microsoft-learn-mcp-grounding

## Purpose

Use the Microsoft Learn MCP server correctly as CARI's official Microsoft guidance layer. Ensure WAF, CAF, ALZ, and Azure service-specific guidance is fetched, persisted, and cited in every finding. Handle MCP failure gracefully without blocking the review workflow.

## When to Use

- Implementing or reviewing MCP query logic in `fetchMicrosoftLearnGrounding.js`
- Investigating incorrect or missing `learnMoreUrl` values in ARB findings
- Debugging MCP timeout, fallback, or metadata persistence issues
- Adding a new finding domain that requires a new MCP query template
- Reviewing MCP audit metadata in Azure Table Storage

## When Not to Use

- Reading or processing customer evidence — MCP is for Microsoft guidance only
- Replacing the Foundry ARB agent — MCP provides grounding context to the agent
- Inventing `learn.microsoft.com` URLs — only use MCP results or the approved fallback list

## Inputs

- ARB finding domain and severity (drives MCP query template)
- Azure service names extracted from customer evidence
- `fetchMicrosoftLearnGrounding.js` configuration (timeout, fallback URLs)
- Microsoft Learn MCP server (available via Claude Code MCP integration: `mcp__ms-learn__microsoft_docs_search`)

## Process

1. Select MCP query template based on finding domain (Security, Reliability, Cost, Operations, Governance, Architecture)
2. Sanitize query: strip customer project names, IP ranges, and sensitive architecture terms
3. Call `microsoft_docs_search` with sanitized query; capture title, URL, rank, relevance score
4. If relevance score < 0.5 or MCP fails/times out → use approved domain fallback URL; set `fallbackUsed: true`
5. Persist `mcpMetadata` object to Table Storage alongside review result
6. Store `queryHash` (SHA-256 of sanitized query) as audit key; do not store raw unsanitized query

## Required mcpMetadata Model

```json
{
  "query": "sanitized query text",
  "queryHash": "sha256-hex",
  "resultTitle": "string",
  "resultUrl": "https://learn.microsoft.com/...",
  "resultRank": 1,
  "retrievedAt": "ISO-8601",
  "relevanceScore": 0.85,
  "usedForFindingId": "finding-001",
  "fallbackUsed": false,
  "mcpStatus": "success|timeout|failed|fallback",
  "promptVersion": "v6",
  "rulesVersion": "1.1"
}
```

## Outputs

- `{docs, mcpMetadata}` from `fetchMicrosoftLearnGrounding`
- `learnMoreUrl` in each finding (from MCP result or approved fallback — never invented)
- `mcpMetadata` persisted to Table Storage
- `mcpStatus` emitted to `review-telemetry.js`

## CARI Runtime Mapping

| Component | File |
|---|---|
| MCP orchestration + metadata | `api/src/shared/fetchMicrosoftLearnGrounding.js` |
| Metadata persistence | `api/src/shared/runAgent.js` (stores mcpMetadata after run) |
| ARB agent grounding context | Foundry ARB agent system instructions |
| Board-pack references slide | `api/src/shared/arb-pptx-export.js` |
| Telemetry | `api/src/shared/review-telemetry.js` |

## Approved Fallback URLs

| Domain | Fallback |
|---|---|
| Security | `https://learn.microsoft.com/azure/security/fundamentals/overview` |
| Reliability | `https://learn.microsoft.com/azure/reliability/overview` |
| Cost | `https://learn.microsoft.com/azure/cost-management-billing/` |
| Operations | `https://learn.microsoft.com/azure/azure-monitor/overview` |
| Governance | `https://learn.microsoft.com/azure/governance/` |
| Architecture | `https://learn.microsoft.com/azure/architecture/framework/` |

## Guardrails

- NEVER invent a `learn.microsoft.com` URL — only MCP results or approved fallbacks
- NEVER persist raw query text containing customer project name or IP address — sanitize first
- NEVER block the reviewer workflow on MCP failure — fallback must always produce a URL
- NEVER use MCP to read customer-uploaded evidence files
- Do NOT call MCP more than once per finding per review run — cache within the run

## Examples

```
Valid:   domain="Security" → query "Azure network security best practices WAF" → MCP returns HTTPS result → persisted
Invalid: domain="Security" → query "Contoso banking hub vnet security" → customer name in query → must sanitize first
Valid:   MCP timeout → fallback URL used → fallbackUsed: true → mcpStatus: "timeout"
Invalid: learnMoreUrl set to "https://learn.microsoft.com/made-up-page" → not from MCP or fallback list
```

## Acceptance Criteria

- `fetchMicrosoftLearnGrounding` returns `{docs, mcpMetadata}` object (not just docs array)
- `mcpMetadata` written to Table Storage on every agent run
- `fallbackUsed: true` and `mcpStatus: "timeout"` set correctly when MCP times out
- No `learn.microsoft.com` URL appears in a finding that is not from MCP result or approved fallback list
- Persisted query text does not contain customer project name or IP range
- `durationMs` and `mcpStatus` appear in Application Insights telemetry for every MCP call
