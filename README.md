# Cloud Architecture Review Intelligence

> Enterprise-grade AI-powered architecture review platform for Azure and hybrid cloud environments.

[![Frontend: Next.js](https://img.shields.io/badge/frontend-Next.js%2016-000000?logo=nextdotjs)](./frontend)
[![Backend: Azure Functions](https://img.shields.io/badge/backend-Azure%20Functions-0062AD?logo=microsoftazure)](./api)
[![Infrastructure: Azure](https://img.shields.io/badge/infrastructure-Azure%20IaC-0078D4?logo=microsoftazure)](./infrastructure)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933?logo=nodedotjs)](https://nodejs.org/)

Cloud Architecture Review Intelligence is a professional solution accelerator for organizations that need to assess cloud architectures with greater **speed**, **consistency**, and **governance rigor**. It combines **Azure-native application architecture**, **AI-assisted review workflows**, **document intelligence**, and **deterministic validation patterns** to support architecture review boards, cloud centers of excellence, platform engineering teams, and enterprise solution architects.

This README has been positioned in a **Microsoft-style enterprise architecture format** because that is the most appropriate approach for this repository: it communicates strategic value, technical credibility, implementation clarity, and operational maturity for engineering teams, enterprise stakeholders, and pre-sales conversations.

## Table of Contents
- [Executive summary](#executive-summary)
- [Business value](#business-value)
- [What the platform does](#what-the-platform-does)
- [Core capabilities](#core-capabilities)
- [Reference architecture](#reference-architecture)
- [Repository structure](#repository-structure)
- [Technology stack](#technology-stack)
- [Deployment model](#deployment-model)
- [Getting started](#getting-started)
- [Configuration and security](#configuration-and-security)
- [Testing and validation](#testing-and-validation)
- [Documentation](#documentation)
- [Target users and scenarios](#target-users-and-scenarios)
- [Roadmap direction](#roadmap-direction)
- [Contributing](#contributing)
- [License](#license)

## Executive summary

Enterprise architecture reviews are often constrained by manual assessment processes, fragmented evidence, and inconsistent interpretation across reviewers. Cloud Architecture Review Intelligence addresses those challenges by providing a structured review platform that helps teams evaluate architecture submissions using a combination of:

- **AI-assisted reasoning** for contextual review and guided assessment
- **Evidence-grounded workflows** for better traceability and defensibility
- **Deterministic rules and scoring patterns** for review consistency
- **Azure-native deployment architecture** for security, scalability, and operational readiness

The result is a platform that can help reduce review cycle time, improve quality of decision-making, and strengthen governance outcomes across Azure and hybrid cloud environments.

## Business value

From an enterprise architecture, governance, and pre-sales perspective, this solution is valuable because it helps organizations:

- accelerate architecture review board processes
- improve consistency of technical and governance decisions
- reduce dependency on purely manual document review
- create reusable review standards and architecture rubrics
- support advisory, modernization, migration, and readiness assessment engagements
- operationalize architecture review as a scalable digital capability rather than an ad hoc meeting process

## What the platform does

Based on the current repository structure and documentation, the platform supports an end-to-end architecture review workflow that includes:

- intake of architecture inputs and supporting artifacts
- review orchestration through backend services
- document extraction and evidence analysis
- AI-supported architecture assessment
- structured findings, severity indicators, and scorecards
- web-based presentation of results and review experiences
- Azure-native deployment and observability patterns

The repository includes a **Next.js frontend**, an **Azure Functions API layer**, and **infrastructure assets** for Azure deployment. The technical design documentation also defines a target architecture centered on **Azure AI Foundry Agents API**, **Azure AI Search**, **Document Intelligence**, **Key Vault**, **Storage**, and **Application Insights**.

## Core capabilities

### AI-assisted architecture assessment
- Supports architecture review workflows enhanced by Azure AI capabilities
- Designed to evolve toward agent-driven orchestration using Azure AI Foundry Agents API
- Intended to support contextual interpretation of review evidence, not just static checklist execution

### Deterministic governance validation
- Uses structured rule-based validation alongside AI-assisted analysis
- Supports more consistent and defensible review outputs
- Documentation references rule coverage across WAF, CAF, and internal review guidance

### Evidence extraction and grounding
- Uses document-processing patterns to analyze review artifacts
- Incorporates retrieval-oriented patterns to ground outputs in relevant evidence and guidance
- Supports more traceable architecture findings and review recommendations

### Structured findings and scorecards
- Produces output formats suitable for architecture review boards and enterprise stakeholders
- Supports communication of findings, scoring, risk indicators, and review outcomes
- Helps standardize how architecture quality and readiness are presented

### Azure-native operational model
- Backend execution through Azure Functions
- Frontend delivery aligned with Azure Static Web Apps patterns
- Security and operations aligned to enterprise Azure deployment expectations

## Reference architecture

At a high level, the solution is organized into four layers:

### 1. Experience layer
A modern web experience implemented with Next.js and React for architecture review workflows, operational views, and stakeholder-facing scorecards.

### 2. Application layer
Azure Functions-based services that handle orchestration, review processing, data handling, integration, and supporting business logic.

### 3. AI and knowledge layer
Azure AI capabilities for document extraction, knowledge retrieval, embeddings, and AI-assisted reasoning. Repository documentation describes a target-state pattern using **Azure AI Foundry Agents API** for review execution.

### 4. Platform and operations layer
Infrastructure-as-code, security configuration, storage services, observability, and environment setup for enterprise deployment.

The detailed architecture planning document in [`docs/arb-foundry-agents-solution-plan.md`](./docs/arb-foundry-agents-solution-plan.md) outlines a target architecture that includes:

- Azure Static Web Apps
- Azure Functions
- Azure AI Foundry Hub and Project
- Azure AI Foundry Agents API
- Azure AI Search
- Azure Storage
- Azure Key Vault
- Document Intelligence
- Application Insights and Log Analytics

## Repository structure

```text
Cloud-Architecture-Review-Intelligence/
├── .github/             # GitHub workflows and repository configuration
├── api/                 # Azure Functions backend and shared review services
├── docs/                # Solution plans, architecture guidance, and validation guides
├── frontend/            # Next.js frontend, tooling, and test assets
├── infrastructure/      # Infrastructure-as-code assets for Azure deployment
└── README.md            # Repository overview
```

## Technology stack

### Frontend
- **Next.js 16**
- **React 19**
- TypeScript-based configuration

### Backend
- **Azure Functions v4**
- **Node.js 20+**
- Azure SDKs for identity, storage, tables, and document processing

### AI and Azure services
- **Azure AI Foundry / agents-oriented design**
- **Azure AI Search**
- **Azure Document Intelligence / Form Recognizer**
- **Azure Storage**
- **Azure Key Vault**
- **Application Insights**

### Quality and engineering
- **Vitest** for unit testing
- **Playwright** for end-to-end, accessibility, and visual validation
- Native Node test execution for API workflows

## Deployment model

The current documentation indicates an enterprise Azure deployment model with the following logical topology:

- **Frontend** hosted using Azure Static Web Apps or equivalent web hosting pattern
- **Backend APIs** hosted as Azure Functions
- **AI orchestration and knowledge services** delivered through Azure AI services
- **Storage and secret management** handled through Azure Storage and Azure Key Vault
- **Observability** implemented with Application Insights and Log Analytics

The architecture plan in [`docs/arb-foundry-agents-solution-plan.md`](./docs/arb-foundry-agents-solution-plan.md) also emphasizes:
- managed identity-based access patterns
- Key Vault-backed secret handling
- low-cost, scalable Azure-native deployment choices
- clear separation between frontend, API, AI, and operational services

## Getting started

### Prerequisites
- **Node.js 20 or later**
- **npm**
- An **Azure subscription** for cloud deployment and service integration
- Access to required Azure resources for full end-to-end execution

### Clone the repository

```bash
git clone https://github.com/upendra25312/Cloud-Architecture-Review-Intelligence.git
cd Cloud-Architecture-Review-Intelligence
```

### Install dependencies

Frontend:

```bash
cd frontend
npm install
```

API:

```bash
cd ../api
npm install
```

### Run the frontend locally

```bash
cd frontend
npm run dev
```

### Run backend tests

```bash
cd api
npm test
```

## Configuration and security

The API project includes a sample local settings file:
- [`api/local.settings.sample.json`](./api/local.settings.sample.json)

Recommended practices for professional deployment:
- never store secrets in source control
- use environment variables and Azure Key Vault for secret management
- use managed identities wherever possible
- separate local, integration, test, and production environments
- document environment variables and service dependencies clearly

The solution planning documentation strongly indicates an enterprise security posture based on **Key Vault**, **managed identity**, and **Azure-native access controls**.

## Testing and validation

The repository includes strong signals of a professional validation approach.

### Frontend testing
From the `frontend` directory:

```bash
npm run test:unit
npm run test:e2e
npm run test:e2e:a11y
npm run test:e2e:visual
```

### API testing
From the `api` directory:

```bash
npm test
```

The available scripts indicate support for:
- unit testing
- accessibility validation
- visual regression validation
- end-to-end workflow validation
- evaluation-oriented test execution for review scenarios

## Documentation

Primary documentation is available in:
- [`docs/`](./docs)
- Wiki: https://github.com/upendra25312/Cloud-Architecture-Review-Intelligence/wiki
- Public site reference: https://red-coast-0b2d8700f.7.azurestaticapps.net/arb

Recommended reading order:
1. Review this README for the solution overview
2. Read [`docs/arb-foundry-agents-solution-plan.md`](./docs/arb-foundry-agents-solution-plan.md)
3. Read [`docs/arb-implementation-test-validation-guide.md`](./docs/arb-implementation-test-validation-guide.md)
4. Explore the `frontend/`, `api/`, and `infrastructure/` directories for implementation detail
5. Use the wiki for extended project context where available

## Target users and scenarios

### Primary users
- cloud architecture review boards
- cloud centers of excellence
- enterprise and solution architects
- platform engineering teams
- governance and risk stakeholders
- pre-sales and advisory architecture teams

### Representative scenarios
- architecture review board modernization
- workload readiness and governance assessments
- migration and modernization design reviews
- AI-assisted pre-sales architecture evaluation
- scalable architecture quality assurance for enterprise delivery teams

## Roadmap direction

Based on the current repository documentation, the likely roadmap direction includes:

- deeper Azure AI Foundry agent integration
- more mature evidence-grounded review workflows
- stronger governance scoring and findings presentation
- broader automation across review execution and validation
- enterprise-ready deployment, observability, and operational patterns

## Contributing

Contributions are welcome where they improve:
- architecture quality
- governance rules and review rubrics
- frontend usability and experience
- backend reliability and observability
- infrastructure automation
- documentation clarity and onboarding experience
- test coverage and validation depth

Recommended contribution workflow:
1. create a focused branch
2. make clearly scoped changes
3. validate through the appropriate test path
4. document assumptions and outcomes
5. open a pull request with a concise business and technical summary

## License

No license file is currently present in the repository. If this project is intended for reuse, collaboration, or external sharing, adding an explicit license is strongly recommended.
