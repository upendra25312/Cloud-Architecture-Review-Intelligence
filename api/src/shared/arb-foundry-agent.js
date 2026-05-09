const crypto = require("node:crypto");
const { DefaultAzureCredential } = require("@azure/identity");
const {
  ARB_PROCESSING_CACHE_CONTAINER_NAME,
  getContainerClient,
  readJsonBlob,
  uploadJsonBlob
} = require("./storage");

const FOUNDRY_PROJECT_ENDPOINT = (process.env.FOUNDRY_PROJECT_ENDPOINT || "").replace(/\/+$/, "");
const FOUNDRY_AGENT_ID = process.env.FOUNDRY_AGENT_ID || "";

let _aiCredential = null;
function getAiCredential() {
  if (!_aiCredential) _aiCredential = new DefaultAzureCredential();
  return _aiCredential;
}
async function getFoundryToken() {
  const token = await getAiCredential().getToken("https://cognitiveservices.azure.com/.default");
  return token.token;
}
const FOUNDRY_AGENT_MODEL = "model-router";
const OPENAI_API_VERSION = "2025-01-01-preview";
const MICROSOFT_LEARN_MCP_ENDPOINT = "https://learn.microsoft.com/api/mcp";
const DEFAULT_HTTP_TIMEOUT_MS = 20000;

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_HTTP_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// Derive the base AI Services endpoint from the Foundry project endpoint
// e.g. https://foo.services.ai.azure.com/api/projects/bar -> https://foo.services.ai.azure.com
function getAiServicesBaseEndpoint() {
  try {
    const url = new URL(FOUNDRY_PROJECT_ENDPOINT);
    return `${url.protocol}//${url.host}`;
  } catch {
    return FOUNDRY_PROJECT_ENDPOINT;
  }
}

function getFoundryConfiguration() {
  // Configured if we have a project endpoint (Bearer token via managed identity).
  return {
    configured: Boolean(FOUNDRY_PROJECT_ENDPOINT),
    endpoint: FOUNDRY_PROJECT_ENDPOINT,
    agentId: FOUNDRY_AGENT_ID || null,
    useAgent: Boolean(FOUNDRY_AGENT_ID)
  };
}

