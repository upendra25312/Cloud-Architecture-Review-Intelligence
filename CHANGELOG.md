# Changelog

All notable changes to Cloud Architecture Review Intelligence are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).  
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [1.0.0] — 2026-05-18

### Added

- **ARB Projects** — full project management layer on top of the review workflow;
  create named projects with customer, description, and start date; project list with
  cards on the ARB workspace; project detail page with header, metadata, and review
  history; edit project in-place; "+ New review" shortcut pre-fills `projectId` so
  reviews are automatically scoped to their project

- **E2E smoke test suite** — 12-check Playwright smoke test covering the full Projects
  lifecycle end-to-end against the live production site: login (passkey-rejector
  pattern), project list load, create, card appearance, detail view, name/customer
  display, edit pre-population, save, new-review link with `projectId`, and empty state;
  runs via `npm --prefix frontend run test:e2e:projects`

- **Node.js 22** — runtime upgraded from Node.js 20 to 22 across Azure Functions,
  frontend build, and all CI/CD workflows; aligns with Node.js 20 EOL schedule

### Changed

- **Flex Consumption plan (FC1)** — Azure Functions migrated from Y1 Consumption plan
  to Flex Consumption; `func-arb-review-api-flex` is the new production function app;
  `functionTimeout` raised to 45 minutes to accommodate long-running Durable
  extractions; old Y1 app and plan decommissioned

- **Extraction concurrency** — parallel Office visual artifact activities raised from
  3 → 6; per-file timeout cap raised from 8 min → 12 min; stale-`Queued` phantom
  timeout tightened from 10 min → 3 min for faster recovery on re-run

- **Office Renderer capacity** — Container App scaled to 3 replicas to serve 6-way
  concurrency without queuing

### Fixed

- **Projects routing on Static Web Apps** — project detail (`/arb/projects/view?projectId=…`)
  uses query-param routing instead of dynamic segments; fully compatible with Next.js
  static export and Azure Static Web Apps `navigationFallback`; removed the
  `/arb/projects/*` route rule that was breaking the projects list page

- **LibreOffice XLSX Java warning** — "XLSX: No tables as lists allowed" Java log line
  was causing the Office Renderer to reject valid Excel files; suppressed at source in
  `server.js` so the renderer now processes all XLSX files cleanly

- **Extraction: multi-page Consumption timeout** — extraction fan-out no longer hits the
  10-minute hard cap on the old Y1 plan; combined with Flex migration, multi-page
  document extraction now completes reliably within the 45-minute function timeout

- **Extraction: phantom Queued state** — prevented `instanceId` conflict on re-run and
  stale `Queued` status blocking subsequent extractions; `getStatus` 404 handled
  gracefully in Durable orchestrator

- **Office Renderer: over-batch prevention** — renderer no longer requests a page batch
  that exceeds the actual document page count, eliminating "Wrong page range" errors on
  short documents

- **CI: broken E2E job removed** — `deploy-frontend.yml` `e2e` job was dead code
  (wrong `working-directory`, no app server, masked by `continue-on-error`); removed
  cleanly

- **CI: action version hygiene** — `actions/setup-node@v4` → `@v6` in eval workflow;
  `actions/download-artifact@v8` (invalid) removed with the dead e2e job; all workflows
  now consistent on `@v6` for Node.js setup ahead of the June 2026 node20 deprecation

- **CI: ACR name in office renderer deploy** — corrected `ACR_NAME` from
  `acrcariofficerenderprod` (wrong) to `crarbrevrendererprod` (actual); workflow was
  failing with `ResourceNotFound` on every run

---

## [0.9.2] — 2026-05-17

### Fixed

- **Word and Excel downloads no longer produce corrupt files** — `downloadArbExport`
  was calling `readTextBlob` for all export formats; binary formats (`.xlsx`, `.docx`)
  were UTF-8 decoded during blob read, mangling the binary payload and causing
  "The file is corrupt" / "Word found unreadable content" errors on every download;
  fixed by routing `xlsx` and `docx` to `readBinaryBlob` so the raw buffer reaches
  the HTTP response unchanged; regression test added

---

## [0.9.1] — 2026-05-17

### Fixed

