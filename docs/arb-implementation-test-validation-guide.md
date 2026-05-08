# ARB Review Intelligence — Implementation, Test & Validation Guide

**Subscription:** `<your-azure-subscription-id>` · **Region:** East US 2 · **Budget:** < $60 USD/month  
**Expert Team:** Senior Director · Azure Cloud Architect · Azure AI Architect · Senior PM · Full Stack Developer

---

## How to Read This Document

Each section is owned by a specific role. Work flows left to right:  
**Architect provisions → AI Architect configures agent → Developer migrates code → QA validates → PM gates → Director signs off.**

Every phase has a **gate** — a set of pass/fail checks that must be green before the next phase begins. No gate = no proceed.

---

## PART 1 — IMPLEMENTATION

---

### Phase 0: Environment Setup *(All Roles — Day 0, ~2 hours)*

Everyone on the team runs these steps before any work begins.

#### 0.1 Toolchain

```bash
# Verify required tools
az --version          # Azure CLI 2.60+
node --version        # Node.js 20+
npm --version         # npm 10+
gh --version          # GitHub CLI 2.40+
pwsh --version        # PowerShell 7+ (for Bicep validation)

# Install Bicep
az bicep install
az bicep version      # 0.28+

# Install Playwright (for E2E tests)
npx playwright install --with-deps chromium
```

#### 0.2 Subscription Access

```bash
# Login and set subscription
az login
az account set --subscription <your-subscription-id>

# Confirm access level (need Contributor or Owner)
az role assignment list \
  --assignee $(az account show --query user.name -o tsv) \
  --subscription <your-subscription-id> \
  --query "[].roleDefinitionName" -o table
```

#### 0.3 Quota Pre-Check *(Azure AI Architect)*

Run before provisioning — quota requests take up to 24 hours.

```bash
# Check gpt-4.1-mini GlobalStandard quota in East US 2
az cognitiveservices usage list \
  --location eastus2 \
  --query "[?contains(name.value, 'OpenAI.Standard.gpt-4.1-mini')]" \
  -o table

# Check text-embedding-3-large quota
az cognitiveservices usage list \
  --location eastus2 \
  --query "[?contains(name.value, 'OpenAI.Standard.text-embedding')]" \
  -o table
```

**Gate 0 — Proceed only if:**
- [ ] All team members can run `az account show` against the subscription
- [ ] `gpt-4.1-mini` GlobalStandard quota ≥ 100K TPM available in East US 2
- [ ] `text-embedding-3-large` GlobalStandard quota ≥ 120K TPM available in East US 2

---

### Phase 1: Infrastructure Provisioning *(Azure Cloud Architect — Day 1, ~3 hours)*

#### 1.1 Create Resource Group

```bash
az group create \
  --name rg-arb-review-prod \
  --location eastus2 \
  --tags project=arb-review environment=prod budget-limit=60USD
```

#### 1.2 Deploy Bicep Template

The full Bicep template is at `infrastructure/main.bicep`. It provisions all 13 resources in a single transaction.

```bash
# Validate first (dry run — no resources created)
az deployment group validate \
  --resource-group rg-arb-review-prod \
  --template-file infrastructure/main.bicep \
  --parameters env=prod prefix=arb-review

# Deploy (~8 minutes)
az deployment group create \
  --resource-group rg-arb-review-prod \
  --template-file infrastructure/main.bicep \
  --parameters env=prod prefix=arb-review \
  --output table
```

#### 1.3 Capture Outputs

```bash
# Save all outputs to a local env file (never commit this file)
az deployment group show \
  --resource-group rg-arb-review-prod \
  --name main \
  --query properties.outputs \
  -o json > .deployment-outputs.json

cat .deployment-outputs.json
```

Expected outputs:
- `functionAppName` — `func-arb-review-api`
- `storageAccountName` — `starbrevprod01`
- `aiServicesEndpoint` — `https://ai-arb-review-prod.cognitiveservices.azure.com/`
- `searchEndpoint` — `https://srch-arb-review-prod.search.windows.net`
- `staticWebAppUrl` — `<generated>.azurestaticapps.net`
- `projectEndpoint` — `https://proj-arb-review-prod.eastus2.api.azureml.ms`

#### 1.4 Verify RBAC Assignments

The Bicep template creates all role assignments. Verify each one:

```bash
FUNC_MI=$(az functionapp identity show \
  --name func-arb-review-api \
  --resource-group rg-arb-review-prod \
  --query principalId -o tsv)

echo "Function App MI: $FUNC_MI"

# Should show 5 role assignments
az role assignment list \
  --assignee "$FUNC_MI" \
  --query "[].{Role:roleDefinitionName, Scope:scope}" \
  -o table
```

Expected roles:
1. `Storage Blob Data Contributor` on storage account
2. `Storage Table Data Contributor` on storage account
3. `Cognitive Services OpenAI User` on AI Services
4. `Key Vault Secrets User` on Key Vault
5. `Search Index Data Contributor` on AI Search

#### 1.5 Store Initial Secrets in Key Vault

```bash
KV_NAME="kv-arb-review-prod"

# AI Search admin key
SEARCH_KEY=$(az search admin-key show \
  --service-name srch-arb-review-prod \
  --resource-group rg-arb-review-prod \
  --query primaryKey -o tsv)
az keyvault secret set --vault-name $KV_NAME --name search-api-key --value "$SEARCH_KEY"

# Document Intelligence key
DOCINT_KEY=$(az cognitiveservices account keys list \
  --name di-arb-review-prod \
  --resource-group rg-arb-review-prod \
  --query key1 -o tsv)
az keyvault secret set --vault-name $KV_NAME --name docint-key --value "$DOCINT_KEY"
```

