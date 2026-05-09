const { app } = require("@azure/functions");
const { getClientPrincipal, jsonResponse } = require("../shared/auth");
const { recordTelemetryEvent } = require("../shared/review-telemetry");

app.http("telemetry", {
  route: "telemetry",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request) => {
    const principal = getClientPrincipal(request);
    const body = await request.json().catch(() => ({}));

    try {
      const result = await recordTelemetryEvent(body, principal);

      return jsonResponse(
        202,
        {
          recorded: result.recorded,
          storageConfigured: result.storageConfigured
        },
        {
          "Cache-Control": "no-store"
        }
      );
    } catch (error) {
      return jsonResponse(
        400,
        {
          recorded: false,
          error: error instanceof Error ? error.message : "Telemetry payload is invalid."
        },
        {
          "Cache-Control": "no-store"
        }
      );
    }
  }
});
