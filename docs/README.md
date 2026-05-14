# Documentation

This directory is the primary documentation hub for Cloud Architecture Review Intelligence (CARI).

> **New here?** Start with [`../README.md`](../README.md) for the solution overview, then [`../ARCHITECTURE.md`](../ARCHITECTURE.md) for the technical deep-dive.

---

## Structure

```
docs/
├── adr/                   Architecture Decision Records
├── architecture/          Solution design, agent plans, sync design
│   └── foundry-agent-tools/  AI Foundry agent schemas, rubrics, tooling guidance
├── assets/                Diagrams and presentation assets
│   ├── diagrams/          Architecture diagrams (PNG/SVG — tracked in VCS)
│   └── presentations/     Executive decks (gitignored — store in SharePoint)
├── current-state/         Deployed environment snapshots and baselines
├── guides/                How-to guides for common tasks
│   ├── deployment/        Azure deployment and AZD runbooks
│   ├── development/       Security approval, contribution process
│   └── testing/           Manual test guides, validation checklists
├── runbooks/              Operational runbooks and rollback procedures
│   └── rca/               Root Cause Analysis documents
└── target-state/          Future architecture goals and roadmap
```

---

## Quick links

### Architecture
| Document | Description |
|----------|-------------|
| [../ARCHITECTURE.md](../ARCHITECTURE.md) | High-level platform architecture overview |
| [architecture/solution-architecture-diagram.md](architecture/solution-architecture-diagram.md) | Detailed solution architecture narrative |
| [architecture/arb-foundry-agents-solution-plan.md](architecture/arb-foundry-agents-solution-plan.md) | Azure AI Foundry agents design and implementation plan |
| [architecture/FINDING-ACTION-SYNC-DESIGN.md](architecture/FINDING-ACTION-SYNC-DESIGN.md) | Finding ↔ Action synchronisation design |

### Architecture Decision Records
| ADR | Decision |
|-----|----------|
| [adr/adr-001](adr/adr-001-azure-static-web-apps-hosting.md) | Azure Static Web Apps hosting |
| [adr/adr-002](adr/adr-002-durable-functions-orchestration.md) | Durable Functions orchestration |
| [adr/adr-003](adr/adr-003-managed-identity-no-keys.md) | Managed Identity — no client secrets |
| [adr/adr-004](adr/adr-004-github-actions-oidc-deployment.md) | GitHub Actions OIDC deployment |
| [adr/adr-005](adr/adr-005-terraform-infrastructure-as-code.md) | Terraform IaC |

### Deployment guides
| Document | Description |
|----------|-------------|
| [guides/deployment/azd-up-down-deployment-plan.md](guides/deployment/azd-up-down-deployment-plan.md) | Azure Developer CLI (`azd up` / `azd down`) runbook |
| [guides/deployment/DEPLOYMENT-GUIDE-DURABLE-FUNCTIONS.md](guides/deployment/DEPLOYMENT-GUIDE-DURABLE-FUNCTIONS.md) | Durable Functions deployment guide |

### Runbooks and incident response
| Document | Description |
|----------|-------------|
| [runbooks/rollback-frontend.md](runbooks/rollback-frontend.md) | Frontend rollback procedure |
| [runbooks/rollback-api.md](runbooks/rollback-api.md) | API rollback procedure |
| [runbooks/durable-functions-rollback-runbook.md](runbooks/durable-functions-rollback-runbook.md) | Durable Functions rollback |
| [runbooks/rca/RCA-401-ERROR-ARB-REVIEW.md](runbooks/rca/RCA-401-ERROR-ARB-REVIEW.md) | RCA: 401 error in ARB review |
| [runbooks/rca/RCA-EXPORT-BOARD-PACK.md](runbooks/rca/RCA-EXPORT-BOARD-PACK.md) | RCA: Export Board Pack fix |

### Guides
| Document | Description |
|----------|-------------|
| [guides/testing/MANUAL-TEST-DOMAIN-FILTER.md](guides/testing/MANUAL-TEST-DOMAIN-FILTER.md) | Manual testing: domain filter |
| [guides/testing/arb-implementation-test-validation-guide.md](guides/testing/arb-implementation-test-validation-guide.md) | ARB implementation test and validation guide |
| [guides/development/SECURITY-APPROVAL-PREREQUISITES.md](guides/development/SECURITY-APPROVAL-PREREQUISITES.md) | Security approval prerequisites |

### Current and target state
| Document | Description |
|----------|-------------|
| [current-state/README.md](current-state/README.md) | Deployed environment current state |
| [current-state/performance-baseline.md](current-state/performance-baseline.md) | Performance baseline |
| [target-state/README.md](target-state/README.md) | Target architecture and roadmap |

---

## Documentation principles

- Clearly distinguish **current state** (what is live) from **target state** (what we are building toward)
- Keep links accurate — update them when files move
- Architecture docs live in `architecture/`, operational docs in `runbooks/`, how-to in `guides/`
- ADRs record decisions that were made — never delete, only supersede
