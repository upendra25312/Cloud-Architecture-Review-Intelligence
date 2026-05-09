const { app } = require("@azure/functions");
const { requireAdmin } = require("../shared/admin-auth");
const { loadTelemetrySummary } = require("../shared/review-telemetry");
const { jsonResponse } = require("../shared/auth");

function parseWindowDays(request) {
  const days = Number(new URL(request.url).searchParams.get("days") || "14");

  if (!Number.isFinite(days)) {
    return 14;
  }

  return Math.max(1, Math.min(30, Math.trunc(days)));
}

app.http("admin-telemetry-summary", {
  route: "admin/telemetry/summary",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (request) => {
    const { response } = requireAdmin(request);

    if (response) {
      return response;
    }

    const windowDays = parseWindowDays(request);
    const summary = await loadTelemetrySummary({ windowDays });

    return jsonResponse(200, summary, {
      "Cache-Control": "no-store"
    });
  }
});
