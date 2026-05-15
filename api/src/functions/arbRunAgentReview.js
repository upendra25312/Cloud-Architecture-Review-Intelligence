const crypto = require("node:crypto");
const { app } = require("@azure/functions");
const df = require("durable-functions");
const { jsonResponse, requireAuthenticated } = require("../shared/auth");
const {
  getArbReview,
  getArbFiles,
  getArbRequirements,
  getArbEvidence,
  getArbVisualEvidence,
  getArbActions,
  syncArbReviewedOutputs,
  capFindingsForTableStorage,
  capScorecardForTableStorage
} = require("../shared/arb-review-store");
const { searchArbDocuments, ensureArbSearchIndex } = require("../shared/arb-search");
const { runArbAgentReview, getFoundryConfiguration, buildFallbackAgentReview } = require("../shared/arb-foundry-agent");
const { runDeterministicRules } = require("../shared/arb-rules-engine");
const { getTableClient, ARB_REVIEW_TABLE_NAME, encodeTableKey } = require("../shared/table-storage");
const { shouldUseDurable } = require("../durable/shared/featureFlag");
const { computeInstanceId } = require("../durable/shared/instanceId");

const ARBJOBS_TABLE_NAME = "arbjobs";
const RECOMMENDED_APPROVAL_SCORE = 80;

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
    ...requirements.slice(0, 30).map((r) => r.normalizedText ?? ""),
    ...evidence.slice(0, 25).map((e) => e.summary ?? "")
  ].join(" ");
  allText.split(/\W+/).forEach((tok) => {
    const t = tok.trim().toLowerCase();
    if (t.length >= 5 && !stopWords.has(t)) terms.add(tok.trim());
  });
  // Include key landing zone + WAF pillar terms to ensure broad document coverage
  const base = "Azure architecture security reliability governance identity network connectivity backup monitoring WAF CAF landing zone";
  const extra = [...terms].slice(0, 25).join(" ");
  return `${base} ${extra}`.slice(0, 300).trim();
}

function getRowKey(baseKey, userId) {
  return `${baseKey}|${encodeTableKey(userId)}`;
}

function getPartitionKey(reviewId) {
  return encodeTableKey(reviewId);
}

function isActiveFinding(finding) {
  return finding?.status !== "Closed" && finding?.status !== "Not Applicable";
}

function hasSowArtifact(files, review) {
  const uploadedSow = files.some((file) => String(file.logicalCategory ?? "").toLowerCase() === "sow");
  if (uploadedSow) return true;

  const missingRequired = Array.isArray(review.missingRequiredItems) ? review.missingRequiredItems : [];
  return Boolean(review.requiredEvidencePresent) && !missingRequired.includes("sow");
}

function deriveGovernedRecommendation({ review, files, findings, scorecard, visualEvidence }) {
  const overallScore = Number(scorecard?.overallScore);
  const activeFindings = Array.isArray(findings) ? findings.filter(isActiveFinding) : [];
  const unresolvedCritical = activeFindings.filter(
    (finding) => finding.criticalBlocker || finding.severity === "Critical"
  ).length;
  const unresolvedHigh = activeFindings.filter((finding) => finding.severity === "High").length;
  const sowPresent = hasSowArtifact(files, review);
  const visualEvidenceProcessed = Array.isArray(visualEvidence) && visualEvidence.length > 0;
  const readiness = review.evidenceReadinessState;

  if (!Number.isFinite(overallScore)) {
    return "Needs Remediation";
  }

  if (readiness === "Insufficient Evidence") {
    return "Ready with Gaps";
  }

  if (unresolvedCritical > 0 || unresolvedHigh > 0 || overallScore < 70) {
    return "Needs Remediation";
  }

  if (
    overallScore >= RECOMMENDED_APPROVAL_SCORE &&
    readiness === "Ready for Review" &&
    sowPresent &&
    visualEvidenceProcessed
  ) {
    return "Recommended for Approval";
  }

  return "Ready with Gaps";
}