**Gate 1 — Proceed only if:**
- [ ] `az resource list --resource-group rg-arb-review-prod --query "length(@)"` returns `13`
- [ ] All 5 RBAC role assignments exist for Function App MI
- [ ] Key Vault contains `search-api-key` and `docint-key` secrets
- [ ] Function App can read secrets: `az functionapp config appsettings list --name func-arb-review-api --resource-group rg-arb-review-prod` shows no `@Microsoft.KeyVault` resolution errors

---

### Phase 2: Foundry Agent Setup *(Azure AI Architect — Day 1–2, ~3 hours)*

#### 2.1 Deploy Model Deployments

```bash
AI_NAME="ai-arb-review-prod"
RG="rg-arb-review-prod"

# Deploy gpt-4.1-mini (GlobalStandard, 100K TPM)
az cognitiveservices account deployment create \
  --name $AI_NAME \
  --resource-group $RG \
  --deployment-name arb-gpt41mini \
  --model-name gpt-4.1-mini \
  --model-version 2025-04-14 \
  --model-format OpenAI \
  --sku-name GlobalStandard \
  --sku-capacity 100

# Deploy text-embedding-3-large (GlobalStandard, 120K TPM)
az cognitiveservices account deployment create \
  --name $AI_NAME \
  --resource-group $RG \
  --deployment-name arb-embedding \
  --model-name text-embedding-3-large \
  --model-version 1 \
  --model-format OpenAI \
  --sku-name GlobalStandard \
  --sku-capacity 120

# Verify both deployments succeeded
az cognitiveservices account deployment list \
  --name $AI_NAME \
  --resource-group $RG \
  --query "[].{Name:name, State:properties.provisioningState}" \
  -o table
```

Both must show `Succeeded` before proceeding.

#### 2.2 Upload Knowledge Files to Foundry

```bash
PROJECT_ENDPOINT="https://proj-arb-review-prod.eastus2.api.azureml.ms"
API_VER="2025-01-01-preview"
TOKEN=$(az account get-access-token --resource https://ml.azure.com --query accessToken -o tsv)

# Upload rubrics file
FILE_ID_1=$(curl -s -X POST \
  "${PROJECT_ENDPOINT}/agents/v1.0/files?api-version=${API_VER}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "file=@docs/foundry-knowledge/azure_arb_review_rubrics_v1_1.md;type=text/plain" \
  -F "purpose=assistants" | jq -r '.id')
echo "Rubrics file ID: $FILE_ID_1"

# Upload runtime guidance file
FILE_ID_2=$(curl -s -X POST \
  "${PROJECT_ENDPOINT}/agents/v1.0/files?api-version=${API_VER}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "file=@docs/foundry-knowledge/azure_arb_runtime_tooling_guidance_v1_1.md;type=text/plain" \
  -F "purpose=assistants" | jq -r '.id')
echo "Guidance file ID: $FILE_ID_2"

# Upload output schema file
FILE_ID_3=$(curl -s -X POST \
  "${PROJECT_ENDPOINT}/agents/v1.0/files?api-version=${API_VER}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "file=@docs/foundry-knowledge/azure_arb_output_schema_v1_1.json;type=application/json" \
  -F "purpose=assistants" | jq -r '.id')
echo "Schema file ID: $FILE_ID_3"
```

#### 2.3 Create Vector Store

```bash
VECTOR_STORE_ID=$(curl -s -X POST \
  "${PROJECT_ENDPOINT}/agents/v1.0/vector_stores?api-version=${API_VER}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"arb-knowledge-store\",
    \"file_ids\": [\"${FILE_ID_1}\", \"${FILE_ID_2}\", \"${FILE_ID_3}\"],
    \"chunking_strategy\": {
      \"type\": \"static\",
      \"static\": { \"max_chunk_size_tokens\": 2048, \"chunk_overlap_tokens\": 200 }
    }
  }" | jq -r '.id')

echo "Vector Store ID: $VECTOR_STORE_ID"

# Wait for indexing to complete (poll status)
while true; do
  STATUS=$(curl -s "${PROJECT_ENDPOINT}/agents/v1.0/vector_stores/${VECTOR_STORE_ID}?api-version=${API_VER}" \
    -H "Authorization: Bearer ${TOKEN}" | jq -r '.status')
  echo "Status: $STATUS"
  [ "$STATUS" = "completed" ] && break
  sleep 5
done
```

#### 2.4 Create the ARB Review Agent

```bash
# Extract system prompt from existing arb-foundry-agent.js
# The ARB_SYSTEM_PROMPT constant is at approximately line 175
SYSTEM_PROMPT=$(node -e "
  const src = require('fs').readFileSync('api/src/shared/arb-foundry-agent.js', 'utf8');
  const match = src.match(/ARB_SYSTEM_PROMPT\s*=\s*\`([\s\S]*?)\`/);
  if (match) process.stdout.write(match[1].trim());
")

AGENT_ID=$(curl -s -X POST \
  "${PROJECT_ENDPOINT}/agents/v1.0/agents?api-version=${API_VER}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg name "ARB-Review-Agent" \
    --arg model "arb-gpt41mini" \
    --arg instructions "$SYSTEM_PROMPT" \
    --arg vsid "$VECTOR_STORE_ID" \
    '{
      name: $name,
      model: $model,
      instructions: $instructions,
      tools: [{"type": "file_search"}],
      tool_resources: {
        file_search: { vector_store_ids: [$vsid] }
      },
      response_format: { type: "json_object" },
      temperature: 0.2
    }')" | jq -r '.id')

echo "Agent ID: $AGENT_ID"

# Store in Key Vault
az keyvault secret set \
  --vault-name kv-arb-review-prod \
  --name foundry-agent-id \
  --value "$AGENT_ID"
```

