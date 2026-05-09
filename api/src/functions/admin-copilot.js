const { app } = require("@azure/functions");
const { jsonResponse } = require("../shared/auth");
const { requireAdmin } = require("../shared/admin-auth");
const { getCopilotConfiguration } = require("../shared/copilot");

app.http("admin-copilot", {
  route: "admin/copilot",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request) => {
    const { response } = requireAdmin(request);

    if (response) {
      return response;
    }

    const copilotConfiguration = getCopilotConfiguration();
    const body = await request.json().catch(() => ({}));
    const question =
      typeof body?.question === "string" && body.question.trim()
        ? body.question.trim()
        : "Admin copilot prompt execution requested.";

    return jsonResponse(
      501,
      {
        answer:
          "The admin shell is live and protected. Prompt execution is a Milestone 2 feature — it will be enabled when read-only Azure MCP tooling (Resource Graph, Cost Management, Application Insights) is connected and validated end-to-end. Current status: shell authenticated, prompt execution not yet wired.",
        generatedAt: new Date().toISOString(),
        modelName: copilotConfiguration.modelName,
        modelDeployment: copilotConfiguration.deployment ?? null,
        milestone: "M2 — Azure MCP read-only tooling",
        milestoneStatus: "not-started",
        sources: [
          {
            label: "Admin copilot shell — Milestone 2",
            note: "Auth and route protection are complete (M1). Prompt execution with MCP tools is scoped to M2. Do not present as a current capability."
          }
        ],
        toolCalls: [
          {
            tool: "admin-shell",
            status: "skipped",
            detail: question
          }
        ],
        promptExecutionEnabled: false,
        error: "Admin copilot prompt execution is a Milestone 2 feature and is not yet enabled."
      },
      {
        "Cache-Control": "no-store"
      }
    );
  }
});
