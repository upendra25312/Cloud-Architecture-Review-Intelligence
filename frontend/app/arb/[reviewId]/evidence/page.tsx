import { ArbEvidencePage } from "@/components/arb/evidence/arb-evidence-page";

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

  return <ArbEvidencePage reviewId={reviewId} />;
}