#### 2.5 Smoke Test Agent via Portal

Before writing any code, manually verify the agent works:

1. Open `https://ai.azure.com` → project `proj-arb-review-prod` → **Agents**
2. Click `ARB-Review-Agent` → **Test in playground**
3. Paste this minimal test message:

```
REVIEW CONTEXT:
Project: Test App
Customer: Contoso
Target Regions: East US

REQUIREMENTS (1):
- REQ-001: The application must support high availability

EVIDENCE FACTS (1):
- ev-001: No disaster recovery plan documented

EXISTING RULE FINDINGS: none
SEARCH CONTEXT: none

Perform a full ARB review and return valid JSON.
```

4. Verify the response:
   - Is valid JSON (no markdown fences)
   - Contains `findings`, `scorecard`, `recommendation`, `missingEvidence`
   - `findings` array has ≥ 1 item
   - `scorecard.overallScore` is a number 0–100

**Gate 2 — Proceed only if:**
- [ ] Both model deployments show `Succeeded`
- [ ] Vector store status is `completed` with 3 files indexed
- [ ] Agent ID stored in Key Vault
- [ ] Portal playground returns valid JSON with all required top-level fields
- [ ] `recommendation` is one of: `Approved`, `Needs Revision`, `Rejected`

---

### Phase 3: Backend Code Migration *(Full Stack Developer — Days 2–4, ~16 hours)*

#### 3.1 Update `arb-foundry-agent.js`

Replace the Chat Completions transport with the Foundry Agents API. The change is isolated to this one file — all other 21 functions remain unchanged.

**Key changes:**
1. Add `agentsRequest()` — HTTP transport using `DefaultAzureCredential`
2. Add `runAgentOnThread()` — thread create → message → run → poll → get response → cleanup
3. Add `pollRunToCompletion()` — exponential backoff polling, 4-minute max
4. Replace `chatCompletionsRequest()` call in `runArbAgentReview()` with `runAgentOnThread()`
5. Remove `buildSystemMessages()` — system prompt now lives in the agent config
6. Update `getFoundryConfiguration()` to check `FOUNDRY_PROJECT_ENDPOINT` + `FOUNDRY_AGENT_ID`

The `buildUserMessage()`, `parseAgentResponse()`, `parseSeverity()`, `buildFallbackAgentReview()`, and `getFoundryConfiguration()` functions are **unchanged**.

#### 3.2 Update `local.settings.json`

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_EXTENSION_VERSION": "~4",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "FOUNDRY_PROJECT_ENDPOINT": "https://proj-arb-review-prod.eastus2.api.azureml.ms",
    "FOUNDRY_AGENT_ID": "<from-key-vault-or-local-override>",
    "AZURE_SEARCH_ENDPOINT": "https://srch-arb-review-prod.search.windows.net",
    "AZURE_SEARCH_KEY": "<admin-key>",
    "AZURE_SEARCH_INDEX_NAME": "arb-documents",
    "AZURE_DOCINT_ENDPOINT": "https://di-arb-review-prod.cognitiveservices.azure.com/",
    "AZURE_DOCINT_KEY": "<key>",
    "AZURE_STORAGE_ACCOUNT_NAME": "starbrevprod01"
  }
}
```

#### 3.3 Deploy Functions App

```bash
cd api

# Install dependencies
npm ci

# Build (if TypeScript — otherwise skip)
npm run build --if-present

# Deploy to Azure
func azure functionapp publish func-arb-review-api --node

# Verify deployment — all 22 functions should appear
az functionapp function list \
  --name func-arb-review-api \
  --resource-group rg-arb-review-prod \
  --query "[].name" -o table
```

#### 3.4 Smoke Test Each Critical Endpoint

```bash
BASE="https://func-arb-review-api.azurewebsites.net/api"
TOKEN="<your-auth-token>"

# Health check
curl -s "${BASE}/arb/health" | jq .

# Create a review
curl -s -X POST "${BASE}/arb/reviews" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"projectName":"Test","customerName":"Contoso","targetRegions":["East US"]}' | jq .

# Should return 201 with reviewId
```

**Gate 3 — Proceed only if:**
- [ ] All 22 functions deployed successfully
- [ ] `/api/arb/health` returns `200`
- [ ] Create review returns `201` with a `reviewId`
- [ ] No `KeyVault` resolution errors in Function App logs
- [ ] `az webapp log tail` shows no startup crashes

---

### Phase 4: Frontend Deployment *(Full Stack Developer — Days 4–5, ~4 hours)*

#### 4.1 Configure Static Web App

```bash
SWA_NAME="swa-arb-review-prod"
API_URL="https://func-arb-review-api.azurewebsites.net"

# Set environment variable for the frontend
az staticwebapp appsettings set \
  --name $SWA_NAME \
  --resource-group rg-arb-review-prod \
  --setting-names \
    NEXT_PUBLIC_API_URL="$API_URL" \
    NEXTAUTH_URL="https://$(az staticwebapp show --name $SWA_NAME --resource-group rg-arb-review-prod --query defaultHostname -o tsv)" \
    NEXTAUTH_SECRET="$(openssl rand -base64 32)"
