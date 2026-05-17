import type { Route } from "next";
import type { ArbReviewStep, ArbReviewStepKey } from "@/arb/types";

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

export function getArbCompareHref(baseId: string, headId: string): Route {
  return `/arb?reviewId=${encodeURIComponent(baseId)}&compareWith=${encodeURIComponent(headId)}` as Route;
}

export function getArbReviewSteps(reviewId: string): ArbReviewStep[] {
  return [
    { key: "overview", label: "Overview", href: getArbStepHref(reviewId, "overview") },
    { key: "upload", label: "Upload", href: getArbStepHref(reviewId, "upload") },
    { key: "requirements", label: "Requirements", href: getArbStepHref(reviewId, "requirements") },
    { key: "evidence", label: "Evidence", href: getArbStepHref(reviewId, "evidence") },
    { key: "findings", label: "Findings", href: getArbStepHref(reviewId, "findings") },
    { key: "scorecard", label: "Scorecard", href: getArbStepHref(reviewId, "scorecard") },
    { key: "decision", label: "Decision", href: getArbStepHref(reviewId, "decision") },
  ];
}
