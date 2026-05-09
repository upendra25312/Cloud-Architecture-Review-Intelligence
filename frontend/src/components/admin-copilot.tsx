"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuthSession } from "@/components/auth-session-provider";
import type {
  AdminCopilotHealthResponse,
  AdminCopilotResponse,
  ReviewTelemetrySummaryResponse,
  StaticWebAppClientPrincipal
} from "@/types";
import { loadAdminCopilotHealth, runAdminCopilot } from "@/lib/admin-copilot";
import { buildPrimaryLoginUrl } from "@/lib/review-cloud";
import { loadReviewTelemetrySummary, trackReviewTelemetry } from "@/lib/review-telemetry";

const SUGGESTED_ADMIN_PROMPTS = [
  "List the Azure resources supporting this website.",
  "Check whether the Function App has the expected app settings.",
  "Verify the Azure OpenAI deployment health.",
  "Summarize App Insights and backend health risks."
];

function getLoginUrl() {
  if (typeof window === "undefined") {
    return buildPrimaryLoginUrl();
  }

  return buildPrimaryLoginUrl(window.location.href);
}

function hasAdminRole(principal: StaticWebAppClientPrincipal | null) {
  return (
    principal?.userRoles?.some((role) => role.trim().toLowerCase() === "admin") ?? false
  );
}

function formatDate(value?: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Date(value).toLocaleString("en-US");
}

function getFindingToneClass(severity: "info" | "warning" | "error") {
  switch (severity) {
    case "error":
      return "matrix-chip matrix-chip-danger";
    case "warning":
      return "matrix-chip matrix-chip-warning";
    case "info":
    default:
      return "matrix-chip matrix-chip-neutral";
  }
}

function getConfigToneClass(status: "configured" | "defaulted" | "missing") {
  switch (status) {
    case "configured":
      return "matrix-chip matrix-chip-good";
    case "defaulted":
      return "matrix-chip matrix-chip-neutral";
    case "missing":
    default:
      return "matrix-chip matrix-chip-warning";
  }
}

function getEvidenceToneClass(status: "healthy" | "warning" | "error" | "info") {
  switch (status) {
    case "healthy":
      return "matrix-chip matrix-chip-good";
    case "error":
      return "matrix-chip matrix-chip-danger";
    case "warning":
      return "matrix-chip matrix-chip-warning";
    case "info":
    default:
      return "matrix-chip matrix-chip-neutral";
  }
}

