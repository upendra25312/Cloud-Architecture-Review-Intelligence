function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeReview(record) {
  const review = record?.review ?? {};

  return {
    reviewState: isNonEmptyString(review.reviewState) ? review.reviewState : "Not Reviewed",
    packageDecision: isNonEmptyString(review.packageDecision)
      ? review.packageDecision
      : "Needs Review",
    comments: isNonEmptyString(review.comments) ? review.comments.trim() : "",
    owner: isNonEmptyString(review.owner) ? review.owner.trim() : "",
    dueDate: isNonEmptyString(review.dueDate) ? review.dueDate.trim() : "",
    evidenceLinks: Array.isArray(review.evidenceLinks)
      ? review.evidenceLinks.filter((entry) => isNonEmptyString(entry)).map((entry) => entry.trim())
      : [],
    exceptionReason: isNonEmptyString(review.exceptionReason)
      ? review.exceptionReason.trim()
      : ""
  };
}

function normalizeRecord(record) {
  return {
    guid: String(record?.guid ?? ""),
    technology: isNonEmptyString(record?.technology) ? record.technology.trim() : "Unknown",
    technologySlug: isNonEmptyString(record?.technologySlug) ? record.technologySlug.trim() : "",
    technologyStatus: isNonEmptyString(record?.technologyStatus)
      ? record.technologyStatus.trim()
      : "Unknown",
    technologyMaturityBucket: isNonEmptyString(record?.technologyMaturityBucket)
      ? record.technologyMaturityBucket.trim()
      : "Mixed",
    severity: isNonEmptyString(record?.severity) ? record.severity.trim() : "",
    waf: isNonEmptyString(record?.waf) ? record.waf.trim() : "",
    category: isNonEmptyString(record?.category) ? record.category.trim() : "",
    subcategory: isNonEmptyString(record?.subcategory) ? record.subcategory.trim() : "",
    service: isNonEmptyString(record?.service) ? record.service.trim() : "",
    serviceCanonical: isNonEmptyString(record?.serviceCanonical)
      ? record.serviceCanonical.trim()
      : "",
    sourcePath: isNonEmptyString(record?.sourcePath) ? record.sourcePath.trim() : "",
    sourceUrl: isNonEmptyString(record?.sourceUrl) ? record.sourceUrl.trim() : "",
    text: isNonEmptyString(record?.text) ? record.text.trim() : "Unnamed finding",
    updatedAt: isNonEmptyString(record?.updatedAt) ? record.updatedAt.trim() : new Date().toISOString(),
    review: normalizeReview(record)
  };
}

function toReviewDocument(records) {
  const normalizedRecords = Array.isArray(records)
    ? records.map(normalizeRecord).filter((record) => record.guid)
    : [];

  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    recordCount: normalizedRecords.length,
    records: normalizedRecords
  };
}

function csvEscape(value) {
  const normalized = String(value ?? "");
  return `"${normalized.replace(/"/g, "\"\"")}"`;
}

function toReviewCsv(document) {
  const headers = [
    "guid",
    "technology",
    "technologySlug",
    "technologyStatus",
    "technologyMaturityBucket",
    "severity",
    "waf",
    "category",
    "subcategory",
    "service",
    "serviceCanonical",
    "text",
    "reviewState",
    "packageDecision",
    "owner",
    "dueDate",
    "comments",
    "evidenceLinks",
    "exceptionReason",
    "sourcePath",
    "sourceUrl",
    "updatedAt"
  ];
  const lines = [
    headers.join(","),
    ...document.records.map((record) =>
      [
        record.guid,
        record.technology,
        record.technologySlug,
        record.technologyStatus,
        record.technologyMaturityBucket,
        record.severity,
        record.waf,
        record.category,
        record.subcategory,
        record.service,
        record.serviceCanonical,
        record.text,
        record.review.reviewState,
        record.review.packageDecision,
        record.review.owner,
        record.review.dueDate,
        record.review.comments,
        record.review.evidenceLinks.join(" | "),
        record.review.exceptionReason,
        record.sourcePath,
        record.sourceUrl,
        record.updatedAt
      ]
        .map(csvEscape)
        .join(",")
    )
  ];

  return lines.join("\n");
}

module.exports = {
  toReviewCsv,
  toReviewDocument
};
