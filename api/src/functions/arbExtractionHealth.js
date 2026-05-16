const { app } = require("@azure/functions");
const { jsonResponse } = require("../shared/auth");
const { requireAdmin } = require("../shared/admin-auth");
const { checkDocumentIntelligenceHealth } = require("../shared/arb-document-intelligence");
const { checkVisionServiceHealth } = require("../shared/arb-vision-service");

/**
 * GET /api/arb/extraction/health
 *
 * Admin-protected diagnostic endpoint. Verifies that Azure Document Intelligence
 * and Azure AI Vision are reachable and properly authenticated.
 *
 * Does NOT submit any documents — uses lightweight model/service list endpoints
 * to test connectivity and auth with zero quota cost.
 *
 * Protected by the same admin token as other /admin/* routes.
 */
app.http("arbExtractionHealth", {
  route: "arb/extraction/health",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (request) => {
    const { response } = requireAdmin(request);
    if (response) return response;

    const checkedAt = new Date().toISOString();

    const [diResult, visionResult] = await Promise.allSettled([
      checkDocumentIntelligenceHealth(),
      checkVisionServiceHealth()
    ]);

    const di = diResult.status === "fulfilled"
      ? diResult.value
      : { ok: false, configured: false, message: `Health check threw: ${diResult.reason?.message ?? diResult.reason}` };

    const vision = visionResult.status === "fulfilled"
      ? visionResult.value
      : { ok: false, configured: false, message: `Health check threw: ${visionResult.reason?.message ?? visionResult.reason}` };

    const allHealthy = di.ok && vision.ok;

    const recommendations = [];
    if (!di.configured) {
      recommendations.push("Set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT (or AZURE_DOCINT_ENDPOINT) in Azure Portal → Function App → Configuration → Application Settings.");
    } else if (!di.ok) {
      recommendations.push("Document Intelligence: " + di.message);
    } else {
      recommendations.push("Document Intelligence: Upgrade SKU from F0 (500 pages/month) to S0 (pay-as-you-go) for production workloads: az cognitiveservices account update --name <di-name> --resource-group <rg> --sku S0");
    }

    if (!vision.configured) {
      recommendations.push("Set AZURE_VISION_ENDPOINT in Azure Portal → Function App → Configuration → Application Settings.");
    } else if (!vision.ok) {
      recommendations.push("Azure Vision: " + vision.message);
    }

    return jsonResponse(
      allHealthy ? 200 : 503,
      {
        status: allHealthy ? "Healthy" : "Degraded",
        checkedAt,
        services: {
          documentIntelligence: {
            configured: di.configured,
            healthy: di.ok,
            message: di.message,
            skuHint: di.skuHint ?? null,
            envVar: "AZURE_DOCINT_ENDPOINT",
            requiredRole: "Cognitive Services User"
          },
          vision: {
            configured: vision.configured,
            healthy: vision.ok,
            message: vision.message,
            envVar: "AZURE_VISION_ENDPOINT",
            requiredRole: "Cognitive Services User"
          }
        },
        pdfFallback: {
          available: true,
          description: "pdf-parse native text layer extraction is always available as a zero-config fallback for PDFs with selectable text."
        },
        recommendations
      },
      { "Cache-Control": "no-store" }
    );
  }
});
