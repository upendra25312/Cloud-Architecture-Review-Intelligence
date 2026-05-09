const crypto = require("node:crypto");
const { app } = require("@azure/functions");
const { jsonResponse, requireAuthenticated } = require("../shared/auth");
const {
  getArbReview,
  getArbFiles,
  getArbRequirements,
  getArbEvidence,
  getArbActions,
  syncArbReviewedOutputs
} = require("../shared/arb-review-store");
const { searchArbDocuments, ensureArbSearchIndex } = require("../shared/arb-search");
const { runArbAgentReview, getFoundryConfiguration, buildFallbackAgentReview } = require("../shared/arb-foundry-agent");
const { runDeterministicRules } = require("../shared/arb-rules-engine");
const { getTableClient, ARB_REVIEW_TABLE_NAME, encodeTableKey } = require("../shared/table-storage");

const ARBJOBS_TABLE_NAME = "arbjobs";

async function getJobsClient() {
  return getTableClient(ARBJOBS_TABLE_NAME);
}

async function readJob(reviewId, userId) {
  try {
    const client = await getJobsClient();
    return await client.getEntity(encodeTableKey(reviewId), encodeTableKey(userId));
  } catch (err) {
    if (err?.statusCode === 404) return null;
    throw err;
  }
}

async function writeJob(reviewId, userId, fields) {
  const client = await getJobsClient();
  await client.upsertEntity(
    { partitionKey: encodeTableKey(reviewId), rowKey: encodeTableKey(userId), ...fields },
    "Replace"
  );
}

function buildArbSearchQuery(review, requirements, evidence) {
  const terms = new Set();
  if (review.projectName) review.projectName.split(/\s+/).forEach((t) => terms.add(t));
  if (review.customerName) review.customerName.split(/\s+/).forEach((t) => terms.add(t));
  (review.targetRegions ?? []).forEach((r) => terms.add(r));
  const stopWords = new Set(["the","a","an","and","or","for","to","of","in","on","at","is","are","be","with","from","that","this","by","as","its","it","will","we","our","all","any","not","have","has","can"]);
  const allText = [
    ...requirements.slice(0, 20).map((r) => r.normalizedText ?? ""),
    ...evidence.slice(0, 15).map((e) => e.summary ?? "")
  ].join(" ");
  allText.split(/\W+/).forEach((tok) => {
    const t = tok.trim().toLowerCase();
    if (t.length >= 5 && !stopWords.has(t)) terms.add(tok.trim());
  });
  const base = "Azure architecture security reliability WAF CAF";
  const extra = [...terms].slice(0, 20).join(" ");
  return `${base} ${extra}`.slice(0, 200).trim();
}

function getRowKey(baseKey, userId) {
  return `${baseKey}|${encodeTableKey(userId)}`;
}

function getPartitionKey(reviewId) {
  return encodeTableKey(reviewId);
}

