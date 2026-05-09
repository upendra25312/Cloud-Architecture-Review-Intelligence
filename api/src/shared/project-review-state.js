function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeServiceAssumption(value) {
  return {
    plannedRegion: isNonEmptyString(value?.plannedRegion) ? value.plannedRegion.trim() : "",
    preferredSku: isNonEmptyString(value?.preferredSku) ? value.preferredSku.trim() : "",
    sizingNote: isNonEmptyString(value?.sizingNote) ? value.sizingNote.trim() : ""
  };
}

function normalizeReviewPackage(reviewPackage) {
  if (!reviewPackage?.id) {
    return null;
  }

  return {
    id: String(reviewPackage.id).trim(),
    name: isNonEmptyString(reviewPackage.name) ? reviewPackage.name.trim() : "Project review",
    audience: isNonEmptyString(reviewPackage.audience)
      ? reviewPackage.audience.trim()
      : "Cloud Architect",
    businessScope: isNonEmptyString(reviewPackage.businessScope)
      ? reviewPackage.businessScope.trim()
      : "",
    targetRegions: Array.isArray(reviewPackage.targetRegions)
      ? reviewPackage.targetRegions
          .filter((entry) => isNonEmptyString(entry))
          .map((entry) => entry.trim())
      : [],
    selectedServiceSlugs: Array.isArray(reviewPackage.selectedServiceSlugs)
      ? reviewPackage.selectedServiceSlugs
          .filter((entry) => isNonEmptyString(entry))
          .map((entry) => entry.trim())
      : [],
    serviceAssumptions: Object.fromEntries(
      Object.entries(reviewPackage.serviceAssumptions ?? {})
        .filter(([serviceSlug]) => isNonEmptyString(serviceSlug))
        .map(([serviceSlug, value]) => [serviceSlug.trim(), normalizeServiceAssumption(value)])
    ),
    createdAt: isNonEmptyString(reviewPackage.createdAt)
      ? reviewPackage.createdAt.trim()
      : new Date().toISOString(),
    updatedAt: isNonEmptyString(reviewPackage.updatedAt)
      ? reviewPackage.updatedAt.trim()
      : new Date().toISOString()
  };
}

function normalizeCopilotSource(source) {
  return {
    label: isNonEmptyString(source?.label) ? source.label.trim() : "Project review source",
    url: isNonEmptyString(source?.url) ? source.url.trim() : undefined,
    note: isNonEmptyString(source?.note) ? source.note.trim() : undefined
  };
}

function normalizeCopilotService(service) {
  return {
    serviceSlug: isNonEmptyString(service?.serviceSlug) ? service.serviceSlug.trim() : "",
    serviceName: isNonEmptyString(service?.serviceName) ? service.serviceName.trim() : "Unknown service",
    description: isNonEmptyString(service?.description) ? service.description.trim() : "",
    plannedRegion: isNonEmptyString(service?.plannedRegion) ? service.plannedRegion.trim() : "",
    preferredSku: isNonEmptyString(service?.preferredSku) ? service.preferredSku.trim() : "",
    sizingNote: isNonEmptyString(service?.sizingNote) ? service.sizingNote.trim() : "",
    itemCount: Number(service?.itemCount ?? 0),
    includedCount: Number(service?.includedCount ?? 0),
    notApplicableCount: Number(service?.notApplicableCount ?? 0),
    excludedCount: Number(service?.excludedCount ?? 0),
    pendingCount: Number(service?.pendingCount ?? 0),
    regionFitSummary: isNonEmptyString(service?.regionFitSummary)
      ? service.regionFitSummary.trim()
      : "",
    regionFitSignals: Array.isArray(service?.regionFitSignals)
      ? service.regionFitSignals
          .filter((entry) => isNonEmptyString(entry))
          .map((entry) => entry.trim())
      : [],
    costFitSummary: isNonEmptyString(service?.costFitSummary)
      ? service.costFitSummary.trim()
      : "",
    costFitSignals: Array.isArray(service?.costFitSignals)
      ? service.costFitSignals
          .filter((entry) => isNonEmptyString(entry))
          .map((entry) => entry.trim())
      : []
  };
}

function normalizeCopilotFinding(finding) {
  return {
    guid: isNonEmptyString(finding?.guid) ? finding.guid.trim() : "",
    serviceName: isNonEmptyString(finding?.serviceName) ? finding.serviceName.trim() : "Unknown service",
    finding: isNonEmptyString(finding?.finding) ? finding.finding.trim() : "Unnamed finding",
    severity: isNonEmptyString(finding?.severity) ? finding.severity.trim() : undefined,
    decision: isNonEmptyString(finding?.decision) ? finding.decision.trim() : "Needs Review",
    comments: isNonEmptyString(finding?.comments) ? finding.comments.trim() : undefined,
    owner: isNonEmptyString(finding?.owner) ? finding.owner.trim() : undefined,
    dueDate: isNonEmptyString(finding?.dueDate) ? finding.dueDate.trim() : undefined
  };
}

function normalizeCopilotContext(context) {
  if (!context?.review || !Array.isArray(context?.services)) {
    return null;
  }

  return {
    review: {
      id: isNonEmptyString(context.review.id) ? context.review.id.trim() : "",
      name: isNonEmptyString(context.review.name) ? context.review.name.trim() : "Project review",
      audience: isNonEmptyString(context.review.audience)
        ? context.review.audience.trim()
        : "Cloud Architect",
      businessScope: isNonEmptyString(context.review.businessScope)
        ? context.review.businessScope.trim()
        : "",
      targetRegions: Array.isArray(context.review.targetRegions)
        ? context.review.targetRegions
            .filter((entry) => isNonEmptyString(entry))
            .map((entry) => entry.trim())
        : []
    },
    services: context.services.map(normalizeCopilotService),
    findings: Array.isArray(context.findings)
      ? context.findings.map(normalizeCopilotFinding).filter((entry) => entry.guid)
      : [],
    sources: Array.isArray(context.sources)
      ? context.sources.map(normalizeCopilotSource)
      : []
  };
}

function toProjectReviewStateDocument(payload) {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    activePackage: normalizeReviewPackage(payload?.activePackage),
    copilotContext: normalizeCopilotContext(payload?.copilotContext)
  };
}

module.exports = {
  normalizeCopilotContext,
  normalizeReviewPackage,
  toProjectReviewStateDocument
};