```

#### 4.2 Deploy Next.js App

```bash
cd frontend

# Build
npm ci
npm run build

# Deploy via SWA CLI
npm install -g @azure/static-web-apps-cli
swa deploy ./out \
  --deployment-token $(az staticwebapp secrets list \
    --name swa-arb-review-prod \
    --resource-group rg-arb-review-prod \
    --query properties.apiKey -o tsv) \
  --env production
```

#### 4.3 Verify All 7 ARB Routes

| Route | Expected |
|---|---|
| `/arb` | Review list page loads |
| `/arb/new` | New review form renders |
| `/arb/[reviewId]` | Review detail page loads |
| `/arb/[reviewId]/upload` | File upload UI visible |
| `/arb/[reviewId]/extract` | Extraction status panel renders |
| `/arb/[reviewId]/review` | Agent review trigger + status polling works |
| `/arb/[reviewId]/findings` | Findings table + scorecard renders |

**Gate 4 — Proceed only if:**
- [ ] All 7 routes return HTTP 200
- [ ] No JavaScript console errors on any route
- [ ] API proxy correctly forwards requests to Function App (check Network tab)
- [ ] Auth flow completes (login → redirect back to app)

---

## PART 2 — TESTING

---

### Test Level 1: Unit Tests *(Full Stack Developer)*

Run locally before any deployment. These tests have zero Azure dependencies.

```bash
cd api
npm test
```

#### Critical unit test cases

**T1.1 — `parseSeverity` regression (Fix 1.3)**
```javascript
// arb-foundry-agent.test.js
test("parseSeverity preserves Critical", () => {
  expect(parseSeverity("Critical")).toBe("Critical");
  expect(parseSeverity("High")).toBe("High");
  expect(parseSeverity("Medium")).toBe("Medium");
  expect(parseSeverity("Low")).toBe("Low");
  expect(parseSeverity("garbage")).toBe("Medium"); // safe default
  expect(parseSeverity(undefined)).toBe("Medium");
});
```

**T1.2 — Fallback does not set criticalBlocker (Fix 1.1)**
```javascript
test("buildFallbackAgentReview does not trigger critical blocker", () => {
  const result = buildFallbackAgentReview({
    review: { projectName: "Test" },
    requirements: [],
    evidence: [],
    reason: "API timeout"
  });
  expect(result.scorecard.criticalBlockerCount).toBe(0);
  expect(result.scorecard.criticalBlockers).toEqual([]);
  result.findings.forEach(f => {
    expect(f.criticalBlocker).toBe(false);
  });
});
```

**T1.3 — Rules engine: zero findings on empty input**
```javascript
test("runDeterministicRules returns empty on empty review", () => {
  const { ruleFindings } = runDeterministicRules({
    review: { reviewId: "test-01" },
    requirements: [],
    evidence: [],
    files: []
  });
  expect(ruleFindings).toHaveLength(0);
});
```

**T1.4 — Rules engine: NET-001 fires on internet-facing without WAF**
```javascript
test("NET-001 fires when internet-facing evidence has no WAF", () => {
  const { ruleFindings } = runDeterministicRules({
    review: { reviewId: "test-02" },
    requirements: [],
    evidence: [{ summary: "The application is publicly accessible via the internet", category: "networking" }],
    files: [{ fileName: "design.pdf", extractionStatus: "Completed" }]
  });
  const net001 = ruleFindings.find(f => f.ruleId === "NET-001");
  expect(net001).toBeDefined();
  expect(net001.severity).toBe("Critical");
  expect(net001.criticalBlocker).toBe(true);
});
```

**T1.5 — Rules engine: NET-001 does NOT fire when WAF is present**
```javascript
test("NET-001 does not fire when WAF is documented", () => {
  const { ruleFindings } = runDeterministicRules({
    review: { reviewId: "test-03" },
    requirements: [],
    evidence: [
      { summary: "Application is internet-facing with Azure Front Door WAF enabled", category: "security" }
    ],
    files: [{ extractionStatus: "Completed" }]
  });
  const net001 = ruleFindings.find(f => f.ruleId === "NET-001");
  expect(net001).toBeUndefined();
});
```

**T1.6 — Token-Jaccard evidence matching**
```javascript
test("evidence matching uses Jaccard similarity", () => {
  const finding = {
    evidenceBasis: "no backup strategy documented",
    title: "Missing Backup Strategy",
    evidenceIds: []
  };
  const evidenceList = [
    { evidenceId: "ev-01", summary: "no disaster recovery or backup plan was found", sourceExcerpt: "backup strategy not documented" }
  ];
  const matched = resolveEvidenceForFinding(finding, evidenceList);
  expect(matched.length).toBeGreaterThan(0);
  expect(matched[0].evidenceId).toBe("ev-01");
});
```

**T1.7 — DOC-001 fires on insufficient files**
```javascript
test("DOC-001 fires when fewer than 2 files uploaded", () => {
  const { ruleFindings } = runDeterministicRules({
    review: { reviewId: "test-04" },
    requirements: [],
    evidence: [],
    files: [{ extractionStatus: "Completed" }]
  });
  const doc001 = ruleFindings.find(f => f.ruleId === "DOC-001");
  expect(doc001).toBeDefined();
});
```

**Pass criteria:** All unit tests green, 0 failures, 0 skipped.

---

### Test Level 2: Integration Tests *(Full Stack Developer + Cloud Architect)*

These tests hit real Azure resources. Run after Gate 1 (infrastructure live).

```bash
cd api
INTEGRATION=true npm test
```

#### T2.1 — Storage: CRUD round-trip

```javascript
test("Table Storage: write and read review", async () => {
  const review = await createArbReview(testPrincipal, {
    projectName: "Integration Test",
    customerName: "Test Corp"
  });
  const fetched = await getArbReview(testPrincipal, review.reviewId);
  expect(fetched.projectName).toBe("Integration Test");
  await deleteArbReview(testPrincipal, review.reviewId); // cleanup
});
```

#### T2.2 — AI Search: index and query

```javascript
test("AI Search: index chunk and retrieve it", async () => {
  await ensureArbSearchIndex();
  const chunks = await indexArbDocumentChunks(
    "integration-test-review",
    "file-001",
    "test.pdf",
    "security",
    "The application uses Azure WAF for boundary control"
  );
  expect(chunks).toBeGreaterThan(0);

  const results = await searchArbDocuments("integration-test-review", "WAF boundary control", 5);
  expect(results.length).toBeGreaterThan(0);
  expect(results[0].content).toContain("WAF");
});
```

#### T2.3 — Job tracking: multi-instance simulation

```javascript
test("Table Storage job tracker survives separate client instances", async () => {
  // Simulate instance A starting a job
  await writeJob("review-test", "user-test", { status: "running", traceId: "abc", startedAt: new Date().toISOString() });

  // Simulate instance B reading the job
  const job = await readJob("review-test", "user-test");
  expect(job.status).toBe("running");
  expect(job.traceId).toBe("abc");
});
```

#### T2.4 — Key Vault secret resolution

```javascript
test("Function App reads Key Vault secrets at startup", async () => {
  // Call an endpoint that uses FOUNDRY_AGENT_ID
  const res = await fetch(`${FUNC_BASE_URL}/api/arb/reviews/test/agent-status`, {
    headers: { Authorization: `Bearer ${testToken}` }
  });
  // If KV resolution failed, Functions would return 500 on startup
  expect(res.status).not.toBe(500);
});
```

**Pass criteria:** All integration tests green against live Azure resources.

---

### Test Level 3: Agent Evaluation Tests *(Azure AI Architect)*

These tests validate the AI output quality — correctness of findings, scoring accuracy, and format compliance. Run after Gate 2 (agent configured).

#### T3.1 — Well-documented review → Approved or Needs Revision

**Input:** Full review with security architecture doc, network diagram, HA design, DR plan, cost model.  
**Expected:**
- `recommendation` = `Approved` or `Needs Revision` (NOT `Rejected`)
- `scorecard.overallScore` ≥ 65
- `scorecard.criticalBlockerCount` = 0
- At least 3 findings with `severity: "High"` or lower
- `missingEvidence.length` ≥ 3 (some gaps always exist)

#### T3.2 — Security gap review → Critical findings present

**Input:** Review where network design doc mentions "publicly accessible" but no WAF/firewall documented.  
**Expected:**
- At least 1 finding with `severity: "Critical"`
- `criticalBlocker: true` on at least one finding
- `scorecard.criticalBlockerCount` ≥ 1
- `recommendation` = `Needs Revision` or `Rejected`
- NET-001 finding present with `source: "rules-engine"`

#### T3.3 — Near-empty submission → DOC rules fire

**Input:** Review with 0 files uploaded, 0 requirements, 0 evidence items.  
**Expected:**
- DOC-001 finding present
- DOC-002 finding present
- `scorecard.overallScore` ≤ 30
- `recommendation` = `Rejected`
- `missingEvidence.length` ≥ 5

#### T3.4 — Fallback path produces non-zero scorecard

**How to trigger:** Set `FOUNDRY_AGENT_ID` to an invalid value in local settings.  
**Expected:**
- `fallbackUsed: true` in response
- `scorecard.overallScore` between 30–70 (mid-range, not near-zero)
- `scorecard.criticalBlockerCount` = 0
- All findings have `criticalBlocker: false`
- No errors thrown to the caller

#### T3.5 — JSON format compliance

For every test run:
- [ ] Response is valid JSON (no markdown fences, no prose prefix)
- [ ] All 8 required top-level fields present: `reviewSummary`, `strengths`, `findings`, `missingEvidence`, `criticalBlockers`, `scorecard`, `recommendation`, `nextActions`
- [ ] `findings` array has ≥ 8 items (schema minimum)
- [ ] `missingEvidence` array has ≥ 5 items (schema minimum)
- [ ] `scorecard.dimensions` has exactly 8 entries matching the defined enum names
- [ ] `recommendation` is exactly one of: `Approved`, `Needs Revision`, `Rejected`
- [ ] No `"Critical"` severity finding silently appears as `"Medium"`

#### T3.6 — Evidence traceability

**Check:**
- Every finding that references an `evidenceId` has a corresponding `evidenceFound` entry
- Findings with no `evidenceIds` but with `evidenceBasis` text have at least 1 fuzzy-matched `evidenceFound` entry (Jaccard ≥ 0.12)
- `evidenceFound` entries contain: `evidenceId`, `summary`, `sourceFileName`, `factType`

**Run agent eval suite:**

```bash
cd tests/agent-eval
node run-eval.js --cases cases.json --endpoint https://func-arb-review-api.azurewebsites.net
```

**Pass criteria:** All 6 agent eval scenarios pass. No scenario returns invalid JSON. Fallback scenario overallScore ≥ 30.

---

### Test Level 4: End-to-End Tests — Playwright *(Full Stack Developer + QA)*

Run against the deployed production URL after Gates 3 and 4.

```bash
cd tests/e2e
PLAYWRIGHT_BASE_URL=https://<your-swa-url>.azurestaticapps.net \
npx playwright test --reporter=html
```

#### Critical E2E test cases

**T4.1 — Full golden-path workflow**
```
Login → Create new review → Upload 2 PDFs → Start extraction
→ Poll until Completed → Run agent review → Poll until Completed
→ View findings (≥8 items) → View scorecard → Download markdown export
```
Expected total duration: < 3 minutes.

**T4.2 — Extraction status lifecycle**
```
After starting extraction, poll /api/arb/reviews/{id}/extraction-status
every 5 seconds and verify state transitions:
"Not Started" → "Running" → "Completed"
Never skips a state. Never stays "Running" > 5 minutes.
```

**T4.3 — Agent status polling**
```
After POST /run-agent-review:
- Immediate response: status = "running"
- Poll /agent-status every 5 seconds
- Within 90 seconds: status = "completed"
- Response contains findingsCount ≥ 8
```

**T4.4 — Multi-session job isolation**
```
Session A: start agent review for review-001
Session B (new browser context): GET /agent-status for review-001
→ Session B must see status = "running" (not "idle")
Confirms Table Storage job tracking works across instances.
```

**T4.5 — Empty upload blocked**
```
Try to start extraction without uploading any files.
→ API returns 400 with "Upload files before starting extraction."
→ UI shows the error message (not a blank screen or 500 page)
```

**T4.6 — Critical finding display**
```
Upload a document that describes an internet-facing app with no WAF.
Run agent review. In the Findings page:
→ At least 1 finding shows "Critical" badge (red)
→ Severity badge text is "Critical" not "Medium"
```

**T4.7 — Export downloads**
```
After a completed review:
→ Download markdown export → file is non-empty, contains "# ARB Review"
→ Download CSV export → file has header row + ≥8 data rows
→ Download HTML export → file renders valid HTML with findings table
```

**Pass criteria:** All 7 E2E scenarios pass in headed Chromium. Zero test failures. Zero JavaScript console errors on any page.

---

### Test Level 5: Load & Concurrency Tests *(Azure Cloud Architect + Full Stack Developer)*

Run after E2E tests pass.

#### T5.1 — 10 concurrent reviews

```bash
# Use Artillery or k6
cat > load-test.yaml << 'EOF'
config:
  target: "https://func-arb-review-api.azurewebsites.net"
  phases:
    - duration: 60
      arrivalRate: 2
      name: "Ramp up"
    - duration: 120
      arrivalRate: 10
      name: "Peak load"
