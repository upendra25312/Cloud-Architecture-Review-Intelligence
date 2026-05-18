import { use } from "react";
import { ArbProjectDetailView } from "@/components/arb/projects/arb-project-detail-view";

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export function generateStaticParams() {
  return [{ projectId: "demo-project" }];
}

// Non-async: use React.use(params) instead of await so client-side navigation
// to un-pre-generated project IDs works in the Next.js static export.
export default function ArbProjectDetailPage({ params }: PageProps) {
  const { projectId } = use(params);
  return <ArbProjectDetailView projectId={projectId} />;
}