async function runReviewPipeline({ principal, reviewId, traceId, log }) {
  const t0 = Date.now();
  const foundryConfig = getFoundryConfiguration();
  if (!foundryConfig.configured) {
    throw Object.assign(new Error("Foundry agent is not configured on this deployment."), { statusCode: 503 });
  }

  log("Agent review started");

  const [review, files, requirementsList, evidenceList, actionsList] = await Promise.all([
    getArbReview(principal, reviewId),
    getArbFiles(principal, reviewId),
    getArbRequirements(principal, reviewId),
    getArbEvidence(principal, reviewId),
    getArbActions(principal, reviewId)
  ]);

  if (!review) {
    throw Object.assign(new Error("Review not found."), { statusCode: 404 });
  }
  if (files.length === 0) {
    throw Object.assign(new Error("Upload and extract files before running the agent review."), { statusCode: 400 });
  }
  const extractedFiles = files.filter((f) => f.extractionStatus === "Completed");
  if (extractedFiles.length === 0) {
    throw Object.assign(new Error("Run extraction before triggering the agent review."), { statusCode: 400 });
  }

  log("Review data loaded", {
    files: files.length, extracted: extractedFiles.length,
    requirements: requirementsList.length, evidence: evidenceList.length
  });

  const searchQuery = buildArbSearchQuery(review, requirementsList, evidenceList);
  await ensureArbSearchIndex();
  const searchChunks = await searchArbDocuments(reviewId, searchQuery, 12);
  log("Search complete", { query: searchQuery.slice(0, 80), chunks: searchChunks.length });

  // Run deterministic rules first — these are authoritative and cost-free
  const { ruleFindings, ruleBlockers, criticalBlockerCount: ruleCriticalCount } = runDeterministicRules({
    review, requirements: requirementsList, evidence: evidenceList, files
  });
  log("Rules engine completed", { ruleFindings: ruleFindings.length, blockers: ruleCriticalCount });

  // Run automated agent assessment — no timeout pressure since this runs in the background
  let agentResult = await runArbAgentReview({
    review, files, requirements: requirementsList, evidence: evidenceList, searchChunks,
    existingRuleFindings: ruleFindings
  });

  if (!agentResult.success) {
    log("Agent returned failure — using fallback", { reason: agentResult.reason });
    agentResult = {
      ...buildFallbackAgentReview({
        review, requirements: requirementsList, evidence: evidenceList,
        reason: agentResult.reason ?? "Automated assessment unavailable"
      }),
      success: true, fallbackUsed: true
    };
  }

  // Merge: rule findings are authoritative; AI fills remaining findings without ruleId overlap
  if (ruleFindings.length > 0) {
    const existingRuleIds = new Set(ruleFindings.map((f) => f.ruleId));
    const aiOnlyFindings = (agentResult.findings ?? []).filter((f) => !existingRuleIds.has(f.ruleId));
    agentResult = { ...agentResult, findings: [...ruleFindings, ...aiOnlyFindings] };
    if (agentResult.scorecard && ruleCriticalCount > 0) {
      agentResult.scorecard.criticalBlockerCount = Math.max(agentResult.scorecard.criticalBlockerCount ?? 0, ruleCriticalCount);
      agentResult.scorecard.criticalBlockers = [
        ...(agentResult.scorecard.criticalBlockers ?? []),
        ...ruleBlockers
      ].filter((v, i, a) => a.indexOf(v) === i);
    }
  }

  log("Agent succeeded", {
    findings: agentResult.findings?.length ?? 0,
    ruleFindings: ruleFindings.length,
    score: agentResult.scorecard?.overallScore ?? null,
    recommendation: agentResult.recommendation,
    durationMs: Date.now() - t0,
    fallback: agentResult.fallbackUsed ?? false
  });

  // Resolve evidence traceability
  if (agentResult.findings && evidenceList.length > 0) {
    const evidenceById = new Map(evidenceList.map((e) => [e.evidenceId, e]));
    for (const finding of agentResult.findings) {
      const ids = Array.isArray(finding.evidenceIds) ? finding.evidenceIds : [];
      finding.evidenceFound = ids
        .map((id) => evidenceById.get(id)).filter(Boolean)
        .map((e) => ({ evidenceId: e.evidenceId, summary: e.summary, sourceFileName: e.sourceFileName, sourceFileId: e.sourceFileId, factType: e.factType }));
      if (finding.evidenceFound.length === 0 && finding.evidenceBasis) {
        const STOP = new Set(["the","a","an","and","or","for","to","of","in","on","at","is","are","be","with","from","that","this","by","as","its","it","will","we","our","all","any","not","have","has","can","was","were"]);
        const tokenize = (text) => new Set(String(text ?? "").toLowerCase().split(/\W+/).filter((t) => t.length > 3 && !STOP.has(t)));
        const basisTokens = tokenize(`${finding.evidenceBasis} ${finding.title ?? ""}`);
        finding.evidenceFound = evidenceList
          .map((e) => {
            const eTokens = tokenize(`${e.summary ?? ""} ${e.sourceExcerpt ?? ""}`);
            const intersection = [...basisTokens].filter((t) => eTokens.has(t)).length;
            const union = new Set([...basisTokens, ...eTokens]).size;
            return { e, score: union > 0 ? intersection / union : 0 };
          })
          .filter(({ score }) => score >= 0.12)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map(({ e }) => ({ evidenceId: e.evidenceId, summary: e.summary, sourceFileName: e.sourceFileName, sourceFileId: e.sourceFileId, factType: e.factType }));
      }
      delete finding.evidenceIds;
    }
  }

  // Persist findings + scorecard + exports
  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const now = new Date().toISOString();
  const userId = principal.userId;

  if (agentResult.findings && agentResult.findings.length > 0) {
    await client.upsertEntity({ partitionKey: getPartitionKey(reviewId), rowKey: getRowKey("FINDINGS", userId), findingsJson: JSON.stringify(agentResult.findings) }, "Replace");
  }

  if (agentResult.scorecard) {
    await client.upsertEntity({
      partitionKey: getPartitionKey(reviewId), rowKey: getRowKey("SCORECARD", userId),
      overallScore: agentResult.scorecard.overallScore, recommendation: agentResult.scorecard.recommendation,
      criticalBlockerCount: agentResult.scorecard.criticalBlockerCount, missingEvidenceCount: agentResult.scorecard.missingEvidenceCount,
      confidenceLevel: agentResult.scorecard.confidenceLevel, dimensionScoresJson: JSON.stringify(agentResult.scorecard.dimensionScores),
      reviewSummary: agentResult.scorecard.reviewSummary, strengthsJson: JSON.stringify(agentResult.scorecard.strengths),
      missingEvidenceJson: JSON.stringify(agentResult.scorecard.missingEvidence), criticalBlockersJson: JSON.stringify(agentResult.scorecard.criticalBlockers),
      nextActionsJson: JSON.stringify(agentResult.scorecard.nextActions), evidenceReadinessState: review.evidenceReadinessState,
      source: "agent", generatedAt: now
    }, "Replace");
  }

  const syncedOutputs = await syncArbReviewedOutputs({
    principal,
    review: { ...review, workflowState: "Review In Progress", agentRecommendation: agentResult.recommendation ?? null, agentReviewedAt: now, lastUpdated: now },
    files, requirements: requirementsList, evidence: evidenceList,
    findings: agentResult.findings ?? [], scorecard: agentResult.scorecard ?? null,
    actions: actionsList, formats: ["markdown", "csv", "html"], generatedAt: now, existingExports: []
  });

  await client.upsertEntity({ partitionKey: getPartitionKey(reviewId), rowKey: getRowKey("EXPORTS", userId), exportsJson: JSON.stringify(syncedOutputs.exportsList) }, "Replace");
  await client.upsertEntity({ partitionKey: getPartitionKey(reviewId), rowKey: getRowKey("SUMMARY", userId), workflowState: "Review In Progress", agentRecommendation: agentResult.recommendation ?? null, agentReviewedAt: now, lastUpdated: now }, "Merge");

  log("Persisted results", { durationMs: Date.now() - t0 });

  return {
    agentReviewCompleted: true,
    fallbackUsed: agentResult.fallbackUsed ?? false,
    findingsCount: agentResult.findings?.length ?? 0,
    recommendation: agentResult.recommendation,
    overallScore: agentResult.scorecard?.overallScore ?? null,
    confidenceLevel: agentResult.scorecard?.confidenceLevel ?? null,
    generatedAt: now,
    artifactsGenerated: syncedOutputs.artifacts.length
  };
}