async function runReviewPipeline({ principal, reviewId, traceId, log }) {
  const t0 = Date.now();
  const foundryConfig = getFoundryConfiguration();
  if (!foundryConfig.configured) {
    throw Object.assign(new Error("Foundry agent is not configured on this deployment."), { statusCode: 503 });
  }

  log("Agent review started");

  const [review, files, requirementsList, evidenceList, visualEvidenceList, actionsList] = await Promise.all([
    getArbReview(principal, reviewId),
    getArbFiles(principal, reviewId),
    getArbRequirements(principal, reviewId),
    getArbEvidence(principal, reviewId),
    getArbVisualEvidence(principal, reviewId),
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
    requirements: requirementsList.length, evidence: evidenceList.length,
    visualEvidence: visualEvidenceList.length
  });

  const searchQuery = buildArbSearchQuery(review, requirementsList, evidenceList);
  await ensureArbSearchIndex();
  const searchChunks = await searchArbDocuments(reviewId, searchQuery, 20);
  log("Search complete", { query: searchQuery.slice(0, 80), chunks: searchChunks.length });

  // Run deterministic rules first — these are authoritative and cost-free
  const { ruleFindings, ruleBlockers, criticalBlockerCount: ruleCriticalCount } = runDeterministicRules({
    review, requirements: requirementsList, evidence: evidenceList, files
  });
  log("Rules engine completed", { ruleFindings: ruleFindings.length, blockers: ruleCriticalCount });

  // Run automated agent assessment — no timeout pressure since this runs in the background
  let agentResult = await runArbAgentReview({
    review, files, requirements: requirementsList, evidence: evidenceList, searchChunks, visualEvidence: visualEvidenceList,
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

  if (agentResult.scorecard) {
    const governedRecommendation = deriveGovernedRecommendation({
      review,
      files,
      findings: agentResult.findings ?? [],
      scorecard: agentResult.scorecard,
      visualEvidence: visualEvidenceList
    });
    agentResult.scorecard.recommendation = governedRecommendation;
    agentResult.recommendation = governedRecommendation;
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
  if (agentResult.findings && (evidenceList.length > 0 || visualEvidenceList.length > 0)) {
    const evidenceById = new Map(evidenceList.map((e) => [e.evidenceId, e]));
    const visualEvidenceById = new Map(visualEvidenceList.map((e) => [e.visualEvidenceId, e]));
    for (const finding of agentResult.findings) {
      const ids = Array.isArray(finding.evidenceIds) ? finding.evidenceIds : [];
      const visualIds = Array.isArray(finding.visualEvidenceIds) ? finding.visualEvidenceIds : [];
      finding.evidenceFound = [
        ...ids
        .map((id) => evidenceById.get(id)).filter(Boolean)
        .map((e) => ({ evidenceId: e.evidenceId, summary: e.summary, sourceFileName: e.sourceFileName, sourceFileId: e.sourceFileId, factType: e.factType })),
        ...visualIds
          .map((id) => visualEvidenceById.get(id)).filter(Boolean)
          .map((e) => ({
            evidenceId: e.visualEvidenceId,
            visualEvidenceId: e.visualEvidenceId,
            summary: e.summary,
            sourceFileName: e.sourceFileName,
            sourceFileId: e.sourceFileId,
            factType: e.factType,
            imageUri: e.imageUri,
            extractionSource: e.extractionSource
          }))
      ];
      if (finding.evidenceFound.length === 0 && finding.evidenceBasis && evidenceList.length > 0) {
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
      delete finding.visualEvidenceIds;
    }
  }

  // Persist findings + scorecard + exports
  const client = await getTableClient(ARB_REVIEW_TABLE_NAME);
  const now = new Date().toISOString();
  const userId = principal.userId;

  // When fallback fired, only persist rule-based findings — never store the placeholder finding
  // that would pollute future runs. If agent succeeded fully, write everything.
  const findingsToWrite = agentResult.fallbackUsed
    ? (agentResult.findings ?? []).filter((f) => !String(f.findingId ?? "").startsWith("fallback-"))
    : agentResult.findings;

  if (findingsToWrite && findingsToWrite.length > 0) {
    const safeFindings = capFindingsForTableStorage(findingsToWrite);
    await client.upsertEntity({ partitionKey: getPartitionKey(reviewId), rowKey: getRowKey("FINDINGS", userId), findingsJson: JSON.stringify(safeFindings) }, "Replace");
  }

  // Never overwrite a real scorecard with a fallback scorecard — preserve existing scores
  if (agentResult.scorecard && !agentResult.fallbackUsed) {
    const sc = capScorecardForTableStorage(agentResult.scorecard);
    await client.upsertEntity({
      partitionKey: getPartitionKey(reviewId), rowKey: getRowKey("SCORECARD", userId),
      overallScore: sc.overallScore, recommendation: sc.recommendation,
      criticalBlockerCount: sc.criticalBlockerCount, missingEvidenceCount: sc.missingEvidenceCount,
      confidenceLevel: sc.confidenceLevel, dimensionScoresJson: JSON.stringify(sc.dimensionScores),
      reviewSummary: sc.reviewSummary, strengthsJson: JSON.stringify(sc.strengths),
      missingEvidenceJson: JSON.stringify(sc.missingEvidence), criticalBlockersJson: JSON.stringify(sc.criticalBlockers),
      nextActionsJson: JSON.stringify(sc.nextActions), evidenceReadinessState: review.evidenceReadinessState,
      source: "agent", generatedAt: now
    }, "Replace");
  }

  const evidenceForOutputs = [
    ...evidenceList,
    ...visualEvidenceList.map((v) => ({
      evidenceId: v.visualEvidenceId,
      reviewId: v.reviewId,
      sourceFileId: v.sourceFileId,
      sourceFileName: v.sourceFileName,
      factType: v.factType,
      summary: v.summary,
      sourceExcerpt: v.sourceExcerpt,
      confidence: v.confidence
    }))
  ];

  const syncedOutputs = await syncArbReviewedOutputs({
    principal,
    review: { ...review, workflowState: "Review In Progress", agentRecommendation: agentResult.recommendation ?? null, agentReviewedAt: now, lastUpdated: now },
    files, requirements: requirementsList, evidence: evidenceForOutputs,
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

  // ─── Feature flag branch: route to Durable Functions orchestration ───
  // When USE_DURABLE_ORCHESTRATION=ON, start a durable orchestration instead
  // of running the fire-and-forget pipeline inline. The orchestration writes
  // status to `arbjobs` (via the writeArbJobStatus activity) so the existing
  // GET /agent-status polling endpoint continues to work unchanged.
  if (shouldUseDurable()) {
    try {
      const client = df.getClient(context);
      const instanceId = computeInstanceId("review", reviewId, userId);

      // If an orchestration is already running/pending for this (review, user),
      // return its current status rather than starting a duplicate.
      const existingStatus = await client.getStatus(instanceId);
      if (
        existingStatus &&
        (existingStatus.runtimeStatus === "Running" ||
          existingStatus.runtimeStatus === "Pending")
      ) {
        const existingInput = existingStatus.input && typeof existingStatus.input === "object"
          ? existingStatus.input
          : {};
        return jsonResponse(200, {
          reviewId,
          traceId: existingInput.traceId ?? traceId,
          status: "running",
          startedAt: existingStatus.createdTime
            ? new Date(existingStatus.createdTime).toISOString()
            : new Date().toISOString(),
          message: "Assessment is already in progress. Poll the status endpoint."
        });
      }

      const startedAt = new Date().toISOString();

      // Seed the arbjobs row with the running state so polling works immediately,
      // even before the orchestrator's first checkpoint.
      await writeJob(reviewId, userId, {
        status: "running",
        traceId,
        startedAt,
        completedAt: null,
        resultJson: null,
        error: null
      });

      await client.startNew("orchestratorAgentReview", {
        instanceId,
        input: { reviewId, principal: auth.principal, traceId }
      });

      log("Durable orchestration started", { instanceId });

      return jsonResponse(202, {
        reviewId,
        traceId,
        status: "running",
        startedAt,
        message: "Assessment started. Poll /api/arb/reviews/{reviewId}/agent-status for progress."
      });
    } catch (err) {
      log("Durable orchestration start failed", {
        error: err instanceof Error ? err.message : String(err)
      });
      return jsonResponse(503, { error: "Unable to start assessment." });
    }
  }

  // ─── Legacy path (USE_DURABLE_ORCHESTRATION=OFF or DRAIN) ───
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
// NOTE: Both legacy (fire-and-forget) and durable (via writeArbJobStatus activity)
// paths write to arbjobs, so this status endpoint works unchanged for both.
async function handleArbAgentStatus(request, context) {
  // Works for both legacy and durable paths — both write to arbjobs table
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
  extraInputs: [df.input.durableClient()],
  handler: handleArbRunAgentReview
});

app.http("arbAgentStatus", {
  route: "arb/reviews/{reviewId}/agent-status",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: handleArbAgentStatus
});

module.exports = { handleArbRunAgentReview, handleArbAgentStatus, deriveGovernedRecommendation };
