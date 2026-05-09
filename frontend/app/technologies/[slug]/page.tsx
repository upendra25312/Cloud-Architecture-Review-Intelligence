import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TechnologyPageView } from "@/components/technology-page-view";
import { readTechnologyIndex, readTechnologyPayload } from "@/lib/catalog";

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateStaticParams() {
  const index = await readTechnologyIndex();

  return index.technologies.map((technology) => ({
    slug: technology.slug
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const payload = await readTechnologyPayload(slug);

  if (!payload) {
    return {
      title: "Checklist Family"
    };
  }

  return {
    title: payload.technology.technology,
    description: `${payload.technology.technology} checklist family with ${payload.technology.itemCount} normalized findings, ${payload.technology.highSeverityCount} high-severity items, and ${payload.technology.maturityBucket} maturity handling.`
  };
}

export default async function TechnologyPage({ params }: PageProps) {
  const { slug } = await params;
  const payload = await readTechnologyPayload(slug);

  if (!payload) {
    notFound();
  }

  return <TechnologyPageView payload={payload} />;
}