// ─── POST handler: starts the job and returns immediately ───
async function handleArbRunAgentReview(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) return auth.response;

  const reviewId = request.params?.reviewId || "demo-review";
  const userId = auth.principal.userId;
  const traceId = crypto.randomUUID();

  function log(msg, extra = {}) {
    context.log(JSON.stringify({ traceId, reviewId, msg, ...extra }));
  }

  // If a job is already running for this review, return its status (survives restarts + multi-instance)
  const existing = await readJob(reviewId, userId);
  if (existing && existing.status === "running") {
    return jsonResponse(200, {
      reviewId, traceId: existing.traceId, status: "running",
      startedAt: existing.startedAt,
      message: "Assessment is already in progress. Poll the status endpoint."
    });
  }

  // Mark job as running in Table Storage before firing background task
  const startedAt = new Date().toISOString();
  await writeJob(reviewId, userId, { status: "running", traceId, startedAt, completedAt: null, resultJson: null, error: null });

  // Fire and forget — the pipeline runs in the background with no timeout pressure
  runReviewPipeline({ principal: auth.principal, reviewId, traceId, log })
    .then(async (result) => {
      const completedAt = new Date().toISOString();
      await writeJob(reviewId, userId, { status: "completed", traceId, startedAt, completedAt, resultJson: JSON.stringify(result), error: null });
      log("Background pipeline completed", { durationMs: Date.now() - new Date(startedAt).getTime() });
    })
    .catch(async (error) => {
      const completedAt = new Date().toISOString();
      const msg = error instanceof Error ? error.message : String(error);
      await writeJob(reviewId, userId, { status: "failed", traceId, startedAt, completedAt, resultJson: null, error: msg });
      log("Background pipeline failed", { error: msg });
    });

  // Return immediately — frontend will poll for status
  return jsonResponse(202, {
    reviewId,
    traceId,
    status: "running",
    startedAt,
    message: "Assessment started. Poll /api/arb/reviews/{reviewId}/agent-status for progress."
  });
}

// ─── GET handler: returns current job status ───
async function handleArbAgentStatus(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) return auth.response;

  const reviewId = request.params?.reviewId || "demo-review";
  const job = await readJob(reviewId, auth.principal.userId);

  if (!job) {
    return jsonResponse(200, { reviewId, status: "idle", message: "No assessment has been started for this review." });
  }

  if (job.status === "running") {
    const elapsed = Date.now() - new Date(job.startedAt).getTime();
    return jsonResponse(200, {
      reviewId, traceId: job.traceId, status: "running",
      startedAt: job.startedAt, elapsedMs: elapsed,
      message: "Assessment is in progress."
    });
  }

  if (job.status === "completed") {
    const result = job.resultJson ? JSON.parse(job.resultJson) : {};
    return jsonResponse(200, {
      reviewId, traceId: job.traceId, status: "completed",
      startedAt: job.startedAt, completedAt: job.completedAt,
      ...result
    });
  }

  if (job.status === "failed") {
    return jsonResponse(200, {
      reviewId, traceId: job.traceId, status: "failed",
      startedAt: job.startedAt, completedAt: job.completedAt,
      error: job.error
    });
  }

  return jsonResponse(200, { reviewId, status: job.status });
}

app.http("arbRunAgentReview", {
  route: "arb/reviews/{reviewId}/run-agent-review",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: handleArbRunAgentReview
});

app.http("arbAgentStatus", {
  route: "arb/reviews/{reviewId}/agent-status",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: handleArbAgentStatus
});

module.exports = { handleArbRunAgentReview, handleArbAgentStatus };
