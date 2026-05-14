# ARB Review — Foundry Agents API: Full Solution Plan

**Subscription:** `<your-azure-subscription-id>`


---

## 1. Executive Summary 

The ARB Review solution will be re-deployed from scratch in a new Azure subscription using **Azure AI Foundry Agents API** as the AI backbone. The primary chat deployment is **model-router**, so the runtime can route each ARB prompt to the most suitable eligible model without deploying every underlying GPT model separately. This eliminates the Chat Completions boilerplate, delegates system prompt management to the Foundry portal, and enables built-in File Search (vector retrieval) without requiring Azure AI Search to leave the Free tier.

**Key strategic decisions:**
- Foundry Agents API replaces raw Chat Completions — cleaner separation of AI logic from application code
- Free tier AI Search retained — saves ~$75/month vs Basic upgrade
- Foundry vector store handles knowledge file retrieval — $0.02/month for 200 KB of files
- Consumption-plan Azure Functions — zero fixed compute cost
- All secrets in Key Vault — enterprise security posture from day 0
- Bicep IaC — single `az deployment` command provisions everything

**Budget constraint: Total solution cost MUST remain under $60 USD/month at all usage levels.**

**Target monthly cost: $8–15 at 200 reviews/month. Hard ceiling: $30 at 500 reviews/month — well within the $60 budget.**

---

## 2. Architecture Design 

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Azure Subscription                                              │
│  Resource Group: rg-arb-review-prod  (East US 2)                 │
│                                                                  │
│  ┌──────────────┐     ┌────────────────────────────────────┐    │
│  │  Static Web  │────▶│  Azure Functions (Consumption)     │    │
│  │  App (Free)  │     │  func-arb-review-api               │    │
│  │  Next.js UI  │     │  22 HTTP triggers                  │    │
│  └──────────────┘     └────────────┬───────────────────────┘    │
│                                    │  Managed Identity           │
│              ┌─────────────────────┼──────────────────────┐     │
│              ▼                     ▼                       ▼     │
│  ┌─────────────────┐  ┌──────────────────────┐  ┌──────────────┐│
│  │  Storage Acct   │  │  AI Foundry Project  │  │  AI Search  ││
│  │  starbrevprod   │  │  proj-arb-review     │  │  (Free)     ││
│  │  ├ Blob (files) │  │  ┌────────────────┐  │  │ arb-docs    ││
│  │  ├ Table (jobs) │  │  │ ARB-Review-    │  │  │ index       ││
│  │  └ Queue        │  │  │ Agent          │  │  └──────────────┘│
│  └─────────────────┘  │  │ ├ model-router │  │                  │
│                        │  │ ├ System Prompt│  │  ┌──────────────┐│
│  ┌─────────────────┐  │  │ └ File Search  │  │  │  Document   ││
│  │  Key Vault      │  │  │   vector store │  │  │  Intel.     ││
│  │  kv-arb-review  │  │  └────────────────┘  │  │  (Free 500pg)│
│  │  (all secrets)  │  │                       │  └──────────────┘
│  └─────────────────┘  │  ┌────────────────┐  │                  │
│                        │  │ text-embedding │  │  ┌──────────────┐│
│  ┌─────────────────┐  │  │ -3-large       │  │  │  App Insights││
│  │  Foundry Hub    │  │  └────────────────┘  │  │  + Log Ana.  ││
│  │  hub-arb-review │  └──────────────────────┘  └──────────────┘│
│  └─────────────────┘                                             │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Foundry Agents API Flow (vs old Chat Completions)

**Old flow (Chat Completions):**
```
API call → build 6,000-token system prompt → build 10,000-token user message
         → single REST call to /chat/completions → parse JSON from response
```

**New flow (Foundry Agents API):**
```
API call → build user message only (review data + evidence + search chunks)
         → POST /threads                    (create thread)
         → POST /threads/{id}/messages      (add user message)
         → POST /threads/{id}/runs          (trigger ARB-Review-Agent)
         → GET  /threads/{id}/runs/{runId}  (poll: queued → in_progress → completed)
         → GET  /threads/{id}/messages      (get assistant response)
         → DELETE /threads/{id}             (cleanup)
         → parse JSON from assistant message content
```

