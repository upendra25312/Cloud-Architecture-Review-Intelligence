"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { runProjectReviewCopilot } from "@/lib/copilot";
import type { CopilotMode, CopilotResponse, ProjectReviewCopilotContext } from "@/types";

const COPILOT_MODES: Array<{
  value: CopilotMode;
  label: string;
  title: string;
  description: string;
  placeholder: string;
  prompts: string[];
}> = [
  {
    value: "project-review",
    label: "Project review",
    title: "Ask a scoped architecture or pre-sales question.",
    description:
      "Use the full review context to summarize blockers, pricing signals, export readiness, and cross-service tradeoffs.",
    placeholder:
      "Ask about regional blockers, pricing drivers, export readiness, or ask for a scoped summary of this review.",
    prompts: [
      "Summarize the biggest regional blockers across the selected services.",
      "Summarize pricing drivers and public retail pricing caveats for this review.",
      "Which selected services still need checklist decisions before export?",
      "What are the biggest decision risks still unresolved in this review?"
    ]
  },
  {
    value: "service-review",
    label: "Service review",
    title: "Ask for a service-by-service review.",
    description:
      "Get a service-centric answer that calls out region fit, pricing posture, checklist gaps, and notable findings per service.",
    placeholder:
      "Ask for a service-by-service breakdown, a specific service comparison, or the riskiest services in scope.",
    prompts: [
      "Which selected services look riskiest from a regional fit perspective, and why?",
      "Give me a service-by-service checkpoint on pricing caveats and sizing assumptions.",
      "Which services are closest to review-ready, and which still have the biggest checklist gaps?",
      "Compare the top service-specific blockers that would slow architecture sign-off."
    ]
  },
  {
    value: "leadership-summary",
    label: "Leadership summary",
    title: "Ask for an executive-ready brief.",
    description:
      "Generate a concise leadership view focused on recommendation, risk, commercial caveats, and next decisions.",
    placeholder:
      "Ask for an executive summary, top risks, commercial cautions, or the next leadership decisions needed.",
    prompts: [
      "Draft a leadership summary for this project review.",
      "What should leadership know before approving this architecture direction?",
      "Summarize the top commercial and regional risks in executive language.",
      "What are the next three decisions leadership should force to keep this review moving?"
    ]
  }
];

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-US");
}

function classifyRegionSignal(signal: string) {
  const normalized = signal.toLowerCase();

  if (
    normalized.includes("restricted") ||
    normalized.includes("unavailable") ||
    normalized.includes("not in feed")
  ) {
    return "blocker" as const;
  }

  if (
    normalized.includes("retiring") ||
    normalized.includes("preview") ||
    normalized.includes("early access")
  ) {
    return "caveat" as const;
  }

  return null;
}

function getModeDefinition(mode: CopilotMode) {
  return COPILOT_MODES.find((entry) => entry.value === mode) ?? COPILOT_MODES[0];
}

