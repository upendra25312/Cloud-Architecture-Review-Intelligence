/**
 * Delete an ARB review by reviewId.
 * Sends DELETE to /api/arb/reviews/{reviewId}.
 */
export async function deleteArbReview(reviewId: string): Promise<{ deleted: boolean }> {
  const response = await fetch(`/api/arb/reviews/${reviewId}`, {
    method: "DELETE",
    headers: {
      Accept: "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`Unable to delete ARB review (${response.status})`);
  }
  return { deleted: true };
}
import type {
  ArbAction,
  ArbDecision,
  ArbEvidenceFact,
  ArbExportArtifact,
  ArbExportFormat,
  ArbFinding,
  ArbExtractionStatus,
  ArbRequirement,
  ArbReviewLibraryResponse,
  ArbReviewSummary,
  ArbScorecard,
  ArbUploadedFile
} from "@/arb/types";
import { getMockArbUploads } from "@/arb/mock-review";

async function readJsonResponse<T>(response: Response, fallbackMessage: string) {
  if (!response.ok) {
    let message = fallbackMessage;

    try {
      const payload = (await response.json()) as {
        error?: string;
        reason?: string;
        details?: string;
        traceId?: string;
      };

      const parts = [payload.error || fallbackMessage];
      if (payload.reason && !parts[0].includes(payload.reason)) {
        parts.push(payload.reason);
      }
      if (payload.details) {
        parts.push(payload.details);
      }
      if (payload.traceId) {
        parts.push(`Trace ID: ${payload.traceId}`);
      }
      message = parts.join(" ").trim();
    } catch {
      try {
        const text = (await response.text()).trim();
        message = text || fallbackMessage;
      } catch {
        message = fallbackMessage;
      }
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

export async function fetchArbReview(reviewId: string): Promise<ArbReviewSummary> {
  const response = await fetch(`/api/arb/reviews/${reviewId}`, {
    method: "GET",
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });
  // Fallback to mock data when API is unavailable (404) — useful for development/demo
  if (response.status === 404) {
    const { getMockArbReviewSummary } = await import("@/arb/mock-review");
    return getMockArbReviewSummary(reviewId);
  }

  const payload = await readJsonResponse<{ review: ArbReviewSummary }>(
    response,
    `Unable to load ARB review (${response.status}).`
  );
  return payload.review;
}

export async function listArbReviews(): Promise<ArbReviewLibraryResponse> {
  const response = await fetch("/api/arb/reviews", {
    method: "GET",
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });

  return readJsonResponse<ArbReviewLibraryResponse>(
    response,
    `Unable to load ARB reviews (${response.status}).`
  );
}

export async function createArbReview(input: {
  projectName: string;
  customerName: string;
  projectCode?: string;
}): Promise<ArbReviewSummary> {
  const response = await fetch("/api/arb/reviews", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  const payload = await readJsonResponse<{ review: ArbReviewSummary }>(
    response,
    `Unable to create ARB review (${response.status}).`
  );

  return payload.review;
}

export async function fetchArbFindings(reviewId: string): Promise<ArbFinding[]> {
  const response = await fetch(`/api/arb/reviews/${reviewId}/findings`, {
    method: "GET",
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });

  const payload = await readJsonResponse<{ findings: ArbFinding[] }>(
    response,
    `Unable to load ARB findings (${response.status}).`
  );
  return payload.findings;
}

export async function updateArbFinding(input: {
  reviewId: string;
  findingId: string;
  status: string;
  owner: string | null;
  dueDate: string | null;
  reviewerNote: string | null;
  criticalBlocker: boolean;
}): Promise<ArbFinding> {
  const response = await fetch(
    `/api/arb/reviews/${input.reviewId}/findings/${input.findingId}`,
    {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        status: input.status,
        owner: input.owner,
        dueDate: input.dueDate,
        reviewerNote: input.reviewerNote,
        criticalBlocker: input.criticalBlocker
      })
    }
  );

  const payload = await readJsonResponse<{ finding: ArbFinding }>(
    response,
    `Unable to update ARB finding (${response.status}).`
  );
  return payload.finding;
}

export async function fetchArbActions(reviewId: string): Promise<ArbAction[]> {
  const response = await fetch(`/api/arb/reviews/${reviewId}/actions`, {
    method: "GET",
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });

  const payload = await readJsonResponse<{ actions: ArbAction[] }>(
    response,
    `Unable to load ARB actions (${response.status}).`
  );
  return payload.actions;
}

export async function createArbAction(input: {
  reviewId: string;
  sourceFindingId: string;
}): Promise<ArbAction> {
  const response = await fetch(`/api/arb/reviews/${input.reviewId}/actions`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sourceFindingId: input.sourceFindingId
    })
  });

  const payload = await readJsonResponse<{ action: ArbAction }>(
    response,
    `Unable to create ARB action (${response.status}).`
  );
  return payload.action;
}

export async function updateArbAction(input: {
  reviewId: string;
  actionId: string;
  owner: string | null;
  dueDate: string | null;
  status: string;
  closureNotes: string | null;
  reviewerVerificationRequired: boolean;
}): Promise<ArbAction> {
  const response = await fetch(`/api/arb/reviews/${input.reviewId}/actions/${input.actionId}`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      owner: input.owner,
      dueDate: input.dueDate,
      status: input.status,
      closureNotes: input.closureNotes,
      reviewerVerificationRequired: input.reviewerVerificationRequired
    })
  });

  const payload = await readJsonResponse<{ action: ArbAction }>(
    response,
    `Unable to update ARB action (${response.status}).`
  );
  return payload.action;
}

