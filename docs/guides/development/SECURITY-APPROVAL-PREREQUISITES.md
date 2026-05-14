# Cloud Architecture Review Intelligence (CARI)
## Security Approval Request — Azure Resource Access Prerequisites

**Document Version:** 1.0  
**Date:** May 2026  
**Prepared by:** Expert Team (Microsoft Azure Cloud Architect, Senior PM, Azure AI Foundry Expert, Senior Director Cloud Solutions Architecture)  
**For:** Rackspace Security Approval Owner

---

## Executive Summary

This document outlines the **minimum Azure RBAC roles and resource access** required to deploy and operate the Cloud Architecture Review Intelligence (CARI) platform. We also explain **why a 14-day sandbox environment is unsuitable** for this solution and recommend a dedicated, persistent Azure subscription.

**Key Points:**
- CARI uses **Managed Identity exclusively** — zero API keys or secrets in code
- All secrets stored in **Azure Key Vault** with RBAC-based access
- **Least-privilege principle** applied throughout — each identity gets only the roles it needs
- Monthly cost: **< $60 USD** (hard budget cap enforced via Azure Cost Management)

---

## 1. Minimum Azure RBAC Roles Required

### 1.1 Deployment Identity (Terraform / GitHub Actions)

The identity that provisions infrastructure needs these roles:

| Role | Scope | Justification |
|------|-------|---------------|
| **Contributor** | Resource Group `rg-arb-review-prod` | Create/manage all Azure resources within the solution boundary |
| **User Access Administrator** | Resource Group `rg-arb-review-prod` | Assign RBAC roles to Managed Identities (Function App, Foundry Hub) |
| **Storage Blob Data Contributor** | Terraform State Storage Account | Read/write Terraform state files for infrastructure-as-code |

**Why these roles are needed:**
- **Contributor** allows creating the 20+ Azure resources (Functions, Storage, AI Services, Key Vault, etc.) without granting subscription-wide Owner access
- **User Access Administrator** is required to assign roles to the Managed Identities that the application uses at runtime — this is a one-time setup operation
- **Storage Blob Data Contributor** on the Terraform state account enables GitOps-style infrastructure management

### 1.2 Runtime Identity (Azure Function App Managed Identity)

The Function App uses a **system-assigned Managed Identity** — no service principal secrets. This identity needs:

| Role | Resource | Justification |
|------|----------|---------------|
| **Storage Blob Data Contributor** | Storage Account | Upload/read/delete ARB review documents and evidence files |
| **Storage Table Data Contributor** | Storage Account | Read/write review state, job tracking, extraction status |
| **Cognitive Services OpenAI User** | AI Services Account | Call Azure AI Foundry Agents API and embedding models |
| **Key Vault Secrets User** | Key Vault | Read `foundry-agent-id` and other runtime secrets |
| **Search Index Data Contributor** | AI Search Service | Create indexes, index documents, execute search queries |
| **Search Service Contributor** | AI Search Service | Manage index schema definitions |
| **Cognitive Services User** | Document Intelligence | Extract text/tables from PDF, DOCX, PPTX, XLSX files |
| **Cognitive Services User** | Computer Vision | Analyze architecture diagrams and visual evidence |

**Why these roles are needed:**
- Each role follows **least-privilege** — the Function App can only access the specific operations it needs
- **No Owner or Contributor roles** are assigned to the runtime identity
- All data access is scoped to the specific resources, not the subscription

### 1.3 Azure AI Foundry Hub Managed Identity

The Foundry Hub (AI orchestration layer) needs:

| Role | Resource | Justification |
|------|----------|---------------|
| **Storage Blob Data Contributor** | Storage Account | Read knowledge files for vector store (auto-assigned by Azure) |
| **Cognitive Services OpenAI User** | AI Services Account | Generate embeddings for knowledge retrieval |
| **Key Vault Secrets User** | Key Vault | Read configuration during project operations |

### 1.4 Human Operator Roles (One-Time Setup)

For initial deployment and ongoing administration:

| Role | Scope | Justification |
|------|-------|---------------|
| **Key Vault Secrets Officer** | Key Vault | Write secrets during initial setup (agent ID, etc.) |
| **Contributor** | Resource Group | Troubleshoot and manage resources |

---

## 2. Azure Resources Provisioned