scenarios:
  - name: "Start agent review"
    flow:
      - post:
          url: "/api/arb/reviews/load-test-{{ $randomInt(1,100) }}/run-agent-review"
          headers:
            Authorization: "Bearer {{ token }}"
          expect:
            - statusCode: 202
EOF
npx artillery run load-test.yaml
```

**Expected under load:**
- No `429 Too Many Requests` errors (within reasonable rate)
- No cross-user job state leakage (each userId gets its own Table Storage row)
- Function App scales to handle concurrency without errors
- `activeJobs` Map pattern is NOT used — all state is in Table Storage

#### T5.2 — Large document batch

Upload 8 PDFs (each ~10 pages) to a single review. Start extraction.  
**Expected:**
- Returns `202` immediately (fire-and-forget confirmed)
- Each file's `extractionStatus` updates independently in Table Storage
- Total extraction completes within 8 minutes (1 min/file worst case)
- No Azure Function timeout errors

**Pass criteria:** Zero 5xx errors under load. No cross-user state leakage. Extraction completes for 8-file batch.

---

### Test Level 6: Security Tests *(Azure Cloud Architect)*

#### T6.1 — No secrets in source code

```bash
# Must return zero results
grep -r \
  -E "(api.key|apiKey|api-key|password|secret|connectionstring|AccountKey)" \
  --include="*.js" --include="*.ts" --include="*.json" \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  api/ frontend/

