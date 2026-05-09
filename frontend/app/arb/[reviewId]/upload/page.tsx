import { ArbLiveReviewStep } from "@/components/arb/live-review-step";

type PageProps = {
  params: Promise<{
    reviewId: string;
  }>;
};

export function generateStaticParams() {
  return [{ reviewId: "demo-review" }];
}

export default async function ArbUploadPage({ params }: PageProps) {
  const { reviewId } = await params;

  return (
    <ArbLiveReviewStep
      reviewId={reviewId}
      activeStep="upload"
      title="Upload Review Package"
      description="Stage source documents, confirm package readiness, and prepare the extraction handoff."
    />
  );
}
