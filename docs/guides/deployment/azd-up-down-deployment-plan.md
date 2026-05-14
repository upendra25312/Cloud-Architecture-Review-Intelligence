# CARI Single-Command Azure Deployment Plan

## Purpose

This plan explains how to evolve Cloud Architecture Review Intelligence (CARI) so a cloud engineer can deploy the full solution with:

```powershell
azd up
```

and remove the environment with:

```powershell
azd down --purge
```

The goal is a repeatable, auditable, engineer-friendly deployment path that provisions Azure infrastructure, deploys application code, configures runtime settings, validates the solution, and supports clean teardown.

## Current Deployment State

The repository already contains most of the infrastructure-as-code needed to provision CARI, but deployment is currently split across Terraform and GitHub Actions workflows.

| Area | Current State |
|---|---|
| Infrastructure | Terraform under `infrastructure/terraform` |
| Frontend deployment | GitHub Actions deploys `frontend/out` to Azure Static Web Apps |
| API deployment | GitHub Actions deploys `api` to Azure Functions |
| Office renderer deployment | GitHub Actions builds a container image, pushes to ACR, and updates Azure Container Apps |
| Production CI/CD | GitHub Actions with Azure OIDC |
| `azd` support | Not yet implemented |

## Target Deployment Experience

The target engineer experience is:

```powershell
git clone https://github.com/upendra25312/Cloud-Architecture-Review-Intelligence.git
cd Cloud-Architecture-Review-Intelligence

azd auth login
azd env new cari-dev
azd env set AZURE_SUBSCRIPTION_ID "<subscription-id>"
azd env set AZURE_LOCATION "eastus2"
azd env set CARI_ALERT_EMAIL "cloud-ops@example.com"

azd up
```

Expected outcome:

- Resource group is created.
- Azure resources are provisioned.
- API is deployed to Azure Functions.
- Frontend is deployed to Azure Static Web Apps.
- Office renderer image is built, pushed, and deployed to Azure Container Apps.
- Function App settings are configured from provisioned resource outputs.
- CARI URL and API URL are printed at the end.
- A smoke test confirms `/`, `/arb`, API health, and renderer health.

Teardown:

```powershell
azd down --purge
```

Use `--purge` because Key Vault and Cognitive Services use soft delete.

## Azure Services in Scope

The `azd up` flow must provision and configure:

| Layer | Azure Services |
|---|---|
| Web | Azure Static Web Apps |
| API | Azure Functions, Azure Durable Functions |
| Rendering | Azure Container Apps, Azure Container Registry |
| Storage | Azure Storage blobs, tables, queues |
| AI | Azure AI Services, model-router deployment, embedding deployment |
| Document processing | Azure Document Intelligence |
| Vision | Azure AI Vision / Computer Vision |
| Search | Azure AI Search |
| Agent platform | Azure AI Foundry hub and project |
| Secrets | Azure Key Vault |
| Monitoring | Log Analytics, Application Insights |
| Security | Managed identities and Azure RBAC assignments |

## Recommended Deployment Model

Use both deployment paths, but for different purposes:

| Use Case | Recommended Path |
|---|---|
| Production/live environment | GitHub Actions remains the controlled release path |
| Developer/demo/sandbox environment | `azd up` and `azd down` |
| Training/onboarding | `azd up` |
| Clean rebuild validation | `azd up`, validate, then `azd down --purge` |

Do not replace production GitHub Actions immediately. Introduce `azd` first as a parallel deployment path, then converge later only after repeated successful deployments.

## Required Repository Changes

### 1. Add `azure.yaml`

Create a root-level `azure.yaml`:

```yaml
name: cari-arb-review

metadata:
  template: cari-arb-review@0.1.0

infra:
  provider: terraform
  path: infrastructure/terraform

hooks:
  preprovision:
    shell: pwsh
    run: ./scripts/azd/preprovision.ps1

  postprovision:
    shell: pwsh
    run: ./scripts/azd/postprovision.ps1

  predeploy:
    shell: pwsh
    run: ./scripts/azd/predeploy.ps1

  postdeploy:
    shell: pwsh
    run: ./scripts/azd/postdeploy.ps1
```

