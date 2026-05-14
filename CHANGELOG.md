# Changelog

All notable changes to Cloud Architecture Review Intelligence are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).  
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### In progress
- Azure Developer CLI (AZD) deployment path — PR #5

---

## [0.5.0] — 2026-05-14

### Added
- Production change control standard classifying changes as Safe / Sensitive / Blocked
- Release standards defining validation gates and rollback expectations
- Architecture, engineering, security, and UX standards documents
- Current-state and target-state documentation structure under `docs/`
- Frontend and API rollback runbooks under `docs/runbooks/`
- Production performance baseline document
- CODEOWNERS assignment for all repository paths

---

## [0.4.0] — 2026-05-13

### Added
- Time-to-Value section on homepage aligned to validated CARI metrics
- ARB findings navigation canonicalisation fix

### Fixed
- Domain filter state initialisation using lazy initializer pattern
- Domain filter from URL now correctly applied on Findings page navigation

---

## [0.3.0] — 2026-05-12

### Added
- Auto-sync between finding status, owner, due date, and linked remediation actions
- Security approval prerequisites documentation for Rackspace deployment
- AZD lifecycle hook scripts (`scripts/azd/`) — draft, pending finalisation

### Fixed
- Export Board Pack now automatically downloads the generated file
- 401 authentication error handling with user-friendly login prompt

---

## [0.2.0] — 2026-05-12

### Added
- **Azure Durable Functions migration** for Agent Review and Extraction workflows
  - `orchestratorAgentReview` — reliable, resumable AI review with automatic retry
  - `orchestratorExtraction` — parallel document fan-out with configurable concurrency
  - Feature flag control (`USE_DURABLE_ORCHESTRATION`) for gradual rollout
  - 11 activity functions covering the full review and extraction lifecycle
- Azure Terraform infrastructure updates for Durable Functions storage backend
- Durable Functions deployment guide and rollback runbook

---

## [0.1.0] — 2026-05-11

### Added
- Initial platform release
- Azure Static Web Apps frontend (Next.js 16, React 19, TypeScript)
- Azure Functions API (47 HTTP-triggered functions)
- Azure AI Foundry agent integration for architecture review
- Azure Document Intelligence for PDF/DOCX extraction
- Azure AI Search for evidence retrieval
- Azure Computer Vision for diagram analysis
- Azure Key Vault, Managed Identity, and RBAC security model
- Terraform infrastructure-as-code for all Azure resources
- Office renderer microservice (LibreOffice + Puppeteer, Container Apps)
- GitHub Actions CI/CD with OIDC authentication (no stored secrets)
- Application Insights observability and alerting
- Weekly security scanning and cost monitoring workflow
