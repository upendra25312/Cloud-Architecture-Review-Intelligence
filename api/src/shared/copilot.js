const { DefaultAzureCredential } = require("@azure/identity");

const DEFAULT_API_VERSION = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";
const DEFAULT_MODEL_NAME = process.env.AZURE_OPENAI_MODEL_NAME || "gpt-4.1-mini";

let _copilotCred = null;
function getCopilotCredential() {
  if (!_copilotCred) _copilotCred = new DefaultAzureCredential();
  return _copilotCred;
}
async function getCopilotToken() {
  const token = await getCopilotCredential().getToken("https://cognitiveservices.azure.com/.default");
  return token.token;
}

function trimTrailingSlash(value) {
  return String(value ?? "").replace(/\/+$/, "");
}

function getCopilotConfiguration() {
  const endpoint = trimTrailingSlash(process.env.AZURE_OPENAI_ENDPOINT);
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;

  return {
    configured: Boolean(endpoint && deployment),
    endpoint,
    deployment,
    apiVersion: DEFAULT_API_VERSION,
    modelName: DEFAULT_MODEL_NAME
  };
}

function toVisibleEndpoint(value) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return value;
  }
}

function truncate(value, maxLength) {
  const text = String(value ?? "").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function sanitizeSources(sources) {
  return (Array.isArray(sources) ? sources : [])
    .slice(0, 8)
    .map((source) => ({
      label: truncate(source?.label ?? "Project review source", 120),
      url: source?.url ? truncate(source.url, 400) : undefined,
      note: source?.note ? truncate(source.note, 280) : undefined
    }));
}

function sanitizeServices(services) {
  return (Array.isArray(services) ? services : [])
    .slice(0, 40)
    .map((service) => ({
      serviceSlug: truncate(service?.serviceSlug ?? "", 80),
      serviceName: truncate(service?.serviceName ?? "Unknown service", 120),
      description: truncate(service?.description ?? "", 220),
      plannedRegion: truncate(service?.plannedRegion ?? "", 80),
      preferredSku: truncate(service?.preferredSku ?? "", 120),
      sizingNote: truncate(service?.sizingNote ?? "", 180),
      itemCount: Number(service?.itemCount ?? 0),
      includedCount: Number(service?.includedCount ?? 0),
      notApplicableCount: Number(service?.notApplicableCount ?? 0),
      excludedCount: Number(service?.excludedCount ?? 0),
      pendingCount: Number(service?.pendingCount ?? 0),
      regionFitSummary: truncate(service?.regionFitSummary ?? "", 260),
      regionFitSignals: (Array.isArray(service?.regionFitSignals) ? service.regionFitSignals : [])
        .slice(0, 8)
        .map((entry) => truncate(entry, 120)),
      costFitSummary: truncate(service?.costFitSummary ?? "", 260),
      costFitSignals: (Array.isArray(service?.costFitSignals) ? service.costFitSignals : [])
        .slice(0, 8)
        .map((entry) => truncate(entry, 120))
    }));
}

function sanitizeFindings(findings) {
  return (Array.isArray(findings) ? findings : [])
    .slice(0, 40)
    .map((finding) => ({
      guid: truncate(finding?.guid ?? "", 80),
      serviceName: truncate(finding?.serviceName ?? "Unknown service", 120),
      finding: truncate(finding?.finding ?? "", 260),
      severity: finding?.severity ?? undefined,
      decision: truncate(finding?.decision ?? "Needs Review", 40),
      comments: truncate(finding?.comments ?? "", 260),
      owner: truncate(finding?.owner ?? "", 80),
      dueDate: truncate(finding?.dueDate ?? "", 40)
    }));
}

function sanitizeCopilotContext(context) {
  return {
    review: {
      id: truncate(context?.review?.id ?? "", 80),
      name: truncate(context?.review?.name ?? "Project review", 120),
      audience: truncate(context?.review?.audience ?? "Unknown audience", 60),
      businessScope: truncate(context?.review?.businessScope ?? "", 400),
      targetRegions: (Array.isArray(context?.review?.targetRegions)
        ? context.review.targetRegions
        : []
      )
        .slice(0, 12)
        .map((region) => truncate(region, 80))
    },
    services: sanitizeServices(context?.services),
    findings: sanitizeFindings(context?.findings),
    sources: sanitizeSources(context?.sources)
  };
}

function buildModePrompt(mode) {
  switch (mode) {
    case "service-review":
      return {
        system:
          "You are the Azure Checklists service review copilot. Answer only from the supplied project review context and source list. Organize the answer around the specific services implicated by the question. For each relevant service, call out regional blockers or caveats, pricing or sizing caveats, checklist readiness, and notable findings. Do not invent Azure pricing, region availability, contract discounts, checklist decisions, or service dependencies. If the context is insufficient, say so clearly.",
        instructions: [
          "Structure the answer service by service when multiple services are relevant.",
          "For each relevant service, use the exact region-fit and cost-fit signals supplied in the context.",
          "Call out pending checklist decisions or unresolved findings that would block service sign-off.",
          "If the question names a service that is not in the supplied review, say that clearly."
        ]
      };
    case "leadership-summary":
      return {
        system:
          "You are the Azure Checklists leadership summary copilot. Answer only from the supplied project review context and source list. Write for senior decision-makers who need a concise recommendation, top risks, commercial caveats, and the next decisions required. Do not invent Azure pricing, region availability, contract discounts, checklist decisions, or service dependencies. If the context is insufficient, say so clearly.",
        instructions: [
          "Lead with the overall recommendation or decision posture.",
          "Summarize the most material regional, commercial, and execution risks in plain language.",
          "Keep the answer concise and executive-friendly, avoiding unnecessary low-level detail.",
          "End with concrete next decisions or actions when the context supports them."
        ]
      };
    case "project-review":
    default:
      return {
        system:
          "You are the Azure Checklists project review copilot. Answer only from the supplied project review context and source list. Do not invent Azure pricing, region availability, contract discounts, checklist decisions, or service dependencies. If the context is insufficient, say so clearly. Keep the answer concise, decision-oriented, and useful for architects, pre-sales teams, cloud engineers, and leadership readers when relevant. Prefer short sections and bullets only when helpful. Treat explicit region-fit signals such as Restricted, Restricted region, Early access, Preview, Retiring, Unavailable, and Not in feed as blockers or caveats, not as full regional coverage. Do not translate 'accounted for' into 'available/open/GA' unless the region-fit signals actually say Available or Global service.",
        instructions: [
          "Use only the provided project review data and listed sources.",
          "Call out regional restrictions, pricing caveats, and pending checklist decisions when they matter.",
          "When a service has region-fit signals, rely on those exact signal labels before summarizing availability.",
          "Mention uncertainty explicitly if the supplied context does not answer part of the question."
        ]
      };
  }
}

function buildCopilotMessages(question, context, mode) {
  const prompt = buildModePrompt(mode);

  return [
    {
      role: "system",
      content: prompt.system
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          mode,
          task: question,
          instructions: prompt.instructions,
          projectReview: context
        },
        null,
        2
      )
    }
  ];
}

