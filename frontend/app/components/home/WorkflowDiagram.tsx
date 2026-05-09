/**
 * WorkflowDiagram — "How it works" (Req 3).
 *
 * Six-step evidence-to-decision workflow rendered as an ordered list.
 * Layout switches at ≥1024px from a vertical stepper to a six-column
 * horizontal row via CSS grid (see globals.css .review-workflow-grid).
 *
 * Pure presentational component.
 */

import Image from "next/image";
import { Fragment, type ReactNode } from "react";
import { HOME_COPY } from "./home-copy";

interface StepIconProps {
  label: string;
}

function UploadIcon({ label }: StepIconProps) {
  return (
    <svg
      className="review-workflow-step-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      role="presentation"
      data-icon-title={label}
    >
      <path d="M12 3v12" />
      <path d="m7 8 5-5 5 5" />
      <path d="M4 21h16" />
    </svg>
  );
}

function AnalyzeIcon({ label }: StepIconProps) {
  return (
    <svg
      className="review-workflow-step-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      role="presentation"
      data-icon-title={label}
    >
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

function FindingsIcon({ label }: StepIconProps) {
  return (
    <svg
      className="review-workflow-step-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      role="presentation"
      data-icon-title={label}
    >
      <path d="M5 5h14v14H5z" />
      <path d="M8 10h8" />
      <path d="M8 14h5" />
    </svg>
  );
}

function ReviewIcon({ label }: StepIconProps) {
  return (
    <svg
      className="review-workflow-step-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      role="presentation"
      data-icon-title={label}
    >
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="m15.5 13 2 2 4-4" />
    </svg>
  );
}

function ApproveIcon({ label }: StepIconProps) {
  return (
    <svg
      className="review-workflow-step-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      role="presentation"
      data-icon-title={label}
    >
      <path d="m5 12 4 4 10-10" />
    </svg>
  );
}

function ExportBoardIcon({ label }: StepIconProps) {
  return (
    <svg
      className="review-workflow-step-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      role="presentation"
      data-icon-title={label}
    >
      <path d="M7 3h8l4 4v14H7z" />
      <path d="M15 3v4h4" />
      <path d="M10 17h4" />
      <path d="M12 11v6" />
    </svg>
  );
}

const STEP_ICONS: ReadonlyArray<(props: StepIconProps) => ReactNode> = [
  UploadIcon,
  AnalyzeIcon,
  FindingsIcon,
  ReviewIcon,
  ApproveIcon,
  ExportBoardIcon,
];

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export default function WorkflowDiagram() {
  const steps = HOME_COPY.workflow;
  return (
    <section
      className="review-section"
      aria-labelledby="workflow-title"
      data-home-section="workflow"
    >
      <div className="review-section-head">
        <p className="review-eyebrow">Review workflow</p>
        <h2 id="workflow-title">From evidence to board-ready decision — in one review session.</h2>
      </div>

      {/* Full-width process diagram */}
      <div className="review-workflow-diagram-wrap">
        <Image
          src="/arb-workflow.png"
          alt="ARB review workflow: Evidence Intake → Review Readiness → Findings & Risks → Decisions & Exceptions → Board Pack Export. Produces Decision Log, Exception Register, and Stakeholder Sign-off. Outcomes: Reduce Rework, Improve Governance, Track Decisions, Delivery Confidence."
          width={1200}
          height={420}
          className="review-workflow-diagram-img"
          priority={false}
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 1200px"
        />
      </div>

      <p className="review-eyebrow" style={{ marginTop: "2.5rem", textAlign: "center" }}>Step by step</p>
      <ol className="review-workflow-grid" aria-label="Review workflow steps">
        {steps.map((step, index) => {
          const Icon = STEP_ICONS[index] ?? UploadIcon;
          return (
            <Fragment key={step.number}>
              <li className="review-workflow-step">
                <span className="review-workflow-step-number" aria-hidden="true">
                  {step.number}
                </span>
                <Icon label={step.label} />
                <h3>{step.label}</h3>
                <p>{step.explanation}</p>
              </li>
              {index < steps.length - 1 ? (
                <span
                  className="review-workflow-connector"
                  aria-hidden="true"
                  role="presentation"
                >
                  <Chevron />
                </span>
              ) : null}
            </Fragment>
          );
        })}
      </ol>
    </section>
  );
}
