# CARI Repository Restructuring Plan
## Microsoft Standard Repo Structure — Session-Resumable Execution Plan

**Branch:** `feat/microsoft-standard-repo-structure`  
**Live Site:** https://red-coast-0b2d8700f.7.azurestaticapps.net/  
**Repository:** https://github.com/upendra25312/Cloud-Architecture-Review-Intelligence  
**Started:** May 2026  
**Status:** In progress — Phase 5 (code quality) remaining

---

## Core constraint

**Zero live site disruption.** The live site deploys only when `frontend/**` changes are pushed to `main`. Phases 1–4 make no changes to `frontend/`, `api/`, `infrastructure/` source code. Phase 5 requires careful staging + smoke tests before merging.

---

## Baseline state (as of session start)

### Already completed on this branch
- [x] ADR library: `docs/adr/` — adr-001 through adr-005 + template + README
- [x] `CHANGELOG.md` at repo root
- [x] Upgraded GitHub templates: PR template, bug report, feature request
- [x] Governance docs: CODE_OF_CONDUCT, CONTRIBUTING, SECURITY, SUPPORT, LICENSE
- [x] Standards directory: `standards/architecture/`, `engineering/`, `security/`, `ux/`, `release/`
- [x] `ARCHITECTURE.md` with deployed Azure service inventory

### Repo structure (healthy baseline)
```
cari-repo/
├── .github/            # CI/CD workflows + templates + CODEOWNERS
├── api/                # Azure Functions (Node.js) — DO NOT RESTRUCTURE
│   ├── src/functions/  # 30+ function handlers
│   ├── src/shared/     # Shared utilities + unit tests
│   └── src/durable/    # Durable Functions orchestrators
├── docs/               # Architecture docs, ADRs, runbooks, RCAs
├── frontend/           # Next.js App Router — DO NOT RESTRUCTURE
│   ├── app/            # Next.js routes + page components
│   ├── src/            # Shared components + lib + arb types
│   └── public/         # Static assets
├── infrastructure/     # Terraform IaC
│   └── terraform/      # All .tf files
├── services/           # Ancillary services
│   └── office-renderer/# Containerized Office rendering service
└── standards/          # Engineering, architecture, security, UX, release standards
```

---

## Phase 1: Repository Hygiene — ZERO live site risk
**Goal:** Clean untracked files, fix `.gitignore`, add AI tooling guidance.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.1 | Update `.gitignore` | ✅ done | Added: `frontend/out/`, `frontend/.next/`, `*.pptx`, `*.xlsx`, `docs/generated/`, `coverage/`, `*.tfstate` |
| 1.2 | Move binary assets to `docs/assets/` | ✅ done | Moved to `docs/assets/diagrams/` (png) and `docs/assets/presentations/` (pptx, gitignored) |
| 1.3 | Commit `docs/MANUAL-TEST-DOMAIN-FILTER.md` | ✅ done | Moved to `docs/guides/testing/MANUAL-TEST-DOMAIN-FILTER.md` |
| 1.4 | Commit `.vscode/` team settings | ✅ done | Enhanced `extensions.json` with full recommended set; committed all 4 VS Code files |
| 1.5 | Add `docs/generated/` to `.gitignore` | ✅ done | Covered in 1.1 |
| 1.6 | Add `CLAUDE.md` | ✅ done | Already existed from previous session — comprehensive AI guidance file |

---

## Phase 2: Documentation Structure — ZERO live site risk
**Goal:** Professional docs hierarchy, eliminate folder names with spaces.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.1 | Rename `docs/architecture/foundry agent tools and knowledge/` | ✅ done | Renamed → `docs/architecture/foundry-agent-tools/` using git rm + git add (history preserved as rename) |
| 2.2 | Create `docs/guides/` sub-structure | ✅ done | Created `deployment/`, `testing/`, `development/` sub-folders |
| 2.3 | Move deployment guides to `docs/guides/deployment/` | ✅ done | Both deployment guides moved |
| 2.4 | Create `docs/runbooks/` structure | ✅ done | `durable-functions-rollback-runbook.md` moved; `rollback-frontend.md`, `rollback-api.md` already existed |
| 2.5 | Organize RCA docs | ✅ done | Both RCA files moved to `docs/runbooks/rca/` |
| 2.6 | Update `docs/README.md` | ✅ done | Already had accurate index from previous session — reflects new structure |
| 2.7 | Update root `README.md` | ✅ done | Already comprehensive from previous session |