export function ProjectReviewCopilot({
  context
}: {
  context: ProjectReviewCopilotContext;
}) {
  const [mode, setMode] = useState<CopilotMode>("project-review");
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [response, setResponse] = useState<CopilotResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const modeDefinition = useMemo(() => getModeDefinition(mode), [mode]);

  const sourceList = useMemo(
    () =>
      context.sources.filter(
        (source, index, array) =>
          array.findIndex(
            (entry) =>
              entry.label === source.label &&
              (entry.url ?? "") === (source.url ?? "") &&
              (entry.note ?? "") === (source.note ?? "")
          ) === index
      ),
    [context.sources]
  );

  const regionalSignalSummary = useMemo(() => {
    const entries = context.services
      .map((service) => {
        const blockerSignals: string[] = [];
        const caveatSignals: string[] = [];

        service.regionFitSignals.forEach((signal) => {
          const classification = classifyRegionSignal(signal);

          if (classification === "blocker") {
            blockerSignals.push(signal);
          } else if (classification === "caveat") {
            caveatSignals.push(signal);
          }
        });

        return {
          serviceSlug: service.serviceSlug,
          serviceName: service.serviceName,
          blockerSignals,
          caveatSignals
        };
      })
      .filter((entry) => entry.blockerSignals.length > 0 || entry.caveatSignals.length > 0);

    return {
      blockerEntries: entries.filter((entry) => entry.blockerSignals.length > 0),
      caveatEntries: entries.filter(
        (entry) => entry.blockerSignals.length === 0 && entry.caveatSignals.length > 0
      )
    };
  }, [context.services]);

  async function submit(nextQuestion: string) {
    const trimmed = nextQuestion.trim();

    if (!trimmed) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const nextResponse = await runProjectReviewCopilot({
        question: trimmed,
        mode,
        context
      });

      setResponse(nextResponse);
      setSubmittedQuestion(trimmed);
      setQuestion(trimmed);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Unable to run the project review copilot."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="surface-panel board-stage-panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">Optional inside Step 3</p>
          <h2 className="section-title">Use CoPilot for a scoped summary, pricing explanation, or leadership-ready answer.</h2>
          <p className="section-copy">
            This copilot is grounded on the active project review, selected services, target regions,
            pricing summaries, and recorded notes. It is useful for summaries and rationale, but it
            does not know customer-specific discounts or data outside this review. When you save the
            active review to Azure after sign-in, the backend can restore this context automatically
            in later sessions.
          </p>
        </div>
      </div>

      <div className="copilot-layout">
        <article className="filter-card copilot-card">
          <div className="copilot-card-head">
            <div>
              <p className="eyebrow">Project review copilot</p>
              <h3>{modeDefinition.title}</h3>
            </div>
            <span className="chip">{context.services.length.toLocaleString()} services in scope</span>
          </div>

          <div className="section-stack" style={{ gap: 12 }}>
            <div>
              <p className="microcopy">{modeDefinition.description}</p>
            </div>
            <div className="chip-row">
              {COPILOT_MODES.map((entry) => (
                <button
                  key={entry.value}
                  type="button"
                  className="chip"
                  aria-pressed={mode === entry.value}
                  onClick={() => {
                    setMode(entry.value);
                    setResponse(null);
                    setError(null);
                  }}
                  disabled={loading}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>

          <form
            className="copilot-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submit(question);
            }}
          >
            <label className="copilot-label">
              <span className="microcopy">Question</span>
              <textarea
                className="field-textarea copilot-textarea"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={modeDefinition.placeholder}
              />
            </label>
            <p className="microcopy">
              Type a question first, or click one of the suggested prompts below to run the
              copilot.
            </p>
            <div className="button-row">
              <button type="submit" className="primary-button" disabled={loading || !question.trim()}>
                {loading ? "Generating..." : question.trim() ? "Ask copilot" : "Type a question first"}
              </button>
            </div>
          </form>

          <div className="copilot-suggestion-grid">
            {modeDefinition.prompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="copilot-suggestion"
                onClick={() => {
                  setQuestion(prompt);
                  void submit(prompt);
                }}
                disabled={loading}
              >
                {prompt}
              </button>
            ))}
          </div>
        </article>

        <article className="leadership-brief copilot-brief">
          <p className="eyebrow">Grounding scope</p>
          <h2 className="leadership-title">The answer stays inside this project review.</h2>
          <div className="leadership-list">
            <article>
              <strong>Services</strong>
              <p>{context.services.map((service) => service.serviceName).join(", ") || "None selected"}</p>
            </article>
            <article>
              <strong>Target regions</strong>
              <p>{context.review.targetRegions.join(", ") || "Not captured yet"}</p>
            </article>
            <article>
              <strong>Reviewed findings carried in</strong>
              <p>{context.findings.length.toLocaleString()} finding notes and decisions.</p>
            </article>
          </div>
        </article>
      </div>

      {response ? (
        <>
          {regionalSignalSummary.blockerEntries.length > 0 || regionalSignalSummary.caveatEntries.length > 0 ? (
            <article className="filter-card copilot-signal-card">
              <div className="copilot-card-head">
                <div>
                  <p className="eyebrow">Regional blockers detected</p>
                  <h3>
                    {regionalSignalSummary.blockerEntries.length.toLocaleString()} service
                    {regionalSignalSummary.blockerEntries.length === 1 ? "" : "s"} with blockers
                    {regionalSignalSummary.caveatEntries.length > 0
                      ? `, ${regionalSignalSummary.caveatEntries.length.toLocaleString()} with caveats`
                      : ""}
                  </h3>
                </div>
                <span className="chip">
                  {context.review.targetRegions.join(", ") || "Target regions not captured yet"}
                </span>
              </div>
              <div className="copilot-signal-grid">
                {regionalSignalSummary.blockerEntries.length > 0 ? (
                  <article className="trace-card">
                    <strong>Blockers</strong>
                    <div className="copilot-signal-list">
                      {regionalSignalSummary.blockerEntries.map((entry) => (
                        <div className="copilot-signal-entry" key={`blocker-${entry.serviceName}`}>
                          <p>
                            <strong>{entry.serviceName}:</strong> {entry.blockerSignals.join(", ")}
                          </p>
                          <Link href={`/services/${entry.serviceSlug}`} className="muted-link">
                            Open service review
                          </Link>
                        </div>
                      ))}
                    </div>
                  </article>
                ) : null}
                {regionalSignalSummary.caveatEntries.length > 0 ? (
                  <article className="trace-card">
                    <strong>Caveats</strong>
                    <div className="copilot-signal-list">
                      {regionalSignalSummary.caveatEntries.map((entry) => (
                        <div className="copilot-signal-entry" key={`caveat-${entry.serviceName}`}>
                          <p>
                            <strong>{entry.serviceName}:</strong> {entry.caveatSignals.join(", ")}
                          </p>
                          <Link href={`/services/${entry.serviceSlug}`} className="muted-link">
                            Open service review
                          </Link>
                        </div>
                      ))}
                    </div>
                  </article>
                ) : null}
              </div>
            </article>
          ) : null}

          <article className="filter-card copilot-card">
            <div className="copilot-card-head">
              <div>
                <p className="eyebrow">Latest answer</p>
                <h3>{submittedQuestion}</h3>
              </div>
              <span className="chip">
                {response.modelName} via {response.modelDeployment}
              </span>
            </div>
            <div className="copilot-answer">{response.answer}</div>
            <div className="traceability-grid">
              <article className="trace-card">
                <strong>Mode</strong>
                <p>{getModeDefinition(response.mode).label}</p>
              </article>
              <article className="trace-card">
                <strong>Generated</strong>
                <p>{formatDate(response.generatedAt)}</p>
              </article>
              <article className="trace-card">
                <strong>Grounding mode</strong>
                <p>{response.groundingMode}</p>
              </article>
            </div>
            <div className="copilot-source-list">
              {(response.sources.length > 0 ? response.sources : sourceList).map((source) => (
                <article className="trace-card" key={`${source.label}-${source.url ?? source.note ?? ""}`}>
                  <strong>{source.label}</strong>
                  <p>
                    {source.url ? (
                      <a href={source.url} target="_blank" rel="noreferrer" className="muted-link">
                        {source.url}
                      </a>
                    ) : (
                      source.note ?? "Local project review context"
                    )}
                  </p>
                </article>
              ))}
            </div>
          </article>
        </>
      ) : null}

      {error ? (
        <section className="filter-card">
          <p className="eyebrow">Copilot</p>
          <h3>The project review copilot could not answer right now.</h3>
          <p className="microcopy">{error}</p>
        </section>
      ) : null}
    </section>
  );
}