The hooks keep deployment behavior explicit and testable.

### 2. Make Terraform AZD-Friendly

Current Terraform uses a fixed remote backend:

```hcl
backend "azurerm" {
  resource_group_name  = "rg-tf-state"
  storage_account_name = "starbrevtfstate"
  container_name       = "tfstate"
  key                  = "arb-review-prod.terraform.tfstate"
}
```

For `azd up`, use one of these patterns.

#### Recommended for dev/demo

Remove the fixed backend from the AZD deployment path and let AZD manage the Terraform working directory/state for the selected environment.

#### Recommended for team/prod

Keep remote state, but make it explicit and bootstrapped:

```powershell
azd env set CARI_TF_STATE_RG "rg-tf-state"
azd env set CARI_TF_STATE_ACCOUNT "starbrevtfstate"
azd env set CARI_TF_STATE_CONTAINER "tfstate"
azd env set CARI_TF_STATE_KEY "cari-dev.terraform.tfstate"
```

For first implementation, use the dev/demo path so `azd up` is truly single-command after environment variables are set.

### 3. Map AZD Environment Values to Terraform Variables

Terraform variables that must be supplied:

| Terraform Variable | AZD Environment Value | Example |
|---|---|---|
| `subscription_id` | `AZURE_SUBSCRIPTION_ID` | `87cf2b93-5e52-4533-9e6b-7182cd7dbde6` |
| `location` | `AZURE_LOCATION` | `eastus2` |
| `env` | `AZURE_ENV_NAME` or `CARI_ENV` | `dev` |
| `prefix` | `CARI_PREFIX` | `cari-arb` |
| `prefix_short` | `CARI_PREFIX_SHORT` | `cariarb` |
| `alert_email` | `CARI_ALERT_EMAIL` | `cloud-ops@example.com` |
| `budget_amount` | `CARI_BUDGET_AMOUNT` | `60` |
| `use_durable_orchestration` | `CARI_USE_DURABLE_ORCHESTRATION` | `ON` |

The preprovision hook should validate these values before Terraform runs.

### 4. Remove Hardcoded Production Names from Deployment Scripts

Current GitHub Actions use hardcoded values such as:

- `func-arb-review-api`
- `rg-arb-review-prod`
- `crarbrevrenderprod`
- `ca-cari-office-renderer-prod`
- `https://red-coast-0b2d8700f.7.azurestaticapps.net`

For AZD, all deployment scripts should read these from Terraform outputs:

| Output | Usage |
|---|---|
| `resource_group_name` | CLI updates and smoke tests |
| `function_app_name` | API deployment and app settings |
| `function_app_url` | frontend `NEXT_PUBLIC_API_URL` |
| `static_web_app_url` | final URL and smoke test |
| `static_web_app_deploy_token` | SWA deployment |
| `office_renderer_container_registry_name` | Docker push |
| `office_renderer_container_registry_login_server` | Docker tag and push |
| `office_renderer_container_app_name` | Container App update |
| `office_renderer_endpoint` | API app setting |
| `key_vault_uri` | secret reference verification |

### 5. Add Deployment Scripts

Create:

```text
scripts/azd/preprovision.ps1
scripts/azd/postprovision.ps1
scripts/azd/predeploy.ps1
scripts/azd/deploy-api.ps1
scripts/azd/deploy-frontend.ps1
scripts/azd/deploy-renderer.ps1
scripts/azd/postdeploy.ps1
```

#### `preprovision.ps1`

Responsibilities:

- Verify Azure CLI login.
- Verify `azd` environment exists.
- Verify subscription and location.
- Verify required tools:
  - `az`
  - `azd`
  - `terraform`
  - `node`
  - `npm`
  - `docker`
- Validate required AZD variables.
- Fail fast with clear errors.

#### `postprovision.ps1`

Responsibilities:

