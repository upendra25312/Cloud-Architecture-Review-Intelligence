const { app } = require("@azure/functions");
const { jsonResponse, requireAuthenticated } = require("../shared/auth");
const { loadProjectReviewState, saveProjectReviewState } = require("../shared/project-review-store");

function createEmptyStateDocument() {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    activePackage: null,
    copilotContext: null
  };
}

app.http("project-review-state-get", {
  route: "project-review-state",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (request) => {
    const { principal, response } = requireAuthenticated(request);

    if (response) {
      return response;
    }

    try {
      const document = (await loadProjectReviewState(principal)) ?? createEmptyStateDocument();

      return jsonResponse(200, document, {
        "Cache-Control": "no-store"
      });
    } catch (error) {
      return jsonResponse(500, {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load the saved project review state."
      });
    }
  }
});

app.http("project-review-state-save", {
  route: "project-review-state",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request) => {
    const { principal, response } = requireAuthenticated(request);

    if (response) {
      return response;
    }

    try {
      const body = await request.json();
      const document = await saveProjectReviewState(principal, body);

      return jsonResponse(200, document, {
        "Cache-Control": "no-store"
      });
    } catch (error) {
      return jsonResponse(500, {
        error:
          error instanceof Error
            ? error.message
            : "Unable to save the project review state."
      });
    }
  }
});
