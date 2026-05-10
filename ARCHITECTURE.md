# Architecture Overview

## Purpose

Cloud Architecture Review Intelligence is designed as an enterprise-ready platform for evaluating cloud architectures using a combination of AI-assisted analysis, deterministic governance checks, evidence extraction, and Azure-native operational patterns.

This document provides a concise architecture overview for engineering teams, platform teams, solution architects, and technical stakeholders who need to understand how the solution is structured and how its major components interact.

## Architectural goals

The solution is intended to achieve the following goals:

- enable repeatable and scalable architecture review workflows
- improve consistency and traceability of architecture assessments
- combine AI-assisted reasoning with deterministic validation
- support secure, Azure-native deployment patterns
- maintain a modular structure across frontend, API, AI, and infrastructure layers
- provide a foundation for enterprise governance, observability, and controlled evolution

## High-level architecture

At a high level, the platform is composed of four logical layers:

### 1. Experience layer
The frontend provides the user-facing experience for architecture review workflows.

Responsibilities include:
- collecting review inputs
- displaying architecture findings and scorecards
- supporting workflow navigation and review operations
- providing a modern, accessible web experience

Repository location:
- [`frontend/`](./frontend)

Indicative technologies:
- Next.js
- React
- TypeScript-based configuration and tooling

### 2. Application and orchestration layer
The backend provides the API and orchestration capabilities required for review execution.

Responsibilities include:
- receiving and validating review requests
- orchestrating document analysis and AI-assisted processing
- coordinating rule evaluation and business logic
- handling storage and review lifecycle operations
- exposing service endpoints to the frontend

Repository location:
- [`api/`](./api)

Indicative technologies:
- Azure Functions
- Node.js
- Azure SDKs for identity, storage, and document processing

### 3. AI and knowledge layer
The AI layer provides the intelligence and grounding mechanisms that support review quality.

Responsibilities include:
- extracting information from uploaded review artifacts
- searching and retrieving relevant supporting knowledge
- supporting structured AI-assisted reasoning
- grounding outputs in evidence and curated guidance

The solution documentation indicates a target-state architecture using:
- Azure AI Foundry / Agents API patterns
- Azure AI Search
- Azure Document Intelligence
- embeddings and vector-store-oriented retrieval patterns

### 4. Platform and operations layer
The infrastructure layer provides deployment, security, observability, and operational support.

Responsibilities include:
- provisioning Azure resources
- storing secrets and configuration securely
- enabling monitoring and diagnostics
- supporting repeatable environment setup
- enabling scalable enterprise deployment patterns

Repository location:
- [`infrastructure/`](./infrastructure)

## Reference deployment model

Based on the current repository documentation, the intended Azure deployment model includes the following services:

- **Azure Static Web Apps** for frontend hosting
- **Azure Functions** for API hosting and orchestration
- **Azure AI Foundry Hub / Project** for AI orchestration patterns
- **Azure AI Foundry Agents API** for agent-driven review execution
- **Azure AI Search** for knowledge retrieval and document search
- **Azure Document Intelligence** for document extraction
- **Azure Storage** for files, state, and related review artifacts
- **Azure Key Vault** for secrets and secure configuration
- **Application Insights** and **Log Analytics** for observability

## Logical flow

A representative end-to-end review flow is as follows:

1. A user initiates a review through the frontend.
2. The frontend sends the request to backend APIs.
3. The backend accepts review input and supporting artifacts.
4. Documents are processed and relevant evidence is extracted.
5. Search and retrieval logic identifies supporting architecture knowledge.
6. Deterministic rules and AI-assisted evaluation contribute to the review outcome.
7. Findings, scorecards, and other structured outputs are generated.
8. Results are persisted and presented back through the frontend.
9. Telemetry and diagnostics capture operational insights for support and improvement.

## Security model

The repository documentation strongly indicates an enterprise-oriented security approach built around:

- managed identity where possible
- Azure Key Vault for secret management
- Azure-native role assignment and service access controls
- separation of environments for local, test, and production deployments
- avoidance of plaintext secrets in application code

Recommended security principles for this solution include:
- least-privilege access
- secure secret handling
- environment isolation
- centralized observability
- auditable deployment and configuration management

## Engineering model

The repository structure suggests a professional engineering approach that includes:

- separated frontend and backend concerns
- infrastructure-as-code alignment
- automated and targeted testing patterns
- documentation-driven architecture planning
- support for accessibility, visual regression, and end-to-end validation

## Key repository areas

- [`README.md`](./README.md) — repository overview and business context
- [`docs/arb-foundry-agents-solution-plan.md`](./docs/arb-foundry-agents-solution-plan.md) — target solution architecture and deployment design
- [`docs/arb-implementation-test-validation-guide.md`](./docs/arb-implementation-test-validation-guide.md) — implementation and validation guidance
- [`api/`](./api) — Azure Functions backend
- [`frontend/`](./frontend) — user experience layer
- [`infrastructure/`](./infrastructure) — deployment assets

## Architectural principles

This solution should continue to evolve according to the following principles:

- design for clarity and maintainability
- prefer Azure-native security and operations patterns
- ground AI outputs in evidence where possible
- combine deterministic rules with AI-assisted insight
- keep the system modular and testable
- optimize for enterprise adoption, governance, and operational maturity

## Future evolution

Likely future evolution areas include:

- deeper Foundry agent integration
- expanded review rules and governance rubrics
- richer review scorecards and reporting
- more robust deployment automation
- stronger architecture evidence traceability
- broader operational dashboards and governance analytics
