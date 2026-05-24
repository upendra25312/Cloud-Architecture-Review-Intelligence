# CARI 100/100 Score — Document Generation Prompt

> **Purpose:** Use this prompt (or its per-file sub-prompts) with any capable AI model (Claude, GPT-4o, Gemini, Copilot) to generate a complete fictitious Azure Landing Zone evidence package. When all four files are uploaded to CARI at **https://thankful-pond-04383960f.7.azurestaticapps.net/** as a single review, the platform will find zero unaddressed gaps and return a perfect score.
>
> **Project scenario:** Contoso Financial Services Ltd — Azure Enterprise Landing Zone Foundation Build.
>
> **Files to generate:**
> | # | File | Format | Tool |
> |---|---|---|---|
> | 1 | Statement of Work (SOW) | Microsoft Word (.docx) | Any AI or Word |
> | 2 | High-Level Design (HLD) | Microsoft Word (.docx) | Any AI or Word |
> | 3 | Low-Level Design (LLD) | Microsoft Excel (.xlsx) | Any AI or Excel |
> | 4 | Architecture Diagrams | draw.io XML (.drawio) | draw.io desktop or diagrams.net |

---

## Critical Coverage Rules

CARI evaluates evidence against WAF, CAF, and internal governance rules. Every keyword below **must appear verbatim** somewhere across the uploaded files. Missing even one blocker keyword causes a deduction. Do not use vague phrases like "we follow best practices" — every control must be specifically named and described.

| Domain | Required Keywords (must appear in documents) |
|---|---|
| **Reliability / Regions** | `availability zone`, `zone redundant`, `UK South`, `UK West`, `region pair` |
| **Identity** | `Entra ID`, `Azure AD`, `managed identity`, `RBAC`, `PIM`, `Conditional Access`, `least privilege`, `access review`, `emergency access`, `break-glass` |
| **Networking** | `hub-spoke`, `Azure Firewall`, `WAF`, `Application Gateway`, `NSG`, `private endpoint`, `Private Link`, `private DNS`, `VNet integration`, `ExpressRoute`, `hybrid DNS` |
| **Backup / DR** | `backup`, `restore`, `disaster recovery`, `DR`, `RTO`, `RPO` |
| **Resilience** | `health probe`, `retry`, `failover`, `resilience test` |
| **Monitoring** | `Azure Monitor`, `Log Analytics`, `Application Insights`, `alert`, `dashboard` |
| **IaC / DevOps** | `Terraform`, `Bicep`, `CI/CD`, `pipeline`, `runbook` |
| **Governance** | `Azure Policy`, `policy assignment`, `initiative`, `deny`, `tagging`, `diagnostic setting`, `management group`, `subscription vending`, `platform landing zone`, `application landing zone` |
| **Cost** | `cost`, `budget`, `FinOps`, `tagging`, `reserved`, `savings plan`, `SKU`, `right-size`, `autoscale`, `utilization` |
| **Security** | `Key Vault`, `Microsoft Defender for Cloud`, `Sentinel`, `JIT`, `NSG`, `security baseline` |

---

## Master Prompt (Single-Shot — generates all four files)

> Copy everything between the triple backticks and paste it into your AI assistant. Ask it to generate each file one at a time.

````
You are a Senior Azure Cloud Architect and Technical Programme Manager at Microsoft. 
Generate a complete Azure Enterprise Landing Zone evidence package for the fictitious 
client "Contoso Financial Services Ltd" for submission to an Architecture Review Board (ARB).

The package must comprise exactly four files described below. Every file must be 
production-quality, technically precise, and evidence-rich. Do not use placeholder 
language such as "TBD", "to be confirmed", or "we follow best practices". Every 
architectural control must be specifically named, justified, and traceable.

---

PROJECT CONTEXT
===============
Client:         Contoso Financial Services Ltd (fictitious)
Project Name:   Azure Enterprise Landing Zone — Foundation Build
Engagement Ref: CONT-ALZ-2026-001
Primary Region: UK South
DR Region:      UK West
Region Pair:    UK South ↔ UK West
Project Period: July 2026 – December 2026 (6 months)
Budget:         £1,200,000 (Year 1 implementation + first year run)
Project Manager:  Sarah Chen (Contoso)
Lead Architect:   James Okafor (Microsoft)
Engagement Lead:  Priya Sharma (Microsoft)

BUSINESS DRIVERS
================
Contoso Financial Services is a mid-size UK financial institution regulated by the 
FCA and PRA. They are moving their corporate banking platform from on-premises 
(two datacentres in Reading and Slough) to Azure. The Landing Zone is the foundation 
that all migrated and new workloads will land into. Security, regulatory compliance 
(FCA SYSC, PRA SS1/21, ISO 27001), and operational resilience (PS6/21) are 
non-negotiable constraints.

---

FILE 1 — STATEMENT OF WORK (Microsoft Word .docx)
==================================================
Title: "Azure Enterprise Landing Zone — Statement of Work v1.0"

Include ALL of the following sections with full detail:

1. EXECUTIVE SUMMARY
   - Business context, regulatory drivers (FCA, PRA, ISO 27001, PS6/21)
   - Strategic objective: production-ready Azure Landing Zone aligned to 
     Microsoft Cloud Adoption Framework (CAF) and Azure Landing Zone (ALZ) reference architecture
   - Expected outcomes: 10 platform landing zones, 3 application landing zones, 
     hybrid connectivity via ExpressRoute, full governance baseline

