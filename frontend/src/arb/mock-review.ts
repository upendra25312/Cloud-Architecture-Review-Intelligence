import { getArbStepHref } from "@/arb/routes";
import type { ArbExtractionStatus, ArbReviewStep, ArbReviewSummary, ArbUploadedFile } from "@/arb/types";

export function getArbReviewSteps(reviewId: string): ArbReviewStep[] {
  return [
    { key: "overview", label: "Overview", href: getArbStepHref(reviewId, "overview") },
    { key: "upload", label: "Upload", href: getArbStepHref(reviewId, "upload") },
    { key: "requirements", label: "Requirements", href: getArbStepHref(reviewId, "requirements") },
    { key: "evidence", label: "Evidence", href: getArbStepHref(reviewId, "evidence") },
    { key: "findings", label: "Findings", href: getArbStepHref(reviewId, "findings") },
    { key: "scorecard", label: "Scorecard", href: getArbStepHref(reviewId, "scorecard") },
    { key: "decision", label: "Decision", href: getArbStepHref(reviewId, "decision") }
  ];
}

export function getMockArbReviewSummary(reviewId: string): ArbReviewSummary {
  return {
    reviewId,
    projectName: "Sample ARB Review",
    customerName: "Contoso",
    workflowState: "Review In Progress",
    evidenceReadinessState: "Ready with Gaps",
    overallScore: 78,
    recommendation: "Needs Revision",
    assignedReviewer: null
  };
}

export function getMockArbUploads(
  reviewId: string
): {
  files: ArbUploadedFile[];
  extraction: ArbExtractionStatus;
} {
  const mockFiles: ArbUploadedFile[] = [
    {
      fileId: "mock-sow-001",
      reviewId,
      fileName: "Statement_of_Work.pdf",
      fileType: "application/pdf",
      logicalCategory: "Statement of Work",
      blobPath: "uploads/mock-sow-001.pdf",
      uploadedBy: "demo@contoso.com",
      uploadedAt: new Date(Date.now() - 3600000).toISOString(),
      contentHash: "abc123def456",
      extractionStatus: "Completed",
      extractionError: null,
      sourceRole: "Solutions Architect",
      sizeBytes: 524288,
      contentType: "application/pdf",
      supportedTextExtraction: true
    },
    {
      fileId: "mock-arch-001",
      reviewId,
      fileName: "Architecture_Design.docx",
      fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      logicalCategory: "Architecture Design",
      blobPath: "uploads/mock-arch-001.docx",
      uploadedBy: "demo@contoso.com",
      uploadedAt: new Date(Date.now() - 1800000).toISOString(),
      contentHash: "ghi789jkl012",
      extractionStatus: "Completed",
      extractionError: null,
      sourceRole: "Solutions Architect",
      sizeBytes: 262144,
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      supportedTextExtraction: true
    }
  ];

  const mockExtraction: ArbExtractionStatus = {
    reviewId,
   jobId: "mock-job-001",
   state: "Not Started",
   extractionConfidencePercent: 0,
    completedSteps: [],
   failedSteps: [],
   lastStartedAt: null,
   lastCompletedAt: null,
   evidenceReadinessState: "Not Started",
   extractionErrors: [],
   fileStatuses: []
  };

  return {
    files: mockFiles,
    extraction: mockExtraction
  };
}