export async function fetchArbScorecard(reviewId: string): Promise<ArbScorecard> {
  const response = await fetch(`/api/arb/reviews/${reviewId}/scorecard`, {
    method: "GET",
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });

  const payload = await readJsonResponse<{ scorecard: ArbScorecard }>(
    response,
    `Unable to load ARB scorecard (${response.status}).`
  );
  return payload.scorecard;
}

export async function fetchArbDecision(reviewId: string): Promise<ArbDecision | null> {
  const response = await fetch(`/api/arb/reviews/${reviewId}/decision`, {
    method: "GET",
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });

  const payload = await readJsonResponse<{ decision: ArbDecision | null }>(
    response,
    `Unable to load ARB decision (${response.status}).`
  );

  return payload.decision;
}

export async function recordArbDecision(input: {
  reviewId: string;
  finalDecision: string;
  rationale: string;
  reviewerName?: string;
  reviewerRole?: string;
}): Promise<ArbDecision> {
  const response = await fetch(`/api/arb/reviews/${input.reviewId}/decision`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      finalDecision: input.finalDecision,
      rationale: input.rationale,
      reviewerName: input.reviewerName ?? null,
      reviewerRole: input.reviewerRole ?? null
    })
  });

  const payload = await readJsonResponse<{ decision: ArbDecision }>(
    response,
    `Unable to record ARB decision (${response.status}).`
  );
  return payload.decision;
}

export async function fetchArbUploads(reviewId: string): Promise<{
  files: ArbUploadedFile[];
  extraction: ArbExtractionStatus;
}> {
  const response = await fetch(`/api/arb/reviews/${reviewId}/uploads`, {
    method: "GET",
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });

  // Fallback to mock data when API is unavailable (404) — useful for development/demo
  if (response.status === 404) {
    return getMockArbUploads(reviewId);
  }

  return readJsonResponse<{ files: ArbUploadedFile[]; extraction: ArbExtractionStatus }>(
    response,
    `Unable to load ARB uploads (${response.status}).`
  );
}

export async function uploadArbFiles(input: {
  reviewId: string;
  files: File[];
}): Promise<{
  files: ArbUploadedFile[];
  addedCount: number;
  evidenceReadinessState: string;
}> {
  const formData = new FormData();

  for (const file of input.files) {
    formData.append("files", file, file.name);
  }

  const response = await fetch(`/api/arb/reviews/${input.reviewId}/uploads`, {
    method: "POST",
    body: formData
  });

  return readJsonResponse<{
    files: ArbUploadedFile[];
    addedCount: number;
    evidenceReadinessState: string;
  }>(response, `Unable to upload ARB files (${response.status}).`);
}

