"use client";

import type { ArbExportArtifact } from "@/arb/types";
import { ArbExportPanel } from "@/components/arb/arb-export-panel";

export interface RequirementsExportSectionProps {
  reviewId: string;
  exportArtifacts: ArbExportArtifact[];
  onRegenerate: () => void;
  onDownload: (artifact: ArbExportArtifact) => void;
  onDownloadExcel: () => void;
  onDownloadDocx: () => void;
  regenerating: boolean;
  downloadingId: string | null;
  downloadingExcel: boolean;
  downloadingDocx: boolean;
  error: string | null;
}

export function RequirementsExportSection(props: RequirementsExportSectionProps) {
  return (
    <ArbExportPanel
      exportArtifacts={props.exportArtifacts}
      onRegenerate={props.onRegenerate}
      onDownload={props.onDownload}
      onDownloadExcel={props.onDownloadExcel}
      onDownloadDocx={props.onDownloadDocx}
      regenerating={props.regenerating}
      downloadingId={props.downloadingId}
      downloadingExcel={props.downloadingExcel}
      downloadingDocx={props.downloadingDocx}
      error={props.error}
      secondaryFormats={["Markdown", "CSV", "HTML"]}
    />
  );
}
