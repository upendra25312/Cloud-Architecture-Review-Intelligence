import { ArbProjectDetailView } from "@/components/arb/projects/arb-project-detail-view";

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export function generateStaticParams() {
  return [{ projectId: "demo-project" }];
}

export default async function ArbProjectDetailPage({ params }: PageProps) {
  const { projectId } = await params;
  return <ArbProjectDetailView projectId={projectId} />;
}
