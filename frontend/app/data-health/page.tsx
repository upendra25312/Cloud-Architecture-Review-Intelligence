import type { Metadata } from "next";
import { DataHealthView } from "@/components/data-health-view";

export const metadata: Metadata = {
  title: "Data Health",
  description:
    "Check whether regional availability and retail pricing are being refreshed and served from the dedicated Azure Function App backend."
};

export default function DataHealthPage() {
  return <DataHealthView />;
}
