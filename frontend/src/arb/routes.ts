import type { Route } from "next";
import type { ArbReviewStepKey } from "@/arb/types";

export function getArbStepHref(
  reviewId: string,
  step: ArbReviewStepKey = "overview",
  hash?: "upload-documents" | "run-automated-analysis"
): Route {
  const encodedReviewId = encodeURIComponent(reviewId);
  const suffix = hash ? `#${hash}` : "";
  return `/arb?reviewId=${encodedReviewId}&step=${step}${suffix}` as Route;
}

export function getArbFindingsHref(reviewId: string, domain?: string): Route {
  const encodedReviewId = encodeURIComponent(reviewId);
  const domainQuery = domain ? `&domain=${encodeURIComponent(domain)}` : "";
  return `/arb?reviewId=${encodedReviewId}&step=findings${domainQuery}` as Route;
}