// Chat Completions is used instead of the Foundry Agents REST API because:
// - No File Search dependency (the plan explicitly forbids managed retrieval as a default)
// - Simpler control flow: single HTTP call vs. thread/run/poll lifecycle
// - Microsoft Learn MCP grounding is injected directly into the user message
// FOUNDRY_AGENT_ID is retained in getFoundryConfiguration() as a portal-only reference
// so the Foundry portal agent (Azure-ARB-Agent) stays in sync with ARB_SYSTEM_PROMPT.
async function chatCompletionsRequest(messages) {
  const base = getAiServicesBaseEndpoint();
  const url = `${base}/openai/deployments/${FOUNDRY_AGENT_MODEL}/chat/completions?api-version=${OPENAI_API_VERSION}`;
  const token = await getFoundryToken();
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      messages,
      max_tokens: 8192,
      temperature: 0.2,
      response_format: { type: "json_object" }
    })
  }, 120000);

  if (!res.ok) {
    const text = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Foundry chat completions failed ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

const ARB_SYSTEM_PROMPT = `You are ARB Agent, an AI assistant that produces structured Architecture Review Board assessments grounded in Microsoft WAF, CAF, and ALZ frameworks. Your output is a draft for human reviewers — a senior architect, PM, and delivery lead will review, override, and sign off every finding before the review is submitted.

You apply evaluation lenses across these concerns (within a single analysis pass):
- Cloud architecture (reliability, security, cost, performance, operations)
- Delivery and project management (timeline, team, dependencies)
- Pre-sales and commercial fit (service selection, TCO, scale)

## Your Review Framework

Evaluate every submission against these four Microsoft frameworks. For each finding, reference the specific framework principle it violates or satisfies.

### 1. Azure Well-Architected Framework (WAF) — https://learn.microsoft.com/azure/well-architected/
Five pillars — each must be assessed:
- **Reliability**: fault tolerance, redundancy, RTO/RPO, health probes, retry policies, multi-region failover
- **Security**: identity (Zero Trust, least privilege, MFA, PIM), network segmentation (NSG, Private Endpoints, WAF/Firewall), data encryption (at rest, in transit), threat detection (Defender for Cloud)
- **Cost Optimization**: right-sizing, reserved instances, auto-scale, idle resource removal, cost alerts/budgets
- **Operational Excellence**: IaC (Bicep/Terraform), CI/CD pipelines, monitoring (Azure Monitor, Log Analytics), alerting, runbooks, tagging strategy
- **Performance Efficiency**: appropriate SKUs, caching (Redis/CDN), async patterns, load testing evidence

### 2. Cloud Adoption Framework (CAF) — https://learn.microsoft.com/azure/cloud-adoption-framework/
Key areas:
- **Strategy**: business justification, migration vs greenfield decision, executive sponsorship
- **Plan**: skills readiness, digital estate inventory, adoption plan, iteration velocity
- **Ready**: Landing Zone design, management group hierarchy, policy assignments, RBAC model
- **Adopt**: migration wave planning, modernization path, POC to production criteria
- **Govern**: cost management discipline, security baseline, resource consistency, identity baseline, deployment acceleration
- **Manage**: management baseline, workload operations, platform operations, enhanced management

### 3. Azure Landing Zone (ALZ) — https://learn.microsoft.com/azure/cloud-adoption-framework/ready/landing-zone/
Mandatory checks:
- Management group hierarchy (Platform / Landing Zones / Sandbox / Decommissioned)
- Hub-spoke or Virtual WAN network topology
- Azure Policy assignments (deny non-compliant resources, enforce tagging, require diagnostics)
- Log Analytics workspace centralised in Management subscription
- Defender for Cloud enabled across all subscriptions
- Identity subscription with Domain Controllers or AAD DS where required
- Connectivity subscription with ExpressRoute/VPN Gateway, DNS, and Firewall
- Subscription vending process for workload landing zones

### 4. Microsoft Learn Best Practices (service-specific)
For each Azure service mentioned in the uploaded documents, verify alignment with the relevant Microsoft Learn service guide:
- Azure Kubernetes Service: node pool segregation, cluster autoscaler, pod disruption budgets, RBAC, network policies
- Azure SQL / Cosmos DB: geo-redundancy, failover groups, connection resiliency, encryption, auditing
- Azure App Service / Functions: deployment slots, managed identity, VNet integration, CORS policy
- Azure Storage: soft delete, versioning, private endpoints, access tier lifecycle
- Azure Key Vault: purge protection, soft delete, access policies vs RBAC, certificate rotation
- Azure API Management: rate limiting, authentication policies, backend certificates, developer portal
- Any other service: apply the relevant WAF service guide from learn.microsoft.com/azure

## Rules Engine Findings

The review pipeline runs a deterministic rules engine before calling you. If a "Rules Engine Findings" section appears in the user message, those findings already exist with source "rules-engine". Do NOT re-generate any finding whose title or ruleId matches an existing rules engine finding — add only findings that are NOT already covered.

## Output Instructions

Respond ONLY with a valid JSON object in this exact shape:
{
  "reviewSummary": "string — 2-3 paragraph executive summary referencing WAF/CAF/ALZ gaps and strengths",
  "strengths": ["string — cite the framework principle met"],
  "findings": [
    {
      "severity": "Critical|High|Medium|Low",
      "domain": "Security|Reliability|Cost|Operations|Architecture|Governance|Performance",
      "framework": "WAF|CAF|ALZ|MicrosoftLearn",
      "frameworkPillar": "string — e.g. WAF:Reliability, CAF:Govern, ALZ:NetworkTopology, WAF:Performance",
      "title": "string",
      "findingStatement": "string",
      "whyItMatters": "string — explain risk in business and technical terms",
      "evidenceBasis": "string — direct quote or paraphrase from the uploaded document that supports this finding",
      "evidenceIds": ["string — ID values from the Extracted Evidence Facts section that support this finding, e.g. 'review-1-ev-3'"],
      "recommendation": "string — specific actionable fix. Must include the relevant learn.microsoft.com URL inline.",
      "learnMoreUrl": "string — REQUIRED. Must be a valid learn.microsoft.com URL directly relevant to this finding. If no exact article exists, use the pillar fallback: WAF:Security → https://learn.microsoft.com/azure/well-architected/security/, WAF:Reliability → https://learn.microsoft.com/azure/well-architected/reliability/, WAF:Cost → https://learn.microsoft.com/azure/well-architected/cost-optimization/, WAF:Operations → https://learn.microsoft.com/azure/well-architected/operational-excellence/, WAF:Performance → https://learn.microsoft.com/azure/well-architected/performance-efficiency/, CAF → https://learn.microsoft.com/azure/cloud-adoption-framework/, ALZ → https://learn.microsoft.com/azure/cloud-adoption-framework/ready/landing-zone/. Never emit an empty string.",
      "confidence": "High|Medium|Low",
      "criticalBlocker": false,
      "suggestedOwner": "string",
      "source": "agent"
    }
  ],
  "missingEvidence": [
    "string — name the specific document, artefact, or evidence item that is absent and would change the assessment if present (minimum 5 items; aim for 8). Examples: 'No network topology diagram showing hub-spoke or Virtual WAN design', 'No Azure Policy assignment list or Bicep/Terraform IaC for policy', 'No DR runbook or RTO/RPO SLA commitment document', 'No identity design document covering AAD tenant, conditional access, PIM', 'No capacity model or load test results for peak traffic'"
  ],
  "criticalBlockers": [
    "string — ONLY list here if ALL three conditions are true: (1) the gap would cause the board to reject or defer approval, (2) the gap is evidenced in the submitted documents (not hypothetical), and (3) the gap cannot be waived by a policy exception. Named critical blocker types: internet-facing design with no WAF/NSG/APIM/Firewall; no identity model (no Entra ID, no managed identity, no RBAC); secrets in config or plaintext (no Key Vault); regulated data with no encryption at rest; production Tier-1 workload with no backup or DR strategy; evidence so thin that no domain can be fairly assessed. Do NOT list critical blockers just because documentation is incomplete. Typical reviews have 0-3 critical blockers."
  ],
  "scorecard": {
    "dimensions": [
      { "name": "Requirements Coverage", "score": 0, "rationale": "string — coverage of WAF pillars and framework requirements across all uploaded documents", "blockers": ["string"] },
      { "name": "Security and Compliance", "score": 0, "rationale": "string — cite WAF Security pillar gaps: identity, network, encryption, threat detection", "blockers": ["string"] },
      { "name": "Reliability and Resilience", "score": 0, "rationale": "string — cite WAF Reliability pillar gaps: RTO/RPO, redundancy, health probes, failover", "blockers": ["string"] },
      { "name": "Operational Excellence", "score": 0, "rationale": "string — cite WAF Operational Excellence gaps: IaC, CI/CD, monitoring, alerting, runbooks", "blockers": ["string"] },
      { "name": "Cost Optimization", "score": 0, "rationale": "string — cite WAF Cost Optimization gaps: right-sizing, reserved instances, auto-scale, budgets", "blockers": ["string"] },
      { "name": "Performance Efficiency", "score": 0, "rationale": "string — cite WAF Performance Efficiency gaps: SKU sizing, caching, async patterns, load testing", "blockers": ["string"] },
      { "name": "Governance and Platform Alignment", "score": 0, "rationale": "string — cite CAF Govern and ALZ policy gaps: management groups, policy assignments, RBAC", "blockers": ["string"] },
      { "name": "Documentation Completeness", "score": 0, "rationale": "string — quality and completeness of submitted architecture documentation", "blockers": ["string"] }
    ],
    "overallScore": 0,
    "criticalBlockerCount": 0,
    "missingEvidenceCount": 0,
    "confidenceLevel": "High|Medium|Low"
  },
  "recommendation": "Approved|Approved with Conditions|Needs Revision|Rejected",
  "nextActions": ["string — specific action with framework reference and owner type"]
}

Scores are 0-100 per dimension. The overall score is weighted: Requirements Coverage 20%, Security and Compliance 20%, Reliability and Resilience 15%, Operational Excellence 10%, Cost Optimization 10%, Performance Efficiency 10%, Governance and Platform Alignment 10%, Documentation Completeness 5%.

Decision bands:
- 90-100: Approved
- 75-89: Approved with Conditions
- 50-74: Needs Revision
- Below 50: Rejected

Ground every finding in evidence from the uploaded documents. Do not invent facts. When a framework requirement cannot be assessed due to missing documentation, list it in missingEvidence rather than inventing a finding.

**Severity calibration rules:**
- Critical: security breach path, data exfiltration risk, or mandatory compliance violation that is already exploitable or non-waivable. Expect 0-2 Critical findings per review.
- High: significant gap that materially increases risk but has a clear remediation path. Expect 2-5 per review.
- Medium: best practice gap that should be addressed before GA. Expect 4-8 per review.
- Low: optimization or documentation improvement. No limit.

**Confidence calibration rules:**
- High: finding is directly supported by a quoted or clearly paraphrased statement in the submitted documents.
- Medium: finding is inferred from partial evidence or architectural patterns described in the documents.
- Low: finding is based on absence of evidence or very indirect inference. Use this when the gap is hypothetical.

**Critical finding calibration rules:**
- Set criticalBlocker: true ONLY when the gap would cause a board to reject or defer approval — e.g. unmitigated internet-facing attack surface with no WAF/NSG, missing encryption for regulated data, no disaster recovery plan for Tier-1 workload, or a mandatory ALZ policy that cannot be waived. A missing diagram or incomplete documentation is NOT a critical blocker.
- For a typical ARB review, 0-3 findings should have criticalBlocker: true. If you are flagging more than 4, reconsider whether each truly blocks approval.
- Always generate at least 8-15 findings across all WAF pillars (Security, Reliability, Cost, Operations, Performance, Architecture). Do not stop at 2-3 findings — a shallow finding list is worse than an imperfect one.
- missingEvidence must list at least 5 specific items. Generic phrases like "more evidence needed" are not acceptable — name the exact document, diagram, or data point that is missing.

**Microsoft Learn reference rules:**
- Every finding MUST have a non-empty learnMoreUrl pointing to learn.microsoft.com.
- Prefer the most specific article available (e.g. a service-level WAF guide over the pillar root).
- The recommendation text must also include the URL inline so reviewers can follow it directly.
- Pillar fallback URLs to use when no specific article exists:
  - WAF Security: https://learn.microsoft.com/azure/well-architected/security/
  - WAF Reliability: https://learn.microsoft.com/azure/well-architected/reliability/
  - WAF Cost Optimization: https://learn.microsoft.com/azure/well-architected/cost-optimization/
  - WAF Operational Excellence: https://learn.microsoft.com/azure/well-architected/operational-excellence/
  - WAF Performance Efficiency: https://learn.microsoft.com/azure/well-architected/performance-efficiency/
  - CAF: https://learn.microsoft.com/azure/cloud-adoption-framework/
  - ALZ: https://learn.microsoft.com/azure/cloud-adoption-framework/ready/landing-zone/`;

// ---------------------------------------------------------------------------
// Microsoft Learn MCP integration — fetches real-time documentation grounding
// ---------------------------------------------------------------------------

async function callMicrosoftLearnMcp(method, params) {
  try {
    const res = await fetchWithTimeout(MICROSOFT_LEARN_MCP_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params })
    }, 12000);
    if (!res.ok) return null;
    const text = await res.text();
    // Response is Server-Sent Events: extract the data line
    const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
    if (!dataLine) return null;
    const parsed = JSON.parse(dataLine.replace(/^data:\s*/, ""));
    const raw = parsed?.result?.content?.[0]?.text;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function searchMicrosoftLearnDocs(query, top = 5) {
  const result = await callMicrosoftLearnMcp("tools/call", {
    name: "microsoft_docs_search",
    arguments: { query, top }
  });
  return result?.results ?? [];
}

