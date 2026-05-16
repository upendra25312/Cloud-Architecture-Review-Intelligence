const { app } = require("@azure/functions");
const { jsonResponse } = require("../shared/auth");
const { runArbAgentReview, getFoundryConfiguration, buildFallbackAgentReview } = require("../shared/arb-foundry-agent");
const { runDeterministicRules } = require("../shared/arb-rules-engine");

// Map Foundry agent recommendation values to CARI governance posture labels
// that match the evaluation dataset's expected_governance_posture field.
const RECOMMENDATION_TO_POSTURE = {
  "recommended for approval": "Approved",
  "ready with gaps": "Approved with Conditions",
  "needs remediation": "Needs Remediation",
};

function mapGovernancePosture(recommendation, findings) {
  const rec = (recommendation || "").toLowerCase();
  if (RECOMMENDATION_TO_POSTURE[rec]) return RECOMMENDATION_TO_POSTURE[rec];
  // If recommendation is absent but findings exist, derive from severity
  const hasCriticalOrHigh = (findings || []).some(
    (f) => f.severity === "Critical" || f.severity === "High"
  );
  return hasCriticalOrHigh ? "Needs Remediation" : "Review Required";
}

function buildEvalReview(caseId, area) {
  return {
    reviewId: `eval-${caseId}`,
    projectName: `Eval: ${area || caseId}`,
    customerName: "CARI Evaluation",
    targetRegions: ["Australia East"],
    workflowState: "Submitted for Review",
    evidenceReadinessState: "Ready for Review",
    requiredEvidencePresent: true,
    missingRequiredItems: [],
    governancePosture: null,
    agentRecommendation: null,
    agentReviewedAt: null,
    lastUpdated: new Date().toISOString(),
  };
}

function buildEvalFile(caseId, input) {
  return {
    fileId: `eval-file-${caseId}`,
    reviewId: `eval-${caseId}`,
    fileName: "eval-scenario.txt",
    logicalCategory: "architecture",
    extractionStatus: "Completed",
    extractedText: input,
    detectedDomains: [],
    uploadedAt: new Date().toISOString(),
  };
}

