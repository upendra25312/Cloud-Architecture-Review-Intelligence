const crypto = require("node:crypto");
const { app, output } = require("@azure/functions");
const df = require("durable-functions");
const { jsonResponse, requireAuthenticated, safeErrorResponse } = require("../shared/auth");
const { markArbExtractionQueued, getArbFiles } = require("../shared/arb-review-store");
const { rateLimitResponse, EXTRACTION_LIMIT } = require("../shared/rate-limiter");
const { shouldUseDurable } = require("../durable/shared/featureFlag");
const { computeInstanceId } = require("../durable/shared/instanceId");

const extractionQueueOutput = output.storageQueue({
  queueName: "arb-extraction-jobs",
  connection: "AzureWebJobsStorage"
});

async function handleArbStartExtraction(request, context) {
  const auth = requireAuthenticated(request);
  if (auth.response) {
    return auth.response;
  }

  const limited = rateLimitResponse(request, auth.principal, EXTRACTION_LIMIT);
  if (limited) return limited;

  try {
    const reviewId = request.params?.reviewId || "demo-review";

    // Fast validation: confirm files exist before accepting the request
    const files = await getArbFiles(auth.principal, reviewId);
    if (!files || files.length === 0) {
      return jsonResponse(400, { error: "Upload files before starting extraction." });
    }

    // ─── Feature flag branch: route to Durable Functions orchestration ───
    // When USE_DURABLE_ORCHESTRATION=ON, start a durable orchestration instead
    // of enqueueing a message to the legacy `arb-extraction-jobs` queue. The
    // orchestration writes status to `arbjobs` via the writeArbJobStatus
    // activity so the existing status polling endpoint works unchanged.
    //
    // NOTE: markArbExtractionQueued is called AFTER startNew succeeds so that
    // a failed startNew never leaves the job table in a phantom "Queued" state.
    if (shouldUseDurable()) {
      try {
        const client = df.getClient(context);
        const baseInstanceId = computeInstanceId("extraction", reviewId, auth.principal.userId);

        // If an orchestration is already running/pending for this (review, user),
        // return its current status rather than starting a duplicate.
        const existingStatus = await client.getStatus(baseInstanceId);
        if (
          existingStatus &&
          (existingStatus.runtimeStatus === "Running" ||
            existingStatus.runtimeStatus === "Pending")
        ) {
          const extraction = await markArbExtractionQueued(auth.principal, reviewId);
          return jsonResponse(200, {
            reviewId,
            status: "running",
            fileCount: files.length,
            extraction,
            message: "Extraction is already in progress."
          });
        }

        // For re-runs (previous orchestration in Completed/Terminated/Failed state),
        // use a timestamp-suffixed instanceId to avoid "instance already exists" errors
        // from the Durable extension. First-time runs reuse the base ID for clean tracking.
        const runInstanceId = existingStatus
          ? `${baseInstanceId.slice(0, 40)}-${Date.now().toString(36)}`
          : baseInstanceId;

        const traceId = crypto.randomUUID();
        await client.startNew("orchestratorExtraction", {
          instanceId: runInstanceId,
          input: {
            reviewId,
            principal: auth.principal,
            traceId,
            requestedAt: new Date().toISOString()
          }
        });

        // Mark queued only after the orchestration is confirmed started
        const extraction = await markArbExtractionQueued(auth.principal, reviewId);

        context.log(
          JSON.stringify({
            handler: "arbStartExtraction",
            msg: "Durable orchestration started",
            reviewId,
            instanceId: runInstanceId,
            traceId,
            fileCount: files.length
          })
        );

        return jsonResponse(202, {
          reviewId,
          status: "queued",
          fileCount: files.length,
          extraction
        });
      } catch (err) {
        context.error(
          `Durable extraction start failed: ${err instanceof Error ? err.message : String(err)}`
        );
        return jsonResponse(503, { error: "Unable to start extraction." });
      }
    }

    // ─── Legacy path (USE_DURABLE_ORCHESTRATION=OFF or DRAIN) ───
    const extraction = await markArbExtractionQueued(auth.principal, reviewId);
    context.extraOutputs.set(extractionQueueOutput, JSON.stringify({
      reviewId,
      principal: auth.principal,
      requestedAt: new Date().toISOString()
    }));

    return jsonResponse(202, {
      reviewId,
      status: "queued",
      fileCount: files.length,
      extraction
    });
  } catch (error) {
    return safeErrorResponse(error, "Unable to start ARB extraction.", context);
  }
}

app.http("arbStartExtraction", {
  route: "arb/reviews/{reviewId}/extract",
  methods: ["POST"],
  authLevel: "anonymous",
  extraInputs: [df.input.durableClient()],
  extraOutputs: [extractionQueueOutput],
  handler: handleArbStartExtraction
});

module.exports = {
  handleArbStartExtraction
};
