"use client";

import { useAuthSession } from "@/components/auth-session-provider";
import { useEffect, useState } from "react";
import { listArbReviews } from "@/arb/api";
import { getArbStepHref } from "@/arb/routes";
import type { ArbReviewSummary } from "@/arb/types";
import { buildPrimaryLoginUrl } from "@/lib/review-cloud";
import { trackArbEvent } from "@/lib/telemetry";
import HeroSection from "./home/HeroSection";
import PlatformValueCards from "./home/PlatformValueCards";
import WorkflowDiagram from "./home/WorkflowDiagram";
import ReviewCockpitPreview from "./home/ReviewCockpitPreview";
import SampleFindingCard from "./home/SampleFindingCard";
import FrameworkAlignment from "./home/FrameworkAlignment";
import CloudReviewTracks from "./home/CloudReviewTracks";
import ReportPackPreview from "./home/ReportPackPreview";
import TrustTiles from "./home/TrustTiles";
import FinalCtaSection from "./home/FinalCtaSection";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * Homepage orchestrator (Product-Grade Homepage Redesign).
 *
 * Owns the session + resume-review state and composes the page from the
 * new per-section components under ./home/.  After Increment 6 the legacy
 * tail is fully retired; the homepage is 100% new components.
 * ────────────────────────────────────────────────────────────────────────────
 */

function getActiveStep(review: ArbReviewSummary): number {
  const s = review.workflowState;
  if (s === "Draft") return 2;
  if (s === "Evidence Ready") return 3;
  if (s === "Review In Progress") return 4;
  if (s === "Decision Recorded" || s === "Approved" || s === "Needs Revision" || s === "Rejected") return 5;
  if (s === "Review Complete" || s === "Closed") return 6;
  return 1;
}

function getStepHref(review: ArbReviewSummary) {
  const resolvedReviewId = String(review.reviewId ?? "").trim();
  if (!resolvedReviewId || resolvedReviewId === "undefined" || resolvedReviewId === "null") {
    return "/arb";
  }
  const step = getActiveStep(review);
  if (step <= 3) return getArbStepHref(resolvedReviewId, "upload", "upload-documents");
  if (step === 4) return getArbStepHref(resolvedReviewId, "upload", "run-automated-analysis");
  if (step === 5) return getArbStepHref(resolvedReviewId, "decision");
  return getArbStepHref(resolvedReviewId, "overview");
}

function hasValidReviewId(review: ArbReviewSummary): boolean {
  const reviewId = String(review.reviewId ?? "").trim();
  return Boolean(reviewId) && reviewId !== "undefined" && reviewId !== "null";
}

export default function HomeClientSection() {
  const { principal, resolved, signedIn } = useAuthSession();
  const [latestReview, setLatestReview] = useState<ArbReviewSummary | null>(null);
  const getStartedHref = signedIn ? "/arb" : buildPrimaryLoginUrl("/arb");

  useEffect(() => {
    trackArbEvent({ name: "arb_page_view", properties: { page: "home" } });
  }, []);

  useEffect(() => {
    let active = true;
    if (!resolved || !principal) {
      setLatestReview(null);
      return () => { active = false; };
    }

    async function loadLatestReview() {
      try {
        const payload = await listArbReviews();
        if (!active) return;
        const sorted = [...payload.reviews]
          .filter(hasValidReviewId)
          .sort((a, b) => new Date(b.lastUpdated ?? 0).getTime() - new Date(a.lastUpdated ?? 0).getTime());
        setLatestReview(sorted[0] ?? null);
      } catch {
        if (active) setLatestReview(null);
      }
    }

    void loadLatestReview();
    return () => { active = false; };
  }, [principal, resolved]);

  const resumeLink =
    signedIn && latestReview && hasValidReviewId(latestReview) ? getStepHref(latestReview) : null;

  return (
    <main className="review-intel-home">
      <HeroSection
        getStartedHref={getStartedHref}
        resumeLink={resumeLink}
        resumeLabel={latestReview?.projectName ?? null}
        resumeStatus={latestReview?.workflowState ?? null}
      />
      <PlatformValueCards />
      <WorkflowDiagram />
      <ReviewCockpitPreview />
      <SampleFindingCard />
      <FrameworkAlignment />
      <CloudReviewTracks />
      <ReportPackPreview />
      <TrustTiles />
      <FinalCtaSection getStartedHref={getStartedHref} />
    </main>
  );
}