export async function deleteArbFile(reviewId: string, fileId: string): Promise<{ deletedFileId: string; remainingCount: number }> {
  const response = await fetch(`/api/arb/reviews/${reviewId}/uploads/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: {
      Accept: "application/json"
    }
  });

  return readJsonResponse<{ deletedFileId: string; remainingCount: number }>(
    response,
    `Unable to delete file (${response.status}).`
  );
}

export async function startArbExtraction(reviewId: string): Promise<ArbExtractionStatus> {
  const response = await fetch(`/api/arb/reviews/${reviewId}/extract`, {
    method: "POST",
    headers: {
      Accept: "application/json"
    }
  });

  const payload = await readJsonResponse<{ extraction: ArbExtractionStatus }>(
    response,
    `Unable to start ARB extraction (${response.status}).`
  );
  return payload.extraction;
}

export async function fetchArbRequirements(reviewId: string): Promise<ArbRequirement[]> {
  const response = await fetch(`/api/arb/reviews/${reviewId}/requirements`, {
    method: "GET",
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });

  const payload = await readJsonResponse<{ requirements: ArbRequirement[] }>(
    response,
    `Unable to load ARB requirements (${response.status}).`
  );
  return payload.requirements;
}

export async function fetchArbEvidence(reviewId: string): Promise<ArbEvidenceFact[]> {
  const response = await fetch(`/api/arb/reviews/${reviewId}/evidence`, {
    method: "GET",
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });

  const payload = await readJsonResponse<{ evidence: ArbEvidenceFact[] }>(
    response,
    `Unable to load ARB evidence (${response.status}).`
  );
  return payload.evidence;
}

export async function createArbExport(input: {
  reviewId: string;
  format: ArbExportFormat;
  includeFindings?: boolean;
  includeScorecard?: boolean;
  includeActions?: boolean;
}): Promise<ArbExportArtifact> {
  const response = await fetch(`/api/arb/reviews/${input.reviewId}/exports`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  const payload = await readJsonResponse<{ exportArtifact: ArbExportArtifact }>(
    response,
    `Unable to create ARB export (${response.status}).`
  );
  return payload.exportArtifact;
}

export async function fetchArbExports(reviewId: string): Promise<ArbExportArtifact[]> {
  const response = await fetch(`/api/arb/reviews/${reviewId}/exports`, {
    method: "GET",
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });

  const payload = await readJsonResponse<{ exports: ArbExportArtifact[] }>(
    response,
    `Unable to load ARB reviewed outputs (${response.status}).`
  );
  return payload.exports;
}

export async function runArbAgentReview(reviewId: string): Promise<{
  agentReviewCompleted: boolean;
  findingsCount: number;
  recommendation: string;
  overallScore: number | null;
  confidenceLevel: string | null;
}> {
  // Step 1: Start the assessment (returns 202 immediately)
  const startResponse = await fetch(`/api/arb/reviews/${reviewId}/run-agent-review`, {
    method: "POST",
    headers: { Accept: "application/json" }
  });

  // Handle non-2xx start responses
  if (!startResponse.ok && startResponse.status !== 202) {
    const payload = await startResponse.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || `Unable to start ARB agent review (${startResponse.status}).`);
  }

  // Step 2: Poll for completion — up to 5 minutes
  const MAX_POLL_MS = 300_000;
  const POLL_INTERVAL_MS = 4_000;
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_POLL_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const statusResponse = await fetch(`/api/arb/reviews/${reviewId}/agent-status`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store"
    });

    if (!statusResponse.ok) {
      continue; // Retry on transient errors
    }

    const status = await statusResponse.json() as {
      status: string;
      agentReviewCompleted?: boolean;
      findingsCount?: number;
      recommendation?: string;
      overallScore?: number | null;
      confidenceLevel?: string | null;
      error?: string;
    };

    if (status.status === "completed") {
      return {
        agentReviewCompleted: status.agentReviewCompleted ?? true,
        findingsCount: status.findingsCount ?? 0,
        recommendation: status.recommendation ?? "Needs Revision",
        overallScore: status.overallScore ?? null,
        confidenceLevel: status.confidenceLevel ?? null
      };
    }

    if (status.status === "failed") {
      throw new Error(status.error || "Agent review failed.");
    }

    // status === "running" or "idle" — keep polling
  }

  throw new Error("Assessment timed out after 5 minutes. Check the review findings page — results may still appear.");
}

export async function downloadArbExport(reviewId: string, exportArtifact: ArbExportArtifact) {
  const response = await fetch(
    `/api/arb/reviews/${reviewId}/exports/${exportArtifact.exportId}/download`,
    {
      method: "GET",
      cache: "no-store"
    }
  );

  if (!response.ok) {
    let message = `Unable to download ARB reviewed output (${response.status}).`;

    try {
      const payload = (await response.json()) as { error?: string };
      message = payload.error || message;
    } catch {
      message = `Unable to download ARB reviewed output (${response.status}).`;
    }

    throw new Error(message);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = exportArtifact.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
