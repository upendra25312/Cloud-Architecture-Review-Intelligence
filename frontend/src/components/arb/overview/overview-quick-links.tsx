"use client";

import Link from "next/link";
import { getArbStepHref } from "@/arb/routes";
import type { ArbReviewStepKey } from "@/arb/types";
import type { WorkflowStep } from "./overview-utils";
import styles from "./arb-overview-page.module.css";

export interface OverviewQuickLinksProps {
  steps: WorkflowStep[];
  reviewId: string;
}

const STEP_DESCRIPTIONS: Record<string, string> = {
  upload: "Stage source documents and prepare the extraction handoff.",
  requirements: "Validate extracted requirements before evidence mapping.",
  evidence: "Compare evidence against architecture requirements.",
  findings: "Inspect findings, severity, and remediation actions.",
  scorecard: "Review weighted domain scores and recommendation.",
  decision: "Capture reviewer decision, rationale, and sign-off.",
};

function getStatusLabel(status: WorkflowStep["status"]): string {
  if (status === "complete") return "Complete";
  if (status === "active") return "In Progress";
  return "Pending";
}

function getStatusClass(status: WorkflowStep["status"]): string {
  if (status === "complete") return styles.quickLinkStatusComplete;
  if (status === "active") return styles.quickLinkStatusActive;
  return styles.quickLinkStatusPending;
}

export function OverviewQuickLinks({
  steps,
  reviewId,
}: OverviewQuickLinksProps) {
  return (
    <div className={styles.quickLinkGrid}>
      {steps.map((ws) => (
        <Link
          key={ws.step}
          href={getArbStepHref(reviewId, ws.step as ArbReviewStepKey)}
          className={styles.quickLink}
        >
          <span className={styles.quickLinkName}>
            {ws.status === "complete" && (
              <span style={{ color: "#107C10" }}>✓</span>
            )}
            {ws.label}
          </span>
          <span className={styles.quickLinkDescription}>
            {STEP_DESCRIPTIONS[ws.step] ?? ""}
          </span>
          <span className={`${styles.quickLinkStatus} ${getStatusClass(ws.status)}`}>
            {getStatusLabel(ws.status)}
          </span>
        </Link>
      ))}
    </div>
  );
}
