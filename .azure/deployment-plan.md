# CARI AZD Deployment Plan

Status: Planning

## Goal

Enable Cloud Architecture Review Intelligence (CARI) to be provisioned, configured, deployed, and later destroyed with:

```bash
azd up
azd down
```

## Current State

- The repository does not currently include a root `azure.yaml`.
- Infrastructure is implemented under `infrastructure/terraform`.
- Terraform currently uses a fixed Azure Storage remote backend, which prevents a clean single-command `azd up` for a new environment unless the backend storage already exists.
- App deployment is split across GitHub Actions:
  - Terraform infrastructure workflow.
  - Azure Functions API workflow.
  - Next.js Azure Static Web Apps workflow.
  - Office renderer workflow.
- Some names and URLs are hardcoded in workflows instead of being driven from provisioning outputs.

## Target State

- Add root `azure.yaml`.
- Let `azd provision` run Terraform.
- Let `azd deploy` deploy:
  - Azure Functions API.
  - Next.js static frontend.
  - Office renderer container image/container app.
- Let `azd env get-values` expose all runtime settings.
- Let `azd down` destroy all resources created for the environment.

## Architecture Components

- Azure Resource Group.
- Azure Static Web Apps frontend.
- Azure Functions API with managed identity.
- Storage account, blob containers, queues, and tables.
- Azure AI Search.
- Azure AI Services / Azure OpenAI-compatible deployments.
- Azure Document Intelligence.
- Azure AI Vision.
- Azure AI Foundry project/agent configuration.
- Azure Key Vault.
- Application Insights / Log Analytics.
- Azure Container Registry.
- Azure Container Apps office renderer.
- RBAC assignments for managed identity and deployment identity.

## Required Changes

1. Convert Terraform from fixed remote backend to local/default backend for `azd`, or add an explicit AZD bootstrap story for remote state.
2. Add `azure.yaml` with services and hooks.
3. Add `infra/` wrapper or point AZD Terraform provider to `infrastructure/terraform`.
4. Add AZD environment variable mapping for Terraform variables.
5. Make hardcoded names output-driven.
6. Add deployment hooks for API, frontend, and renderer.
7. Add post-provision app setting synchronization from Terraform outputs.
8. Add predown/postdown guidance for soft-delete resources such as Key Vault and Cognitive Services.
9. Update README with one-command deployment and teardown instructions.

## Open Decisions

- Whether to keep Terraform state local under `.azure/<env>` for simple single-user demos, or use a bootstrapped remote backend for team use.
- Whether Azure AI Foundry agent creation remains manual or becomes automated through Terraform/azapi/CLI hooks.
- Whether GitHub Actions remains the production deployment path while `azd` becomes the demo/dev path, or whether all deployment paths converge on AZD.
