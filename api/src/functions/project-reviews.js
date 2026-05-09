const { app } = require("@azure/functions");
const { jsonResponse, requireAuthenticated } = require("../shared/auth");
const {
  activateProjectReview,
  archiveProjectReview,
  deleteProjectReview,
  purgeProjectReview,
  listProjectReviews
  ,restoreDeletedProjectReview
} = require("../shared/project-review-store");

app.http("project-reviews-get", {
  route: "project-reviews",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (request) => {
    const { principal, response } = requireAuthenticated(request);

    if (response) {
      return response;
    }

    try {
      const payload = await listProjectReviews(principal);

      return jsonResponse(200, payload, {
        "Cache-Control": "no-store"
      });
    } catch (error) {
      return jsonResponse(500, {
        error:
          error instanceof Error
            ? error.message
            : "Unable to list saved project reviews."
      });
    }
  }
});

app.http("project-reviews-activate", {
  route: "project-reviews/activate",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request) => {
    const { principal, response } = requireAuthenticated(request);

    if (response) {
      return response;
    }

    try {
      const body = await request.json();
      const reviewId = String(body?.reviewId ?? "").trim();

      if (!reviewId) {
        return jsonResponse(400, {
          error: "A reviewId is required before the active project review can be changed."
        });
      }

      const payload = await activateProjectReview(principal, reviewId);

      return jsonResponse(200, payload, {
        "Cache-Control": "no-store"
      });
    } catch (error) {
      return jsonResponse(error?.statusCode === 404 || error?.statusCode === 409 ? error.statusCode : 500, {
        error:
          error instanceof Error
            ? error.message
            : "Unable to activate the selected project review."
      });
    }
  }
});

app.http("project-reviews-archive", {
  route: "project-reviews/archive",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request) => {
    const { principal, response } = requireAuthenticated(request);

    if (response) {
      return response;
    }

    try {
      const body = await request.json();
      const reviewId = String(body?.reviewId ?? "").trim();
      const archived = body?.archived !== false;

      if (!reviewId) {
        return jsonResponse(400, {
          error: "A reviewId is required before the saved project review can be archived."
        });
      }

      const payload = await archiveProjectReview(principal, reviewId, archived);

      return jsonResponse(200, payload, {
        "Cache-Control": "no-store"
      });
    } catch (error) {
      return jsonResponse(error?.statusCode === 404 || error?.statusCode === 409 ? error.statusCode : 500, {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update the archive state for the selected project review."
      });
    }
  }
});

app.http("project-reviews-delete", {
  route: "project-reviews/delete",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request) => {
    const { principal, response } = requireAuthenticated(request);

    if (response) {
      return response;
    }

    try {
      const body = await request.json();
      const reviewId = String(body?.reviewId ?? "").trim();
      const deleted = body?.deleted !== false;

      if (!reviewId) {
        return jsonResponse(400, {
          error: "A reviewId is required before the saved project review can be deleted."
        });
      }

      const payload = deleted
        ? await deleteProjectReview(principal, reviewId)
        : await restoreDeletedProjectReview(principal, reviewId);

      return jsonResponse(200, payload, {
        "Cache-Control": "no-store"
      });
    } catch (error) {
      return jsonResponse(error?.statusCode === 404 || error?.statusCode === 409 ? error.statusCode : 500, {
        error:
          error instanceof Error
            ? error.message
            : "Unable to delete the selected project review."
      });
    }
  }
});

app.http("project-reviews-purge", {
  route: "project-reviews/purge",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request) => {
    const { principal, response } = requireAuthenticated(request);

    if (response) {
      return response;
    }

    try {
      const body = await request.json();
      const reviewId = String(body?.reviewId ?? "").trim();

      if (!reviewId) {
        return jsonResponse(400, {
          error: "A reviewId is required before the saved project review can be permanently deleted."
        });
      }

      const payload = await purgeProjectReview(principal, reviewId);

      return jsonResponse(200, payload, {
        "Cache-Control": "no-store"
      });
    } catch (error) {
      return jsonResponse(error?.statusCode === 404 || error?.statusCode === 409 ? error.statusCode : 500, {
        error:
          error instanceof Error
            ? error.message
            : "Unable to permanently delete the selected project review."
      });
    }
  }
});
