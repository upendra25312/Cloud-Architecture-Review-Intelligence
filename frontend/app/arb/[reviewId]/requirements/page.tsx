import { ArbRequirementsPage } from "@/components/arb/requirements/arb-requirements-page";

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

  return <ArbRequirementsPage reviewId={reviewId} />;
}