The agent stores the system prompt + knowledge vector store — your code only sends the review-specific data per request.

### 2.3 Resource Inventory

| Resource | Name | SKU | Purpose |
|---|---|---|---|
| Resource Group | `rg-arb-review-prod` | — | Container |
| AI Foundry Hub | `hub-arb-review-prod` | Standard | AI governance layer |
| AI Foundry Project | `proj-arb-review-prod` | — | Agent host |
| AI Services | `ai-arb-review-prod` | S0 | OpenAI + Agents endpoint |
| Storage Account | `starbrevprod01` | LRS Standard | Blobs + Tables + Queues |
| Azure Functions | `func-arb-review-api` | Consumption Y1 | API backend (22 functions) |
| App Service Plan | `asp-arb-review` | Y1 (Dynamic) | Functions host |
| Static Web App | `swa-arb-review-prod` | Free | Next.js frontend |
| AI Search | `srch-arb-review-prod` | Free | ARB document chunk index |
| Document Intelligence | `di-arb-review-prod` | Free (S0 if >500pg/mo) | PDF extraction |
| Application Insights | `appi-arb-review-prod` | Pay-as-you-go | Observability |
| Log Analytics | `law-arb-review-prod` | Pay-as-you-go | Log sink |
| Key Vault | `kv-arb-review-prod` | Standard | All secrets |

**Model deployments (inside AI Services):**

| Model | Deployment Name | SKU | TPM |
|---|---|---|---|
| `model-router` | `model-router` | GlobalStandard | 100K |
| `text-embedding-3-large` | `arb-embedding` | GlobalStandard | 120K |

---

## 3. Cost Model 

### Fixed monthly costs

| Resource | Cost |
|---|---|
| AI Foundry Hub | $0 (no standalone charge) |
| Azure Functions Consumption | $0 (first 1M executions free) |
| Static Web App Free | $0 |
| AI Search Free | $0 |
| Document Intelligence Free (≤500 pages/month) | $0 |
| Storage (~2 GB LRS) | ~$0.50 |
| App Insights (5 GB free/month) | $0 |
| Key Vault (10K ops free) | ~$0.03 |
| **Fixed total** | **~$0.53/month** |

### Variable costs (per review)

| Component | Cost | Notes |
|---|---|---|
| model-router input (~14K tokens) | Variable by routed model | User message with review data |
| model-router output (~4K tokens) | Variable by routed model | Findings + scorecard JSON |
| File Search tool overhead (~2K tokens) | $0.0008 | Agent retrieves knowledge chunks |
| text-embedding-3-large (~1K tokens) | $0.00013 | Doc chunk indexing at upload |
| Document Intelligence | $0 | Within 500-page free tier |
| **Cost per review** | **~$0.013** | |

### Monthly projections

| Reviews/month | AI cost | Total (incl. fixed) |
|---|---|---|
| 50 | $0.65 | ~$1.50 |
| 100 | $1.30 | ~$2.50 |
| 200 | $2.60 | ~$4.00 |
| 500 | $6.50 | ~$8.50 |
| 1,000 | $13.00 | ~$15.00 |

**Hard ceiling: ~$30/month even at 2,000 reviews/month — less than half the $60 budget cap.**

> **Budget guard:** Set an Azure Cost Management budget with a $40 warning alert and a $55 hard alert on resource group `rg-arb-review-prod`. This ensures spend is caught well before hitting the $60 ceiling.

---

## 4. Phased Delivery Plan

### Phase 0 — Prerequisites (Day 0, ~2 hours)
- [ ] Confirm Contributor access to target Azure subscription
- [ ] Confirm East US 2 quota for `model-router` GlobalStandard (request if needed — can take 24h)
- [ ] Clone source repository + confirm code is available
- [ ] `az login` + `az account set --subscription <your-subscription-id>`

