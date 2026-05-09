const { app } = require("@azure/functions");
const { getClientPrincipal, jsonResponse } = require("../shared/auth");
const { rateLimitResponse, COPILOT_LIMIT } = require("../shared/rate-limiter");
const { normalizeCopilotContext } = require("../shared/project-review-state");
const { loadProjectReviewState } = require("../shared/project-review-store");
const { runCopilot } = require("../shared/copilot");

async function loadSavedCopilotContext(request) {
  const principal = getClientPrincipal(request);

  if (!principal?.userId) {
    return null;
  }

  const document = await loadProjectReviewState(principal);

  return normalizeCopilotContext(document?.copilotContext);
}

function normalizeMode(value) {
  switch (String(value ?? "").trim()) {
    case "service-review":
      return "service-review";
    case "leadership-summary":
      return "leadership-summary";
    case "project-review":
    default:
      return "project-review";
  }
}

app.http("copilot", {
  route: "copilot",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request) => {
    const principal = getClientPrincipal(request);
    const limited = rateLimitResponse(request, principal, COPILOT_LIMIT);
    if (limited) return limited;

    try {
      const body = await request.json();
      const question = String(body?.question ?? "").trim();
      const mode = normalizeMode(body?.mode);
      const explicitContext = body?.context;

      if (!question) {
        return jsonResponse(400, {
          error: "A question is required before the project review copilot can answer."
        });
      }

      let context = explicitContext;
      let groundingMode = "project-review-context";

      if (!context?.review || !Array.isArray(context?.services)) {
        context = await loadSavedCopilotContext(request);
        groundingMode = "saved-project-review-context";
      }

      if (!context?.review || !Array.isArray(context?.services)) {
        return jsonResponse(400, {
          error:
            "Project review context is required before the copilot can answer. Sign in and save the active project review to Azure if you want the backend to resolve it automatically."
        });
      }

      const payload = await runCopilot(question, context, {
        mode,
        groundingMode
      });

      return jsonResponse(200, payload, {
        "Cache-Control": "no-store"
      });
    } catch (error) {
      return jsonResponse(500, {
        error:
          error instanceof Error
            ? error.message
            : "Unable to run the Azure Checklists copilot."
      });
    }
  }
});