- Read Terraform outputs.
- Set AZD environment outputs:
  - `CARI_RESOURCE_GROUP`
  - `CARI_FUNCTION_APP_NAME`
  - `CARI_FUNCTION_APP_URL`
  - `CARI_STATIC_WEB_APP_URL`
  - `CARI_STORAGE_ACCOUNT_NAME`
  - `CARI_SEARCH_ENDPOINT`
  - `CARI_DOCINT_ENDPOINT`
  - `CARI_VISION_ENDPOINT`
  - `CARI_OFFICE_RENDERER_ENDPOINT`
- Configure Function App settings that depend on provisioned values.
- Verify managed identity app settings are present.

#### `deploy-renderer.ps1`

Responsibilities:

- Build the Office renderer Docker image.
- Push the image to ACR.
- Update the Container App image.
- Generate or retrieve renderer shared secret.
- Configure API settings:
  - `OFFICE_RENDERER_ENDPOINT`
  - `OFFICE_RENDERER_SHARED_SECRET`
  - `OFFICE_RENDERER_MAX_FILE_BYTES`
  - `OFFICE_RENDERER_MAX_PAGES`
  - `OFFICE_RENDERER_TIMEOUT_MS`
- Run `GET /health` against the renderer.

#### `deploy-api.ps1`

Responsibilities:

- Run `npm ci`.
- Run `npm test`.
- Package and deploy Azure Functions.
- Verify `/api/health`.
- Verify expected functions are registered.

#### `deploy-frontend.ps1`

Responsibilities:

- Set `NEXT_PUBLIC_API_URL` from `function_app_url`.
- Run `npm ci`.
- Run `npm run build`.
- Deploy `frontend/out` to Azure Static Web Apps.
- Verify `/` and `/arb`.

#### `postdeploy.ps1`

Responsibilities:

- Print final URLs.
- Run smoke tests:
  - Home page returns 200.
  - `/arb` returns 200.
  - API health returns 200, 401, or expected protected response.
  - Renderer health returns 200.
- Print next steps for login and first review upload.

### 6. Automate or Document Azure AI Foundry Agent Creation

Terraform currently provisions the Foundry hub/project and stores a placeholder `foundry-agent-id` secret.

To make `azd up` complete, choose one of these options:

| Option | Description | Recommendation |
|---|---|---|
| Terraform/azapi | Create the agent declaratively if provider/API support is reliable | Best long-term |
| CLI hook | Use a postprovision script to create/update the agent and write the agent ID to Key Vault | Best near-term |
| Manual step | Engineer creates agent in Foundry portal and updates Key Vault | Acceptable only for phase 1 |

Recommended near-term approach:

1. `postprovision.ps1` checks whether `foundry-agent-id` is still placeholder.
2. If missing, it prints an actionable command sequence or runs the supported CLI/API command.
3. The real agent ID is stored in Key Vault secret `foundry-agent-id`.
4. Function App reads the secret through managed identity.

### 7. Add Validation Gates

`azd up` should not be considered successful until these checks pass:

| Gate | Expected Result |
|---|---|
| Terraform provision | Complete |
| Function App deployed | Complete |
| Static Web App deployed | Complete |
| Office renderer deployed | Complete |
| `/` route | HTTP 200 |
| `/arb` route | HTTP 200 |
| API health | HTTP 200 or expected auth-protected response |
| Renderer health | HTTP 200 |
| Storage containers/tables | Created |
| AI Search | Created |
| Document Intelligence endpoint | Configured |
| Vision endpoint | Configured |
| Key Vault secret reference | Resolved |
| Foundry agent ID | Not placeholder |

## Engineer Runbook

### Prerequisites

Install:

```powershell
winget install Microsoft.AzureCLI
winget install Microsoft.Azd
winget install Hashicorp.Terraform
winget install OpenJS.NodeJS.LTS
winget install Docker.DockerDesktop
```

Required Azure permissions:

| Scope | Role |
|---|---|
| Subscription or target resource group | Contributor |
| Subscription or target resource group | User Access Administrator |
| Azure AI resources | Cognitive Services Contributor, if subscription policy requires it |
| Foundry/ML workspace | Azure AI Developer or equivalent, if manual agent setup is needed |