export function AdminCopilot() {
  const { principal, resolved: authResolved } = useAuthSession();
  const [health, setHealth] = useState<AdminCopilotHealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [telemetry, setTelemetry] = useState<ReviewTelemetrySummaryResponse | null>(null);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const [telemetryLoading, setTelemetryLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [response, setResponse] = useState<AdminCopilotResponse | null>(null);
  const [responseError, setResponseError] = useState<string | null>(null);
  const [responseLoading, setResponseLoading] = useState(false);

  useEffect(() => {
    let active = true;

    if (!authResolved) {
      return () => {
        active = false;
      };
    }

    if (!hasAdminRole(principal)) {
      setHealth(null);
      setHealthLoading(false);
      return () => {
        active = false;
      };
    }

    setHealthLoading(true);

    loadAdminCopilotHealth()
      .then((nextHealth) => {
        if (!active) {
          return;
        }

        setHealth(nextHealth);
        setHealthLoading(false);
      })
      .catch((nextError) => {
        if (!active) {
          return;
        }

        setHealthError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load admin copilot health."
        );
        setHealthLoading(false);
      });

    return () => {
      active = false;
    };
  }, [authResolved, principal]);

  const principalLabel = useMemo(
    () => principal?.userDetails || principal?.userId || "Signed-in admin",
    [principal]
  );
  const promptExecutionEnabled = health?.capabilities.promptExecutionEnabled ?? false;
  const adminScope = useMemo(
    () =>
      health
        ? {
            resourceGroup: health.scope.resourceGroup,
            staticWebAppName: health.scope.staticWebAppName,
            functionAppName: health.scope.functionAppName,
            openAiResourceName: health.scope.openAiResourceName,
            openAiDeployment: health.scope.openAiDeployment,
            region: health.scope.region
          }
        : undefined,
    [health]
  );

  useEffect(() => {
    if (!hasAdminRole(principal)) {
      return;
    }

    let active = true;
    setTelemetryLoading(true);
    setTelemetryError(null);

    loadReviewTelemetrySummary(14)
      .then((nextTelemetry) => {
        if (!active) {
          return;
        }

        setTelemetry(nextTelemetry);
        setTelemetryLoading(false);
      })
      .catch((nextError) => {
        if (!active) {
          return;
        }

        setTelemetryError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load redesign telemetry."
        );
        setTelemetryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [principal]);

  async function submit(nextQuestion: string, options?: { origin?: "manual" | "suggested" }) {
    const trimmed = nextQuestion.trim();

    if (!trimmed || !promptExecutionEnabled) {
      return;
    }

    setResponseLoading(true);
    setResponseError(null);

    try {
      const nextResponse = await runAdminCopilot({
        question: trimmed,
        scope: adminScope
      });

      void trackReviewTelemetry({
        name: "admin_prompt_submit",
        category: "admin",
        route: "/admin/copilot",
        properties: {
          origin: options?.origin ?? "manual",
          promptExecutionEnabled: nextResponse.promptExecutionEnabled,
          questionLength: trimmed.length,
          sourceCount: nextResponse.sources.length,
          succeeded: true,
          toolCallCount: nextResponse.toolCalls.length
        }
      });
      setResponse(nextResponse);
      setSubmittedQuestion(trimmed);
      setQuestion(trimmed);
    } catch (nextError) {
      void trackReviewTelemetry({
        name: "admin_prompt_submit",
        category: "admin",
        route: "/admin/copilot",
        properties: {
          origin: options?.origin ?? "manual",
          questionLength: trimmed.length,
          succeeded: false
        }
      });
      setResponseError(
        nextError instanceof Error ? nextError.message : "Unable to run the admin copilot."
      );
    } finally {
      setResponseLoading(false);
    }
  }

  if (!authResolved) {
    return (
      <main className="section-stack">
        <section className="review-command-panel">
          <p className="eyebrow">Admin copilot</p>
          <h1 className="review-command-title">Checking admin sign-in status.</h1>
          <p className="review-command-summary">
            This internal area is reserved for platform administrators and operational diagnostics.
          </p>
        </section>
      </main>
    );
  }

  if (!principal) {
    return (
      <main className="section-stack">
        <section className="review-command-panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">Admin access required</p>
              <h1 className="review-command-title">Sign in as an internal administrator.</h1>
              <p className="review-command-summary">
                This area is for internal administrators who manage the Azure Review Board platform,
                diagnostics, and operational tooling.
              </p>
            </div>
          </div>
          <div className="button-row">
            <a href={getLoginUrl()} className="primary-button">
              Sign in as admin
            </a>
            <a href="/review-package" className="ghost-button">
              Back to project review
            </a>
          </div>
        </section>
      </main>
    );
  }

  if (!hasAdminRole(principal)) {
    return (
      <main className="section-stack">
        <section className="review-command-panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">Access denied</p>
              <h1 className="review-command-title">You are signed in, but you do not have admin access.</h1>
              <p className="review-command-summary">
                Your account can use the project review features, but this admin area is restricted
                to internal platform administrators.
              </p>
            </div>
          </div>
          <div className="button-row">
            <a href="/review-package" className="primary-button">
              Go to project review
            </a>
            <a href="/.auth/logout" className="ghost-button">
              Sign out
            </a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="section-stack">
      <section className="review-command-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Admin copilot</p>
            <h1 className="review-command-title">Inspect the Azure platform behind the website before deeper admin tooling goes live.</h1>
            <p className="review-command-summary">
              This shell is protected for internal administrators only. It confirms the admin route,
              admin API, scoped Azure environment, and current backend readiness before we connect
              the full Azure MCP-driven prompt workflow.
            </p>
          </div>
          <div className="button-row">
            <a href="/data-health" className="secondary-button">
              Open data health
            </a>
            <a href="/review-package" className="ghost-button">
              Back to project review
            </a>
          </div>
        </div>

        <div className="package-stats-grid">
          <article className="hero-metric-card">
            <span>Signed in admin</span>
            <strong>{principalLabel}</strong>
            <p>{principal.userRoles.join(", ") || "No roles published"}</p>
          </article>
          <article className="hero-metric-card">
            <span>Admin route</span>
            <strong>Protected</strong>
            <p>`/admin/copilot` is now reserved for the `admin` role.</p>
          </article>
          <article className="hero-metric-card">
            <span>Admin API</span>
            <strong>{health ? "Ready" : healthLoading ? "Checking" : "Pending"}</strong>
            <p>The shell now has a protected backend health route for internal diagnostics.</p>
          </article>
          <article className="hero-metric-card">
            <span>Prompt execution</span>
            <strong>{health?.capabilities.promptExecutionEnabled ? "Enabled" : "Coming next"}</strong>
            <p>
              {health?.capabilities.promptExecutionEnabled
                ? "The protected backend can now call the configured Foundry admin agent for read-only diagnostics."
                : "Prompt execution will turn on after the Foundry admin agent settings are configured on the backend."}
            </p>
          </article>
        </div>
      </section>

      <section className="surface-panel board-stage-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Admin prompts</p>
            <h2 className="section-title">Ask the protected admin copilot about backend health, config drift, and Azure platform readiness.</h2>
            <p className="section-copy">
              This prompt flow stays read-only. It is scoped to the current Azure Review Board
              platform context and is intended for operator diagnostics, not deployments or writes.
            </p>
          </div>
        </div>

        <div className="copilot-layout">
          <article className="filter-card copilot-card">
            <div className="copilot-card-head">
              <div>
                <p className="eyebrow">Protected admin route</p>
                <h3>Run a read-only platform diagnostic prompt.</h3>
              </div>
              <span className="chip">{promptExecutionEnabled ? "Prompt execution enabled" : "Prompt execution pending"}</span>
            </div>

            <form
              className="copilot-form"
              onSubmit={(event) => {
                event.preventDefault();
                void submit(question, { origin: "manual" });
              }}
            >
              <label className="copilot-label">
                <span className="microcopy">Question</span>
                <textarea
                  className="field-textarea copilot-textarea"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Ask for resource inventory, backend drift, refresh posture, Azure OpenAI readiness, or Foundry agent health."
                />
              </label>
              <p className="microcopy">
                {promptExecutionEnabled
                  ? "Use one of the suggested prompts or type your own internal admin question."
                  : "The admin page is authenticated and healthy, but prompt execution is not available until the backend reports it as enabled."}
              </p>
              <div className="button-row">
                <button
                  type="submit"
                  className="primary-button"
                  disabled={responseLoading || !question.trim() || !promptExecutionEnabled}
                >
                  {responseLoading
                    ? "Running admin copilot..."
                    : promptExecutionEnabled
                      ? "Run admin prompt"
                      : "Prompt execution unavailable"}
                </button>
              </div>
            </form>

            <div className="copilot-suggestion-grid">
                {SUGGESTED_ADMIN_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="copilot-suggestion"
                  onClick={() => {
                    setQuestion(prompt);
                    void submit(prompt, { origin: "suggested" });
                  }}
                  disabled={responseLoading || !promptExecutionEnabled}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </article>

          <article className="leadership-brief copilot-brief">
            <p className="eyebrow">Prompt scope</p>
            <h2 className="leadership-title">Each answer is constrained to the published admin platform context.</h2>
            <div className="leadership-list">
              <article>
                <strong>Static Web App</strong>
                <p>{health?.scope.staticWebAppName ?? "Loading..."}</p>
              </article>
              <article>
                <strong>Function App</strong>
                <p>{health?.scope.functionAppName ?? "Loading..."}</p>
              </article>
              <article>
                <strong>Scoped resource group</strong>
                <p>{health?.scope.resourceGroup ?? "Loading..."}</p>
              </article>
              <article>
                <strong>Azure OpenAI deployment</strong>
                <p>{health?.scope.openAiDeployment ?? "Loading..."}</p>
              </article>
            </div>
          </article>
        </div>

        {response ? (
          <article className="filter-card copilot-card">
            <div className="copilot-card-head">
              <div>
                <p className="eyebrow">Latest admin answer</p>
                <h3>{submittedQuestion}</h3>
              </div>
              <span className="chip">
                {[response.modelName, response.modelDeployment].filter(Boolean).join(" · ") || "Foundry admin agent"}
              </span>
            </div>
            <div className="copilot-answer">{response.answer}</div>
            <div className="traceability-grid">
              <article className="trace-card">
                <strong>Generated</strong>
                <p>{formatDate(response.generatedAt)}</p>
              </article>
              <article className="trace-card">
                <strong>Prompt execution</strong>
                <p>{response.promptExecutionEnabled ? "Enabled" : "Disabled"}</p>
              </article>
              <article className="trace-card">
                <strong>Source count</strong>
                <p>{response.sources.length.toLocaleString()}</p>
              </article>
              <article className="trace-card">
                <strong>Tool calls</strong>
                <p>{response.toolCalls.length.toLocaleString()}</p>
              </article>
            </div>

            {response.sources.length > 0 ? (
              <div className="copilot-source-list">
                {response.sources.map((source) => (
                  <article
                    className="trace-card"
                    key={`${source.label}-${source.url ?? source.note ?? ""}`}
                  >
                    <strong>{source.label}</strong>
                    <p>
                      {source.url ? (
                        <a href={source.url} target="_blank" rel="noreferrer" className="muted-link">
                          {source.url}
                        </a>
                      ) : (
                        source.note ?? "Admin platform context"
                      )}
                    </p>
                  </article>
                ))}
              </div>
            ) : null}

            {response.toolCalls.length > 0 ? (
              <div className="service-selection-grid">
                {response.toolCalls.map((toolCall, index) => (
                  <article className="future-card service-selection-card" key={`${toolCall.tool}-${index}`}>
                    <div className="chip-row compact-chip-row">
                      <span
                        className={
                          toolCall.status === "success"
                            ? "matrix-chip matrix-chip-good"
                            : toolCall.status === "failed"
                              ? "matrix-chip matrix-chip-danger"
                              : "matrix-chip matrix-chip-neutral"
                        }
                      >
                        {toolCall.status}
                      </span>
                    </div>
                    <h3>{toolCall.tool}</h3>
                    <p className="microcopy">{toolCall.detail ?? "No additional detail was returned."}</p>
                  </article>
                ))}
              </div>
            ) : null}
          </article>
        ) : null}

        {responseError ? (
          <section className="filter-card">
            <p className="eyebrow">Admin copilot</p>
            <h3>The admin prompt could not complete.</h3>
            <p className="microcopy">{responseError}</p>
          </section>
        ) : null}
      </section>

      <section className="surface-panel board-stage-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Admin health</p>
            <h2 className="section-title">See the admin boundary, scoped Azure environment, and backend readiness.</h2>
            <p className="section-copy">
              This section is sourced from the protected admin API and helps validate whether the
              admin shell has the right platform context before tool execution is enabled.
            </p>
          </div>
        </div>

        {healthLoading ? (
          <section className="filter-card">
            <p className="eyebrow">Admin API</p>
            <h3>Loading admin health.</h3>
            <p className="microcopy">
              The shell is checking protected backend health, Azure scope, and future tool readiness.
            </p>
          </section>
        ) : null}

        {health ? (
          <>
            <div className="package-stats-grid">
              <article className="hero-metric-card">
                <span>Scope region</span>
                <strong>{health.scope.region ?? "Not published"}</strong>
                <p>Primary Azure region for the current platform scope.</p>
              </article>
              <article className="hero-metric-card">
                <span>Resource group</span>
                <strong>{health.scope.resourceGroup}</strong>
                <p>Scoped Azure resource group for internal admin checks.</p>
              </article>
              <article className="hero-metric-card">
                <span>Function App</span>
                <strong>{health.scope.functionAppName ?? "Unknown"}</strong>
                <p>Dedicated backend that powers pricing, availability, and copilot routes.</p>
              </article>
              <article className="hero-metric-card">
                <span>Last checked</span>
                <strong>{formatDate(health.checkedAt)}</strong>
                <p>Most recent protected admin health check.</p>
              </article>
            </div>

            <div className="traceability-grid">
              <article className="trace-card">
                <strong>Static Web App</strong>
                <p>{health.scope.staticWebAppName ?? "Not published"}</p>
              </article>
              <article className="trace-card">
                <strong>Azure OpenAI resource</strong>
                <p>{health.scope.openAiResourceName ?? "Not published"}</p>
              </article>
              <article className="trace-card">
                <strong>Azure OpenAI deployment</strong>
                <p>{health.scope.openAiDeployment ?? "Not published"}</p>
              </article>
              <article className="trace-card">
                <strong>Refresh schedule</strong>
                <p>{health.backend.refreshSchedule ?? "Not published"}</p>
              </article>
              <article className="trace-card">
                <strong>Copilot endpoint</strong>
                <p>{health.backend.copilotEndpoint ?? "Not published"}</p>
              </article>
              <article className="trace-card">
                <strong>MCP server</strong>
                <p>{health.capabilities.mcpServerConfigured ? "Configured" : "Not configured yet"}</p>
              </article>
            </div>

            <div className="traceability-grid">
              <article className="trace-card">
                <strong>Application Insights</strong>
                <p>{health.capabilities.applicationInsightsConfigured ? "Enabled" : "Missing"}</p>
              </article>
              <article className="trace-card">
                <strong>Storage</strong>
                <p>{health.capabilities.storageConfigured ? "Configured" : "Missing"}</p>
              </article>
              <article className="trace-card">
                <strong>Public copilot backend</strong>
                <p>{health.capabilities.copilotConfigured ? "Configured" : "Not configured"}</p>
              </article>
              <article className="trace-card">
                <strong>Admin API shell</strong>
                <p>{health.capabilities.adminApiReady ? "Ready" : "Not ready"}</p>
              </article>
              <article className="trace-card">
                <strong>Admin route protection</strong>
                <p>{health.capabilities.adminRouteProtected ? "Enabled" : "Missing"}</p>
              </article>
            </div>

            <div className="traceability-grid">
              <article className="trace-card">
                <strong>Manual refresh</strong>
                <p>{health.backend.manualRefreshEnabled ? "Enabled" : "Disabled"}</p>
              </article>
              <article className="trace-card">
                <strong>Warm service source</strong>
                <p>{health.backend.warmServiceIndexUrl ?? "Not configured"}</p>
              </article>
              <article className="trace-card">
                <strong>Warm service limit</strong>
                <p>{health.backend.warmServiceLimit?.toLocaleString() ?? "0"}</p>
              </article>
              <article className="trace-card">
                <strong>Diagnostic findings</strong>
                <p>{health.findings.length.toLocaleString()}</p>
              </article>
            </div>

            <div className="traceability-grid">
              <article className="trace-card">
                <strong>Availability refresh</strong>
                <p>{health.backend.availability?.lastSuccessfulRefreshAt ? formatDate(health.backend.availability.lastSuccessfulRefreshAt) : "No successful refresh yet"}</p>
                <p className="microcopy">
                  Mode: {health.backend.availability?.lastRefreshMode ?? "Not published"} · TTL {health.backend.availability?.ttlHours ?? 0}h
                </p>
              </article>
              <article className="trace-card">
                <strong>Availability expiry</strong>
                <p>{formatDate(health.backend.availability?.expiresAt)}</p>
                <p className="microcopy">
                  Public regions: {health.backend.availability?.publicRegionCount?.toLocaleString() ?? "0"}
                </p>
              </article>
              <article className="trace-card">
                <strong>Pricing refresh</strong>
                <p>{health.backend.pricing?.lastSuccessfulRefreshAt ? formatDate(health.backend.pricing.lastSuccessfulRefreshAt) : "No successful refresh yet"}</p>
                <p className="microcopy">
                  Mode: {health.backend.pricing?.lastRefreshMode ?? "Not published"} · TTL {health.backend.pricing?.ttlHours ?? 0}h
                </p>
              </article>
              <article className="trace-card">
                <strong>Last warmed pricing scope</strong>
                <p>{health.backend.pricing?.lastServiceSlug ?? "Not published"}</p>
                <p className="microcopy">
                  Warm count: {health.backend.pricing?.lastWarmCount?.toLocaleString() ?? "0"}
                </p>
              </article>
            </div>

            <div className="section-head">
              <div>
                <p className="eyebrow">Operational evidence</p>
                <h2 className="section-title">See whether the backend looks fresh, observable, and ready right now.</h2>
                <p className="section-copy">
                  This section turns the current runtime and refresh state into operator-readable evidence instead of raw settings only.
                </p>
              </div>
            </div>

            <div className="service-selection-grid">
              {(health.backend.evidence ?? []).map((entry) => (
                <article className="future-card service-selection-card" key={entry.label}>
                  <div className="chip-row compact-chip-row">
                    <span className={getEvidenceToneClass(entry.status)}>{entry.status}</span>
                  </div>
                  <h3>{entry.label}</h3>
                  <p>{entry.summary}</p>
                  {entry.detail ? <p className="microcopy">{entry.detail}</p> : null}
                </article>
              ))}
            </div>

            <div className="section-head">
              <div>
                <p className="eyebrow">Config inventory</p>
                <h2 className="section-title">Inspect the runtime, storage, refresh, and copilot configuration that the backend can actually see.</h2>
                <p className="section-copy">
                  These entries are intentionally limited to visible configuration evidence. Secret values stay hidden.
                </p>
              </div>
            </div>

            <div className="service-selection-grid">
              {[
                {
                  key: "runtime",
                  title: "Runtime",
                  entries: health.backend.runtime ?? []
                },
                {
                  key: "storage",
                  title: "Storage",
                  entries: health.backend.storage ?? []
                },
                {
                  key: "refresh",
                  title: "Refresh",
                  entries: health.backend.refresh ?? []
                },
                {
                  key: "copilot",
                  title: "Copilot",
                  entries: health.backend.copilot ?? []
                }
              ].map((group) => (
                <article className="future-card service-selection-card" key={group.key}>
                  <p className="eyebrow">{group.title}</p>
                  <div className="section-stack" style={{ gap: 12 }}>
                    {group.entries.length > 0 ? (
                      group.entries.map((entry) => (
                        <div key={`${group.key}-${entry.label}`}>
                          <div className="chip-row compact-chip-row">
                            <span className={getConfigToneClass(entry.status)}>{entry.status}</span>
                          </div>
                          <strong>{entry.label}</strong>
                          <p>{entry.value}</p>
                          {entry.detail ? <p className="microcopy">{entry.detail}</p> : null}
                        </div>
                      ))
                    ) : (
                      <p className="microcopy">No visible entries were returned for this category.</p>
                    )}
                  </div>
                </article>
              ))}
            </div>

            {health.findings.length > 0 ? (
              <div className="service-selection-grid">
                {health.findings.map((finding) => (
                  <article className="future-card service-selection-card" key={finding.id}>
                    <div className="chip-row compact-chip-row">
                      <span className={getFindingToneClass(finding.severity)}>{finding.severity}</span>
                    </div>
                    <h3>{finding.label}</h3>
                    <p className="microcopy">{finding.detail}</p>
                  </article>
                ))}
              </div>
            ) : null}

            <div className="service-selection-grid">
              {health.notes.map((note) => (
                <article className="future-card service-selection-card" key={note}>
                  <p className="eyebrow">Admin note</p>
                  <p className="microcopy">{note}</p>
                </article>
              ))}
            </div>
          </>
        ) : null}

        {healthError ? (
          <section className="filter-card">
            <p className="eyebrow">Admin API</p>
            <h3>The protected admin health check could not complete.</h3>
            <p className="microcopy">{healthError}</p>
          </section>
        ) : null}
      </section>

      <section className="surface-panel board-stage-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Redesign telemetry</p>
            <h2 className="section-title">Inspect the shipped homepage-to-review funnel without opening raw storage rows.</h2>
            <p className="section-copy">
              This view summarizes the last 14 days of redesign adoption across homepage starts,
              review creation, scoped-service changes, export downloads, continuity actions, and
              admin prompt usage.
            </p>
          </div>
        </div>

        {telemetryLoading ? (
          <section className="filter-card">
            <p className="eyebrow">Loading telemetry</p>
            <p className="microcopy">Collecting the latest redesign funnel summary from the protected backend.</p>
          </section>
        ) : null}

        {telemetry ? (
          <>
            <div className="package-stats-grid">
              {telemetry.metrics.map((metric) => (
                <article className="hero-metric-card" key={metric.key}>
                  <span>{metric.label}</span>
                  <strong>{metric.count.toLocaleString()}</strong>
                  <p>Captured in the last {telemetry.windowDays.toLocaleString()} days.</p>
                </article>
              ))}
            </div>

            <div className="traceability-grid">
              <article className="trace-card">
                <strong>Telemetry storage</strong>
                <p>{telemetry.storageConfigured ? "Configured" : "Missing"}</p>
              </article>
              <article className="trace-card">
                <strong>Total events</strong>
                <p>{telemetry.totalEvents.toLocaleString()}</p>
              </article>
              <article className="trace-card">
                <strong>Rolling window</strong>
                <p>{telemetry.windowDays.toLocaleString()} days</p>
              </article>
              <article className="trace-card">
                <strong>Last checked</strong>
                <p>{formatDate(telemetry.checkedAt)}</p>
              </article>
            </div>

            <div className="service-selection-grid">
              <article className="future-card service-selection-card">
                <p className="eyebrow">Export mix</p>
                <h3>Which artifacts are actually being downloaded.</h3>
                <div className="section-stack" style={{ gap: 12 }}>
                  {telemetry.exportBreakdown.length > 0 ? (
                    telemetry.exportBreakdown.map((entry) => (
                      <div key={entry.key}>
                        <strong>{entry.label}</strong>
                        <p className="microcopy">{entry.count.toLocaleString()} downloads</p>
                      </div>
                    ))
                  ) : (
                    <p className="microcopy">No export downloads have been captured in this window yet.</p>
                  )}
                </div>
              </article>

              <article className="future-card service-selection-card">
                <p className="eyebrow">Continuity actions</p>
                <h3>See how often users save, restore, or resume Azure-backed reviews.</h3>
                <div className="section-stack" style={{ gap: 12 }}>
                  {telemetry.cloudActionBreakdown.length > 0 ? (
                    telemetry.cloudActionBreakdown.map((entry) => (
                      <div key={entry.key}>
                        <strong>{entry.label}</strong>
                        <p className="microcopy">{entry.count.toLocaleString()} events</p>
                      </div>
                    ))
                  ) : (
                    <p className="microcopy">No cloud continuity actions have been captured in this window yet.</p>
                  )}
                </div>
              </article>
            </div>

            <div className="section-head">
              <div>
                <p className="eyebrow">Daily rollup</p>
                <h2 className="section-title">Watch the funnel by day, not just as one total.</h2>
              </div>
            </div>

            <div className="traceability-grid">
              {telemetry.dailyRollup.length > 0 ? (
                telemetry.dailyRollup.map((entry) => (
                  <article className="trace-card" key={entry.date}>
                    <strong>{entry.date}</strong>
                    <p>{entry.totalEvents.toLocaleString()} total events</p>
                    <p className="microcopy">
                      Starts {entry.reviewStarts.toLocaleString()} · Creates {entry.reviewCreates.toLocaleString()} · Services {entry.servicesAdded.toLocaleString()} · Exports {entry.exports.toLocaleString()}
                    </p>
                  </article>
                ))
              ) : (
                <article className="trace-card">
                  <strong>No telemetry yet</strong>
                  <p>The daily rollup will populate after the first redesign events are recorded.</p>
                </article>
              )}
            </div>

            <div className="section-head">
              <div>
                <p className="eyebrow">Recent events</p>
                <h2 className="section-title">Latest recorded funnel signals from the protected summary route.</h2>
              </div>
            </div>

            <div className="service-selection-grid">
              {telemetry.recentEvents.length > 0 ? (
                telemetry.recentEvents.map((entry) => (
                  <article className="future-card service-selection-card" key={`${entry.occurredAt}-${entry.name}`}>
                    <p className="eyebrow">{entry.name}</p>
                    <h3>{entry.route}</h3>
                    <p className="microcopy">
                      {formatDate(entry.occurredAt)} · {entry.actor}
                    </p>
                    <div className="section-stack" style={{ gap: 8 }}>
                      {Object.entries(entry.properties).length > 0 ? (
                        Object.entries(entry.properties).map(([key, value]) => (
                          <p className="microcopy" key={`${entry.occurredAt}-${key}`}>
                            <strong>{key}</strong>: {value}
                          </p>
                        ))
                      ) : (
                        <p className="microcopy">No extra properties recorded for this event.</p>
                      )}
                    </div>
                  </article>
                ))
              ) : (
                <article className="future-card service-selection-card">
                  <p className="eyebrow">No recent events</p>
                  <p className="microcopy">Recent events will appear here as the redesigned workflow is used.</p>
                </article>
              )}
            </div>
          </>
        ) : null}

        {telemetryError ? (
          <section className="filter-card">
            <p className="eyebrow">Telemetry summary</p>
            <h3>The redesign telemetry summary could not be loaded.</h3>
            <p className="microcopy">{telemetryError}</p>
          </section>
        ) : null}
      </section>

      <section className="surface-panel board-stage-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Next admin prompts</p>
            <h2 className="section-title">These are the first internal questions this admin workspace is being built to answer.</h2>
            <p className="section-copy">
              Prompt execution is intentionally held back until the Azure MCP layer is connected and
              limited to safe read-only tools.
            </p>
          </div>
        </div>

        <div className="service-selection-grid">
          {SUGGESTED_ADMIN_PROMPTS.map((prompt) => (
            <article className="future-card service-selection-card" key={prompt}>
              <p className="eyebrow">Planned prompt</p>
              <h3>{prompt}</h3>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
