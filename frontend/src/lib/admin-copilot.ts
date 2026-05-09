import type {
  AdminCopilotHealthResponse,
  AdminCopilotRequest,
  AdminCopilotResponse
} from "@/types";

async function parseJsonResponse<T>(response: Response) {
  const payload = (await response.json()) as T & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed with status ${response.status}.`);
  }

  return payload as T;
}

export async function loadAdminCopilotHealth() {
  const response = await fetch("/api/admin/copilot/health", {
    credentials: "same-origin",
    cache: "no-store"
  });

  return parseJsonResponse<AdminCopilotHealthResponse>(response);
}

export async function runAdminCopilot(request: AdminCopilotRequest) {
  const response = await fetch("/api/admin/copilot", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(request)
  });

  return parseJsonResponse<AdminCopilotResponse>(response);
}