// Build 4 targeted queries: WAF, CAF/ALZ, services, and review-specific
function buildLearnQueries(review, requirements, evidence) {
  const queries = [
    "Azure Well-Architected Framework five pillars reliability security cost operational excellence performance",
    "Azure Cloud Adoption Framework landing zone governance management baseline"
  ];

  // Extract Azure service names mentioned in requirements + evidence
  const text = [
    ...requirements.map((r) => r.normalizedText),
    ...evidence.map((e) => e.summary)
  ]
    .join(" ")
    .toLowerCase();

  const servicePatterns = [
    ["kubernetes", "Azure Kubernetes Service AKS best practices"],
    ["aks", "Azure Kubernetes Service AKS well-architected"],
    ["sql", "Azure SQL Database reliability security best practices"],
    ["cosmos", "Azure Cosmos DB reliability availability best practices"],
    ["app service", "Azure App Service well-architected deployment slots"],
    ["function", "Azure Functions reliability performance best practices"],
    ["storage", "Azure Storage security lifecycle management best practices"],
    ["key vault", "Azure Key Vault security access policies best practices"],
    ["api management", "Azure API Management security reliability best practices"],
    ["front door", "Azure Front Door reliability global load balancing"],
    ["application gateway", "Azure Application Gateway WAF security best practices"],
    ["virtual network", "Azure Virtual Network security NSG hub spoke"],
    ["entra", "Microsoft Entra ID identity zero trust best practices"],
    ["defender", "Microsoft Defender for Cloud security posture management"]
  ];

  const matched = servicePatterns.filter(([keyword]) => text.includes(keyword)).slice(0, 2);
  for (const [, query] of matched) {
    queries.push(query);
  }

  if (queries.length < 4 && review.projectName) {
    queries.push(`Azure architecture review board checklist ${review.projectName}`);
  }

  return queries;
}