- **Excel workbook no longer shows "content error" on open** — ExcelJS 4.4.0
  writes `<autoFilter>` in the wrong XML element position when combined with
  a frozen pane (`ws.views`); removed `ws.autoFilter` from the shared header
  helper to fix the XML ordering; frozen pane behaviour is unchanged on all
  12 worksheet tabs

---

## [0.9.0] — 2026-05-17

### Added

- **Word/DOCX export** — 6th export format; structured board-pack Word document
  with Cover, Executive Summary, Scorecard, Findings (grouped by severity),
  Actions Register, and Requirements sections; available on Evidence, Scorecard,
  and Requirements pages alongside PPTX and Excel
- `docx` npm package added to API dependencies
- `ArbExportFormat` TypeScript type updated to include `"docx"`

---

## [0.8.0] — 2026-05-17

### Added

- **Findings bulk actions** — multi-select findings via checkboxes in the list
  panel; sticky command bar lets reviewers set status, owner, and due date
  across all selected findings in one click; "select all visible" checkbox
  respects active filter state; parallel API updates with per-field patch
  semantics (blank fields preserve existing values)

---

## [0.7.1] — 2026-05-17

### Fixed

- **Export parity on Scorecard and Requirements pages** — Scorecard now shows
  "Export as PowerPoint" and "Export as Excel" buttons (was Regenerate only);
  Requirements now shows "Export as Excel" button
- Scorecard regenerate handler now includes `xlsx` format (was missing) and
  refreshes artifact list via API fetch instead of appending to stale state

---

## [0.7.0] — 2026-05-17

### Added

- **Excel export button in Evidence page UI** — "Export as Excel" button surfaces the
  existing `.xlsx` API format directly in the browser; regenerate now covers all 5 formats
  (Markdown, CSV, HTML, PPTX, Excel) in one click
- **Eval framework documentation** — `docs/CARI-EVAL-FRAMEWORK.md` operational reference
  and `docs/PRD-CARI-EVAL-FRAMEWORK.md` full PRD committed alongside the eval runner

### Fixed

- Eval dataset calibration: case 022 actions aligned to AI vocabulary
  (`"security"`, `"monitor"`, `"identity"`) — AI does not say "hardening" or "Defender"
- Eval dataset calibration: case 027 findings/actions aligned
  (`"inconsist"`, `"standar"`) — AI says "inconsistent"/"standardize" not "conflict"/"canonical"

### Changed

- `ArbExportFormat` TypeScript type now includes `"xlsx"` (was missing despite API support)
- Regenerate reviewed outputs handler now generates all 5 formats including Excel

---

## [0.6.0] — 2026-05-17

### Added

- **Networking as a first-class ARB review domain** — hub-spoke, private endpoints,
  DNS, hybrid connectivity, and NSG findings now surface under `Networking` domain
  instead of being merged into Security
- **ARB generic output framework** — canonical `ArbReviewOutputPack` schema ensures
  all five export formats (Markdown, HTML, PPTX, CSV, Excel) derive findings, scores,
  and governance posture from one normalisation pipeline; eliminates per-exporter drift
- **Excel export** — new `.xlsx` format available via `createArbExport` alongside
  existing Markdown, HTML, PPTX, and CSV
- **Cross-exporter parity test suite** — 22 new tests verify all formats produce
  identical findings count, score, decision, and governance posture
- **CARI evaluation framework** — `/api/arb-eval/review` endpoint + 27-case labelled
  dataset covering ALZ, WAF, CAF, migration, evidence safety, and red-team scenarios;
  runs in CI against mock mode and in deployed mode via `CARI_FUNCTIONS_URL`

### Changed

- Scorecard dimensions expanded: Requirements Coverage 15%, Security 15%,
  **Networking 10%**, Reliability 15%, OpsEx 10%, Cost 10%, Performance 10%,
  Governance 10%, Documentation 5%
- Frontend findings filter chips, domain sort order, and validation status messages
  updated to include Networking domain
- WAF rules NET-001 and NET-002 reclassified from `Security` to `Networking` domain

### Fixed

- Eval runner: 180s default timeout (was 120s) for AI-agent-heavy scenarios
- Eval runner: automatic retry on transient `ChunkedEncodingError` connection drops
- Positive control test case (024) calibrated to match AI agent's conservative
  evidence assessment behaviour in text-only eval mode

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