2. SCOPE OF WORK
   Include these exact in-scope items:
   - Management Group hierarchy design and deployment (Root → Platform → Landing Zones → Sandbox)
   - Subscription vending model design and automation
   - Platform Landing Zone subscriptions: Identity, Management, Connectivity
   - Application Landing Zone subscriptions: Corp Banking (Prod), Corp Banking (NonProd), Shared Services
   - Hub-spoke network topology using Azure Virtual WAN or hub VNet in UK South and UK West
   - Azure Firewall Premium deployment in hub VNet (UK South primary, UK West DR)
   - ExpressRoute circuits from Reading and Slough datacentres to Azure UK South and UK West
   - Private DNS zones for all Azure platform services (privatelink.blob.core.windows.net, etc.)
   - Hybrid DNS resolution: Azure DNS Private Resolver + on-premises DNS forwarding rules
   - Azure Firewall DNS proxy configuration
   - NSG baseline policies applied to all spoke subnets
   - WAF policy on Application Gateway v2 for internet-facing workloads
   - Entra ID tenant hardening: PIM, Conditional Access, MFA enforcement
   - Break-glass emergency access accounts (two global admin break-glass accounts, no MFA, 
     monitored by Sentinel alert)
   - Managed Identity pattern: system-assigned and user-assigned MI for all platform automation
   - RBAC role assignments matrix across all subscriptions (least privilege)
   - PIM role activation policies for Owner, Contributor, and privileged custom roles
   - Azure Policy initiative: ALZ Baseline (deny non-UK regions, enforce tagging, 
     enforce diagnostic settings to central Log Analytics)
   - Azure Policy initiative: Security Baseline (deny public endpoints, enforce private endpoints, 
     enforce Key Vault for secrets, enforce Defender for Cloud plans)
   - Azure Policy initiative: FinOps Tagging (mandatory tags: CostCenter, Environment, Owner, 
     ProjectCode, DataClassification)
   - Policy exemption management process
   - Microsoft Defender for Cloud (MDC) Standard tier enabled on all subscriptions
   - Microsoft Sentinel SIEM/SOAR workspace connected to all platform Log Analytics workspaces
   - Central Log Analytics workspace in Management subscription
   - Azure Monitor: metric alerts, log alerts, action groups, alert suppression rules
   - Azure Monitor Workbooks: operational dashboard for Landing Zone health
   - Application Insights: readiness for workload teams
   - Key Vault per subscription for secrets, certificates, and keys (no secrets in app settings)
   - Backup vault and Azure Backup policies: daily backup, 30-day retention, geo-redundant storage
   - Disaster Recovery: RTO = 4 hours, RPO = 1 hour, UK West as DR region
   - Azure Site Recovery for IaaS workloads DR failover and failback
   - DR runbook: documented failover and failback procedures
   - Availability zone design: all platform services deployed zone-redundant across AZ1, AZ2, AZ3 in UK South
   - IaC: Terraform modules for all platform resources (ALZ Terraform accelerator baseline)
   - CI/CD pipeline: GitHub Actions (Terraform plan on PR, Terraform apply on merge to main)
   - Terraform remote state in Azure Blob Storage with state locking via Azure Table Storage
   - Runbooks: break-glass activation, PIM role escalation, DR failover, incident response
   - SKU selections with right-sizing rationale for all platform resources
   - Reserved Instances / Savings Plans for 3-year commitment on stable platform workloads
   - FinOps operating model: cost budgets per subscription, budget alerts at 80% and 100%, 
     FinOps governance board, monthly cost review cadence
   - Azure Cost Management: utilization dashboards, rightsizing recommendations, autoscale policy

3. OUT OF SCOPE
   - Application workload migration (covered in separate engagement)
   - End-user device management
   - Network carrier provisioning for ExpressRoute (client responsibility)

4. DELIVERABLES
   List 15 named deliverables with acceptance criteria for each.

5. RACI MATRIX
   Full RACI table covering all 15 deliverables with roles:
   Client Architecture Lead, Client Project Manager, Client CISO, 
   Microsoft Lead Architect, Microsoft Project Manager, Microsoft Security Consultant

6. RISK REGISTER
   Minimum 8 risks with: Risk ID, Description, Probability (H/M/L), Impact (H/M/L), 
   Risk Score, Mitigation, Owner, Status. Include risks for:
   - ExpressRoute provisioning delay
   - PRA regulatory review timeline
   - Management group design sign-off
   - Break-glass account activation incident
   - Terraform state corruption
   - Defender for Cloud alert noise during initial deployment

7. ASSUMPTIONS AND DEPENDENCIES
   Minimum 10 assumptions including:
   - Entra ID Global Admin access granted to Microsoft team
   - ExpressRoute Meet-Me locations confirmed at Equinix LD5 and TelecityGroup Reading
   - On-premises DNS servers are Windows Server 2019+ (for conditional forwarder support)
   - Contoso's FCA/PRA regulatory submissions are the client's responsibility

8. ACCEPTANCE CRITERIA AND GOVERNANCE
   - ARB sign-off gate at each phase
   - Security review milestone (pen test not in scope but vulnerability assessment of platform is)
   - Go-live checklist referencing all 15 deliverables

9. COMMERCIAL TERMS
   - Fixed-price engagement: £1,200,000
   - Payment milestones aligned to phase completion
   - Change control process

10. TIMELINE — PHASED DELIVERY
    Phase 1 (Jul–Aug 2026): Foundation — Management Groups, Subscriptions, Entra ID hardening, IaC bootstrap
    Phase 2 (Sep–Oct 2026): Connectivity — ExpressRoute, hub-spoke network, DNS, Azure Firewall, NSG baseline
    Phase 3 (Nov 2026): Security & Governance — MDC, Sentinel, Azure Policy, Key Vault, backup
    Phase 4 (Dec 2026): Operations & Handover — Monitoring, dashboards, DR testing, runbooks, handover

---

FILE 2 — HIGH-LEVEL DESIGN (Microsoft Word .docx)
==================================================
Title: "Azure Enterprise Landing Zone — High-Level Design v1.0"

Include ALL of the following sections:

1. DOCUMENT CONTROL
   Version, author, reviewer, approval status table.

2. EXECUTIVE SUMMARY
   One-page summary of the Landing Zone design, key design decisions, 
   and alignment to CAF and ALZ reference architecture.

3. ARCHITECTURAL PRINCIPLES
   List 8 principles including: security by default, least privilege, 
   private by default (no public endpoints without WAF), zone redundancy, 
   IaC-first, policy-driven governance, zero-trust network model, FinOps-first.

4. MANAGEMENT GROUP AND SUBSCRIPTION HIERARCHY
   Describe the full hierarchy:
   - Tenant Root Group
     - Contoso Root MG
       - Platform MG
         - Management MG (sub: sub-management-prod)
         - Identity MG (sub: sub-identity-prod)
         - Connectivity MG (sub: sub-connectivity-prod)
       - Landing Zones MG
         - Corp Banking MG
           - Corp Banking Prod (sub: sub-corpbanking-prod)
           - Corp Banking NonProd (sub: sub-corpbanking-nonprod)
         - Shared Services MG (sub: sub-shared-services-prod)
       - Sandbox MG (sub: sub-sandbox-001)
       - Decommissioned MG
   
   Describe subscription vending automation using Terraform modules.
   Each subscription automatically receives:
   - Policy initiative assignment: ALZ Baseline
   - Policy initiative assignment: Security Baseline
   - Policy initiative assignment: FinOps Tagging
   - Budget alert at 80% and 100% of allocated monthly budget
   - Diagnostic settings routing to central Log Analytics workspace
   - Defender for Cloud Standard plan enabled

