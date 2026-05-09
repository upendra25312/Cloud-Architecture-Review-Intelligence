import type {
  ChecklistItem,
  CloudProjectReviewUser,
  ProjectReviewCopilotContext,
  ProjectReviewLibraryResponse,
  ProjectReviewStateDocument,
  ReviewDraft,
  ReviewRecordDocument,
  ReviewPackage,
  StaticWebAppClientPrincipal,
  StructuredReviewRecord
} from "@/types";
import { readBackendErrorMessage } from "@/lib/backend-error";

export type AuthProvider = "aad" | "github";

type AuthProviderOption = {
  id: AuthProvider;
  label: string;
  enabled: boolean;
};

export const GITHUB_AUTH_ENABLED = process.env.NEXT_PUBLIC_ENABLE_GITHUB_AUTH !== "false";

const AUTH_PROVIDER_OPTIONS: AuthProviderOption[] = [
  {
    id: "aad",
    label: "Microsoft",
    enabled: true
  },
  {
    id: "github",
    label: "GitHub",
    enabled: GITHUB_AUTH_ENABLED
  }
];

export const ENABLED_AUTH_PROVIDERS = AUTH_PROVIDER_OPTIONS.filter((provider) => provider.enabled);
export const PRIMARY_AUTH_PROVIDER = ENABLED_AUTH_PROVIDERS[0]?.id ?? "aad";

type AuthMeResponse =
  | {
      clientPrincipal?: StaticWebAppClientPrincipal | null;
    }
  | Array<{
      clientPrincipal?: StaticWebAppClientPrincipal | null;
    }>;

function isMeaningfulReview(review: ReviewDraft | undefined) {
  if (!review) {
    return false;
  }

  return (
    review.reviewState !== "Not Reviewed" ||
    review.packageDecision !== "Needs Review" ||
    review.comments.trim().length > 0 ||
    review.owner.trim().length > 0 ||
    review.dueDate.trim().length > 0 ||
    review.evidenceLinks.length > 0 ||
    review.exceptionReason.trim().length > 0
  );
}

export function buildStructuredReviewRecords(
  items: ChecklistItem[],
  reviews: Record<string, ReviewDraft>
) {
  const itemsByGuid = new Map(items.map((item) => [item.guid, item]));

  return Object.entries(reviews)
    .filter(([, review]) => isMeaningfulReview(review))
    .map(([guid, review]) => {
      const item = itemsByGuid.get(guid);

      if (!item) {
        return null;
      }

      return {
        guid: item.guid,
        technology: item.technology,
        technologySlug: item.technologySlug,
        technologyStatus: item.technologyStatus,
        technologyMaturityBucket: item.technologyMaturityBucket,
        severity: item.severity,
        waf: item.waf,
        category: item.category,
        subcategory: item.subcategory,
        service: item.service,
        serviceCanonical: item.serviceCanonical,
        sourcePath: item.sourcePath,
        sourceUrl: item.sourceUrl,
        text: item.text,
        review,
        updatedAt: new Date().toISOString()
      } satisfies StructuredReviewRecord;
    })
    .filter(Boolean) as StructuredReviewRecord[];
}

export function structuredRecordsToReviewMap(records: StructuredReviewRecord[]) {
  return records.reduce<Record<string, ReviewDraft>>((accumulator, record) => {
    accumulator[record.guid] = record.review;
    return accumulator;
  }, {});
}

function parseClientPrincipal(payload: AuthMeResponse) {
  if (Array.isArray(payload)) {
    return payload[0]?.clientPrincipal ?? null;
  }

  return payload?.clientPrincipal ?? null;
}

