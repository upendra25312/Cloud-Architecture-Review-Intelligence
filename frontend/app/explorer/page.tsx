import type { Metadata } from "next";
import Link from "next/link";
import ExplorerAuthCta from "./ExplorerAuthCta";
import { ExplorerClient } from "@/components/explorer-client";
import { readSummary } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Explorer",
  description:
    "Filter detailed Azure review findings with maturity guardrails, local-only notes, and export-ready views."
};

export default async function ExplorerPage() {
  const summary = await readSummary();

  return (
    <main className="section-stack">
      <section className="surface-panel editorial-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Explorer</p>
            <h1 className="section-title">
              Filter detailed findings without losing maturity guardrails.
            </h1>
            <p className="section-copy">
              Use the explorer when you need service, severity, pillar, or family-level filtering,
              local-only notes, and export-ready result sets. The homepage stays focused on review
              posture and service discovery.
            </p>
          </div>
          <div className="button-row">
            <Link href="/" className="secondary-button">
              Back to overview
            </Link>
            <Link href="/services" className="ghost-button">
              Browse services
            </Link>
            <ExplorerAuthCta />
          </div>
        </div>
      </section>

      <ExplorerClient summary={summary} />
    </main>
  );
}