### Deploy

```powershell
git clone https://github.com/upendra25312/Cloud-Architecture-Review-Intelligence.git
cd Cloud-Architecture-Review-Intelligence

azd auth login
az login

azd env new cari-dev
azd env set AZURE_SUBSCRIPTION_ID "87cf2b93-5e52-4533-9e6b-7182cd7dbde6"
azd env set AZURE_LOCATION "eastus2"
azd env set CARI_ENV "dev"
azd env set CARI_PREFIX "cari-arb"
azd env set CARI_PREFIX_SHORT "cariarb"
azd env set CARI_ALERT_EMAIL "cloud-ops@example.com"
azd env set CARI_BUDGET_AMOUNT "60"
azd env set CARI_USE_DURABLE_ORCHESTRATION "ON"

azd up
```

### Validate

```powershell
azd env get-values
azd show
```

Open:

- Static Web App URL from `CARI_STATIC_WEB_APP_URL`
- ARB page: `<CARI_STATIC_WEB_APP_URL>/arb`
- API health: `<CARI_FUNCTION_APP_URL>/api/health`
- Renderer health: `<CARI_OFFICE_RENDERER_ENDPOINT>/health`

### Destroy

```powershell
azd down --purge
```

After teardown, verify:

```powershell
az group show --name "<resource-group-name>"
```

Expected result: resource group not found.

## Cost Controls

Keep the default cost posture aligned with the existing 60 USD budget target:

| Resource | Cost Control |
|---|---|
| Azure Functions | Consumption plan |
| Container Apps renderer | `minReplicas=0`, `maxReplicas=1`, `0.5 vCPU`, `1Gi` |
| ACR | Basic SKU |
| AI Search | Free tier where available |
| Document Intelligence | F0 where available |
| AI Vision | S1 with limited transactions |
| Storage | Lifecycle management enabled |
| Budget | Terraform `budget_amount` default 60 |

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| AI model capacity unavailable in selected region | Provisioning may fail | Allow region override and document tested regions |
| Search Free tier unavailable | Provisioning may fail | Add `search_sku` variable with fallback |
| Foundry agent creation not fully automated | `azd up` may require manual step | Add postprovision hook or explicit manual validation |
| Soft-deleted Key Vault/Cognitive names block redeploy | `azd up` may fail after teardown | Use unique environment suffix or `azd down --purge` |
| Docker not running | Renderer deployment fails | Predeploy check must fail early |
| Production hardcoded URLs | Wrong app settings | Use Terraform outputs only |

## Acceptance Criteria

The AZD implementation is complete when:

- `azure.yaml` exists at repository root.
- `azd up` provisions all required Azure resources in a clean environment.
- `azd up` deploys API, frontend, and Office renderer.
- Function App app settings are configured from provisioned outputs.
- Foundry agent ID is configured and not left as placeholder.
- Home route, `/arb`, API health, and renderer health validate.
- User can sign in, upload documents, run extraction, run assessment, record decision, and export board pack.
- `azd down --purge` removes the environment without manual cleanup except documented Azure soft-delete edge cases.
- README and wiki contain the runbook.

## Implementation Phases

| Phase | Outcome |
|---|---|
| Phase 1 | Add documentation, `azure.yaml`, and preflight scripts |
| Phase 2 | Make Terraform AZD-compatible and output-driven |
| Phase 3 | Add API/frontend/renderer deploy scripts |
| Phase 4 | Add Foundry agent setup automation or explicit guarded manual step |
| Phase 5 | Run clean-environment `azd up` validation |
| Phase 6 | Run `azd down --purge` validation |
| Phase 7 | Keep GitHub Actions production deployment unchanged until AZD path is proven |

## Production Guidance

For now:

- Keep the live production site deployed through GitHub Actions.
- Use `azd` for clean dev/test/demo environments.
- Do not run `azd down` against production unless the environment was explicitly created for teardown testing.