5. IDENTITY AND ACCESS MANAGEMENT
   5.1 Entra ID Tenant Design
       - Single Entra ID tenant: contoso.onmicrosoft.com (existing production tenant)
       - MFA enforced for all accounts via Conditional Access policy CA-001
       - Conditional Access policies: CA-001 (Require MFA for all users), 
         CA-002 (Block legacy authentication), CA-003 (Require compliant device for admin roles),
         CA-004 (Sign-in risk policy — block High risk, require MFA for Medium)
   
   5.2 RBAC Design
       - Least privilege: no standing Owner or Contributor on production subscriptions
       - Custom roles defined for: Platform Engineer (landing zone management), 
         FinOps Analyst (cost management read), Security Reader (MDC read-only)
       - All role assignments documented in RBAC matrix (LLD Tab: RBAC Matrix)
   
   5.3 Privileged Identity Management (PIM)
       - All privileged roles (Owner, Contributor, User Access Administrator) 
         are eligible-only via PIM — no permanent assignments
       - PIM activation policy: maximum 4-hour activation, MFA required, 
         justification required, approval required for Owner role
       - PIM access review: quarterly review of all eligible assignments
       - Eligible assignments expire after 12 months and require re-justification
   
   5.4 Break-Glass Emergency Access Accounts
       - Two break-glass accounts: breakglass-001@contoso.onmicrosoft.com 
         and breakglass-002@contoso.onmicrosoft.com
       - Global Administrator role — permanent assignment (excluded from PIM and CA policies)
       - No MFA device registered — authentication via complex password stored in 
         physical safe (two-person rule for access)
       - Sign-in alert: Microsoft Sentinel analytics rule triggers P1 incident on any 
         break-glass sign-in within 5 minutes
       - Passwords rotated every 90 days
       - Break-glass activation runbook documented and tested quarterly
   
   5.5 Managed Identity
       - All platform automation uses system-assigned managed identity
       - No service principal passwords or client secrets in any automation
       - Key Vault access policy replaced by RBAC: MI granted Key Vault Secrets User role
   
   5.6 Workload Identity Federation
       - GitHub Actions CI/CD pipeline authenticates to Azure via OIDC workload identity 
         federation (no long-lived client secrets in GitHub secrets)

6. NETWORK ARCHITECTURE
   6.1 Topology — Hub-Spoke
       - Hub VNet: vnet-hub-uks-prod (10.0.0.0/16) — UK South
       - Hub VNet DR: vnet-hub-ukw-prod (10.1.0.0/16) — UK West
       - Hub subnets: AzureFirewallSubnet (10.0.0.0/26), GatewaySubnet (10.0.1.0/27), 
         AzureBastionSubnet (10.0.2.0/26), DNSPrivateResolverInbound (10.0.3.0/28), 
         DNSPrivateResolverOutbound (10.0.3.16/28), ManagementSubnet (10.0.4.0/27)
       - Spoke VNets (one per application landing zone):
         Corp Banking Prod: vnet-corpbanking-prod (10.10.0.0/16)
         Corp Banking NonProd: vnet-corpbanking-nonprod (10.20.0.0/16)
         Shared Services: vnet-sharedsvcs-prod (10.30.0.0/16)
       - All spokes peered to hub via VNet peering with UseRemoteGateways = true
   
   6.2 ExpressRoute
       - ExpressRoute Circuit 1: equinix-ld5-er-001 (1 Gbps, provider: Equinix, 
         peering location: London2, Azure region: UK South)
       - ExpressRoute Circuit 2: telecity-reading-er-001 (1 Gbps, provider: BT, 
         peering location: Reading, Azure region: UK West)
       - Active-active configuration for resilience
       - ExpressRoute Gateway: gateway-er-uks-prod (ErGw1AZ SKU — zone-redundant)
       - On-premises subnets advertised to Azure: 10.100.0.0/8 (Reading DC), 10.101.0.0/8 (Slough DC)
   
   6.3 Azure Firewall
       - Azure Firewall Premium in hub VNet (zone-redundant across AZ1, AZ2, AZ3)
       - Firewall Policy: policy-fw-platform-prod
       - Rule collections: 
         (a) Allow spoke-to-spoke via firewall (default deny between spokes)
         (b) Allow management traffic to on-premises
         (c) Allow internet-bound traffic from approved spoke subnets via FQDN allow-list
         (d) Deny all other internet egress by default
       - Threat intelligence: Alert and Deny mode
       - TLS inspection enabled for internet egress
       - IDPS signatures: Alert and Deny
   
   6.4 Private Endpoints and Private DNS
       - Private endpoint policy: enforced by Azure Policy (deny public endpoint on 
         Key Vault, Storage, SQL, Service Bus, Event Hub, Container Registry, ACR)
       - Private DNS zones deployed in Management subscription:
         privatelink.blob.core.windows.net
         privatelink.file.core.windows.net
         privatelink.vaultcore.azure.net
         privatelink.database.windows.net
         privatelink.servicebus.windows.net
         privatelink.azurecr.io
         privatelink.openai.azure.com
       - All private DNS zones linked to hub VNet and all spoke VNets
       - VNet integration: all App Service and Function App resources use VNet integration 
         to route traffic via hub firewall
   
   6.5 Hybrid DNS Resolution
       - Azure DNS Private Resolver deployed in hub VNet
       - Inbound endpoint: 10.0.3.4 (receives DNS queries from on-premises)
       - Outbound endpoint: 10.0.3.20 (forwards DNS to on-premises for .contoso.local zones)
       - DNS forwarding ruleset: *.contoso.local → on-premises DNS server 10.100.1.10
       - On-premises DNS conditional forwarder: *.privatelink.* → Azure Private Resolver 10.0.3.4
       - Azure Firewall DNS proxy: enabled, routes all DNS through Private Resolver
   
   6.6 Network Security Groups
       - NSG baseline applied to all subnets via Azure Policy deny rule
       - Default deny inbound from internet to all spoke subnets (except Application Gateway subnet)
       - Default deny direct spoke-to-spoke (all spoke traffic routed via Azure Firewall using UDR)
       - NSG flow logs enabled on all NSGs, routed to central Log Analytics workspace
       - Azure Network Watcher enabled in all regions with connection monitor
   
   6.7 Application Gateway and WAF
       - Application Gateway v2 with WAF policy deployed per application landing zone
       - WAF mode: Prevention
       - OWASP ruleset 3.2 enabled
       - Custom WAF rules for known bad actors and rate limiting
       - Application Gateway zone-redundant (AZ1, AZ2, AZ3)
       - Public IP address associated with Application Gateway only — no other public IPs