# Also check for raw Azure keys (format: 88-char base64)
grep -r -E "[a-zA-Z0-9+/]{88}=" api/ frontend/ --include="*.js"
```

Both commands must return zero results.

#### T6.2 — All endpoints require authentication

```bash
# Every ARB endpoint without a token must return 401
for ENDPOINT in \
  "arb/reviews" \
  "arb/reviews/test-id" \
  "arb/reviews/test-id/files" \
  "arb/reviews/test-id/agent-status"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    "https://func-arb-review-api.azurewebsites.net/api/$ENDPOINT")
  echo "$ENDPOINT → $STATUS"
  [ "$STATUS" = "401" ] || echo "FAIL: Expected 401, got $STATUS"
done
```

#### T6.3 — Blob containers not publicly accessible

```bash
# Both containers must have publicAccess: none
for CONTAINER in arb-inputfiles arb-agent-knowledge; do
  az storage container show \
    --account-name starbrevprod01 \
    --name $CONTAINER \
    --auth-mode login \
    --query properties.publicAccess \
    -o tsv
done
# Both must output "None" (not "Blob" or "Container")
```

#### T6.4 — CORS policy

```bash
# Allowed origins must be restricted (not wildcard "*")
az functionapp cors show \
  --name func-arb-review-api \
  --resource-group rg-arb-review-prod \
  --query allowedOrigins -o table
