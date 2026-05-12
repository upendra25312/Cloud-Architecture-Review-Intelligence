import { Suspense } from "react";
import { ArbFindingsPage } from "@/components/arb/findings/arb-findings-page";

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
    <Suspense fallback={<div className="arb-loading-skeleton"><p>Loading findings…</p></div>}>
      <ArbFindingsPage reviewId={reviewId} />
    </Suspense>
  );
}