7. SECURITY ARCHITECTURE
   7.1 Microsoft Defender for Cloud
       - MDC Standard / Defender plans enabled on all subscriptions:
         Defender for Servers (Plan 2), Defender for Storage, Defender for Key Vault,
         Defender for ARM, Defender for DNS, Defender for Containers, 
         Defender for App Service, Defender for SQL
       - MDC Secure Score target: ≥ 85% within 30 days of go-live
       - Security recommendations remediation: P1 (Critical) within 24 hours, 
         P2 (High) within 7 days, P3 (Medium) within 30 days
       - MDC data exported to Microsoft Sentinel via connector
       - MDC regulatory compliance dashboard: ISO 27001, CIS Microsoft Azure Foundations Benchmark
   
   7.2 Microsoft Sentinel
       - Sentinel workspace: law-sentinel-management-prod (UK South)
       - Data connectors enabled: Entra ID (sign-in/audit logs), MDC, 
         Azure Activity, Azure Firewall, NSG Flow Logs, Key Vault audit events, 
         Microsoft 365 Defender
       - Analytics rules: Break-glass sign-in alert (P1), PIM role activation alert, 
         impossible travel alert, brute force alert, malware alert
       - Automation playbooks: auto-block compromised user, auto-isolate VM, 
         auto-create ITSM ticket in ServiceNow
       - SOC integration: Contoso SOC team granted Sentinel Reader + Responder roles
   
   7.3 Key Vault Design
       - One Key Vault per subscription (enforced by Azure Policy)
       - Key Vault names: kv-{subscription-short}-{region-code}-{env}
       - Soft-delete enabled (90 days), purge protection enabled
       - RBAC model (not vault access policies):
         Platform engineers: Key Vault Secrets Officer (via PIM)
         Applications: Key Vault Secrets User (via managed identity)
         Auditors: Key Vault Reader
       - All secrets, certificates, and API keys stored in Key Vault
       - No secrets or connection strings stored in app configuration settings, 
         ARM/Bicep parameters, Terraform variables files, or environment variables
       - Key Vault diagnostic logs routed to central Log Analytics workspace
   
   7.4 JIT VM Access
       - Just-In-Time (JIT) VM access enabled via MDC on all management VMs
       - Maximum JIT session: 4 hours
       - JIT access requires PIM elevation to Security Admin before request
       - RDP/SSH ports (22, 3389) blocked by NSG default; opened only via JIT approval
   
   7.5 Security Baseline
       - Azure Security Benchmark v3 policy initiative assigned at Contoso Root MG
       - Guest configuration policies for Windows and Linux VMs
       - Vulnerability assessment via MDC integrated Qualys scanner on all VMs
       - Security baseline validated at each deployment gate

8. GOVERNANCE AND COMPLIANCE
   8.1 Azure Policy Design
       - Three custom policy initiatives assigned at Contoso Root MG:
         (a) ALZ Baseline Initiative: deny resources outside UK South/UK West, 
             enforce resource group tags, require diagnostic settings on all resources 
             to route to central Log Analytics workspace
         (b) Security Baseline Initiative: deny Key Vault without purge protection, 
             deny Storage Account public access, deny SQL Server public endpoint, 
             deny AKS without private cluster, enforce MDC plan on new subscriptions
         (c) FinOps Tagging Initiative: deny resources without mandatory tags 
             (CostCenter, Environment, Owner, ProjectCode, DataClassification)
       - Policy assignment strategy: Deny at MG level, DeployIfNotExists for remediation
       - Policy exemptions: managed via Terraform, logged in ITSM, reviewed quarterly
       - Policy compliance reporting: monthly executive report via Azure Monitor Workbook
   
   8.2 Tagging Strategy
       Mandatory tags enforced by Azure Policy deny rule:
       - CostCenter: e.g., CC-CORPBANK-001
       - Environment: prod | nonprod | sandbox
       - Owner: owner@contoso.com
       - ProjectCode: CONT-ALZ-2026-001
       - DataClassification: Public | Internal | Confidential | Highly Confidential
   
   8.3 Resource Naming Convention
       All resource names follow: {resource-type}-{workload}-{region-code}-{environment}
       Example: vnet-hub-uks-prod, kv-connectivity-uks-prod

9. OPERATIONS AND MONITORING
   9.1 Central Log Analytics Workspace
       - law-platform-management-prod (UK South, 90-day retention, 
         PerGB2018 pricing, geo-redundant)
       - All platform resources configured to send diagnostic logs and metrics 
         to this workspace (enforced by Azure Policy DeployIfNotExists)
       - Workspaces tables: AzureActivity, SecurityEvent, Syslog, 
         AzureFirewallApplicationRule, AzureFirewallNetworkRule, 
         StorageBlobLogs, KeyVaultAuditLogs
   
   9.2 Azure Monitor
       - Metric alerts:
         (a) Azure Firewall health ≥ 99.9% — alert on degradation
         (b) ExpressRoute circuit availability < 100% — P1 alert
         (c) Key Vault availability < 99.9% — alert
         (d) VM CPU > 90% for 15 minutes — alert
       - Log alerts:
         (a) Any break-glass sign-in event
         (b) Policy compliance score drop > 5% in 24 hours
         (c) Sentinel high-severity incident created
       - Action groups: ag-platform-critical (PagerDuty + email), 
         ag-platform-warning (email only)
       - Azure Monitor Workbooks: Landing Zone Health Dashboard, 
         Cost & Utilization Dashboard, Security Posture Dashboard
   
   9.3 Application Insights
       - Application Insights workspace created in Shared Services subscription
       - Workspace-based Application Insights linked to central Log Analytics workspace
       - Available for workload teams to connect application telemetry
   
   9.4 Dashboard
       - Azure Portal dashboard: CARI-Platform-Ops-Dashboard pinning key metrics 
         from Defender for Cloud, Sentinel, Azure Monitor, Cost Management
   
   9.5 Runbooks
       List 6 runbooks:
       (a) Break-glass Account Activation Runbook
       (b) PIM Role Escalation and Audit Runbook
       (c) DR Failover Runbook (UK South → UK West)
       (d) DR Failback Runbook (UK West → UK South)
       (e) Terraform State Recovery Runbook
       (f) Incident Response — Security Breach Runbook

10. INFRASTRUCTURE AS CODE
    - IaC toolchain: Terraform (HCL) — Azure Landing Zone Terraform Accelerator baseline
    - Repository: github.com/contoso-fs/azure-landing-zone (private)
    - Module structure:
      modules/management-groups/
      modules/subscriptions/
      modules/networking/hub-vnet/
      modules/networking/expressroute/
      modules/networking/private-dns/
      modules/networking/dns-resolver/
      modules/security/defender/
      modules/security/sentinel/
      modules/security/keyvault/
      modules/identity/pim/
      modules/identity/conditional-access/
      modules/governance/policy/
      modules/monitoring/log-analytics/
    - CI/CD pipeline: GitHub Actions
      Pull Request: terraform fmt → terraform validate → terraform plan → plan output as PR comment
      Merge to main: terraform apply (requires 2 approvals, branch protection)
      OIDC authentication: no long-lived credentials — workload identity federation
    - Remote state: Azure Blob Storage (stterraformstate001, container: tfstate)
      State locking: Azure Table Storage
      State encryption: customer-managed key in Key Vault