### Phase 1 — Infrastructure Provisioning (Day 1, ~3 hours)
- [ ] Author `main.bicep` with all 13 resources
- [ ] Run `az deployment group create` — fully automated
- [ ] Verify all resources healthy in Azure portal
- [ ] Assign RBAC roles (Managed Identity → Storage, AI Services, Search, Key Vault)

### Phase 2 — Foundry Agent Setup (Day 1–2, ~2 hours)
- [ ] Deploy `model-router` + `text-embedding-3-large` model deployments
- [ ] Upload 3 knowledge files to Foundry
- [ ] Create vector store from knowledge files
- [ ] Create `ARB-Review-Agent` with system prompt + File Search tool
- [ ] Test agent via Foundry portal playground
- [ ] Store Agent ID in Key Vault

### Phase 3 — Code Migration (Day 2–4, ~16 hours)
- [ ] Update `arb-foundry-agent.js` — replace Chat Completions with Agents API
- [ ] Update environment variable names
- [ ] Update `local.settings.json` template
- [ ] Deploy Functions app
- [ ] Smoke-test end-to-end locally

### Phase 4 — Frontend Deployment (Day 4–5, ~4 hours)
- [ ] Configure Static Web App with API proxy settings
- [ ] Set `NEXT_PUBLIC_API_URL` environment variable
- [ ] Deploy Next.js app via `az staticwebapp` or GitHub Actions
- [ ] Verify all 7 ARB review routes load correctly

### Phase 5 — Validation (Day 5–6, ~4 hours)
- [ ] Upload test PDF → extract → run agent review → verify findings
- [ ] Verify scorecard scores in normal range (no near-zero fallback scores)
- [ ] Verify Critical findings render as Critical in the UI
- [ ] Run Playwright E2E suite against production URL
- [ ] Load test: 10 concurrent reviews (check Table Storage job isolation)

### Phase 6 — Go-Live (Day 7)
- [ ] Set custom domain on Static Web App (if applicable)
- [ ] Enable App Insights alerts (error rate > 5%, latency > 120s)
- [ ] Create Azure Cost Management budget on `rg-arb-review-prod`: $40 warning alert, $55 hard alert (enforces < $60 constraint)
- [ ] Document all env vars in Key Vault + README
- [ ] Deliver handover runbook

**Total timeline: 7 days solo. 4 days with two engineers in parallel.**

---

## 5. Infrastructure as Code 

The entire infrastructure is expressed as a single Bicep file at `infrastructure/main.bicep`. One command provisions all 13 resources with correct RBAC wiring.

### Deployment command

```bash
az group create \
  --name rg-arb-review-prod \
  --location eastus2

az deployment group create \
  --resource-group rg-arb-review-prod \
  --template-file infrastructure/main.bicep \
  --parameters env=prod prefix=arb-review
```

### Key Bicep modules

**Storage Account** — LRS Standard, TLS 1.2, no public blob access, two containers:
- `arb-inputfiles` — uploaded ARB review documents
- `arb-agent-knowledge` — rubric/guidance/schema files for Foundry vector store

**AI Services (S0)** — Hosts both model deployments and the Foundry Agents API endpoint. System-assigned managed identity enabled.

**Model Deployments:**
- `model-router` on GlobalStandard (100K TPM) — primary chat deployment for ARB reviews
- `text-embedding-3-large` on GlobalStandard (120K TPM) — vector store embeddings

**AI Foundry Hub + Project** — Hub owns Key Vault and Storage references. Project is the agent host. Hub MI gets Storage Blob Data Contributor for knowledge file access.

**Azure Functions (Consumption Y1)** — System-assigned MI. App Settings reference Key Vault secrets via `@Microsoft.KeyVault(SecretUri=...)` — no plaintext secrets.

**Key Vault (Standard, RBAC mode)** — Stores: `foundry-agent-id`, `search-api-key`, `docint-key`. Function App MI gets `Key Vault Secrets User` role.