function buildEvalRequirements(caseId, input) {
  const sentences = input
    .split(/[.\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25);
  return sentences.slice(0, 40).map((line, i) => ({
    requirementId: `eval-req-${caseId}-${i}`,
    reviewId: `eval-${caseId}`,
    normalizedText: line,
    category: "Architecture",
    criticality: "Normal",
    sourceFileId: `eval-file-${caseId}`,
    sourceFileName: "eval-scenario.txt",
  }));
}

function buildEvalEvidence(caseId, input) {
  // Surface the full scenario as a single evidence fact so the agent can ground its findings
  return [
    {
      evidenceId: `eval-evidence-${caseId}-0`,
      reviewId: `eval-${caseId}`,
      sourceFileId: `eval-file-${caseId}`,
      sourceFileName: "eval-scenario.txt",
      factType: "Architecture",
      summary: input.slice(0, 800),
      sourceExcerpt: input.slice(0, 300),
      confidence: "High",
    },
  ];
}

async function handleArbEvalReview(request, context) {
  // Disabled kill-switch: set CARI_EVAL_ENABLED=false in app settings to block this endpoint
  if (process.env.CARI_EVAL_ENABLED === "false") {
    return jsonResponse(503, { error: "Eval endpoint is disabled on this deployment." });
  }

  const config = getFoundryConfiguration();
  if (!config.configured) {
    return jsonResponse(503, {
      error: "Foundry agent is not configured on this deployment.",
      findings: [],
      remediationActions: [],
      domains: [],
      governance_posture: "Review Required",
      output_text: "",
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "Request body must be valid JSON." });
  }

  const caseId = String(body?.caseId || "unknown").slice(0, 100);
  const area = String(body?.area || "").slice(0, 200);
  const input = String(body?.input || "").slice(0, 12000);

  if (!input.trim()) {
    return jsonResponse(400, { error: "'input' field is required and must not be empty." });
  }

  context.log(JSON.stringify({ msg: "arbEvalReview started", caseId, area }));

  const review = buildEvalReview(caseId, area);
  const files = [buildEvalFile(caseId, input)];
  const requirements = buildEvalRequirements(caseId, input);
  const evidence = buildEvalEvidence(caseId, input);

  // Run deterministic rules first (cost-free, authoritative)
  const { ruleFindings, ruleBlockers, criticalBlockerCount } = runDeterministicRules({
    review, requirements, evidence, files,
  });

  // Run the AI agent — same path as the real review pipeline
  let agentResult = await runArbAgentReview({
    review, files, requirements, evidence,
    searchChunks: [],     // no Azure AI Search index in eval mode
    visualEvidence: [],
    existingRuleFindings: ruleFindings,
  });

  if (!agentResult.success) {
    context.log(JSON.stringify({ msg: "arbEvalReview agent failed; using fallback", caseId, reason: agentResult.reason }));
    agentResult = {
      ...buildFallbackAgentReview({ review, requirements, evidence, reason: agentResult.reason }),
      success: true, fallbackUsed: true,
    };
  }

  // Merge rule findings (same logic as main pipeline)
  if (ruleFindings.length > 0) {
    const ruleIds = new Set(ruleFindings.map((f) => f.ruleId));
    const aiOnly = (agentResult.findings || []).filter((f) => !ruleIds.has(f.ruleId));
    agentResult = { ...agentResult, findings: [...ruleFindings, ...aiOnly] };
    if (agentResult.scorecard && criticalBlockerCount > 0) {
      agentResult.scorecard.criticalBlockerCount = Math.max(
        agentResult.scorecard.criticalBlockerCount ?? 0, criticalBlockerCount
      );
      agentResult.scorecard.criticalBlockers = [
        ...(agentResult.scorecard.criticalBlockers ?? []), ...ruleBlockers,
      ].filter((v, i, a) => a.indexOf(v) === i);
    }
  }

  const findings = agentResult.findings || [];
  const scorecard = agentResult.scorecard || {};
  const recommendation = agentResult.recommendation || scorecard.recommendation || "";

  // Derive unique domain names from findings and dimension scores
  const domainSet = new Set();
  for (const f of findings) {
    if (f.domain) domainSet.add(f.domain);
  }
  for (const d of scorecard.dimensionScores || []) {
    if (d.name) domainSet.add(d.name);
  }
  const domains = [...domainSet];

  // Build remediation actions from agent next-actions and finding recommendations
  const remediationActions = [
    ...(scorecard.nextActions || []).map((title, i) => ({
      actionId: `eval-action-${caseId}-${i}`,
      title,
      actionSummary: title,
      status: "Open",
    })),
    ...findings.slice(0, 10).map((f, i) => ({
      actionId: `eval-finding-action-${caseId}-${i}`,
      title: f.recommendation || f.title,
      actionSummary: f.recommendation || "",
      status: "Open",
    })),
  ];

  // Build a flat text corpus for the evaluator's corpus-matching checks
  const outputParts = [
    scorecard.reviewSummary || "",
    recommendation,
    ...findings.map((f) => `${f.title} ${f.findingStatement} ${f.recommendation}`),
    ...(scorecard.missingEvidence || []),
    ...(scorecard.criticalBlockers || []),
    ...(scorecard.nextActions || []),
    ...domains,
  ];
  const output_text = outputParts.filter(Boolean).join(" | ");

  const governance_posture = mapGovernancePosture(recommendation, findings);

  context.log(JSON.stringify({
    msg: "arbEvalReview completed",
    caseId,
    findings: findings.length,
    governance_posture,
    recommendation,
    fallback: agentResult.fallbackUsed ?? false,
  }));

  return jsonResponse(200, {
    reviewId: `eval-${caseId}`,
    caseId,
    governance_posture,
    recommendation,
    findings: findings.map((f) => ({
      findingId: f.findingId,
      title: f.title,
      description: f.findingStatement || f.title,
      severity: f.severity,
      domain: f.domain,
      recommendation: f.recommendation,
    })),
    domains,
    remediationActions,
    scorecard: {
      overallScore: scorecard.overallScore ?? null,
      confidenceLevel: scorecard.confidenceLevel ?? null,
    },
    output_text,
    fallbackUsed: agentResult.fallbackUsed ?? false,
  });
}

app.http("arbEvalReview", {
  route: "arb/eval/review",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: handleArbEvalReview,
});

module.exports = { handleArbEvalReview };