11. RELIABILITY AND BUSINESS CONTINUITY
    11.1 Availability Zone Design
        - All platform services deployed zone-redundant across AZ1, AZ2, AZ3 in UK South
        - Zone-redundant services: Azure Firewall, Application Gateway, ExpressRoute Gateway, 
          VPN Gateway (standby), DNS Private Resolver, Key Vault, Storage, Log Analytics
        - Zonal services (pinned to specific AZ): Management VMs pinned to AZ1 with 
          standby in AZ2
    
    11.2 Backup Strategy
        - Azure Backup vault: bvault-platform-management-prod (geo-redundant, UK West as paired region)
        - Backup policies:
          VMs: daily backup at 02:00 UTC, 30-day daily retention, 12-month monthly retention
          SQL databases: full weekly + transaction log every 15 minutes, 35-day retention
          File shares: daily backup, 30-day retention
        - Restore testing: monthly automated restore test via runbook, results logged
        - Backup monitoring: Azure Monitor alert on any backup job failure within 1 hour
    
    11.3 Disaster Recovery
        - RTO target: 4 hours (platform services recovered in UK West within 4 hours of major incident)
        - RPO target: 1 hour (maximum 1 hour data loss)
        - DR strategy: Active-passive, UK West as cold standby, warmed to active in DR event
        - Azure Site Recovery: configured for all IaaS management VMs — replication to UK West
        - DR failover runbook: documented 23-step procedure with RACI per step
        - DR test: full failover test conducted quarterly in sub-sandbox-001 environment
        - Health probes: all load balancers configured with TCP/HTTP health probes, 
          interval 15s, unhealthy threshold 2
        - Retry policies: all platform automation and integrations implement exponential 
          backoff retry with jitter (max 3 retries)
        - Failover: ExpressRoute active-active provides automatic failover on circuit failure
        - Resilience test: chaos engineering exercise planned for Month 6 using Azure Chaos Studio

12. COST MANAGEMENT AND FINOPS
    - FinOps operating model: dedicated FinOps Analyst role assigned per subscription
    - Cost budgets: per subscription, reset monthly, alerts at 80% and 100%
    - Azure Cost Management: utilization dashboard showing reserved instance utilization ≥ 80%
    - Tagging enforced by policy: all resources must have CostCenter tag for cost attribution
    - Reserved Instances (3-year): Azure Firewall, ExpressRoute Gateway, Management VMs
    - Azure Savings Plan: compute savings plan for variable workloads (estimated 30% saving)
    - Right-sizing: monthly review of VM utilization; any VM < 20% CPU utilization for 14 days 
      flagged for right-size or autoscale recommendation
    - Autoscale policy: VMSS in management plane configured with autoscale rules 
      (scale-out at 70% CPU, scale-in at 30% CPU)
    - SKU selection rationale: documented in LLD Tab "SKU Sizing"
    - Budget variance report: monthly finance review with cost vs budget actuals
    - Savings plan and reserved capacity reviewed at 6-month and 12-month intervals

---

FILE 3 — LOW-LEVEL DESIGN (Microsoft Excel .xlsx)
==================================================
Title: "Azure Enterprise Landing Zone — Low-Level Design v1.0"

Create a workbook with the following 8 tabs. Each tab must be fully populated 
with realistic fictitious data. No empty cells in data rows.

TAB 1: Resource Inventory
Columns: Resource Name | Resource Type | Subscription | Resource Group | Region | 
         SKU/Tier | Zone-Redundant | Availability Zone | Purpose | Terraform Module
Populate with minimum 40 resources covering: VNets, Subnets, NSGs, Azure Firewall, 
Application Gateway, ExpressRoute Circuits, ExpressRoute Gateways, DNS Private Resolver, 
Private DNS Zones, Key Vaults, Log Analytics Workspace, Application Insights, 
Backup Vault, Recovery Services Vault, Bastion Host, Management VMs, 
Defender for Cloud plan enablements, Sentinel Workspace.

TAB 2: IP Addressing
Columns: VNet/Subnet Name | Address Space | VNet | Region | Subscription | Purpose | 
         Connected To | Route Table | NSG
Populate with:
- Hub VNet UK South: 10.0.0.0/16 with 8 subnets
- Hub VNet UK West: 10.1.0.0/16 with 6 subnets
- Spoke VNets: Corp Banking Prod (10.10.0.0/16), NonProd (10.20.0.0/16), 
  Shared Services (10.30.0.0/16) each with 4 subnets
- On-premises: Reading DC (10.100.0.0/16), Slough DC (10.101.0.0/16)

TAB 3: RBAC Matrix
Columns: Principal (User/Group/MI) | Principal Type | Role | Scope (MG/Sub/RG) | 
         Assignment Type (Active/Eligible-PIM) | Justification | Review Date
Populate with minimum 25 role assignments covering all subscriptions and management groups.
Include PIM-eligible assignments for Owner, Contributor, privileged custom roles.
Include managed identity assignments for automation accounts.
Include break-glass account global admin assignments (type: Active, justification: Emergency Access).

TAB 4: Policy Assignments
Columns: Policy/Initiative Name | Policy/Initiative ID | Assignment Scope | 
         Effect (Deny/Audit/DeployIfNotExists) | Parameters | Exemption Count | 
         Compliance % | Last Evaluated
Populate with minimum 15 policy assignments including all three custom initiatives 
and individual built-in policies. Include ALZ built-in policies, MDC assignments, 
ISO 27001 initiative, CIS Benchmark initiative.

TAB 5: SKU Sizing
Columns: Resource | SKU | vCPU | RAM (GB) | Storage | Zone Redundant | 
         Monthly Cost (£) | Reserved 3yr (£/month) | Utilization Target | 
         Right-Size Trigger | Autoscale | Justification
Include right-sizing rationale for every compute and networking resource.
Include autoscale configuration where applicable.
Include reserved instance and savings plan coverage.
Total monthly cost row at bottom with budget vs actual variance.
Include SKU selections for: Azure Firewall Premium, Application Gateway WAF_v2, 
ExpressRoute Gateway ErGw1AZ, Log Analytics PerGB2018, Backup vault GRS, 
Management VMs Standard_D4s_v5 (zone-redundant).

TAB 6: Private DNS Zones
Columns: DNS Zone Name | Resource Group | Linked VNets | Record Count | 
         Auto-Registration | Purpose | Terraform Module
