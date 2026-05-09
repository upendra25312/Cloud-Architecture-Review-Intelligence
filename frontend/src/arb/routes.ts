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
