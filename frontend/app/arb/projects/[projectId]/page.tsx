import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export function generateStaticParams() {
  return [{ projectId: "demo-project" }];
}

// Redirect legacy /arb/projects/{id} paths to the query-param URL.
// Next.js static export requires pre-generated paths for dynamic segments;
// the real project detail is served via /arb/projects/view?projectId={id}.
export default async function ArbProjectDetailPage({ params }: PageProps) {
  const { projectId } = await params;
  redirect(`/arb/projects/view?projectId=${encodeURIComponent(projectId)}`);
}
