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

    const extraction = await markArbExtractionQueued(auth.principal, reviewId);

    // ─── Feature flag branch: route to Durable Functions orchestration ───
    // When USE_DURABLE_ORCHESTRATION=ON, start a durable orchestration instead
    // of enqueueing a message to the legacy `arb-extraction-jobs` queue. The
    // orchestration writes status to `arbjobs` via the writeArbJobStatus
    // activity so the existing status polling endpoint works unchanged.
    if (shouldUseDurable()) {
      try {
        const client = df.getClient(context);
        const instanceId = computeInstanceId("extraction", reviewId, auth.principal.userId);

        // If an orchestration is already running/pending for this (review, user),
        // return its current status rather than starting a duplicate.
        const existingStatus = await client.getStatus(instanceId);
        if (
          existingStatus &&
          (existingStatus.runtimeStatus === "Running" ||
            existingStatus.runtimeStatus === "Pending")
        ) {
          return jsonResponse(200, {
            reviewId,
            status: "running",
            fileCount: files.length,
            extraction,
            message: "Extraction is already in progress."
          });
        }

        const traceId = crypto.randomUUID();
        await client.startNew("orchestratorExtraction", {
          instanceId,
          input: {
            reviewId,
            principal: auth.principal,
            traceId,
            requestedAt: new Date().toISOString()
          }
        });

        context.log(
          JSON.stringify({
            handler: "arbStartExtraction",
            msg: "Durable orchestration started",
            reviewId,
            instanceId,
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
