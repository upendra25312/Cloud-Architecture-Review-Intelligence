import { ArbScorecardPage } from "@/components/arb/scorecard/arb-scorecard-page";

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

  return <ArbScorecardPage reviewId={reviewId} />;
}