---

## Phase 3: Developer Experience — ZERO live site risk
**Goal:** One-command setup, team consistency, automated dependency management.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 3.1 | Add `.devcontainer/devcontainer.json` | ✅ done | Node.js 20, Azure CLI, Terraform, Docker-in-Docker; ports 3000/7071/3100 forwarded |
| 3.2 | Add root `Makefile` | ✅ done | Targets: setup, dev, api, renderer, lint, type-check, test, test-api, test-unit, test-e2e, build, generate, tf-plan, tf-apply, clean, help |
| 3.3 | Update `CONTRIBUTING.md` | ✅ done | Already comprehensive from previous session |
| 3.4 | Review + update `.github/CODEOWNERS` | ✅ done | Verified correct |
| 3.5 | Add `.github/dependabot.yml` | ✅ done | Covers npm (frontend, api, services/office-renderer) + github-actions; weekly schedule |

---

## Phase 4: GitHub Actions Hardening — CAREFUL (CI/CD changes)
**Goal:** All workflows follow Microsoft best practices, proper path triggers, latest actions.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 4.1 | Review `deploy-frontend.yml` | ✅ done | OIDC auth, path triggers, build + E2E + deploy + verify smoke test |
| 4.2 | Review `deploy-api.yml` | ✅ done | OIDC auth, path triggers, unit tests, secret scan, deploy + function count verification |
| 4.3 | Review `deploy-office-renderer.yml` | ✅ done | Manual dispatch only (intentional), ACR build+push, container app update, smoke test |
| 4.4 | Review `terraform.yml` | ✅ done | OIDC, plan/apply gates, PR plan comment, outputs artifact |
| 4.5 | Review `validate.yml` | ✅ done | Weekly security scan + cost projection + RBAC validation |
| 4.6 | Add `codeql.yml` | ✅ done | CodeQL javascript-typescript analysis; triggers on push/PR to main + weekly schedule |

---

## Phase 5: Code Structure Review — HIGH CARE (requires testing)
**Goal:** Eliminate any structural inconsistencies. ONLY merge after full smoke test.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 5.1 | Assess `frontend/app/components/` vs `frontend/src/components/` | ⬜ pending | Both exist — `app/components/` has home page components, `src/components/` has ARB workflow components. This is VALID Next.js App Router pattern. Likely leave as-is. |
| 5.2 | Assess `frontend/src/arb/` vs `frontend/src/components/arb/` | ⬜ pending | `src/arb/` has types/API/routes; `src/components/arb/` has UI. Pattern is correct — leave as-is. |
| 5.3 | Frontend vitest coverage | ⬜ pending | Vitest configured but no `.test.` files in `frontend/src/` — add at least 3 utility tests |
| 5.4 | Smoke test suite on preview before merging to main | ⬜ pending | Run `npm run test:e2e:core` against preview URL |

---

## How to resume this plan

1. Check out branch: `git checkout feat/microsoft-standard-repo-structure`
2. Open this file: `docs/RESTRUCTURING-PLAN.md`
3. Find the first row with `⬜ pending` status
4. Update row to `🔄 in progress` when starting, `✅ done` when complete

---

## Risk register

| Risk | Mitigation |
|------|-----------|
| `frontend/` file moves break Next.js routing | Phases 1-4 touch zero source files in `frontend/` |
| `.gitignore` change un-tracks needed files | Review with `git status` before committing |
| Folder rename breaks GitHub Actions `working-directory` | Check all `working-directory:` references before renaming |
| PR merge to main triggers live deploy | Deploy only triggers on `frontend/**` path — safe for docs changes |
| Terraform state file accidentally committed | Already in `.gitignore` — verify before `git add` |
