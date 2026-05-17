"use client";

import type { ArbExportArtifact } from "@/arb/types";
import { ArbExportPanel } from "@/components/arb/arb-export-panel";

export interface ExportSectionProps {
  reviewId: string;
  exportArtifacts: ArbExportArtifact[];
  onRegenerate: () => void;
  onDownload: (artifact: ArbExportArtifact) => void;
  onDownloadPptx: () => void;
  onDownloadExcel: () => void;
  onDownloadDocx: () => void;
  regenerating: boolean;
  downloadingId: string | null;
  downloadingPptx: boolean;
  downloadingExcel: boolean;
  downloadingDocx: boolean;
  error: string | null;
}

export function ExportSection(props: ExportSectionProps) {
  return (
    <ArbExportPanel
      exportArtifacts={props.exportArtifacts}
      onRegenerate={props.onRegenerate}
      onDownload={props.onDownload}
      onDownloadPptx={props.onDownloadPptx}
      onDownloadExcel={props.onDownloadExcel}
      onDownloadDocx={props.onDownloadDocx}
      regenerating={props.regenerating}
      downloadingId={props.downloadingId}
      downloadingPptx={props.downloadingPptx}
      downloadingExcel={props.downloadingExcel}
      downloadingDocx={props.downloadingDocx}
      error={props.error}
      secondaryFormats={["Markdown", "CSV", "HTML"]}
    />
  );
}
