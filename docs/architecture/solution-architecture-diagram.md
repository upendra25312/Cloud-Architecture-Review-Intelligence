# Solution Architecture Diagram

This document provides the primary architecture diagram for Cloud Architecture Review Intelligence.

The diagram is based on:
- the repository codebase and structure
- the current Azure resource inventory shared for the deployed environment
- the solution planning documents in `docs/`
- the documented target-state direction toward Azure AI Foundry agent orchestration

## Current-state and target-state architecture

```mermaid
flowchart TB
    User[Architecture Reviewer / Architect / ARB User]
    Browser[Browser]
    SWA[Azure Static Web App\nswa-arb-review-prod\nNext.js frontend]
    FUNC[Azure Function App\nfunc-arb-review-api]
    PLAN[App Service Plan\nasp-arb-review-prod]
    STORAGE[Azure Storage\nstarbrevprod01\nfiles / state / review artifacts]
    KV[Azure Key Vault\nkv-arb-review-prod]
    AI[Azure AI Foundry\nai-arb-review-prod]
    HUB[Azure AI Hub\nhub-arb-review-prod]
    PROJ[Azure AI Project\nproj-arb-review-prod]
    FPROJ[Foundry Project\narb-review-proj]
    SEARCH[Azure AI Search\nsrch-arb-review-prod]
    DOCINT[Azure Document Intelligence\ndi-arb-review-prod]
    VISION[Azure Computer Vision\nvision-arb-review-prod]
    APPI[Application Insights\nappi-arb-review-prod]
    LAW[Log Analytics\nlaw-arb-review-prod]
    ALERTS[Metric Alerts / Smart Detector Alerts]
    AG[Action Group\nag-arb-review-prod]
    USERSUB[Architecture documents / review evidence]
    KNOWLEDGE[Architecture guidance / rubrics / review knowledge]
    TARGET[Target-state\nAzure AI Foundry Agents API orchestration]

    User --> Browser --> SWA
    SWA --> FUNC
    PLAN -. hosts .-> FUNC

    USERSUB --> SWA
    SWA -->|upload / submit review| FUNC

    FUNC --> STORAGE
    FUNC --> KV
    FUNC --> AI
    FUNC --> PROJ
    FUNC --> SEARCH
    FUNC --> DOCINT
    FUNC --> VISION

    HUB --> PROJ
    AI --> FPROJ
    PROJ --> TARGET
    FPROJ --> TARGET

    KNOWLEDGE --> SEARCH
    KNOWLEDGE --> TARGET

    DOCINT -->|extracted text / structure| FUNC
    VISION -->|visual analysis signals| FUNC
    SEARCH -->|retrieval / grounding| FUNC
    STORAGE -->|review data / artifacts| FUNC
    KV -->|secrets / config| FUNC

    FUNC -->|findings / scorecards / status| SWA
    SWA --> Browser --> User

    FUNC --> APPI
    APPI --> LAW
    APPI --> ALERTS
    ALERTS --> AG
```

## Diagram interpretation

### Experience layer
- **Azure Static Web App (`swa-arb-review-prod`)** hosts the Next.js frontend.
- Users interact with the system through browser-based architecture review workflows.

### Application and orchestration layer
- **Azure Function App (`func-arb-review-api`)** handles API orchestration, review processing, integrations, and business logic.
- **App Service Plan (`asp-arb-review-prod`)** provides the hosting plan context for the function app.

### AI, search, and document intelligence layer
- **Azure AI Foundry (`ai-arb-review-prod`)**, **Azure AI Hub (`hub-arb-review-prod`)**, and **Azure AI Projects (`proj-arb-review-prod`, `arb-review-proj`)** represent the AI platform foundation.
- **Azure AI Search (`srch-arb-review-prod`)** supports retrieval and evidence grounding.
- **Azure Document Intelligence (`di-arb-review-prod`)** supports structured extraction from uploaded review documents.
- **Azure Computer Vision (`vision-arb-review-prod`)** supports visual analysis scenarios where needed.
- The architecture is evolving toward a deeper **Azure AI Foundry Agents API** pattern for richer review orchestration.

### Data, security, and operations layer
- **Azure Storage (`starbrevprod01`)** stores documents, state, and review-related artifacts.
- **Azure Key Vault (`kv-arb-review-prod`)** secures secrets and configuration.
- **Application Insights (`appi-arb-review-prod`)** and **Log Analytics (`law-arb-review-prod`)** provide observability.
- **Metric Alerts**, **Smart Detector Alerts**, and **Action Groups (`ag-arb-review-prod`)** provide operational monitoring and response capability.

## Current-state vs target-state note

This diagram is intentionally designed to show both:
- the **current deployed Azure platform**, and
- the **target-state evolution** toward agent-first orchestration.

That is the most accurate representation of the solution based on the repository, deployed resource inventory, and planning documents.
