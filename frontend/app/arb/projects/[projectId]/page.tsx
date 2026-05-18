import { ArbProjectDetailView } from "@/components/arb/projects/arb-project-detail-view";

export function generateStaticParams() {
  return [{ projectId: "demo-project" }];
}

// Page passes no props — ArbProjectDetailView reads projectId via useParams()
// so it works for any project UUID at runtime without needing a server-rendered
// RSC payload (which doesn't exist in the static export for un-pre-generated IDs).
export default function ArbProjectDetailPage() {
  return <ArbProjectDetailView />;
}
