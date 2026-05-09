import type {
  ReviewTelemetryEventProperties,
  ReviewTelemetryEventRequest,
  ReviewTelemetrySummaryResponse
} from "@/types";
import { readBackendErrorMessage } from "@/lib/backend-error";

const SESSION_STORAGE_KEY = "azure-review-board-telemetry-session-id";

function normalizeProperties(
  properties: ReviewTelemetryEventProperties | undefined
): ReviewTelemetryEventProperties | undefined {
  if (!properties) {
    return undefined;
  }

  return Object.entries(properties).reduce<ReviewTelemetryEventProperties>(
    (accumulator, [key, value]) => {
      if (value === undefined) {
        return accumulator;
      }

      accumulator[key] = value;
      return accumulator;
    },
    {}
  );
}

function createSessionId() {
  if (typeof window === "undefined") {
    return undefined;
  }

  const nextCrypto = window.crypto;

  if (nextCrypto?.randomUUID) {
    return nextCrypto.randomUUID();
  }

  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getSessionId() {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const current = window.sessionStorage.getItem(SESSION_STORAGE_KEY);

    if (current) {
      return current;
    }

    const created = createSessionId();

    if (created) {
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, created);
    }

    return created;
  } catch {
    return undefined;
  }
}

async function parseJsonResponse<T>(response: Response, fallback: string) {
  if (!response.ok) {
    const message = await readBackendErrorMessage(response, fallback);
    throw new Error(message || fallback);
  }

  return (await response.json()) as T;
}

export function trackReviewTelemetry(
  event: Omit<ReviewTelemetryEventRequest, "route" | "sessionId"> & {
    route?: string;
  }
) {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  const payload: ReviewTelemetryEventRequest = {
    ...event,
    route: event.route ?? window.location.pathname,
    sessionId: getSessionId(),
    properties: normalizeProperties(event.properties)
  };

  return fetch("/api/telemetry", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "same-origin",
    cache: "no-store",
    keepalive: true,
    body: JSON.stringify(payload)
  })
    .then(() => undefined)
    .catch(() => undefined);
}

export async function loadReviewTelemetrySummary(windowDays = 14) {
  const response = await fetch(`/api/admin/telemetry/summary?days=${windowDays}`, {
    credentials: "same-origin",
    cache: "no-store"
  });

  return parseJsonResponse<ReviewTelemetrySummaryResponse>(
    response,
    "Unable to load redesign telemetry."
  );
}