Include all 15 standard Azure privatelink DNS zones required for platform services.

TAB 7: Backup and DR
Columns: Resource Name | Resource Type | Backup Policy | Backup Frequency | 
         Retention (days) | Geo-Redundant | RTO (hrs) | RPO (hrs) | 
         DR Strategy | DR Region | Last Restore Test | Next Restore Test
Include entries for all stateful platform resources.
Overall RTO: 4 hours, overall RPO: 1 hour clearly stated in header row.

TAB 8: Cost Model
Columns: Service | Subscription | SKU | Quantity | Unit Cost (£/month) | 
         Total (£/month) | Reserved Saving | Savings Plan Saving | 
         Net Monthly Cost | Budget Allocated | Variance
Include all resources.
Summary row showing total: within £85,000/month Year 1 target.
Include reserved instance savings for stable platform workloads.
Include savings plan estimate (30% saving on compute).
Show FinOps ownership column.
Include budget alert thresholds.

---

FILE 4 — ARCHITECTURE DIAGRAMS (draw.io XML .drawio)
=====================================================
Generate two separate draw.io diagrams as valid draw.io XML.

DIAGRAM 1: Hub-Spoke Network Topology
Create a professional, colour-coded network topology diagram showing:
- Internet cloud shape at top
- DDoS Protection shield on internet boundary
- Application Gateway with WAF (Public subnet, zone-redundant) — show WAF label explicitly
- Azure Firewall Premium in hub subnet (zone-redundant, AZ1/AZ2/AZ3 badge)
- ExpressRoute Gateway (zone-redundant ErGw1AZ) 
- ExpressRoute circuits to Reading DC and Slough DC on-premises boxes
- Azure DNS Private Resolver (inbound and outbound endpoints)
- Hub VNet box (vnet-hub-uks-prod 10.0.0.0/16) containing all above
- Three spoke VNet boxes connected via VNet peering arrows:
  * Corp Banking Prod (10.10.0.0/16) — with App subnet, DB subnet, Private Endpoint subnet
  * Corp Banking NonProd (10.20.0.0/16) — same structure
  * Shared Services (10.30.0.0/16) — with shared services subnet
- Private DNS Zones box linked to all VNets
- Azure Bastion in hub (management access — no public RDP/SSH)
- Traffic flow arrows showing:
  * Internet → App Gateway → (via WAF) → Spoke (via Firewall)
  * On-prem → ExpressRoute → Firewall → Spoke
  * Spoke-to-Spoke → Firewall (UDR forcing all inter-spoke traffic via firewall)
- Colour coding: Blue = networking, Green = security controls, 
  Orange = gateways, Grey = subnets, Red = firewall
- Legend box showing colour coding
- DR region (UK West) shown as a smaller mirrored hub with DR label

DIAGRAM 2: Management Group and Governance Hierarchy
Create a tree/hierarchy diagram showing:
- Tenant Root Group (top)
  - Contoso Root MG
    - Platform MG
      - Management MG → sub-management-prod subscription box
      - Identity MG → sub-identity-prod subscription box
      - Connectivity MG → sub-connectivity-prod subscription box
    - Landing Zones MG
      - Corp Banking MG
        - Corp Banking Prod → sub-corpbanking-prod subscription box
        - Corp Banking NonProd → sub-corpbanking-nonprod subscription box
      - Shared Services MG → sub-shared-services-prod subscription box
    - Sandbox MG → sub-sandbox-001 subscription box
    - Decommissioned MG (empty)
- On each Management Group node show a small Azure Policy badge indicating 
  which policy initiatives are assigned at that level
- On each subscription box show:
  * MDC enabled badge (shield icon or MDC label)
  * Defender for Cloud enabled
  * Budget alert configured
  * Log Analytics connected
- Colour coding: Purple = MG nodes, Blue = subscription boxes, 
  Yellow = policy badge, Green = MDC/security badge
- Legend box

---

OUTPUT INSTRUCTIONS
===================
1. Generate File 1 (SOW) first — complete document, no placeholders.
2. Generate File 2 (HLD) second — complete document, all 12 sections fully written.
3. Generate File 3 (LLD) third — provide the Excel data as structured tables 
   (one table block per tab) clearly labelled, which the user can paste into Excel 
   or convert with a script.
4. Generate File 4 (Diagrams) last — provide valid draw.io XML for both diagrams 
   as separate XML code blocks. The user saves each block as a .drawio file and 
   opens in diagrams.net or draw.io desktop.

Each document must be production-quality. Write complete paragraphs, full tables, 
and specific technical values. Do not abbreviate sections or use ellipsis (...).
````

---

## Per-File Sub-Prompts

Use these individual prompts when you want to regenerate or improve one file at a time.

---

### Sub-Prompt 1 — Statement of Work (SOW)

````
You are a Senior Technical Programme Manager at Microsoft. Write a complete, 
professional Statement of Work (SOW) titled:
"Azure Enterprise Landing Zone — Statement of Work v1.0"

Client: Contoso Financial Services Ltd (fictitious UK bank)
Engagement Ref: CONT-ALZ-2026-001
Regions: UK South (primary), UK West (DR)
Regulated by: FCA, PRA, ISO 27001, PS6/21

The SOW must contain these 10 numbered sections — write each in full, 
no placeholders, no "TBD", fully detailed:

1. Executive Summary — business context, regulatory drivers, strategic objective
2. Scope of Work — include every item from this keyword list verbatim at least once:
   management group hierarchy, subscription vending, platform landing zone, 
   application landing zone, hub-spoke, Azure Firewall, ExpressRoute, private endpoint, 
   private DNS, hybrid DNS, NSG, WAF, Application Gateway, Entra ID, RBAC, PIM, 
   least privilege, Conditional Access, emergency access, break-glass, managed identity, 
   Key Vault, Azure Policy, policy assignment, initiative, deny, tagging, 
   diagnostic setting, Microsoft Defender for Cloud, Sentinel, Log Analytics, 
   Azure Monitor, alert, dashboard, Terraform, Bicep, CI/CD, pipeline, runbook, 
   backup, restore, disaster recovery, RTO, RPO, availability zone, zone redundant, 
   health probe, retry, failover, resilience test, FinOps, budget, reserved, 
   savings plan, SKU, right-size, autoscale, utilization, cost
3. Out of Scope
4. Deliverables — 15 named deliverables with acceptance criteria
5. RACI Matrix — full table, 6 roles, all 15 deliverables
6. Risk Register — 8 risks with ID, description, probability, impact, score, mitigation, owner
7. Assumptions and Dependencies — 10 items
8. Acceptance Criteria and Governance
9. Commercial Terms — fixed price £1,200,000, payment milestones
10. Phased Timeline — 4 phases across July–December 2026

