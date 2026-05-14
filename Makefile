.PHONY: setup dev test build lint type-check clean help

# ── Setup ─────────────────────────────────────────────────────────────────────

setup: ## Install all dependencies across frontend, api, and services
	npm install --prefix frontend
	npm install --prefix api
	npm install --prefix services/office-renderer

# ── Development ───────────────────────────────────────────────────────────────

dev: ## Start frontend dev server (port 3000) — run 'make api' in a second terminal
	npm run dev --prefix frontend

api: ## Start Azure Functions API locally (port 7071)
	cd api && func start

renderer: ## Start Office renderer service locally (port 3100)
	npm start --prefix services/office-renderer

# ── Quality ───────────────────────────────────────────────────────────────────

lint: ## Run ESLint on frontend
	npm run lint --prefix frontend --if-present

type-check: ## TypeScript type-check frontend
	npm run type-check --prefix frontend --if-present

test: test-api test-unit ## Run all unit tests

test-api: ## Run API unit tests
	npm test --prefix api

test-unit: ## Run frontend unit tests (vitest)
	npm run test:unit --prefix frontend

test-e2e: ## Run core E2E tests (requires running app — see CONTRIBUTING.md)
	npm run test:e2e:core --prefix frontend

# ── Build ─────────────────────────────────────────────────────────────────────

build: ## Build frontend for production
	npm run build --prefix frontend

generate: ## Regenerate frontend data files
	npm run generate:data --prefix frontend

# ── Infrastructure ────────────────────────────────────────────────────────────

tf-plan: ## Run Terraform plan (reads from infrastructure/terraform/)
	terraform -chdir=infrastructure/terraform plan

tf-apply: ## Apply Terraform plan — requires confirmation
	terraform -chdir=infrastructure/terraform apply

# ── Utilities ─────────────────────────────────────────────────────────────────

clean: ## Remove build artefacts (frontend/.next, frontend/out)
	rm -rf frontend/.next frontend/out

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
