"use client";

// Static page — reads projectId from ?projectId=... query param at runtime.
// This avoids the dynamic [projectId] path segment which requires pre-generation
// in Next.js static export and fails for arbitrary UUIDs.
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ArbProjectDetailView } from "@/components/arb/projects/arb-project-detail-view";

function ProjectDetailContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") ?? "";
  return <ArbProjectDetailView projectId={projectId} />;
}

export default function ArbProjectViewPage() {
  return (
    <Suspense fallback={<main className="arb-page"><div className="arb-page-header"><h1 className="arb-page-title">Loading…</h1></div></main>}>
      <ProjectDetailContent />
    </Suspense>
  );
}
