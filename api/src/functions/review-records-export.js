const { app } = require("@azure/functions");
const { jsonResponse, requireAuthenticated } = require("../shared/auth");
const {
  ARTIFACTS_CONTAINER_NAME,
  NOTES_CONTAINER_NAME,
  buildArtifactBlobName,
  buildNotesBlobName,
  getContainerClient,
  sanitizePathSegment,
  uploadJsonBlob,
  uploadTextBlob
} = require("../shared/storage");
const { toReviewCsv, toReviewDocument } = require("../shared/review-records");

function buildCsvFileName(userId, reviewName) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reviewSegment = sanitizePathSegment(reviewName || "project-review");
  return `review-notes-${reviewSegment}-${sanitizePathSegment(userId)}-${stamp}.csv`;
}

app.http("review-records-export", {
  route: "review-records/export",
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
      const csv = toReviewCsv(document);
      const notesContainerClient = await getContainerClient(NOTES_CONTAINER_NAME);
      const artifactsContainerClient = await getContainerClient(ARTIFACTS_CONTAINER_NAME);
      const notesBlobName = buildNotesBlobName(principal.userId);
      const artifactName = buildCsvFileName(principal.userId, body?.reviewName);
      const artifactBlobName = buildArtifactBlobName(principal.userId, artifactName);

      await uploadJsonBlob(notesContainerClient, notesBlobName, document);
      await uploadTextBlob(artifactsContainerClient, artifactBlobName, csv, "text/csv; charset=utf-8");

      return {
        status: 200,
        body: csv,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=\"${artifactName}\"`,
          "Cache-Control": "no-store",
          "X-Review-Artifact-Path": artifactBlobName
        }
      };
    } catch (error) {
      return jsonResponse(500, {
        error: error instanceof Error ? error.message : "Unable to generate the CSV artifact."
      });
    }
  }
});
