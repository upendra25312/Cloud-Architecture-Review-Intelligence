"use client";

import Link from "next/link";
import type { Route } from "next";
import type { ArbReviewerOverride } from "@/arb/types";

export interface ReviewerOverrideSectionProps {
  reviewerOverride: ArbReviewerOverride | null;
  reviewId: string;
}

export function ReviewerOverrideSection({ reviewerOverride, reviewId }: ReviewerOverrideSectionProps) {
  if (reviewerOverride) {
    return (
      <section style={{ padding: "12px 20px", borderTop: "1px solid var(--border)" }}>
        <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: "0.82rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--brand)" }}>
          Reviewer Override
        </p>
        <p style={{ margin: "0 0 4px" }}>
          <strong>Decision:</strong> {reviewerOverride.overrideDecision}
        </p>
        <p style={{ margin: "0 0 4px", lineHeight: 1.6 }}>
          <strong>Rationale:</strong> {reviewerOverride.overrideRationale}
        </p>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--t3)" }}>
          {reviewerOverride.reviewerName} · {new Date(reviewerOverride.overriddenAt).toLocaleString()}
        </p>
      </section>
    );
  }

  const decisionHref = `/arb/${reviewId}/decision` as Route;

  return (
    <section style={{ padding: "12px 20px", borderTop: "1px solid var(--border)" }}>
      <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: "0.82rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--brand)" }}>
        Reviewer Decision
      </p>
      <p style={{ margin: 0, color: "var(--t2)" }}>
        No reviewer override recorded.{" "}
        <Link href={decisionHref} style={{ color: "var(--brand)", fontWeight: 600 }}>
          Go to Decision step →
        </Link>
      </p>
    </section>
  );
}