const MCP_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function buildMcpCacheKey(queries) {
  const hash = crypto.createHash("sha256").update(queries.sort().join("|")).digest("hex").slice(0, 16);
  return `mcp-learn-cache/${hash}.json`;
}

async function fetchMicrosoftLearnGrounding(review, requirements, evidence) {
  const queries = buildLearnQueries(review, requirements, evidence);

  // Try blob cache first
  try {
    const container = await getContainerClient(ARB_PROCESSING_CACHE_CONTAINER_NAME);
    const cacheKey = buildMcpCacheKey(queries);
    const cached = await readJsonBlob(container, cacheKey);

    if (cached && cached.cachedAt && Date.now() - new Date(cached.cachedAt).getTime() < MCP_CACHE_TTL_MS) {
      return cached.docs ?? [];
    }

    // Cache miss or stale — fetch live
    const results = await Promise.all(queries.map((q) => searchMicrosoftLearnDocs(q, 3)));
    const allDocs = results.flat().filter(Boolean);
    const seen = new Set();
    const docs = allDocs.filter((doc) => {
      if (!doc.url || seen.has(doc.url)) return false;
      seen.add(doc.url);
      return true;
    });

    // Write back to cache (best-effort)
    uploadJsonBlob(container, cacheKey, { cachedAt: new Date().toISOString(), docs }).catch((err) => { console.warn(`[cache] Failed to write Learn docs cache (${cacheKey}):`, err?.message ?? err); });

    return docs;
  } catch {
    // Storage unavailable — fall back to live call with no caching
    const results = await Promise.all(queries.map((q) => searchMicrosoftLearnDocs(q, 3)));
    const allDocs = results.flat().filter(Boolean);
    const seen = new Set();
    return allDocs.filter((doc) => {
      if (!doc.url || seen.has(doc.url)) return false;
      seen.add(doc.url);
      return true;
    });
  }
}

