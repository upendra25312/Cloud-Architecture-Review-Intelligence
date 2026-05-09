import type { Metadata } from "next";
import { ServicesDirectory } from "@/components/services-directory";
import { readServiceIndex } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Browse normalized Azure services and open service-specific review views anchored in maturity-aware checklist families."
};

export default async function ServicesPage() {
  const index = await readServiceIndex();

  return <ServicesDirectory index={index} />;
}
