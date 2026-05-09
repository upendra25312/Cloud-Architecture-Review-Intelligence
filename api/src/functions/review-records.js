const { app } = require("@azure/functions");
const { jsonResponse, requireAuthenticated } = require("../shared/auth");
const { toReviewDocument } = require("../shared/review-records");
const { loadReviewRecords, saveReviewRecords } = require("../shared/project-review-store");

app.http("review-records-get", {
  route: "review-records",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (request) => {
    const { principal, response } = requireAuthenticated(request);

    if (response) {
      return response;
    }

    try {
      const document = await loadReviewRecords(principal);

      return jsonResponse(200, document, {
        "Cache-Control": "no-store"
      });
    } catch (error) {
      return jsonResponse(500, {
        error: error instanceof Error ? error.message : "Unable to load saved review records."
      });
    }
  }
});

app.http("review-records-save", {
  route: "review-records",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request) => {
    const { principal, response } = requireAuthenticated(request);

    if (response) {
      return response;
    }

    try {
      const body = await request.json();
      const document = toReviewDocument(body?.records);
      await saveReviewRecords(principal, document, body?.reviewId);

      return jsonResponse(200, document, {
        "Cache-Control": "no-store"
      });
    } catch (error) {
      return jsonResponse(500, {
        error: error instanceof Error ? error.message : "Unable to save review records."
      });
    }
  }
});
