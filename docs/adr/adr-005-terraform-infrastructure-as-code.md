# ADR-005: Terraform for infrastructure as code

**Status:** Accepted  
**Date:** 2026-05  
**Deciders:** Platform team

---

## Context

The CARI platform spans 14+ Azure services across compute, storage, AI, security, and observability. Manual portal-based provisioning is not repeatable, auditable, or recoverable. An IaC approach is required to ensure consistent environments and support disaster recovery.

## Decision

Use **HashiCorp Terraform** (AzureRM provider) to define and manage all Azure infrastructure, stored in `infrastructure/terraform/`. Terraform state is stored in a remote Azure Storage backend.

## Alternatives considered

| Option | Reason not chosen |
|--------|------------------|
| Azure Bicep | Less ecosystem maturity for cross-resource orchestration at the time of decision; Terraform team familiarity |
| Azure Resource Manager (ARM) templates | Verbose, poor readability, harder to diff and review |
| Pulumi | Smaller Azure ecosystem; additional language runtime dependency |
| Azure Developer CLI (AZD) only | AZD is layered on top of Terraform here — not a replacement |

## Consequences

### Positive
- All infrastructure is version-controlled, reviewable, and auditable
- Consistent provisioning across environments (destroy and recreate is safe)
- Terraform plan provides a preview of infrastructure changes before apply
- Remote state backend enables team collaboration and CI/CD-based apply
- AZD deployment (PR #5) layers on top of Terraform, not replacing it

### Negative / trade-offs
- Remote state backend (Azure Storage) must be bootstrapped manually before first `terraform init`
- Some Azure resources (AI Foundry agent identity) require manual post-provision steps
- Terraform state file contains sensitive output values — must be protected with storage RBAC

### Risks
- State lock conflicts if multiple team members run `terraform apply` concurrently
- AzureRM provider version must be pinned in `.terraform.lock.hcl` to avoid unexpected upgrades
- Destroying and recreating AI Search will lose indexed data

## Related decisions
- [ADR-004](./adr-004-github-actions-oidc-deployment.md) — Terraform apply triggered via GitHub Actions
