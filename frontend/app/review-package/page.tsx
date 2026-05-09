import type { Metadata } from "next";
import { ReviewPackageWorkbench } from "@/components/review-package-workbench";
import { readServiceIndex } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Project Review",
  description:
    "Create a project-scoped Azure review, select only the services in scope, and export the resulting review notes."
};

export default async function ReviewPackagePage() {
  const index = await readServiceIndex();

  return <ReviewPackageWorkbench index={index} />;
}
