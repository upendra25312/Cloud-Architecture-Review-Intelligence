# Cloud Architecture Review Intelligence

> AI-powered architecture review platform for Azure and hybrid cloud environments, combining deterministic governance controls, document intelligence, and Azure AI Foundry agents to accelerate architecture assessments.

[![Frontend: Next.js](https://img.shields.io/badge/frontend-Next.js%2016-000000?logo=nextdotjs)](./frontend)
[![Backend: Azure Functions](https://img.shields.io/badge/backend-Azure%20Functions-0062AD?logo=microsoftazure)](./api)
[![Infrastructure: Terraform%20%26%20Bicep-ready](https://img.shields.io/badge/infrastructure-Azure%20IaC-0078D4?logo=microsoftazure)](./infrastructure)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933?logo=nodedotjs)](https://nodejs.org/)

Cloud Architecture Review Intelligence is a production-oriented solution for reviewing enterprise cloud architectures with a focus on **architecture governance**, **evidence-based assessment**, and **AI-assisted decision support**. The platform is designed for architecture review boards, cloud center-of-excellence teams, solution architects, pre-sales architects, and engineering leadership who need faster, more consistent, and more defensible cloud reviews.

It brings together:
- **Azure AI Foundry / agent-driven review workflows** for contextual analysis
- **Deterministic rules** aligned to cloud governance and architecture guardrails
- **Document intelligence and search** for extracting and evaluating architecture evidence
- **Modern web UX** for review operations, scorecards, and findings presentation
- **Azure-native deployment patterns** for secure, scalable implementation

## Table of Contents
- [Why this repository exists](#why-this-repository-exists)
- [What the platform does](#what-the-platform-does)
- [Key capabilities](#key-capabilities)
- [Solution architecture](#solution-architecture)
- [Repository structure](#repository-structure)
- [Technology stack](#technology-stack)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Testing and validation](#testing-and-validation)
- [Documentation and wiki](#documentation-and-wiki)
- [Use cases](#use-cases)
- [Roadmap direction](#roadmap-direction)
- [Contributing](#contributing)
- [License](#license)

## Why this repository exists

Enterprise architecture reviews are often slow, inconsistent, and overly dependent on manual interpretation of documents, standards, and cloud platform guidance. This repository addresses that problem by providing a structured review platform that helps teams:

- reduce review cycle time
- improve consistency across reviewers and review boards
- ground recommendations in documented evidence
- combine AI reasoning with deterministic policy and architecture checks
- create a stronger operating model for Azure and hybrid cloud governance

## What the platform does

Cloud Architecture Review Intelligence supports an end-to-end review workflow for architecture assessment scenarios, including:

- ingesting architecture inputs and supporting documents
- extracting relevant evidence from uploaded material
- evaluating workloads against architecture rules and review criteria
- generating findings, observations, and scorecards
- presenting outputs through a modern web application
- supporting repeatable review operations using Azure-native services

Based on the repository structure and implementation assets, the solution includes a **Next.js frontend**, an **Azure Functions API layer**, and **infrastructure-as-code assets** for Azure deployment. The documentation also outlines an evolution toward **Azure AI Foundry Agents API** as the primary AI orchestration model.

## Key capabilities

### 1. AI-assisted architecture review
- Uses Azure AI services to support architecture analysis workflows
- Designed for agent-based review patterns using Azure AI Foundry
- Enables contextual, evidence-aware assessment rather than static checklist review alone

### 2. Deterministic governance controls
- Supports rule-based validation aligned to cloud architecture expectations
- Intended to blend AI-generated analysis with deterministic checks for stronger review defensibility
- Documentation references rules coverage across WAF, CAF, and internal review guidance

### 3. Evidence extraction and knowledge retrieval
- Uses document-processing patterns to extract insights from uploaded review artifacts
- Incorporates search and knowledge retrieval patterns to ground review outputs in source content
- Designed to reduce hallucination risk by anchoring outputs to review evidence and curated guidance

### 4. Review scorecards and findings
- Produces structured review outputs such as findings, severity indicators, and scorecards
- Supports communicating architecture risk and readiness in a format suitable for stakeholders and governance boards

### 5. Azure-native deployment model
- Uses Azure Functions for API execution
- Uses a modern frontend suitable for deployment via Azure Static Web Apps
- Includes infrastructure assets for repeatable provisioning and enterprise deployment patterns

## Solution architecture

At a high level, the solution is organized into four layers:

1. **Experience layer**  
   A Next.js-based frontend for review workflows, administration experiences, and presentation of findings.

2. **Application/API layer**  
   Azure Functions-based backend endpoints responsible for orchestration, review execution, integration, and persistence workflows.

3. **AI and knowledge layer**  
   Azure AI capabilities for document extraction, search, embeddings, and agent-driven reasoning.

4. **Infrastructure and operations layer**  
   Azure infrastructure definitions, environment configuration, observability, and deployment patterns.

The detailed planning documentation in [`docs/arb-foundry-agents-solution-plan.md`](./docs/arb-foundry-agents-solution-plan.md) describes a target architecture that includes:
- Azure Static Web Apps
- Azure Functions
- Azure AI Foundry Project / Agents API
- Azure AI Search
- Azure Storage
- Azure Key Vault
- Application Insights and Log Analytics
- Document Intelligence

## Repository structure

```text
Cloud-Architecture-Review-Intelligence/
├── api/                 # Azure Functions backend and shared review services
├── docs/                # Architecture plans, implementation guidance, and supporting documentation
├── frontend/            # Next.js application and test assets
├── infrastructure/      # Infrastructure-as-code assets for Azure deployment
├── .github/             # GitHub workflows and repository configuration
└── README.md            # Repository overview
```

## Technology stack

### Frontend
- **Next.js 16**
- **React 19**
- TypeScript-based configuration and testing setup

### Backend
- **Azure Functions v4**
- **Node.js 20+**
- Azure SDKs for identity, storage, tables, and document processing

### AI and cloud services
- **Azure AI Foundry / Agents-oriented architecture**
- **Azure AI Search**
- **Azure Document Intelligence / Form Recognizer**
- **Azure Storage**
- **Azure Key Vault**
- **Application Insights**

### Testing and quality
- **Vitest** for unit testing
- **Playwright** for end-to-end, accessibility, and visual validation
- Node native test execution for API test workflows

## Getting started

### Prerequisites
- **Node.js 20 or later**
- **npm**
- An **Azure subscription** for deploying cloud resources
- Access to any required Azure AI, Search, Storage, and Functions services for full end-to-end execution

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

### Run API tests

```bash
cd api
npm test
```

## Configuration

The API project includes a sample configuration file:
- [`api/local.settings.sample.json`](./api/local.settings.sample.json)

You should use this as the starting point for local configuration and secret management.

Recommended configuration practices:
- keep secrets out of source control
- use environment variables or Azure Key Vault-backed configuration
- separate local, test, and production environments
- use managed identity where possible in Azure-hosted deployments

## Deployment

This repository is structured for Azure-native deployment scenarios.

### Likely deployment topology
- **Frontend** deployed via Azure Static Web Apps or equivalent hosting for Next.js
- **API** deployed as Azure Functions
- **Infrastructure** provisioned through assets under [`infrastructure/`](./infrastructure)
- **Observability and security** handled through Azure-native services such as Application Insights and Key Vault

For broader implementation and solution-planning guidance, review:
- [`docs/arb-foundry-agents-solution-plan.md`](./docs/arb-foundry-agents-solution-plan.md)
- [`docs/arb-implementation-test-validation-guide.md`](./docs/arb-implementation-test-validation-guide.md)

## Testing and validation

The repository contains quality and validation patterns suitable for professional engineering workflows.

### Frontend tests
From the `frontend` directory:

```bash
npm run test:unit
npm run test:e2e
npm run test:e2e:a11y
npm run test:e2e:visual
```

### API tests
From the `api` directory:

```bash
npm test
```

The frontend package scripts also indicate support for:
- accessibility validation
- visual regression validation
- targeted end-to-end review flows
- evaluation-oriented fixture generation and test execution

## Documentation and wiki

Primary repository documentation is available in:
- [`docs/`](./docs)
- Repository Wiki: https://github.com/upendra25312/Cloud-Architecture-Review-Intelligence/wiki
- Public experience/site reference: https://red-coast-0b2d8700f.7.azurestaticapps.net/arb

Suggested reading order:
1. Start with this README for solution overview
2. Review architecture and implementation guidance in `docs/`
3. Explore the wiki for extended project notes and operational context
4. Review the frontend and API folders for implementation detail

## Use cases

This repository is well suited for scenarios such as:
- internal architecture review board enablement
- cloud center of excellence review automation
- pre-sales architecture assessment accelerators
- governance-led workload readiness reviews
- modernization and migration architecture evaluation
- AI-assisted enterprise design assurance

## Roadmap direction

Based on the current documentation, the solution direction includes:
- deeper Azure AI Foundry agent integration
- stronger evidence-grounded review workflows
- cost-controlled enterprise deployment patterns
- improved testing, validation, and review automation maturity
- richer architecture scorecards and governance insights

## Contributing

Contributions are welcome where they improve architecture quality, engineering rigor, usability, documentation, or deployment maturity.

Recommended contribution areas:
- architecture review rules and rubrics
- frontend UX improvements
- API reliability and observability
- infrastructure automation
- documentation quality and onboarding experience
- testing depth and coverage

A professional contribution workflow typically includes:
1. create a feature branch
2. make focused, well-documented changes
3. validate with relevant tests
4. open a pull request with clear problem statement, solution summary, and validation notes

## License

No license file is currently present in the repository. If this project is intended for reuse, consider adding an explicit license to clarify usage rights.
