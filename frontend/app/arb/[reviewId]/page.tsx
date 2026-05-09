import { ArbOverviewPage } from "@/components/arb/overview/arb-overview-page";

type PageProps = {
  params: Promise<{
    reviewId: string;
  }>;
};

export function generateStaticParams() {
  return [{ reviewId: "demo-review" }];
}

export default async function ArbReviewOverviewRoute({ params }: PageProps) {
  const { reviewId } = await params;

  return <ArbOverviewPage reviewId={reviewId} />;
}