function formatHumanList(values: string[]) {
  if (values.length <= 1) {
    return values[0] ?? "Microsoft";
  }

  if (values.length === 2) {
    return `${values[0]} or ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, or ${values.at(-1)}`;
}

export function getAuthSupportLabel() {
  return `${formatHumanList(ENABLED_AUTH_PROVIDERS.map((provider) => provider.label))} account supported`;
}

export function formatIdentityProvider(provider: string | undefined) {
  switch ((provider ?? "").toLowerCase()) {
    case "aad":
    case "azureactivedirectory":
      return "Microsoft";
    case "github":
      return "GitHub";
    case "google":
      return "Google";
    default:
      return provider || "Account";
  }
}

export async function readClientPrincipal() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch("/.auth/me", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Unable to read auth session: ${response.status}`);
    }

    const payload = (await response.json()) as AuthMeResponse;
    return parseClientPrincipal(payload);
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchClientPrincipal() {
  try {
    return await readClientPrincipal();
  } catch {
    return null;
  }
}

export function buildLoginUrl(provider: AuthProvider, redirectUri?: string) {
  const fallbackRedirect = typeof window === "undefined" ? "/" : window.location.href;
  const requestedRedirect = (redirectUri ?? fallbackRedirect).trim();
  const invalidRedirect =
    !requestedRedirect || requestedRedirect.includes("reviewId=undefined") || requestedRedirect === "undefined";
  const nextRedirect = invalidRedirect ? "/arb" : requestedRedirect;

  return `/.auth/login/${provider}?post_login_redirect_uri=${encodeURIComponent(nextRedirect)}`;
}

export function buildPrimaryLoginUrl(redirectUri?: string) {
  return buildLoginUrl(PRIMARY_AUTH_PROVIDER, redirectUri);
}

export function buildLogoutUrl(redirectUri = "/") {
  const nextRedirect = redirectUri.trim() || "/";
  return `/.auth/logout?post_logout_redirect_uri=${encodeURIComponent(nextRedirect)}`;
}

async function parseJsonResponse<T>(response: Response) {
  if (!response.ok) {
    const message = await readBackendErrorMessage(
      response,
      `Request failed with status ${response.status}`
    );

    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function loadCloudReviewRecords() {
  const response = await fetch("/api/review-records", {
    credentials: "same-origin",
    cache: "no-store"
  });

  return parseJsonResponse<ReviewRecordDocument>(response);
}

export async function saveCloudReviewRecords(
  records: StructuredReviewRecord[],
  reviewId?: string | null
) {
  const response = await fetch("/api/review-records", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "same-origin",
    body: JSON.stringify({ records, reviewId: reviewId ?? undefined })
  });

  return parseJsonResponse<ReviewRecordDocument>(response);
}

export async function loadCloudProjectReviewState() {
  const response = await fetch("/api/project-review-state", {
    credentials: "same-origin",
    cache: "no-store"
  });

  return parseJsonResponse<ProjectReviewStateDocument>(response);
}

export async function saveCloudProjectReviewState(
  activePackage: ReviewPackage | null,
  copilotContext: ProjectReviewCopilotContext | null
) {
  const response = await fetch("/api/project-review-state", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "same-origin",
    body: JSON.stringify({
      activePackage,
      copilotContext
    })
  });

  return parseJsonResponse<ProjectReviewStateDocument>(response);
}

function getFilenameFromDisposition(value: string | null) {
  if (!value) {
    return null;
  }

  const match = /filename="?([^"]+)"?/i.exec(value);
  return match?.[1] ?? null;
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}

export async function downloadCloudReviewCsv(
  records: StructuredReviewRecord[],
  options?: {
    reviewId?: string | null;
    reviewName?: string | null;
  }
) {
  const response = await fetch("/api/review-records/export", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "same-origin",
    body: JSON.stringify({
      records,
      reviewId: options?.reviewId ?? undefined,
      reviewName: options?.reviewName ?? undefined
    })
  });

  if (!response.ok) {
    const message = await readBackendErrorMessage(
      response,
      `Request failed with status ${response.status}`
    );

    throw new Error(message || `Request failed with status ${response.status}`);
  }

  const blob = await response.blob();
  const filename =
    getFilenameFromDisposition(response.headers.get("Content-Disposition")) ??
    "azure-review-notes.csv";

  downloadBlob(filename, blob);

  return {
    filename,
    artifactPath: response.headers.get("X-Review-Artifact-Path") ?? undefined
  };
}

export async function listCloudProjectReviews() {
  const response = await fetch("/api/project-reviews", {
    credentials: "same-origin",
    cache: "no-store"
  });

  return parseJsonResponse<ProjectReviewLibraryResponse>(response);
}

export async function activateCloudProjectReview(reviewId: string) {
  const response = await fetch("/api/project-reviews/activate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "same-origin",
    body: JSON.stringify({ reviewId })
  });

  return parseJsonResponse<{
    user: CloudProjectReviewUser;
  }>(response);
}

export async function archiveCloudProjectReview(reviewId: string, archived = true) {
  const response = await fetch("/api/project-reviews/archive", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "same-origin",
    body: JSON.stringify({ reviewId, archived })
  });

  return parseJsonResponse<{
    user: CloudProjectReviewUser;
  }>(response);
}

export async function deleteCloudProjectReview(reviewId: string) {
  const response = await fetch("/api/project-reviews/delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "same-origin",
    body: JSON.stringify({ reviewId, deleted: true })
  });

  return parseJsonResponse<{
    user: CloudProjectReviewUser;
  }>(response);
}

export async function restoreDeletedCloudProjectReview(reviewId: string) {
  const response = await fetch("/api/project-reviews/delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "same-origin",
    body: JSON.stringify({ reviewId, deleted: false })
  });

  return parseJsonResponse<{
    user: CloudProjectReviewUser;
  }>(response);
}

export async function purgeCloudProjectReview(reviewId: string) {
  const response = await fetch("/api/project-reviews/purge", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "same-origin",
    body: JSON.stringify({ reviewId })
  });

  return parseJsonResponse<{
    user: CloudProjectReviewUser;
  }>(response);
}