| Resource Type | Name | SKU/Tier | Monthly Cost |
|---------------|------|----------|--------------|
| Resource Group | `rg-arb-review-prod` | — | $0 |
| Storage Account | `starbrevprod01` | Standard LRS | ~$0.50 |
| Azure Functions | `func-arb-review-api` | Consumption Y1 | ~$0-5 |
| App Service Plan | `asp-arb-review-prod` | Dynamic (Y1) | $0 |
| Static Web App | `stapp-arb-review-prod` | Free | $0 |
| Key Vault | `kv-arb-review-prod` | Standard | ~$0.03 |
| AI Services | `ais-arb-review-prod` | S0 | ~$4-15 |
| AI Foundry Hub | `hub-arb-review-prod` | Standard | $0 |
| AI Foundry Project | `proj-arb-review-prod` | — | $0 |
| AI Search | `srch-arb-review-prod` | Free | $0 |
| Document Intelligence | `di-arb-review-prod` | F0 (Free) | $0 |
| Computer Vision | `cog-vision-arb-review-prod` | S1 | ~$0-2 |
| Container Apps Environment | `cae-cari-arb-review-prod` | Consumption | ~$0-2 |
| Container App | `ca-cari-office-renderer-prod` | Scale-to-zero | ~$0-1 |
| Container Registry | `crarbrevrenderprod` | Basic | ~$5 |
| Application Insights | `appi-arb-review-prod` | Pay-as-you-go | $0 (5GB free) |
| Log Analytics | `log-arb-review-prod` | Pay-as-you-go | $0 (5GB free) |
| Action Group | `ag-arb-review-prod` | — | $0 |
| Metric Alerts | Various | — | $0 |

**Total Monthly Cost: < $60 USD** (enforced via Azure Cost Management budget alerts)

---

## 3. Security Architecture

### 3.1 Zero Secrets in Code