# Must only show the Static Web App domain and localhost for dev
```

**Pass criteria:** Zero secrets in code. All endpoints return 401 without token. Both containers have `publicAccess: None`. CORS restricted to known origins.

---

## PART 3 — VALIDATION GATES

---

### Gate Summary Table

| Gate | After Phase | Owner | Decision |
|---|---|---|---|
| Gate 0 | Setup | PM | ✓ All tools installed, quota confirmed |
| Gate 1 | Infrastructure | Cloud Architect | ✓ 13 resources live, RBAC complete |
| Gate 2 | Agent Setup | AI Architect | ✓ Agent returns valid JSON in portal |
| Gate 3 | Backend Code | Full Stack Dev | ✓ 22 functions deployed, API responds |
| Gate 4 | Frontend | Full Stack Dev | ✓ All 7 routes load, no console errors |
| Gate 5 | Testing | PM | ✓ All test levels green |
| Gate 6 | Go-Live | Senior Director | ✓ Cost < $60, security clean, signed off |

---

### Gate 5 Scorecard (Test Completion Checklist)

Complete this scorecard before requesting Gate 6 sign-off:

```
UNIT TESTS
  [ ] T1.1  parseSeverity("Critical") = "Critical"
  [ ] T1.2  Fallback criticalBlockerCount = 0
  [ ] T1.3  Rules engine: zero findings on empty input
  [ ] T1.4  NET-001 fires: internet-facing + no WAF
  [ ] T1.5  NET-001 silent: WAF documented
  [ ] T1.6  Jaccard evidence matching threshold 0.12
  [ ] T1.7  DOC-001 fires: < 2 files

INTEGRATION TESTS
  [ ] T2.1  Table Storage CRUD round-trip
  [ ] T2.2  AI Search index + query
  [ ] T2.3  Job tracker multi-instance
  [ ] T2.4  Key Vault secret resolution

AGENT EVALUATION
  [ ] T3.1  Well-documented review → score ≥ 65
  [ ] T3.2  Security gap → Critical finding present
  [ ] T3.3  Near-empty → DOC rules fire, score ≤ 30
  [ ] T3.4  Fallback → score 30–70, no critical blocker
  [ ] T3.5  JSON format compliance (all 8 fields)
  [ ] T3.6  Evidence traceability

END-TO-END (PLAYWRIGHT)
  [ ] T4.1  Full golden-path workflow < 3 min
  [ ] T4.2  Extraction status lifecycle correct
  [ ] T4.3  Agent status polling → completed < 90s
  [ ] T4.4  Multi-session job isolation
  [ ] T4.5  Empty upload blocked with correct error
  [ ] T4.6  Critical finding shows as "Critical" in UI
  [ ] T4.7  All 3 export formats download correctly

LOAD & CONCURRENCY
  [ ] T5.1  10 concurrent reviews: no 5xx, no state leakage
  [ ] T5.2  8-file batch extraction: completes < 8 min

SECURITY
  [ ] T6.1  Zero secrets in source code
  [ ] T6.2  All endpoints return 401 without token
  [ ] T6.3  Blob containers: publicAccess = None
  [ ] T6.4  CORS: no wildcard origin
```

**Minimum to proceed to Gate 6:** All unit + integration + agent eval + E2E tests green. Load and security tests green.

---

## PART 4 — GO-LIVE VALIDATION

---

### Gate 6: Senior Director Sign-Off Checklist

#### Functional Validation
- [ ] End-to-end review completes successfully in production
- [ ] Findings include both rule-engine findings (`source: "rules-engine"`) and AI findings (`source: "agent"`)
- [ ] Scorecard shows all 8 dimensions with scores
- [ ] Export artifacts (markdown, CSV, HTML) are non-empty and correctly formatted

#### Cost Validation
```bash
# Confirm budget alert is configured
az consumption budget list \
  --resource-group rg-arb-review-prod \
  --query "[].{Name:name, Amount:amount, Threshold:notifications[0].threshold}" \
  -o table
# Must show: amount=60, at least one threshold at 40 (warning) and 55 (action)

# Estimate current month spend
az consumption usage list \
  --start-date $(date -d "$(date +%Y-%m-01)" +%Y-%m-%d) \
  --end-date $(date +%Y-%m-%d) \
  --query "sum([].pretaxCost)" \
  -o tsv
```

- [ ] Budget alert exists: $40 warning, $55 hard limit, $60 cap
- [ ] Current month projected spend < $60

#### Observability Validation
```bash
# Confirm App Insights is receiving traces
az monitor app-insights query \
  --app appi-arb-review-prod \
  --resource-group rg-arb-review-prod \
  --analytics-query "requests | where timestamp > ago(1h) | summarize count()" \
  -o table
