import type {
  ExplorerFilters,
  ReviewDraft,
  ReviewPackage,
  ReviewMode,
  ReviewPackageAudience,
  ReviewServiceAssumption
} from "@/types";

export const STORAGE_KEYS = {
  theme: "azure-review-dashboard.theme",
  reviews: "azure-review-dashboard.reviews",
  filters: "azure-review-dashboard.filters",
  packages: "azure-review-dashboard.packages",
  activePackageId: "azure-review-dashboard.active-package-id",
  packageReviewsPrefix: "azure-review-dashboard.package-reviews"
} as const;

function readStorage<T>(key: string, fallback: T) {
  if (typeof window === "undefined") {
    return fallback;
  }

  const raw = window.localStorage.getItem(key);

  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function packageReviewsKey(packageId: string) {
  return `${STORAGE_KEYS.packageReviewsPrefix}.${packageId}`;
}

function createPackageId() {
  return `pkg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyServiceAssumption(): ReviewServiceAssumption {
  return {
    plannedRegion: "",
    preferredSku: "",
    sizingNote: "",
    estimateInputMode: "defaults",
    estimateInputs: {}
  };
}

function normalizeServiceAssumptions(
  assumptions: Record<string, Partial<ReviewServiceAssumption>> | undefined
) {
  return Object.fromEntries(
    Object.entries(assumptions ?? {}).map(([serviceSlug, value]) => [
      serviceSlug,
      {
        plannedRegion: value.plannedRegion ?? "",
        preferredSku: value.preferredSku ?? "",
        sizingNote: value.sizingNote ?? "",
        estimateProfileVersion: value.estimateProfileVersion,
        estimateInputMode: value.estimateInputMode ?? "defaults",
        estimateInputs: value.estimateInputs ?? {}
      }
    ])
  ) as Record<string, ReviewServiceAssumption>;
}

function normalizeReviewPackage(reviewPackage: ReviewPackage): ReviewPackage {
  return {
    ...reviewPackage,
    reviewMode: reviewPackage.reviewMode ?? ("Standard review" as ReviewMode),
    serviceAssumptions: normalizeServiceAssumptions(reviewPackage.serviceAssumptions)
  };
}

export function createEmptyReview(): ReviewDraft {
  return {
    reviewState: "Not Reviewed",
    packageDecision: "Needs Review",
    comments: "",
    owner: "",
    dueDate: "",
    evidenceLinks: [],
    exceptionReason: ""
  };
}

export function loadReviews() {
  return readStorage<Record<string, ReviewDraft>>(STORAGE_KEYS.reviews, {});
}

export function saveReviews(reviews: Record<string, ReviewDraft>) {
  window.localStorage.setItem(STORAGE_KEYS.reviews, JSON.stringify(reviews));
}

export function clearReviews() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEYS.reviews);
}

export function loadPackageReviews(packageId: string) {
  return readStorage<Record<string, ReviewDraft>>(packageReviewsKey(packageId), {});
}

export function savePackageReviews(packageId: string, reviews: Record<string, ReviewDraft>) {
  window.localStorage.setItem(packageReviewsKey(packageId), JSON.stringify(reviews));
}

export function loadScopedReviews(packageId: string | null) {
  return packageId ? loadPackageReviews(packageId) : loadReviews();
}

export function saveScopedReviews(packageId: string | null, reviews: Record<string, ReviewDraft>) {
  if (packageId) {
    savePackageReviews(packageId, reviews);
    return;
  }

  saveReviews(reviews);
}

export function loadFilters() {
  return readStorage<ExplorerFilters | null>(STORAGE_KEYS.filters, null);
}

export function saveFilters(filters: ExplorerFilters) {
  window.localStorage.setItem(STORAGE_KEYS.filters, JSON.stringify(filters));
}

export function createReviewPackage(input?: Partial<ReviewPackage>): ReviewPackage {
  const now = new Date().toISOString();

  return normalizeReviewPackage({
    id: input?.id ?? createPackageId(),
    name: input?.name?.trim() || "Project review package",
    reviewMode: input?.reviewMode ?? ("Standard review" as ReviewMode),
    audience: input?.audience ?? ("Cloud Architect" as ReviewPackageAudience),
    businessScope: input?.businessScope ?? "",
    targetRegions: input?.targetRegions ?? [],
    selectedServiceSlugs: input?.selectedServiceSlugs ?? [],
    serviceAssumptions: input?.serviceAssumptions ?? {},
    createdAt: input?.createdAt ?? now,
    updatedAt: input?.updatedAt ?? now
  });
}

export function loadPackages() {
  return readStorage<ReviewPackage[]>(STORAGE_KEYS.packages, []).map((entry) =>
    normalizeReviewPackage(entry)
  );
}

export function savePackages(packages: ReviewPackage[]) {
  window.localStorage.setItem(STORAGE_KEYS.packages, JSON.stringify(packages));
}

export function loadActivePackageId() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(STORAGE_KEYS.activePackageId);
}

export function saveActivePackageId(packageId: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (!packageId) {
    window.localStorage.removeItem(STORAGE_KEYS.activePackageId);
    return;
  }

  window.localStorage.setItem(STORAGE_KEYS.activePackageId, packageId);
}

export function upsertPackage(nextPackage: ReviewPackage) {
  const packages = loadPackages();
  const existingIndex = packages.findIndex((entry) => entry.id === nextPackage.id);
  const updated = normalizeReviewPackage({
    ...nextPackage,
    updatedAt: new Date().toISOString()
  });

  if (existingIndex === -1) {
    savePackages([updated, ...packages]);
    return updated;
  }

  const nextPackages = [...packages];

  nextPackages.splice(existingIndex, 1, updated);
  savePackages(nextPackages);

  return updated;
}

export function deletePackage(packageId: string) {
  if (typeof window === "undefined") {
    return;
  }

  const packages = loadPackages().filter((entry) => entry.id !== packageId);

  savePackages(packages);
  window.localStorage.removeItem(packageReviewsKey(packageId));

  if (loadActivePackageId() === packageId) {
    saveActivePackageId(packages[0]?.id ?? null);
  }
}