async function runCopilot(question, context, options = {}) {
  const configuration = getCopilotConfiguration();

  if (!configuration.configured) {
    throw new Error(
      "Azure OpenAI copilot settings are not configured on the dedicated Function App."
    );
  }

  const sanitizedQuestion = truncate(question, 1200);
  const sanitizedContext = sanitizeCopilotContext(context);
  const mode =
    options.mode === "service-review" || options.mode === "leadership-summary"
      ? options.mode
      : "project-review";

  // Hard timeout so a slow/unreachable Azure OpenAI endpoint never causes the
  // calling function to hang indefinitely and hit SWA's proxy timeout ceiling.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  let response;
  try {
    response = await fetch(
      `${configuration.endpoint}/openai/deployments/${configuration.deployment}/chat/completions?api-version=${configuration.apiVersion}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${await getCopilotToken()}`
        },
        body: JSON.stringify({
          messages: buildCopilotMessages(sanitizedQuestion, sanitizedContext, mode),
          temperature: 0.2,
          max_tokens: 900
        }),
        signal: controller.signal
      }
    );
  } catch (fetchErr) {
    clearTimeout(timer);
    const isAbort = fetchErr && fetchErr.name === "AbortError";
    throw new Error(isAbort ? "Azure OpenAI copilot request timed out after 30s." : String(fetchErr.message ?? fetchErr));
  }
  clearTimeout(timer);

  if (!response.ok) {
    const errorBody = await response.text();

    throw new Error(
      errorBody || `Azure OpenAI request failed with status ${response.status}.`
    );
  }

  const payload = await response.json();
  const answer = payload?.choices?.[0]?.message?.content;

  if (typeof answer !== "string" || !answer.trim()) {
    throw new Error("Azure OpenAI returned an empty copilot answer.");
  }

  return {
    answer: answer.trim(),
    generatedAt: new Date().toISOString(),
    modelName: configuration.modelName,
    modelDeployment: configuration.deployment,
    mode,
    groundingMode: options.groundingMode ?? "project-review-context",
    sources: sanitizedContext.sources
  };
}

module.exports = {
  getCopilotConfiguration,
  runCopilot,
  toVisibleEndpoint
};