**AI Search (Free)** — Full-text search index for uploaded ARB document chunks. The `searchArbDocuments()` function already falls back silently to simple search when semantic ranking is unavailable on Free tier.

**Document Intelligence (F0 Free)** — 500 pages/month free. Upgrade path to S0 ($0.001/page) is a single SKU change in Bicep.

**Static Web App (Free)** — Deployed to **East US 2** (same region as all other resources). Hosts the Next.js 16 frontend. Upgrade to Standard ($9/month) available if rate limiting becomes an issue.

**Application Insights + Log Analytics** — 30-day retention, 5 GB/month free ingestion. Linked to Functions for end-to-end distributed tracing.

---

## 6. Code Migration Plan 

### 6.1 Files to change

| File | Change Type | Effort |
|---|---|---|
| `api/src/shared/arb-foundry-agent.js` | Major rewrite of AI call layer | 4h |
| `api/src/shared/arb-search.js` | No change needed (fallback already in place) | — |
| `api/local.settings.json.example` | Update env var names | 15min |
| `api/src/shared/arb-review-store.js` | No change needed | — |
| `api/src/functions/*.js` | No change needed | — |
| `frontend/` | Update `NEXT_PUBLIC_API_URL` | 15min |

### 6.2 Agents API transport layer

```javascript
// arb-foundry-agent.js — Layer 1: HTTP transport
const FOUNDRY_PROJECT_ENDPOINT = (process.env.FOUNDRY_PROJECT_ENDPOINT || "").replace(/\/+$/, "");
const FOUNDRY_AGENT_ID = process.env.FOUNDRY_AGENT_ID || "";
const AGENTS_API_VERSION = "2025-01-01-preview";

async function agentsRequest(method, path, body) {
  const url = `${FOUNDRY_PROJECT_ENDPOINT}/agents/v1.0${path}?api-version=${AGENTS_API_VERSION}`;
  const credential = new DefaultAzureCredential();
  const token = await credential.getToken("https://ml.azure.com/.default");

  const res = await fetchWithTimeout(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token.token}`
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!res.ok) {
    const text = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Agents API ${method} ${path} failed ${res.status}: ${text}`);
  }
  return res.status === 204 ? null : res.json();
}
```

### 6.3 Thread lifecycle manager

```javascript
// arb-foundry-agent.js — Layer 2: Thread lifecycle
async function runAgentOnThread(userMessage) {
  const thread = await agentsRequest("POST", "/threads", {});

  try {
    await agentsRequest("POST", `/threads/${thread.id}/messages`, {
      role: "user",
      content: userMessage
    });

    const run = await agentsRequest("POST", `/threads/${thread.id}/runs`, {
      agent_id: FOUNDRY_AGENT_ID
    });

    const completedRun = await pollRunToCompletion(thread.id, run.id);
    if (completedRun.status !== "completed") {
      throw new Error(`Agent run ended with status: ${completedRun.status}`);
    }

    const msgList = await agentsRequest("GET", `/threads/${thread.id}/messages`);
    const assistantMsg = (msgList.data ?? []).find((m) => m.role === "assistant");
    return assistantMsg?.content?.[0]?.text?.value ?? "";

  } finally {
    // Always cleanup — no orphaned threads
    await agentsRequest("DELETE", `/threads/${thread.id}`).catch(() => {});
  }
}

async function pollRunToCompletion(threadId, runId, maxMs = 240000) {
  const deadline = Date.now() + maxMs;
  let delay = 2000;
  while (Date.now() < deadline) {
    await sleep(delay);
    delay = Math.min(delay * 1.5, 15000); // exponential backoff up to 15s
    const run = await agentsRequest("GET", `/threads/${threadId}/runs/${runId}`);
    if (["completed", "failed", "cancelled", "expired"].includes(run.status)) return run;
  }
  throw new Error("Agent run polling timeout (4 minutes exceeded)");
}
```

### 6.4 New environment variables

| Variable | Value | Source |
|---|---|---|
| `FOUNDRY_PROJECT_ENDPOINT` | `https://proj-arb-review-prod.eastus2.api.azureml.ms` | Bicep output |
| `FOUNDRY_AGENT_ID` | `<agent-id>` | Key Vault reference |
| `AZURE_SEARCH_ENDPOINT` | `https://srch-arb-review-prod.search.windows.net` | Bicep output |
| `AZURE_SEARCH_KEY` | `<key>` | Key Vault reference |
| `AZURE_DOCINT_ENDPOINT` | `<endpoint>` | Bicep output |
| `AZURE_DOCINT_KEY` | `<key>` | Key Vault reference |
| `AZURE_STORAGE_ACCOUNT_NAME` | `starbrevprod01` | Bicep output |

**Removed variables (no longer needed):**
- `FOUNDRY_ENDPOINT` → replaced by `FOUNDRY_PROJECT_ENDPOINT`
- `FOUNDRY_MODEL` → model is set in agent config, not in code
- `FOUNDRY_API_KEY` → replaced by Managed Identity token (no key needed)

---

## 7. Foundry Agent Configuration *(Azure AI Architect)*

### Agent setup via CLI

```bash
# 1. Get project endpoint
PROJECT_ENDPOINT=$(az ml workspace show \
  --name proj-arb-review-prod \
  --resource-group rg-arb-review-prod \
  --query 'discovery_url' -o tsv | sed 's|/discovery||')

# 2. Get auth token
TOKEN=$(az account get-access-token \
  --resource https://ml.azure.com \
  --query accessToken -o tsv)

# 3. Upload each knowledge file
FILE_ID_1=$(curl -s -X POST "${PROJECT_ENDPOINT}/agents/v1.0/files?api-version=2025-01-01-preview" \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "file=@docs/foundry-knowledge/azure_arb_review_rubrics_v1_1.md;type=text/plain" \
  -F "purpose=assistants" | jq -r '.id')

# (repeat for _runtime_tooling_guidance and _output_schema files)

# 4. Create vector store
VECTOR_STORE_ID=$(curl -s -X POST \
  "${PROJECT_ENDPOINT}/agents/v1.0/vector_stores?api-version=2025-01-01-preview" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"arb-knowledge-store\",\"file_ids\":[\"${FILE_ID_1}\",\"${FILE_ID_2}\",\"${FILE_ID_3}\"]}" \
  | jq -r '.id')

# 5. Create agent
AGENT_ID=$(curl -s -X POST \
  "${PROJECT_ENDPOINT}/agents/v1.0/agents?api-version=2025-01-01-preview" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"ARB-Review-Agent\",
    \"model\": \"model-router\",
    \"instructions\": \"<system prompt>\",
    \"tools\": [{\"type\": \"file_search\"}],
    \"tool_resources\": {
      \"file_search\": {
        \"vector_store_ids\": [\"${VECTOR_STORE_ID}\"]
      }
    },
    \"response_format\": {\"type\": \"json_object\"}
  }" | jq -r '.id')

# 6. Store Agent ID in Key Vault
az keyvault secret set \
  --vault-name kv-arb-review-prod \
  --name foundry-agent-id \
  --value "${AGENT_ID}"
```

---

## 8. RBAC Matrix 

| Identity | Resource | Role | Reason |
|---|---|---|---|
| Function App MI | Storage Account | Storage Blob Data Contributor | Upload/read ARB files |
| Function App MI | Storage Account | Storage Table Data Contributor | Job tracking + review state |
| Function App MI | AI Services | Cognitive Services OpenAI User | Call Agents API + embeddings |
| Function App MI | Key Vault | Key Vault Secrets User | Read secrets at runtime |
| Function App MI | AI Search | Search Index Data Contributor | Index + query ARB doc chunks |
| Function App MI | Document Intelligence | Cognitive Services User | Extract PDFs |
| Foundry Hub MI | Storage Account | Storage Blob Data Contributor | Foundry reads knowledge files |
| Your user account | Key Vault | Key Vault Secrets Officer | Write secrets during setup |
| Your user account | Resource Group | Contributor | Manage all resources |

All roles use **Managed Identity — no secrets in code or config files** except Key Vault references.

---

## 9. Risks and Mitigation 

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `model-router` quota not available in East US 2 | Medium | High | Pre-check quota Day 0; fallback to East US or West US 2 |
| Agents API polling timeout on large reviews | Medium | Medium | 4-minute max poll; fallback to `buildFallbackAgentReview()` already implemented |
| Free AI Search 50 MB limit hit | Low | Medium | Monitor index size via App Insights; cleanup old review indexes on expiry |
| Static Web App Free tier rate limit | Low | Low | Generous limits; upgrade to Standard ($9/month) if needed |
| Doc Intelligence 500-page free tier exceeded | Low | Medium | Alert at 400 pages/month; upgrade to S0 ($0.001/page) — adds ~$0.50/month |
| Thread orphaning if Function crashes mid-run | Low | Low | `finally` block always deletes thread regardless of outcome |

---

## 10. Success Criteria *(Senior PM + Senior Director)*

| Criterion | Verification Method |
|---|---|
| All 13 Azure resources provisioned | `az resource list --resource-group rg-arb-review-prod` returns 13 resources |
| Agent responds with valid JSON | Foundry portal playground returns parseable scorecard |
| End-to-end review completes in < 90 seconds | Playwright test timer on `arb-live-review.spec.ts` |
| Critical findings display as Critical | Upload doc with security gap; verify severity in UI |
| Fallback produces non-zero score | Kill `FOUNDRY_AGENT_ID`; scorecard shows mid-range score |
| Zero secrets in code or env files | `grep -r "api-key\|password\|secret" api/src/` returns nothing |
| Monthly cost < $60 | Azure Cost Management budget alert at $40 (warning) + $55 (hard) |
| Playwright E2E suite passes | `npx playwright test` green on production URL |

---

## 11. Execution Order Summary

```
Day 0  ─ Confirm quota + subscription access
Day 1  ─ az deployment group create (Bicep) → all 13 resources live in ~8 minutes
Day 1  ─ Upload knowledge files → create vector store → create agent → store ID in KV
Day 2  ─ Rewrite arb-foundry-agent.js (Agents API transport + thread lifecycle)
Day 3  ─ Local integration test with real Foundry endpoint
Day 4  ─ Deploy Functions app → smoke-test all API endpoints
Day 5  ─ Deploy Next.js → Static Web App
Day 6  ─ Full E2E validation + Playwright suite
Day 7  ─ Budget alerts + monitoring dashboard + handover runbook
```

---

## 12. Repository Structure

```
Cloud-Architecture-Review-Intelligence/
├── infrastructure/
│   └── main.bicep                         ← provisions all 13 Azure resources
├── api/
│   ├── src/
│   │   ├── functions/                     ← 22 Azure Function HTTP triggers
│   │   └── shared/
│   │       ├── arb-foundry-agent.js       ← Foundry Agents API integration
│   │       ├── arb-review-store.js        ← Table Storage + review lifecycle
│   │       ├── arb-rules-engine.js        ← Deterministic rules (14 WAF/CAF rules)
│   │       └── arb-search.js             ← Azure AI Search (Free tier, with fallback)
│   └── local.settings.json.example
├── frontend/                              ← Next.js 16, 7 ARB review routes
├── data/
│   └── arb-rules/
│       ├── waf-rules.json                 ← 10 WAF deterministic rules
│       ├── caf-rules.json                 ← 4 CAF rules
│       └── internal-rules.json           ← 2 documentation rules
├── docs/
│   ├── foundry-knowledge/
│   │   ├── azure_arb_review_rubrics_v1_1.md
│   │   ├── azure_arb_runtime_tooling_guidance_v1_1.md
│   │   └── azure_arb_output_schema_v1_1.json
│   └── specs/
│       └── arb-deterministic-rules-catalog.md
└── tests/
    ├── e2e/                               ← 30+ Playwright end-to-end tests
    └── agent-eval/                        ← Agent quality evaluation cases
```