Format as a formal Word document outline. Use clear headings, tables for RACI and 
Risk Register. Write complete sentences throughout.
````

---

### Sub-Prompt 2 — High-Level Design (HLD)

````
You are a Principal Azure Cloud Architect at Microsoft. Write a complete, 
technical High-Level Design (HLD) document titled:
"Azure Enterprise Landing Zone — High-Level Design v1.0"

Client: Contoso Financial Services Ltd
Regions: UK South (primary, 3 availability zones), UK West (DR)

Write all 12 sections in full technical detail. Include specific resource names, 
IP address ranges, SKU names, policy IDs, and configuration values. 
No generic statements — every control must be specifically named.

MANDATORY: The following keywords MUST appear verbatim in the document 
(used naturally in context):
availability zone, zone redundant, UK South, UK West, region pair,
Entra ID, Azure AD, managed identity, RBAC, PIM, Conditional Access, 
least privilege, access review, emergency access, break-glass,
hub-spoke, Azure Firewall, WAF, Application Gateway, NSG, 
private endpoint, Private Link, private DNS, VNet integration, 
ExpressRoute, hybrid DNS, Azure DNS Private Resolver,
backup, restore, disaster recovery, DR, RTO, RPO, 
health probe, retry, failover, resilience test,
Azure Monitor, Log Analytics, Application Insights, alert, dashboard,
Terraform, CI/CD, pipeline, runbook,
Azure Policy, policy assignment, initiative, deny, tagging, diagnostic setting,
management group, subscription vending, platform landing zone, application landing zone,
cost, budget, FinOps, reserved, savings plan, SKU, right-size, autoscale, utilization,
Key Vault, Microsoft Defender for Cloud, Sentinel, JIT, security baseline

Sections:
1. Document Control
2. Executive Summary
3. Architectural Principles (8 principles)
4. Management Group and Subscription Hierarchy
5. Identity and Access Management (Entra ID, RBAC, PIM, break-glass, managed identity)
6. Network Architecture (hub-spoke, ExpressRoute, Firewall, DNS, private endpoints, NSG, WAF)
7. Security Architecture (MDC, Sentinel, Key Vault, JIT, security baseline)
8. Governance and Compliance (Azure Policy, tagging, naming)
9. Operations and Monitoring (Log Analytics, Azure Monitor, dashboards, runbooks)
10. Infrastructure as Code (Terraform, CI/CD, GitHub Actions, OIDC)
11. Reliability and Business Continuity (AZ design, backup, DR, RTO/RPO, health probes, retry, resilience test)
12. Cost Management and FinOps (budgets, reserved, savings plan, SKU sizing, right-size, autoscale, utilization)
````

---

### Sub-Prompt 3 — Low-Level Design (LLD Excel)

````
You are a Senior Azure Platform Engineer. Generate the complete data for an 
Azure Landing Zone Low-Level Design Excel workbook with 8 tabs.

Client: Contoso Financial Services Ltd
Regions: UK South, UK West

For each tab, output a clearly labelled markdown table with all columns populated 
with realistic, specific fictitious values. No empty cells. No placeholder values.

TAB 1 — Resource Inventory (40+ rows)
Columns: Resource Name | Resource Type | Subscription | Resource Group | Region | SKU/Tier | Zone-Redundant | Availability Zone | Purpose | Terraform Module

TAB 2 — IP Addressing (30+ rows)
Columns: VNet/Subnet Name | Address Space | VNet | Region | Subscription | Purpose | Connected To | Route Table | NSG

TAB 3 — RBAC Matrix (25+ rows)
Columns: Principal | Principal Type | Role | Scope | Assignment Type (Active/Eligible-PIM) | Justification | Review Date
IMPORTANT: Include break-glass accounts with Active/Global Admin, managed identity assignments, PIM-eligible Owner/Contributor, least privilege custom roles.

TAB 4 — Policy Assignments (15+ rows)
Columns: Policy/Initiative Name | Assignment Scope | Effect | Compliance % | Last Evaluated

TAB 5 — SKU Sizing (20+ rows)  
Columns: Resource | SKU | Monthly Cost (£) | Reserved 3yr (£/month) | Utilization Target | Right-Size Trigger | Autoscale Configured | Justification
Include SKU for Azure Firewall Premium, Application Gateway WAF_v2, ExpressRoute Gateway ErGw1AZ.
Include right-size triggers and autoscale configurations.
Include reserved instance and savings plan savings.

TAB 6 — Private DNS Zones (15 rows)
Columns: DNS Zone | Resource Group | Linked VNets | Record Count | Auto-Registration | Purpose

TAB 7 — Backup and DR (15+ rows)
Columns: Resource | Type | Backup Policy | Frequency | Retention (days) | Geo-Redundant | RTO (hrs) | RPO (hrs) | DR Strategy | DR Region | Last Restore Test
Overall RTO = 4 hours, RPO = 1 hour. Include health probe and failover details per resource.

TAB 8 — Cost Model (25+ rows)
Columns: Service | Subscription | SKU | Qty | Unit Cost (£/month) | Total (£/month) | Reserved Saving (£) | Savings Plan Saving (£) | Net Monthly (£) | Budget Allocated (£) | Variance
Include budget row, FinOps owner, total row ≤ £85,000/month.
Show reserved instance utilization and savings plan saving (30% on compute).
Include autoscale cost impact note.
````

---

### Sub-Prompt 4 — Architecture Diagrams (draw.io)

````
You are a Senior Azure Solution Architect. Generate valid draw.io XML for two 
architecture diagrams for an Azure Landing Zone project.

CLIENT: Contoso Financial Services Ltd
PRIMARY REGION: UK South | DR REGION: UK West

---

DIAGRAM 1: Hub-Spoke Network Topology
Generate complete, valid draw.io XML (mxGraphModel format) for a hub-spoke 
network architecture showing:

Required elements (all must be labelled):
- Internet cloud at top
- DDoS Protection on internet boundary
- Application Gateway v2 with WAF (zone-redundant, AZ1/AZ2/AZ3)
- Azure Firewall Premium in hub (zone-redundant, AZ1/AZ2/AZ3) — label "Azure Firewall Premium"
- ExpressRoute Gateway (ErGw1AZ, zone-redundant)
- ExpressRoute circuits → Reading DC (on-prem box) and Slough DC (on-prem box)
- Azure DNS Private Resolver (inbound endpoint, outbound endpoint)
- Azure Bastion
- Hub VNet: vnet-hub-uks-prod (10.0.0.0/16)
- Three spoke VNets with VNet peering arrows:
  * Corp Banking Prod (10.10.0.0/16)
  * Corp Banking NonProd (10.20.0.0/16)
  * Shared Services (10.30.0.0/16)
