import type { Metadata } from "next";
import { DemoReviewPage } from "./demo-review-page";

export const metadata: Metadata = {
  title: "Demo Review — Rackspace Cloud Architecture Review Intelligence",
  description:
    "See a complete ARB workflow end-to-end — findings, scorecard, domain scores, and reviewer decision — no sign-in required.",
};

export default function DemoPage() {
  return <DemoReviewPage />;
}