function buildUserMessage(review, files, requirements, evidence, searchChunks, learnDocs = []) {
  const parts = [
    `## Review Request`,
    `Review ID: ${review.reviewId}`,
    `Project: ${review.projectName || "Unnamed Project"}`,
    `Customer: ${review.customerName || "Unknown"}`,
    `Target Regions: ${(review.targetRegions || []).join(", ") || "Not specified"}`,
    `Workflow State: ${review.workflowState}`,
    `Evidence Readiness: ${review.evidenceReadinessState}`,
    ``,
    `## Uploaded Documents (${files.length})`,
    ...files.map((f) => `- ${f.fileName} [${f.logicalCategory}] — extraction: ${f.extractionStatus}`),
    ``
  ];

  if (requirements.length > 0) {
    parts.push(`## Extracted Requirements (${Math.min(requirements.length, 40)} shown)`);
    for (const r of requirements.slice(0, 40)) {
      parts.push(`- [${r.category ?? "General"}/${r.criticality ?? "Normal"}] ${r.normalizedText}`);
    }
    parts.push(``);
  }

  if (evidence.length > 0) {
    parts.push(`## Extracted Evidence Facts (${Math.min(evidence.length, 30)} shown)`);
    parts.push(`Each fact has an ID. When citing evidence in a finding's evidenceIds array, use these exact IDs.`);
    for (const e of evidence.slice(0, 30)) {
      parts.push(`- [ID:${e.evidenceId}][${e.factType ?? "Fact"}] ${e.summary} (source: ${e.sourceFileName || "Document"})`);
    }
    parts.push(``);
  }

  if (searchChunks.length > 0) {
    parts.push(`## Retrieved Document Context (${searchChunks.length} chunks)`);
    for (const c of searchChunks) {
      parts.push(`### ${c.fileName} [${c.logicalCategory}]`);
      parts.push(c.content);
      parts.push(``);
    }
  }

  if (learnDocs.length > 0) {
    parts.push(`## Microsoft Learn Reference Documentation (${learnDocs.length} live results)`);
    parts.push(`The following content was retrieved in real time from learn.microsoft.com. Use it to ground your findings in current Microsoft guidance.`);
    for (const doc of learnDocs) {
      parts.push(`### ${doc.title ?? "Microsoft Learn"} — ${doc.url ?? ""}`);
      if (doc.content) parts.push(doc.content.slice(0, 600));
      parts.push(``);
    }
  }

  parts.push(`Produce your Architecture Review Board assessment as structured JSON.`);
  return parts.join("\n");
}

