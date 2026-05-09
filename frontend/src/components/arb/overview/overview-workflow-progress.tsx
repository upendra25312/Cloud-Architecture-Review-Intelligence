"use client";

import Link from "next/link";
import { getArbStepHref } from "@/arb/routes";
import type { ArbReviewStepKey } from "@/arb/types";
import type { WorkflowStep } from "./overview-utils";
import styles from "./arb-overview-page.module.css";

export interface OverviewWorkflowProgressProps {
  steps: WorkflowStep[];
  reviewId: string;
}

function getStepIcon(status: WorkflowStep["status"]): string {
  if (status === "complete") return "✓";
  if (status === "active") return "●";
  return "○";
}

function getStepClass(status: WorkflowStep["status"]): string {
  if (status === "complete") return styles.progressStepComplete;
  if (status === "active") return styles.progressStepActive;
  return styles.progressStepPending;
}

export function OverviewWorkflowProgress({
  steps,
  reviewId,
}: OverviewWorkflowProgressProps) {
  return (
    <nav className={styles.progressBar} aria-label="Workflow progress">
      {steps.map((ws) => (
        <Link
          key={ws.step}
          href={getArbStepHref(reviewId, ws.step as ArbReviewStepKey)}
          className={`${styles.progressStep} ${getStepClass(ws.status)}`}
        >
          <span>{getStepIcon(ws.status)}</span>
          <span>{ws.label}</span>
        </Link>
      ))}
    </nav>
  );
}