# Should show > 0 requests if smoke tests were run
```

- [ ] App Insights shows traces from deployment smoke tests
- [ ] Log Analytics workspace receiving Function App logs
- [ ] Alert rule configured: error rate > 5% → notify
- [ ] Alert rule configured: agent run latency > 120s → notify

#### Security Sign-Off
- [ ] `grep -r "api-key\|password\|AccountKey" api/src/` returns zero results
- [ ] All 5 RBAC roles use Managed Identity (no service principal keys)
- [ ] Key Vault access logs show only Function App MI reading secrets
- [ ] No storage containers or blobs are publicly accessible

#### Handover Checklist
- [ ] `README.md` updated with deployment instructions
- [ ] `docs/runbook.md` created covering: restart procedure, scaling, cost investigation, rollback
- [ ] All Key Vault secrets documented (names only, never values)
- [ ] GitHub Actions workflow or deployment script committed to repo
- [ ] Team members have Contributor access to the resource group

---

## PART 5 — POST GO-LIVE MONITORING

---

### App Insights Dashboard — Key Metrics to Watch

| Metric | Normal Range | Alert Threshold |
|---|---|---|
| Agent review duration | 20–60 seconds | > 120 seconds |
| Extraction duration per file | 15–45 seconds | > 90 seconds |
| API error rate | < 1% | > 5% |
| Function cold start time | < 3 seconds | > 10 seconds |
| AI Search query latency | < 500ms | > 2000ms |
| Monthly spend | $4–15 | > $40 (warning) / > $55 (hard) |

### Daily Health Check (5 minutes)

```bash
# 1. Check for failed agent runs in the last 24h
az monitor app-insights query \
  --app appi-arb-review-prod \
  --resource-group rg-arb-review-prod \
  --analytics-query "
    customEvents
    | where name == 'AgentReviewFailed'
    | where timestamp > ago(24h)
    | summarize count()
  " -o tsv

# 2. Check job table for stuck "running" jobs (> 10 min old)
az storage entity query \
  --account-name starbrevprod01 \
  --table-name arbjobs \
  --filter "status eq 'running'" \
  --auth-mode login \
  --query "items[?timestamp < '$(date -d '-10 minutes' -u +%Y-%m-%dT%H:%M:%SZ)']" \
  -o table

# 3. Check current month cost
az consumption usage list \
  --start-date $(date -d "$(date +%Y-%m-01)" +%Y-%m-%d) \
  --end-date $(date +%Y-%m-%d) \
  --query "sum([].pretaxCost)" -o tsv
```

### Cost Spike Investigation

If the monthly cost alert fires at $40:

1. Check which resource is consuming most: **Azure portal → Cost Management → Cost by resource**
2. Highest likely culprits in order:
   - `gpt-4.1-mini` token usage spike → check if any review loop is retrying repeatedly
   - Document Intelligence pages → check if large batches are being re-extracted
   - Storage transactions → check for runaway polling loops from frontend
3. If `gpt-4.1-mini` cost is spike driver: check App Insights for agent runs > 50K input tokens (indicates prompt bloat)
4. If projected to exceed $60: disable agent review endpoint temporarily via Function App setting `DISABLE_AGENT_REVIEW=true` until root cause is fixed

### Rollback Procedure

If a bad deployment causes errors:

```bash
# 1. Revert Function App to previous deployment slot (if slots configured)
az functionapp deployment slot swap \
  --name func-arb-review-api \
  --resource-group rg-arb-review-prod \
  --slot staging \
  --target-slot production

# 2. Or redeploy specific previous version
func azure functionapp publish func-arb-review-api --node

# 3. If agent is returning bad outputs, roll back to previous agent version
# In Foundry portal: Agents → ARB-Review-Agent → Version history → Revert to version N
```

---

## Appendix A — Deployment Outputs Reference

| Output | Example Value | Used By |
|---|---|---|
| `functionAppName` | `func-arb-review-api` | CI/CD deploy command |
| `storageAccountName` | `starbrevprod01` | `AZURE_STORAGE_ACCOUNT_NAME` env var |
| `aiServicesEndpoint` | `https://ai-arb-review-prod.cognitiveservices.azure.com/` | Agent API base |
| `searchEndpoint` | `https://srch-arb-review-prod.search.windows.net` | `AZURE_SEARCH_ENDPOINT` env var |
| `staticWebAppUrl` | `<random>.azurestaticapps.net` | NEXTAUTH_URL, CORS |
| `projectEndpoint` | `https://proj-arb-review-prod.eastus2.api.azureml.ms` | `FOUNDRY_PROJECT_ENDPOINT` env var |

## Appendix B — Environment Variables Quick Reference

| Variable | Source | Secret? |
|---|---|---|
| `FOUNDRY_PROJECT_ENDPOINT` | Bicep output | No |
| `FOUNDRY_AGENT_ID` | Key Vault: `foundry-agent-id` | Yes |
| `AZURE_SEARCH_ENDPOINT` | Bicep output | No |
| `AZURE_SEARCH_KEY` | Key Vault: `search-api-key` | Yes |
| `AZURE_SEARCH_INDEX_NAME` | Hardcoded: `arb-documents` | No |
| `AZURE_DOCINT_ENDPOINT` | Bicep output | No |
| `AZURE_DOCINT_KEY` | Key Vault: `docint-key` | Yes |
| `AZURE_STORAGE_ACCOUNT_NAME` | Bicep output | No |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Bicep output | No |

## Appendix C — Test Data

Test PDFs for E2E and agent eval scenarios:

| File | Scenario | Expected outcome |
|---|---|---|
| `tests/fixtures/well-documented-review.pdf` | T3.1, T4.1 | Score ≥ 65, Needs Revision or Approved |
| `tests/fixtures/security-gap-review.pdf` | T3.2, T4.6 | Critical finding NET-001, score ≤ 50 |
| `tests/fixtures/minimal-review.pdf` | T3.3, T4.5 | DOC-001/002 fire, Rejected |
| `tests/fixtures/multi-region-review.pdf` | T3.1 | REG-001 checked, multi-region evidence present |