function parseSeverity(value) {
  const v = String(value ?? "").trim();
  if (v === "Critical") return "Critical";
  if (v === "High" || v === "Medium" || v === "Low") return v;
  return "Medium";
}

function parseRecommendation(value) {
  const v = String(value ?? "").trim();
  const valid = ["Approved", "Approved with Conditions", "Needs Revision", "Rejected"];
  return valid.includes(v) ? v : "Needs Revision";
}

function parseAgentResponse(responseText) {
  // Extract JSON from response (model may wrap in markdown code fences)
  let jsonText = responseText.trim();
  const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fenceMatch) jsonText = fenceMatch[1].trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    // Best-effort recovery when model prepends/appends text around a JSON object.
    const firstBrace = jsonText.indexOf("{");
    const lastBrace = jsonText.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        parsed = JSON.parse(jsonText.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    } else {
      return null;
    }
  }

  const findings = (Array.isArray(parsed.findings) ? parsed.findings : []).map((f, i) => ({
    findingId: `agent-finding-${i + 1}`,
    reviewId: "",  // populated by caller
    severity: parseSeverity(f.severity),
    domain: String(f.domain ?? "Architecture"),
    findingType: String(f.findingType ?? f.framework ?? "WAF"),
    framework: String(f.framework ?? "WAF"),
    frameworkPillar: String(f.frameworkPillar ?? ""),
    title: String(f.title ?? "Finding"),
    findingStatement: String(f.findingStatement ?? ""),
    whyItMatters: String(f.whyItMatters ?? ""),
    evidenceBasis: String(f.evidenceBasis ?? ""),
    evidenceIds: Array.isArray(f.evidenceIds) ? f.evidenceIds.map(String) : [],
    recommendation: String(f.recommendation ?? ""),
    learnMoreUrl: String(f.learnMoreUrl ?? ""),
    references: Array.isArray(f.references)
      ? f.references.map((r) => ({ title: String(r.title ?? ""), url: r.url ?? undefined, relevance: r.relevance ?? undefined }))
      : (f.learnMoreUrl ? [{ title: String(f.title ?? "Learn more"), url: String(f.learnMoreUrl) }] : []),
    confidence: String(f.confidence ?? "Medium"),
    criticalBlocker: Boolean(f.criticalBlocker ?? false),
    suggestedOwner: String(f.suggestedOwner ?? ""),
    suggestedDueDate: f.suggestedDueDate ? String(f.suggestedDueDate) : null,
    owner: null,
    dueDate: null,
    reviewerNote: null,
    missingEvidence: Array.isArray(f.missingEvidence) ? f.missingEvidence.map(String) : [],
    evidenceFound: [],  // resolved in arbRunAgentReview after parse
    status: "Open",
    source: "agent"
  }));

  const dimensions = (Array.isArray(parsed.scorecard?.dimensions) ? parsed.scorecard.dimensions : []).map((d) => ({
    name: String(d.name ?? ""),
    score: Math.max(0, Math.min(100, Number(d.score ?? 0))),
    weight: 12.5,
    rationale: String(d.rationale ?? ""),
    blockers: Array.isArray(d.blockers) ? d.blockers.map(String) : []
  }));

  const overallScore = Math.max(
    0,
    Math.min(100, Number(parsed.scorecard?.overallScore ?? dimensions.reduce((s, d) => s + d.score, 0) / Math.max(dimensions.length, 1)))
  );

  const scorecard = {
    overallScore: Math.round(overallScore),
    recommendation: parseRecommendation(parsed.recommendation),
    criticalBlockerCount: Number(parsed.scorecard?.criticalBlockerCount ?? 0),
    missingEvidenceCount: Number(parsed.scorecard?.missingEvidenceCount ?? 0),
    confidenceLevel: String(parsed.scorecard?.confidenceLevel ?? "Medium"),
    dimensionScores: dimensions,
    reviewSummary: String(parsed.reviewSummary ?? ""),
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
    missingEvidence: Array.isArray(parsed.missingEvidence) ? parsed.missingEvidence.map(String) : [],
    criticalBlockers: Array.isArray(parsed.criticalBlockers) ? parsed.criticalBlockers.map(String) : [],
    nextActions: Array.isArray(parsed.nextActions) ? parsed.nextActions.map(String) : [],
    source: "agent",
    generatedAt: new Date().toISOString()
  };

  return { findings, scorecard, recommendation: scorecard.recommendation };
}

