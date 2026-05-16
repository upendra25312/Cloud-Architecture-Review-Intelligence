import type { Route } from "next";

export type ArbWorkflowState =
  | "Draft"
  | "Evidence Ready"
  | "Review In Progress"
  | "Decision Recorded"
  | "Review Complete"
  | "Approved"
  | "Needs Revision"
  | "Rejected"
  | "Closed";

export type ArbEvidenceReadiness =
  | "Ready for Review"
  | "Ready with Gaps"
  | "Insufficient Evidence";

export type ArbReviewStepKey =
  | "overview"
  | "upload"
  | "requirements"
  | "evidence"
  | "findings"
  | "scorecard"
  | "decision";

export interface ArbReviewStep {
  key: ArbReviewStepKey;
  label: string;
  href: Route;
}

export interface ArbReviewSummary {
  reviewId: string;
  projectName: string;
  customerName: string;
  workflowState: ArbWorkflowState;
  evidenceReadinessState: ArbEvidenceReadiness;
  overallScore: number | null;
  recommendation: string;
  assignedReviewer: string | null;
  createdByUserId?: string;
  createdAt?: string;
  finalDecision?: string | null;
  lastUpdated?: string;
  targetReviewDate?: string | null;
  notes?: string | null;
  requiredEvidencePresent?: boolean;
  recommendedEvidenceCoverage?: number;
  missingRequiredItems?: string[];
  missingRecommendedItems?: string[];
  readinessOutcome?: string | null;
  readinessNotes?: string | null;
  documentCount?: number;
}

export interface ArbReviewLibraryResponse {
  reviews: ArbReviewSummary[];
}

export interface ArbFindingReference {
  title: string;
  url?: string;
  relevance?: string;
}

export interface ArbEvidenceLink {
  evidenceId: string;
  visualEvidenceId?: string;
  summary: string;
  sourceFileName: string | null;
  sourceFileId: string | null;
  factType: string | null;
  imageUri?: string | null;
  extractionSource?: string | null;
}

export interface ArbFinding {
  findingId: string;
  reviewId: string;
  severity: string;
  domain: string;
  findingType: string;
  title: string;
  findingStatement: string;
  whyItMatters: string;
  evidenceBasis: string;
  evidenceFound: ArbEvidenceLink[];
  missingEvidence: string[];
  recommendation: string;
  learnMoreUrl: string;
  references: ArbFindingReference[];
  confidence: string;
  criticalBlocker: boolean;
  suggestedOwner: string | null;
  suggestedDueDate: string | null;
  owner: string | null;
  dueDate: string | null;
  reviewerNote: string | null;
  status: string;
  source: string;
}

export interface ArbAction {
  actionId: string;
  reviewId: string;
  sourceFindingId: string;
  actionSummary: string;
  owner: string | null;
  dueDate: string | null;
  severity: string;
  status: string;
  closureNotes: string | null;
  reviewerVerificationRequired: boolean;
  createdAt: string;
}

export interface ArbUploadedFile {
  fileId: string;
  reviewId: string;
  fileName: string;
  fileType: string;
  logicalCategory: string;
  blobPath: string;
  uploadedBy: string;
  uploadedAt: string;
  contentHash: string;
  extractionStatus: string;
  extractionError: string | null;
  sourceRole: string | null;
  sizeBytes: number;
  contentType: string;
  supportedTextExtraction: boolean;
  visualEvidenceCount?: number;
  parentPackageFileName?: string | null;
  parentPackagePath?: string | null;
  packageChildCount?: number;
  packageSkippedCount?: number;
  packageWarnings?: string[];
}

export interface ArbExtractionFileStatus {
  fileId: string;
  fileName: string;
  extractionStatus: string;
  extractionError: string | null;
  visualEvidenceCount?: number;
}

export interface ArbExtractionStatus {
  reviewId: string;
  jobId: string;
  state: string;
  extractionConfidencePercent: number;
  completedSteps: string[];
  failedSteps: string[];
  evidenceReadinessState: ArbEvidenceReadiness | string;
  extractionErrors: string[];
  textExtractionStatus?: string;
  tableExtractionStatus?: string;
  figureExtractionStatus?: string;
  visualAnalysisStatus?: string;
  visualEvidenceCount?: number;
  visualExtractionErrors?: string[];
  missingRequiredItems?: string[];
  missingRecommendedItems?: string[];
  readinessNotes?: string;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  fileStatuses: ArbExtractionFileStatus[];
}

export interface ArbAgentStatus {
  reviewId: string;
  traceId?: string;
  status: "idle" | "running" | "completed" | "failed" | string;
  startedAt?: string;
  completedAt?: string;
  elapsedMs?: number;
  message?: string;
  error?: string;
  agentReviewCompleted?: boolean;
  findingsCount?: number;
  recommendation?: string;
  overallScore?: number | null;
  confidenceLevel?: string | null;
}

export interface ArbRequirement {
  requirementId: string;
  reviewId: string;
  sourceFileId: string | null;
  sourceFileName: string | null;
  normalizedText: string;
  category: string;
  criticality: string;
  reviewerStatus: string;
  /** CARI's AI-assessed validation status for this requirement */
  cariStatus?: "Validated" | "Partial" | "Not Found" | "Gap" | "Pending";
  /** Brief note explaining the validation result */
  cariValidationNote?: string | null;
  /** True when this item is in design docs but missing from the SOW */
  isGap?: boolean;
}

export interface ArbEvidenceFact {
  evidenceId: string;
  visualEvidenceId?: string;
  reviewId: string;
  sourceFileId: string | null;
  sourceFileName: string | null;
  sourceFileType?: string | null;
  sourcePage?: number | null;
  sourceSlide?: number | null;
  sourceSheet?: string | null;
  figureId?: string | null;
  imageUri?: string | null;
  factType: string;
  summary: string;
  sourceExcerpt: string;
  confidence: string;
  detectedAzureServices?: string[];
  detectedArchitecturePatterns?: string[];
  extractionSource?: string;
  promptInjectionRisk?: string;
  analysisError?: string | null;
  createdAt?: string;
}

export type ArbExportFormat = "markdown" | "csv" | "html";

export interface ArbExportArtifact {
  exportId: string;
  reviewId: string;
  format: ArbExportFormat | string;
  includeFindings: boolean;
  includeScorecard: boolean;
  includeActions: boolean;
  blobPath: string;
  fileName: string;
  contentType: string;
  generatedAt: string;
}

export interface ArbDomainScore {
  domain: string;
  weight: number;
  score: number;
  reason: string;
  linkedFindings: string[];
}

export interface ArbReviewerOverride {
  reviewerName: string;
  overrideDecision: string;
  overrideRationale: string;
  overriddenAt: string;
}

export interface ArbScorecard {
  overallScore: number | null;
  recommendation: string;
  confidence: string;
  criticalBlockers: number;
  evidenceReadinessState: ArbEvidenceReadiness;
  domainScores: ArbDomainScore[];
  reviewerOverride: ArbReviewerOverride | null;
  reviewSummary?: string | null;
  strengths?: string[];
  missingEvidence?: string[];
  criticalBlockersList?: string[];
  nextActions?: string[];
}

export interface ArbDecision {
  aiRecommendation: string;
  reviewerDecision: string;
  rationale: string;
  reviewerName: string | null;
  reviewerRole: string | null;
  recordedAt: string;
}
