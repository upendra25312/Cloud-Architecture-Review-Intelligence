"use client";

import { ApplicationInsights } from "@microsoft/applicationinsights-web";

const connectionString = process.env.NEXT_PUBLIC_APPINSIGHTS_CONNECTION_STRING;

let appInsights: ApplicationInsights | null = null;

function getAppInsights(): ApplicationInsights | null {
  if (typeof window === "undefined") return null;
  if (!connectionString) return null;

  if (!appInsights) {
    appInsights = new ApplicationInsights({
      config: {
        connectionString,
        enableAutoRouteTracking: true,
        enableRequestHeaderTracking: true,
        enableResponseHeaderTracking: false,
        disableFetchTracking: false,
        maxBatchSizeInBytes: 10000,
        maxBatchInterval: 15000,
      },
    });
    appInsights.loadAppInsights();
    appInsights.trackPageView();
  }

  return appInsights;
}

export type ArbEvent =
  | { name: "arb_review_started"; properties?: Record<string, string | undefined> }
  | { name: "arb_document_uploaded"; properties?: { reviewId?: string; fileCount?: string; totalSizeKb?: string } }
  | { name: "arb_extraction_completed"; properties?: { reviewId?: string; state?: string; evidenceReadiness?: string; extractionConfidencePercent?: string } }
  | { name: "arb_findings_generated"; properties?: { reviewId?: string; findingCount?: string; scorecardScore?: string } }
  | { name: "arb_scorecard_exported"; properties?: { reviewId?: string; format?: string } }
  | { name: "arb_review_completed"; properties?: { score?: string; findings?: string } }
  | { name: "arb_export_triggered"; properties: { format: "csv" | "html" | "md" } }
  | { name: "arb_finding_overridden"; properties?: { domain?: string; severity?: string } }
  | { name: "arb_signin_initiated"; properties?: { from?: string } }
  | { name: "arb_page_view"; properties?: { page?: string } }
  | { name: "arb_service_selected"; properties?: { service?: string } }
  | { name: "arb_error_captured"; properties?: { error?: string; context?: string } }
  | { name: "arb_home_cta_click"; properties: { cta: "start_azure_review" | "view_sample_review"; location?: string } };

export function trackArbEvent(event: ArbEvent): void {
  const ai = getAppInsights();
  if (!ai) return;
  ai.trackEvent({ name: event.name }, event.properties);
}

export function initTelemetry(): void {
  getAppInsights();
}