```
┌─────────────────────────────────────────────────────────────────┐
│                    CARI Security Model                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     Managed Identity      ┌──────────────┐   │
│  │ Function App │ ─────────────────────────▶│  Key Vault   │   │
│  │   (No keys)  │     (No API keys)         │  (Secrets)   │   │
│  └──────────────┘                           └──────────────┘   │
│         │                                                       │
│         │ Managed Identity (RBAC)                               │
│         ▼                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Storage    │  │ AI Services  │  │  AI Search   │         │
│  │  (No keys)   │  │  (No keys)   │  │  (No keys)   │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Authentication Model

| Component | Authentication Method |
|-----------|----------------------|
| Function App → Storage | Managed Identity (Azure AD token) |
| Function App → AI Services | Managed Identity (Azure AD token) |
| Function App → Key Vault | Managed Identity (Azure AD token) |
| Function App → AI Search | Managed Identity (Azure AD token) |
| Function App → Document Intelligence | Managed Identity (Azure AD token) |
| GitHub Actions → Azure | Federated Identity (OIDC, no secrets) |
| Users → Static Web App | Azure AD / Microsoft Entra ID |

### 3.3 Network Security

- All Azure services use **HTTPS/TLS 1.2+**
- Storage Account: **Public blob access disabled**
- Key Vault: **RBAC mode** (no access policies)
- No VNet integration required for this workload (all PaaS services)

---

## 4. Why a 14-Day Sandbox is NOT Suitable

### 4.1 Data Persistence Requirements

| Data Type | Retention Need | Impact of 14-Day Deletion |
|-----------|----------------|---------------------------|
| **Architecture Review Records** | Months to years | All customer review history lost |
| **Findings & Scorecards** | Audit trail required | Compliance evidence destroyed |
| **Uploaded Documents** | Reference for remediation | Evidence for open actions lost |
| **AI Agent Configuration** | Stable operation | Agent must be recreated from scratch |
| **Terraform State** | Infrastructure management | Cannot manage or update infrastructure |
| **Application Insights Logs** | Troubleshooting | No historical data for incident analysis |

### 4.2 Operational Disruption

| Issue | Business Impact |
|-------|-----------------|
| **Review Continuity** | Active reviews cannot span more than 14 days |
| **Customer Trust** | Customers expect their data to persist |
| **Audit Compliance** | Cannot demonstrate review history for audits |
| **Remediation Tracking** | Open actions lose context when data is deleted |
| **Cost Waste** | Re-provisioning 20+ resources every 2 weeks wastes engineering time |

### 4.3 Technical Limitations

| Component | 14-Day Sandbox Problem |
|-----------|------------------------|
| **Azure AI Foundry Agent** | Agent ID changes on recreation; all threads lost |
| **Vector Store** | Knowledge embeddings must be regenerated (~$0.50 each time) |
| **AI Search Index** | Document chunks must be re-indexed |
| **Durable Functions** | Orchestration state lost; in-progress workflows fail |
| **Table Storage** | All review state, job tracking, quota tracking lost |
| **Key Vault** | Soft-delete recovery period conflicts with sandbox deletion |

### 4.4 Cost Comparison

| Scenario | Monthly Cost | Engineering Overhead |
|----------|--------------|---------------------|
| **Persistent Subscription** | ~$30-60 | Minimal (automated CI/CD) |
| **14-Day Sandbox (2x/month)** | ~$30-60 | 8-16 hours/month re-provisioning |

**The sandbox approach costs the same in Azure spend but adds significant engineering overhead and eliminates all business value from data persistence.**

---

## 5. Recommendation

### 5.1 Requested Environment

| Attribute | Value |
|-----------|-------|
| **Subscription Type** | Dedicated, persistent (not sandbox) |
| **Resource Group** | `rg-arb-review-prod` |
| **Region** | East US 2 (primary), East US (AI Search) |
| **Budget Cap** | $60 USD/month (enforced via Azure Cost Management) |
| **Retention** | Indefinite (standard enterprise retention policies apply) |

### 5.2 Security Controls

| Control | Implementation |
|---------|----------------|
| **Least Privilege** | All RBAC roles scoped to minimum required |
| **No Secrets in Code** | 100% Managed Identity authentication |
| **Audit Logging** | Application Insights + Log Analytics |
| **Cost Governance** | Budget alerts at $40 (warning) and $55 (critical) |
| **Data Encryption** | Azure-managed encryption at rest and in transit |

### 5.3 Approval Request

We request approval for:

1. **Dedicated Azure subscription** (or resource group within existing subscription)
2. **Contributor + User Access Administrator** roles for deployment identity
3. **Persistent resource retention** (not subject to 14-day sandbox deletion)
4. **$60/month budget allocation** with automated alerts

---

## 6. Contact

For questions about this security approval request:

- **Technical Architecture:** [Azure Cloud Architect]
- **Project Management:** [Senior PM]
- **AI Platform:** [Azure AI Foundry Expert]
- **Executive Sponsor:** [Senior Director, Cloud Solutions Architecture]

---

## Appendix A: Complete RBAC Role Matrix

| Identity | Role | Scope | Purpose |
|----------|------|-------|---------|
| Deployment SP | Contributor | Resource Group | Create resources |
| Deployment SP | User Access Administrator | Resource Group | Assign MI roles |
| Deployment SP | Storage Blob Data Contributor | TF State Storage | Manage TF state |
| Function App MI | Storage Blob Data Contributor | Storage Account | File operations |
| Function App MI | Storage Table Data Contributor | Storage Account | State management |
| Function App MI | Cognitive Services OpenAI User | AI Services | AI API calls |
| Function App MI | Key Vault Secrets User | Key Vault | Read secrets |
| Function App MI | Search Index Data Contributor | AI Search | Index operations |
| Function App MI | Search Service Contributor | AI Search | Schema management |
| Function App MI | Cognitive Services User | Document Intelligence | PDF extraction |
| Function App MI | Cognitive Services User | Computer Vision | Image analysis |
| Foundry Hub MI | Storage Blob Data Contributor | Storage Account | Knowledge files |
| Foundry Hub MI | Cognitive Services OpenAI User | AI Services | Embeddings |
| Foundry Hub MI | Key Vault Secrets User | Key Vault | Configuration |
| GitHub Actions SP | Website Contributor | Function App | Deploy code |
| GitHub Actions SP | Contributor | Static Web App | Deploy frontend |
| Human Operator | Key Vault Secrets Officer | Key Vault | Initial setup |
| Human Operator | Contributor | Resource Group | Administration |

---

## Appendix B: Resource Naming Convention

All resources follow the pattern: `{type}-{prefix}-{env}`

| Type Prefix | Resource Type |
|-------------|---------------|
| `rg-` | Resource Group |
| `st` | Storage Account |
| `func-` | Function App |
| `asp-` | App Service Plan |
| `swa-` | Static Web App |
| `kv-` | Key Vault |
| `ai-` | AI Services |
| `hub-` | AI Foundry Hub |
| `proj-` | AI Foundry Project |
| `srch-` | AI Search |
| `di-` | Document Intelligence |
| `vision-` | Computer Vision |
| `appi-` | Application Insights |
| `law-` | Log Analytics Workspace |
| `ag-` | Action Group |
| `ca-` | Container App |
| `cae-` | Container Apps Environment |
| `acr` | Container Registry |
