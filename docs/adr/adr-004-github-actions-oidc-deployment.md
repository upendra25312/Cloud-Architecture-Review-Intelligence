# ADR-004: GitHub Actions with OIDC for deployment

**Status:** Accepted  
**Date:** 2026-05  
**Deciders:** Platform team

---

## Context

The platform requires automated deployment to Azure on every merge to main. A common approach is to store an Azure Service Principal client secret as a GitHub secret. This creates a long-lived credential that must be rotated, audited, and protected. OIDC federation eliminates the stored secret entirely.

## Decision

Use **GitHub Actions with OIDC federation** to authenticate to Azure. No Azure credentials are stored in GitHub secrets. Azure trusts GitHub's OIDC token via a Federated Identity Credential on the deployment Service Principal.

## Alternatives considered

| Option | Reason not chosen |
|--------|------------------|
| Service Principal with client secret in GitHub Secrets | Long-lived credential, rotation burden, breach risk |
| Azure DevOps pipelines | Adds external platform dependency; GitHub Actions is sufficient |
| Manual deployment | Not repeatable, error-prone, no audit trail |

## Consequences

### Positive
- No long-lived Azure credentials stored anywhere in GitHub
- Tokens are short-lived (minutes) and scoped to the specific workflow run
- Consistent with ADR-003 philosophy: no standing secrets
- Azure audit logs show GitHub Actions as the identity — full traceability

### Negative / trade-offs
- OIDC federation must be configured in Entra ID (one-time setup, done via Terraform)
- OIDC does not work in forked repository PR workflows (security by design)
- Slightly more complex initial setup compared to client secret

### Risks
- If the Federated Identity Credential is misconfigured, all deployments fail silently until diagnosed
- OIDC subject claim must match the exact branch/environment pattern configured in Azure

## Related decisions
- [ADR-003](./adr-003-managed-identity-no-keys.md) — same no-standing-secrets philosophy
- [ADR-005](./adr-005-terraform-infrastructure-as-code.md) — OIDC federation provisioned in Terraform
