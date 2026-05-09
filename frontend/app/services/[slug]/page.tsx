import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ServicePageView } from "@/components/service-page-view";
import { readServiceIndex, readServicePayload } from "@/lib/catalog";

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateStaticParams() {
  const index = await readServiceIndex();

  return index.services.map((service) => ({
    slug: service.slug
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const payload = await readServicePayload(slug);

  if (!payload) {
    return {
      title: "Service"
    };
  }

  return {
    title: payload.service.service,
    description: `${payload.service.service} review guidance across ${payload.service.familyCount} checklist families, ${payload.service.gaFamilyCount} GA-ready baselines, and ${payload.service.highSeverityCount} high-severity findings.`
  };
}

export default async function ServiceDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const payload = await readServicePayload(slug);

  if (!payload) {
    notFound();
  }

  return <ServicePageView payload={payload} />;
}