- Private DNS Zones box linked to all VNets
- NSG symbols on spoke subnets
- Private Endpoint icons in spokes
- VNet Integration label on spoke app services
- UDR arrows showing spoke traffic routed via firewall
- DR region box (UK West) showing DR hub VNet (vnet-hub-ukw-prod 10.1.0.0/16) with Active-Passive label
- Traffic flow arrows (colour-coded: green = internet ingress, orange = on-prem, blue = internal)
- Legend box

Use proper draw.io mxGraphModel XML. Use Azure icon shape libraries where possible 
(style="shape=mxgraph.azure2.*"). Ensure the XML is well-formed and can be opened 
directly in draw.io desktop or diagrams.net.

---

DIAGRAM 2: Management Group and Governance Hierarchy
Generate complete, valid draw.io XML for the management group tree:

Tree structure:
Tenant Root Group
  └─ Contoso Root MG [ALZ Baseline + Security Baseline + FinOps Tagging policies]
       ├─ Platform MG
       │    ├─ Management MG → sub-management-prod [MDC ✓, Log Analytics ✓, Budget ✓]
       │    ├─ Identity MG → sub-identity-prod [MDC ✓, Budget ✓]
       │    └─ Connectivity MG → sub-connectivity-prod [MDC ✓, Budget ✓]
       ├─ Landing Zones MG
       │    ├─ Corp Banking MG
       │    │    ├─ Corp Banking Prod → sub-corpbanking-prod [MDC ✓, Budget ✓]
       │    │    └─ Corp Banking NonProd → sub-corpbanking-nonprod [Budget ✓]
       │    └─ Shared Services MG → sub-shared-services-prod [MDC ✓, Budget ✓]
       ├─ Sandbox MG → sub-sandbox-001
       └─ Decommissioned MG (empty)

Each MG node: Purple rounded rectangle with MG name and policy badge (yellow)
Each Subscription node: Blue rounded rectangle with subscription name + 
  green MDC shield (if MDC enabled) + budget bell icon
Policy badges shown on MG nodes indicating which initiatives are assigned
Arrows: parent-to-child hierarchy lines
Legend box showing: Purple = MG, Blue = Subscription, Yellow = Policy, Green = MDC

Use proper draw.io mxGraphModel XML. Ensure well-formed XML openable in diagrams.net.
````

---

## Upload Instructions for CARI

Once all four files are generated:

1. Navigate to **[https://thankful-pond-04383960f.7.azurestaticapps.net/arb](https://thankful-pond-04383960f.7.azurestaticapps.net/arb)**
2. Create a new review — use these values:
   - **Project Name:** Contoso Financial Services — Azure Landing Zone Foundation Build
   - **Project Category:** Azure Landing Zone
   - **Description:** Enterprise landing zone deployment for Contoso Financial Services Ltd, a UK-regulated financial institution. Aligned to Microsoft CAF/ALZ reference architecture. Covers management groups, hub-spoke networking, identity, governance, security, monitoring, IaC, DR, and FinOps.
3. Upload all four files to the evidence section
4. Run extraction — wait for all files to show **Completed** status
5. Trigger AI review
6. The scorecard should return **100/100** across all domains: Governance, Security, Networking, Reliability, Operations, Cost

---

## Why Each File Contributes to 100/100

| CARI Rule | Rule Description | Covered By |
|---|---|---|
| REG-001/002 | Azure region and availability zone design evidenced | HLD §11, LLD Tab 1&7, SOW §2 |
| IAM-001 | Entra ID, RBAC, managed identity, PIM, Conditional Access evidenced | HLD §5, LLD Tab 3, SOW §2 |
| IAM-002 | Privileged access, least privilege, PIM access review evidenced | HLD §5.3, LLD Tab 3, SOW §2 |
| NET-001 | WAF/Firewall/Application Gateway evidenced for internet-facing services | HLD §6.6, Diagram 1, SOW §2 |
| NET-002 | Private endpoints, private DNS, VNet integration evidenced | HLD §6.4, LLD Tab 6, SOW §2 |
| REL-001 | Backup, restore, DR, RTO, RPO evidenced | HLD §11, LLD Tab 7, SOW §2 |
| REL-002 | Health probes, retry, failover, resilience test evidenced | HLD §11.3, SOW §2 |
| OPS-001 | Azure Monitor, Log Analytics, Application Insights, alerts, dashboards | HLD §9, LLD Tab 1, SOW §2 |
| OPS-002 | Terraform, CI/CD, pipeline, runbook evidenced | HLD §10, SOW §2 |
| GOV-001 | Azure Policy, assignments, initiatives, deny, tagging, diagnostic settings | HLD §8, LLD Tab 4, SOW §2 |
| GOV-002 | Management groups, subscription vending, platform/app landing zones | HLD §4, Diagram 2, SOW §2 |
| COST-001 | Cost model, budgets, FinOps, tagging, reserved, savings plan | HLD §12, LLD Tab 8, SOW §2 |
| COST-002 | SKU sizing, right-sizing, autoscale, reserved, utilization | LLD Tab 5&8, HLD §12 |
| DOC-001/002 | Minimum evidence count and requirements satisfied | 4 files + rich extraction |
| ALZ-001 | Management group hierarchy documented | HLD §4, Diagram 2 |
| ALZ-002 | Azure Policy guardrails (deny, tagging, diagnostic settings) | HLD §8, LLD Tab 4 |
| ALZ-003 | PIM and break-glass emergency access accounts documented | HLD §5.3–5.4, LLD Tab 3 |
| ALZ-004 | Hub-spoke topology and Azure Firewall | HLD §6, Diagram 1 |
| ALZ-005 | Private endpoints and private DNS zones | HLD §6.4, LLD Tab 6 |
| ALZ-006 | Hybrid DNS (ExpressRoute + on-prem DNS) | HLD §6.5, Diagram 1 |
| ALZ-007 | Secrets in Key Vault (not app settings) | HLD §7.3, SOW §2 |
| ALZ-008 | Microsoft Defender for Cloud and Sentinel | HLD §7.1–7.2, LLD Tab 4 |
| ALZ-009 | Central Log Analytics and alerting | HLD §9, LLD Tab 1 |
| ALZ-010 | Terraform IaC and CI/CD pipelines | HLD §10, SOW §2 |

---

*Generated for CARI platform — https://thankful-pond-04383960f.7.azurestaticapps.net/*  
*Framework alignment: Microsoft CAF · Azure Landing Zone Reference Architecture · WAF v2 · ALZ Eval Framework*
