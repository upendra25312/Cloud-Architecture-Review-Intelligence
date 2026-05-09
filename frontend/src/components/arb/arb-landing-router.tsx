"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import type { ArbReviewStepKey } from "@/arb/types";
import { ArbLiveReviewStep } from "@/components/arb/live-review-step";
import { ArbOverviewPage } from "@/components/arb/overview/arb-overview-page";
import { ArbRequirementsPage } from "@/components/arb/requirements/arb-requirements-page";
import { ArbEvidencePage } from "@/components/arb/evidence/arb-evidence-page";
import { ArbFindingsPage } from "@/components/arb/findings/arb-findings-page";
import { ArbScorecardPage } from "@/components/arb/scorecard/arb-scorecard-page";
import { ArbReviewLibrary } from "@/components/arb/review-library";

function getRequestedStep(value: string | null): ArbReviewStepKey {
  const step = value?.toLowerCase();
  if (step === "upload") return "upload";
  if (step === "requirements") return "requirements";
  if (step === "evidence") return "evidence";
  if (step === "findings") return "findings";
  if (step === "scorecard") return "scorecard";
  if (step === "decision") return "decision";
  return "overview";
}

function getStepMeta(step: ArbReviewStepKey): { title: string; description: string } {
  switch (step) {
    case "upload":
      return {
        title: "Upload Review Package",
        description: "Stage source documents, confirm package readiness, and prepare the extraction handoff."
      };
    case "requirements":
      return {
        title: "Requirements Review",
        description: "Validate extracted requirements before evidence mapping and scoring."
      };
    case "evidence":
      return {
        title: "Evidence Mapping",
        description: "Compare extracted evidence against architecture requirements and close traceability gaps."
      };
    case "findings":
      return {
        title: "Review Findings",
        description: "Inspect evidence-grounded findings, severity, and references tied to Microsoft guidance."
      };
    case "scorecard":
      return {
        title: "Weighted Scorecard",
        description: "Review weighted domain scores and recommendation posture before final decision."
      };
    case "decision":
      return {
        title: "Decision and Sign-off",
        description: "Capture reviewer decision, rationale, and sign-off details for the ARB package."
      };
    default:
      return {
        title: "Review Workspace Overview",
        description: "See the current evidence posture, workflow state, and next step for this architecture review."
      };
  }
}

export function ArbLandingRouter() {
  const searchParams = useSearchParams();

  const reviewId = useMemo(() => {
    const raw = searchParams.get("reviewId")?.trim() ?? "";
    if (!raw || raw === "undefined" || raw === "null") {
      return "";
    }

    return raw;
  }, [searchParams]);
  const step = useMemo(() => getRequestedStep(searchParams.get("step")), [searchParams]);
  const stepMeta = useMemo(() => getStepMeta(step), [step]);

  if (reviewId) {
    // Route to dedicated redesigned components
    if (step === "overview") {
      return <ArbOverviewPage reviewId={reviewId} />;
    }
    if (step === "requirements") {
      return <ArbRequirementsPage reviewId={reviewId} />;
    }
    if (step === "evidence") {
      return <ArbEvidencePage reviewId={reviewId} />;
    }
    if (step === "findings") {
      return <ArbFindingsPage reviewId={reviewId} />;
    }
    if (step === "scorecard") {
      return <ArbScorecardPage reviewId={reviewId} />;
    }

    // All other steps use the monolith
    return (
      <ArbLiveReviewStep
        reviewId={reviewId}
        activeStep={step}
        title={stepMeta.title}
        description={stepMeta.description}
      />
    );
  }

  return <ArbReviewLibrary />;
}
