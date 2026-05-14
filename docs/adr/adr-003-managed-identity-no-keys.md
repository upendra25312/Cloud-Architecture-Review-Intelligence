# ADR-003: Managed Identity with no stored API keys

**Status:** Accepted  
**Date:** 2026-05  
**Deciders:** Platform team

---

## Context

The CARI platform integrates with multiple Azure AI services (Document Intelligence, AI Search, Computer Vision, AI Foundry), Azure Storage, and Azure Key Vault. A naive implementation would store connection strings and API keys as Function App settings. This creates secret rotation burden, audit exposure, and compliance risk.

## Decision

All Azure service integrations use **Managed Identity** (system-assigned) with Azure RBAC role assignments. No API keys or connection strings are stored in Function App settings. The weekly `validate.yml` workflow enforces this by failing if any key-shaped value appears in the Function App configuration.

## Alternatives considered

| Option | Reason not chosen |
|--------|------------------|
| API keys in App Settings | Secret rotation burden, compliance risk, audit exposure |
| API keys in Key Vault (referenced via `@Microsoft.KeyVault(...)`) | Still requires managing key lifecycle; Managed Identity is simpler and more secure |
| Service principal with client secret | Secret rotation required; Managed Identity eliminates this entirely |

## Consequences

### Positive
- No secrets to rotate, leak, or audit in application configuration
- RBAC provides fine-grained, auditable access control per service
- Eliminates a class of supply-chain and misconfiguration vulnerabilities
- Compliant with Microsoft security baselines (zero standing secrets)

### Negative / trade-offs
- Local development requires `DefaultAzureCredential` with `az login` or environment variables
- RBAC role assignments must be provisioned in Terraform before deployment succeeds
- Some AI Foundry features require additional agent ID stored in Key Vault (one exception, documented)

### Risks
- Managed Identity must be enabled on the Function App before Terraform RBAC assignments apply
- Incorrect RBAC scope (resource vs. resource group) can silently deny access at runtime

## Related decisions
- [ADR-004](./adr-004-github-actions-oidc-deployment.md) — same security philosophy applied to CI/CD
