import { ArbLiveReviewStep } from "@/components/arb/live-review-step";

type PageProps = {
  params: Promise<{
    reviewId: string;
  }>;
};

export function generateStaticParams() {
  return [{ reviewId: "demo-review" }];
}

export default async function Page({ params }: PageProps) {
  const { reviewId } = await params;

  return (
    <ArbLiveReviewStep
      reviewId={reviewId}
      activeStep="decision"
      title="Decision Center"
      description="Record the human-owned decision, rationale, and conditions after reviewing the score and blockers."
    />
  );
}
