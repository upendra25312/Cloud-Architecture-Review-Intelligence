# CLAUDE.md — AI Tooling Guidance for CARI

This file guides AI coding assistants (Claude Code, GitHub Copilot, etc.) on how to work effectively in this repository.

## Project overview

**Cloud Architecture Review Intelligence (CARI)** is a production Azure-native platform for AI-assisted architecture review workflows.

- **Live site (leadership demo):** [https://thankful-pond-04383960f.7.azurestaticapps.net/](https://thankful-pond-04383960f.7.azurestaticapps.net/)
- **Platform:** Azure Static Web Apps (frontend) + Azure Functions (API) + Azure AI services
- **Stack:** Next.js 16 (App Router) · TypeScript · Node.js 20 · Terraform · GitHub Actions

## Repository structure

```
frontend/    Next.js App Router — live production frontend
api/         Azure Functions (Node.js) — live production API
infrastructure/terraform/  Terraform IaC for all Azure resources
services/office-renderer/  Containerised Office document renderer
docs/        Architecture docs, ADRs, runbooks, guides
standards/   Engineering, architecture, security, UX, release standards
.github/     CI/CD workflows, issue/PR templates, CODEOWNERS
```

## Critical rules

### NEVER do these without explicit user confirmation
- Modify any file under `frontend/` without running `npm run build` and verifying it passes
- Modify any file under `api/` without running `npm test` in `api/`
- Push to `main` — this triggers an immediate live production deploy
- Move or rename files that are referenced by `next.config.js`, `staticwebapp.config.json`, or any GitHub Actions `working-directory:`
- Delete or rename Azure Function files in `api/src/functions/` — function names map to HTTP routes
- Commit `*.tfstate`, `*.tfstate.backup`, `tfplan` files — these contain secrets

### Safe to modify without special care
- Files under `docs/` — documentation only, no deploy impact
- Files under `standards/` — standards docs, no deploy impact
- Root governance files: `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `ARCHITECTURE.md`
- `.github/` templates and workflow improvements (review before merging)
- `.gitignore`, `.devcontainer/`, `Makefile`

## Architecture patterns — respect these

### Frontend (Next.js App Router)
- **Routing:** `frontend/app/` directory — each subfolder = a route
- **Shared UI components:** `frontend/src/components/` — feature-grouped subfolders
- **Home-specific components:** `frontend/app/components/` — co-located with routes
- **Utilities/libs:** `frontend/src/lib/` — pure TypeScript, no React
- **ARB types + API client:** `frontend/src/arb/` — the review workflow domain model
- **Static assets:** `frontend/public/` — images, templates, manifest, robots.txt

### API (Azure Functions)
- **HTTP handlers:** `api/src/functions/` — one file per function endpoint
- **Shared logic:** `api/src/shared/` — utilities, stores, services (unit-tested)
- **Durable orchestrators:** `api/src/durable/` — long-running workflow orchestration
- **Data:** `api/data/arb-rules/` — governance rules as JSON (CAF, WAF, internal)

### Authentication
- Frontend uses `frontend/src/components/auth-session-provider.tsx` + `auth-status-chip.tsx`
- API uses `api/src/shared/auth.js` for token validation
- Managed Identity is used for all Azure service-to-service auth (no client secrets)

## Testing

```bash
# API unit tests (from repo root)
npm --prefix api test

# Frontend type-check
npm --prefix frontend run type-check

# Frontend unit tests
npm --prefix frontend run test:unit

# E2E tests (requires running app)
npm --prefix frontend run test:e2e:core
```

## Development setup

See [CONTRIBUTING.md](CONTRIBUTING.md) and `.devcontainer/devcontainer.json` for full setup.

Quick start:
```bash
cd frontend && npm install && npm run dev   # frontend on :3000
cd api && npm install && func start         # api on :7071
```

## Deployment

Deploys are automated via GitHub Actions on merge to `main`:
- `frontend/**` changes → triggers `deploy-frontend.yml` → Azure Static Web Apps
- `api/**` changes → triggers `deploy-api.yml` → Azure Functions
- `infrastructure/terraform/**` → triggers `terraform.yml` (plan/apply gated)

## PowerPoint export — critical rules

File: `api/src/shared/arb-pptx-export.js`  
Standard: `standards/pptx-export-standard.md` — **read this before touching the file.**

### Bugs that MUST NOT recur

1. **`nextSteps: []` bug** — An empty array `[]` is truthy in JavaScript. `data.nextSteps || [defaults]` will NOT fall through to defaults if `nextSteps` is `[]`. Always set `nextSteps: null` in `shapeReviewDataForPptx` so the fallback fires correctly.

2. **Empty-state omission** — Every slide that renders a table or list MUST have an explicit guard when the array is empty. Never let a slide render with only a header row and no body. See `buildRiskRegisterSlide` for the correct pattern.

3. **Text truncation without wrap** — Never use `.slice(n)` on a text element without also setting `wrap: true`. Truncation without wrap still overflows the box. Always use both together.

4. **Missing brand colours** — Purple (`#95008A`) is the static brand anchor: the cover slide category pill MUST use `fill: { color: BRAND.purple }`. Never change it to blue or any other colour. Teal appears conditionally (scorecard ≥80, recommendation "Recommended for Approval", action "Closed", SOW "In scope").

5. **Category-aware Next Steps** — The `CATEGORY_NEXT_STEPS` map in `arb-pptx-export.js` contains 6 specific steps per category. When adding a new project category anywhere in the codebase, add its step list to this map first.

6. **SOW Traceability data source** — Evidence objects in Azure Table Storage do NOT carry `logicalCategory`. Build `sowTraceability` from the `files` array (filter `logicalCategory === "sow"`) cross-referenced against `requirements` (filter by `sourceFileId`). Never filter `evidence` for SOW — it will always return empty.

7. **`wrap: true` on all multi-line text** — Every `addText` call that could receive more than one line MUST have `wrap: true`. This includes Next Steps items and Action summaries, not just `.slice()` truncated fields.

### Quality bar for every PPTX change

Before committing any change to `arb-pptx-export.js`:
- Run `npm --prefix api test` — all 140+ tests must pass
- Mentally walk every slide: does it have content even when all data arrays are empty?
- Check every `.slice()` call has a matching `wrap: true`
- Confirm `nextSteps: null` (not `[]`) in `shapeReviewDataForPptx`

## Current branch context

**Branch:** `main` (feat/cari-comprehensive-v2 merged 2026-05-15)
