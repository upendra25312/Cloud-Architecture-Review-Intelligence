# Documentation Guide

This directory contains the primary architecture, implementation, and validation documentation for Cloud Architecture Review Intelligence.

It serves as the documentation landing page for contributors, architects, engineers, reviewers, and stakeholders who want to understand how the solution is designed and how it is expected to evolve.

## Documentation objectives

The documentation in this repository is intended to help readers:

- understand the purpose and architecture of the platform
- review the intended Azure deployment model
- follow implementation and validation guidance
- navigate major solution artifacts quickly
- align engineering work with architecture and governance goals

## Recommended reading order

If you are new to the repository, use the following reading order:

1. [`../README.md`](../README.md)  
   Start here for the overall solution overview, business context, architecture summary, and repository navigation.

2. [`../ARCHITECTURE.md`](../ARCHITECTURE.md)  
   Read this for a concise explanation of the solution’s logical architecture and component responsibilities.

3. [`arb-foundry-agents-solution-plan.md`](./arb-foundry-agents-solution-plan.md)  
   Review this for the detailed target architecture, Azure service design, cost model, phased plan, and implementation direction.

4. [`arb-implementation-test-validation-guide.md`](./arb-implementation-test-validation-guide.md)  
   Use this for implementation and validation guidance tied to testing and operational readiness.

5. [`../services/office-renderer/README.md`](../services/office-renderer/README.md)  
   Review this for the deployed Office native-shape rendering service used by the visual evidence pre-processor.

## Current key documents

### Solution and architecture
- [`arb-foundry-agents-solution-plan.md`](./arb-foundry-agents-solution-plan.md)
- [`../ARCHITECTURE.md`](../ARCHITECTURE.md)

### Implementation and validation
- [`arb-implementation-test-validation-guide.md`](./arb-implementation-test-validation-guide.md)
- [`../services/office-renderer/README.md`](../services/office-renderer/README.md)

### Visual evidence and rendering
- Visual evidence pre-processor: implemented in the Azure Functions API extraction pipeline.
- Office native-shape renderer: implemented in [`../services/office-renderer`](../services/office-renderer).
- Renderer infrastructure: implemented in [`../infrastructure/terraform/office_renderer.tf`](../infrastructure/terraform/office_renderer.tf).
- Renderer deployment: implemented in [`../.github/workflows/deploy-office-renderer.yml`](../.github/workflows/deploy-office-renderer.yml).

The visual evidence pre-processor extracts and analyzes diagram-derived facts before `cari-arb-review-agent` runs. It supports PDF figure extraction, PDF page-render fallback, Office embedded media extraction, Office native-shape rendering fallback, and standalone image uploads. The ARB agent receives `visualEvidence[]` records and must cite `visualEvidenceId` when using diagram-derived facts.

### Repository entry points
- [`../README.md`](../README.md)
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md)
- [`../SECURITY.md`](../SECURITY.md)

## Documentation principles

Documentation in this repository should aim to be:

- clear and professional
- accurate to the current state of the repository
- useful for both technical and stakeholder audiences
- aligned with enterprise Azure architecture practices
- specific enough to guide implementation without overstating maturity

## Suggested future additions

As the repository evolves, useful future documentation may include:

- deployment runbooks
- environment setup guides
- architecture decision records
- API reference documentation
- governance rubric documentation
- operations and monitoring runbooks
- troubleshooting guides
- release notes and change summaries

## Wiki and external references

Additional context may also be available from:
- the repository wiki
- the public site or demo experience
- implementation assets in `frontend/`, `api/`, and `infrastructure/`

## Maintaining documentation quality

When updating docs:
- keep business and technical claims aligned to the codebase
- update related files together where appropriate
- prefer concise, navigable structure over excessive prose
- preserve clear distinctions between current state and target-state architecture