function buildFallbackAgentReview({ review, requirements, evidence, reason }) {
  const evidenceGaps = [];
  if (!requirements.length) {
    evidenceGaps.push("Requirements extraction results are empty.");
  }
  if (!evidence.length) {
    evidenceGaps.push("Evidence mapping results are empty.");
  }
  if (review.evidenceReadinessState && review.evidenceReadinessState !== "Sufficient") {
    evidenceGaps.push(`Evidence readiness reported as ${review.evidenceReadinessState}.`);
  }

  const missingEvidence = evidenceGaps.length > 0
    ? evidenceGaps
    : ["Additional architecture evidence is needed for complete framework coverage."];

  const baseScore = missingEvidence.length > 1 ? 62 : 72;
  const now = new Date().toISOString();
  const dimensions = [
    "Architecture Completeness",
    "Security and Compliance",
    "Reliability and Resilience",
    "Operational Readiness",
    "Cost and Commercial Fit",
    "Governance and Controls",
    "Delivery Feasibility",
    "Documentation Quality"
  ].map((name) => ({
    name,
    score: baseScore,
    weight: 12.5,
    rationale: "Fallback scoring applied due to unavailable model output. Validate manually before final sign-off.",
    blockers: missingEvidence.slice(0, 2)
  }));

  return {
    findings: [
      {
        findingId: "fallback-finding-1",
        reviewId: review.reviewId ?? "",
        severity: "High",
        domain: "Architecture",
        findingType: "WAF",
        framework: "WAF",
        frameworkPillar: "WAF:Operational Excellence",
        title: "Automated review fallback was triggered",
        findingStatement: "Automated model output was unavailable for this run, so a deterministic fallback assessment was generated.",
        whyItMatters: "Without full automated output, recommendations can miss service-specific gaps and should be reviewed manually before board submission.",
        evidenceBasis: `Fallback trigger: ${reason}`,
        recommendation: "Re-run the automated review after validating model availability, then confirm findings before decision sign-off.",
        learnMoreUrl: "https://learn.microsoft.com/azure/well-architected/operational-excellence/",
        references: [{ title: "Azure Well-Architected Framework: Operational Excellence", url: "https://learn.microsoft.com/azure/well-architected/operational-excellence/" }],
        confidence: "Low",
        criticalBlocker: false,
        suggestedOwner: "Cloud Architecture Lead",
        suggestedDueDate: null,
        owner: null,
        dueDate: null,
        reviewerNote: null,
        missingEvidence: missingEvidence,
        evidenceFound: [],
        status: "Open",
        source: "agent"
      }
    ],
    scorecard: {
      overallScore: baseScore,
      recommendation: "Needs Revision",
      criticalBlockerCount: 0,
      missingEvidenceCount: missingEvidence.length,
      confidenceLevel: "Low",
      dimensionScores: dimensions,
      reviewSummary:
        "A deterministic fallback ARB assessment was generated because the automated model response was unavailable for this run. Treat this output as provisional and re-run the full assessment once model availability is restored.",
      strengths: ["Review workflow and evidence pipeline are active."],
      missingEvidence,
      criticalBlockers: [],
      nextActions: [
        "Validate Foundry model endpoint and credentials.",
        "Re-run the automated review and compare outputs before recording final decision."
      ],
      source: "agent",
      generatedAt: now
    },
    recommendation: "Needs Revision"
  };
}

