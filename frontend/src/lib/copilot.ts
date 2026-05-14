import type { CopilotRequest, CopilotResponse } from "@/types";
import { apiFetch } from "@/lib/api-fetch";

export async function runProjectReviewCopilot(request: CopilotRequest) {
  const response = await apiFetch("/api/copilot", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    cache: "no-store",
    body: JSON.stringify(request)
  });

  const payload = (await response.json()) as CopilotResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? `Copilot request failed with status ${response.status}.`);
  }

  return payload;
}
