# Architecture Decision Records

This folder tracks significant architectural decisions made for Cloud Architecture Review Intelligence.

An ADR captures **why** a decision was made, what alternatives were considered, and what the consequences are. It is a lightweight record — not a design document.

---

## Index

| ID | Title | Status | Date |
|----|-------|--------|------|
| [ADR-001](./adr-001-azure-static-web-apps-hosting.md) | Azure Static Web Apps for frontend hosting | Accepted | 2026-05 |
| [ADR-002](./adr-002-durable-functions-orchestration.md) | Azure Durable Functions for workflow orchestration | Accepted | 2026-05 |
| [ADR-003](./adr-003-managed-identity-no-keys.md) | Managed Identity with no stored API keys | Accepted | 2026-05 |
| [ADR-004](./adr-004-github-actions-oidc-deployment.md) | GitHub Actions with OIDC for deployment | Accepted | 2026-05 |
| [ADR-005](./adr-005-terraform-infrastructure-as-code.md) | Terraform for infrastructure as code | Accepted | 2026-05 |

---

## Template

Use [adr-template.md](./adr-template.md) for new decisions.

---

## Status definitions

| Status | Meaning |
|--------|---------|
| **Proposed** | Under discussion — not yet decided |
| **Accepted** | Decision made and in effect |
| **Deprecated** | Was accepted but is no longer the right approach |
| **Superseded** | Replaced by a later ADR (link to replacement) |