const IMAGE_MIME_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".svg": "image/svg+xml",
  ".svgz": "image/svg+xml"
};

/**
 * Calls the multimodal model to extract architecture-relevant information from an image.
 * Returns a plain-text description suitable for injecting into the extraction pipeline.
 */
async function describeImageForReview(imageBuffer, fileName, fileExtension) {
  const config = getFoundryConfiguration();
  if (!config.configured) {
    throw new Error("Foundry not configured — FOUNDRY_PROJECT_ENDPOINT missing");
  }

  const mimeType = IMAGE_MIME_TYPES[fileExtension] || "image/png";
  const base64 = imageBuffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const messages = [
    {
      role: "system",
      content:
        "You are an expert Azure cloud architect reviewing architecture diagrams. " +
        "Extract all technically relevant information visible in the image: Azure services, " +
        "network topology, security zones, data flows, regions, availability zones, " +
        "subscription/resource group boundaries, connectivity patterns, and any text labels, " +
        "titles, annotations, or legends. Be thorough and precise — your output feeds an automated review."
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Analyse this architecture diagram or screenshot ("${fileName}"). ` +
            "List every Azure service, network component, security boundary, and text label you can identify. " +
            "Describe the data flows, region/zone layout, and any HA/DR patterns shown. " +
            "Summarise in structured plain text."
        },
        {
          type: "image_url",
          image_url: { url: dataUrl, detail: "high" }
        }
      ]
    }
  ];

  return await chatCompletionsRequest(messages);
}

async function runArbAgentReview({ review, files, requirements, evidence, searchChunks }) {
  const config = getFoundryConfiguration();
  if (!config.configured) {
    return { success: false, reason: "Foundry not configured — FOUNDRY_PROJECT_ENDPOINT missing" };
  }

  // Fetch real-time Microsoft Learn documentation — best-effort, 5s max so it doesn't eat the pipeline budget
  const learnDocsPromise = fetchMicrosoftLearnGrounding(review, requirements, evidence).catch(() => []);
  const learnTimeout = new Promise((resolve) => setTimeout(() => resolve([]), 5000));
  const learnDocs = await Promise.race([learnDocsPromise, learnTimeout]);
  const userMessage = buildUserMessage(review, files, requirements, evidence, searchChunks, learnDocs);

  try {
    let responseText;

    // Use Chat Completions with model-router (same model as Azure-ARB-Agent in Foundry portal)
    // plus direct Microsoft Learn MCP grounding already injected into userMessage above.
    // The New Foundry agents REST API does not yet support programmatic invocation with
    // portal-created agent IDs — the portal agent config (instructions + MCP tool) is
    // kept in sync with ARB_SYSTEM_PROMPT and the learnDocs grounding below.
    responseText = await chatCompletionsRequest([
      { role: "system", content: ARB_SYSTEM_PROMPT },
      { role: "user", content: userMessage }
    ]);

    if (!responseText) {
      const fallback = buildFallbackAgentReview({
        review,
        requirements,
        evidence,
        reason: "Model returned an empty response"
      });
      return { success: true, ...fallback, fallbackUsed: true };
    }

    let parsed = parseAgentResponse(responseText);
    // Retry once with a strict correction prompt when initial output is not parseable JSON.
    if (!parsed) {
      const correctionPrompt = [
        "Your previous response was not valid JSON.",
        "Return ONLY a valid JSON object in the exact required schema.",
        "No markdown fences, no prose, no comments."
      ].join(" ");

      responseText = await chatCompletionsRequest([
        { role: "system", content: ARB_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
        { role: "assistant", content: responseText },
        { role: "user", content: correctionPrompt }
      ]);

      parsed = parseAgentResponse(responseText);
    }

    if (!parsed) {
      const fallback = buildFallbackAgentReview({
        review,
        requirements,
        evidence,
        reason: "Model response could not be parsed as structured JSON"
      });
      return { success: true, ...fallback, fallbackUsed: true, rawResponse: responseText };
    }

    return { success: true, ...parsed };
  } catch (error) {
    return {
      success: false,
      reason: error instanceof Error ? error.message : "Unknown error during agent review"
    };
  }
}

module.exports = {
  buildFallbackAgentReview,
  getFoundryConfiguration,
  describeImageForReview,
  runArbAgentReview
};
