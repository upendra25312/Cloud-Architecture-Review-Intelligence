"use client";

import { useState } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

type StepKey = "overview" | "upload" | "requirements" | "evidence" | "findings" | "scorecard" | "decision";

// ── Mock data ─────────────────────────────────────────────────────────────────

const DEMO_REVIEW = {
  reviewId: "demo-contoso-lz-2026",
  projectName: "Contoso Financial Services — Azure Landing Zone",
  customerName: "Contoso Bank",
  workflowState: "Review In Progress",
  evidenceReadinessState: "Ready with Gaps",
  overallScore: 72,
  recommendation: "Needs Revision",
  assignedReviewer: "Senior Cloud Architect",
  lastUpdated: "May 3, 2026, 10:30 AM",
  documentCount: 4,
};

const DEMO_FILES = [
  { name: "Contoso_HLD_v2.1.pdf", category: "High-Level Design", size: "1.4 MB", pages: 42 },
  { name: "Network_Architecture.drawio", category: "Network Diagram", size: "280 KB", pages: null },
  { name: "Statement_of_Work.docx", category: "Statement of Work", size: "520 KB", pages: 18 },
  { name: "Azure_LZ_Requirements.xlsx", category: "Requirements Tracker", size: "190 KB", pages: null },
];

const DEMO_REQUIREMENTS = [
  { id: "req-001", text: "The solution shall deploy all workloads to Azure UK South with 99.95% availability SLA.", category: "Reliability", criticality: "Critical", status: "Confirmed" },
  { id: "req-002", text: "All data at rest shall be encrypted using customer-managed keys stored in Azure Key Vault.", category: "Security", criticality: "Critical", status: "Confirmed" },
  { id: "req-003", text: "Network traffic between subnets shall be inspected by Azure Firewall Premium.", category: "Security", criticality: "High", status: "Needs Clarification" },
  { id: "req-004", text: "The platform shall support automated certificate rotation for all TLS endpoints.", category: "Operations", criticality: "High", status: "Confirmed" },
  { id: "req-005", text: "Regulatory reporting exports shall complete within 30 minutes of request.", category: "Performance", criticality: "Medium", status: "Confirmed" },
  { id: "req-006", text: "All infrastructure shall be defined as code (Bicep or Terraform) with CI/CD deployment.", category: "Delivery", criticality: "High", status: "Confirmed" },
  { id: "req-007", text: "Monthly cloud spend shall not exceed USD 50,000 for the production environment.", category: "Cost", criticality: "Medium", status: "Needs Clarification" },
  { id: "req-008", text: "The solution shall comply with PCI-DSS v4.0 requirements for card data processing.", category: "Governance", criticality: "Critical", status: "Confirmed" },
];

const DEMO_EVIDENCE = [
  { id: "ev-001", factType: "Architecture Decision", summary: "Hub-Spoke topology chosen with Azure Virtual WAN as the hub. Spoke VNets for application, data, and management tiers.", source: "Contoso_HLD_v2.1.pdf", confidence: "High" },
  { id: "ev-002", factType: "Security Control", summary: "Azure Firewall Premium deployed in the hub VNet. IDPS in Alert and Deny mode. TLS inspection enabled for outbound traffic.", source: "Contoso_HLD_v2.1.pdf", confidence: "High" },
  { id: "ev-003", factType: "Compliance Gap", summary: "Network Security Group is absent on the application subnet. No deny-all-inbound default rule documented.", source: "Network_Architecture.drawio", confidence: "High" },
  { id: "ev-004", factType: "Reliability Design", summary: "Single-region deployment to UK South. No secondary region, Traffic Manager profile, or geo-replication configured.", source: "Contoso_HLD_v2.1.pdf", confidence: "High" },
  { id: "ev-005", factType: "Cost Commitment", summary: "Reserved instances planned for 3-year term on production VMs. Estimated 40% saving vs pay-as-you-go.", source: "Statement_of_Work.docx", confidence: "Medium" },
  { id: "ev-006", factType: "IaC Evidence", summary: "Bicep templates for VNet, subnets, Key Vault, and App Service. CI/CD pipeline via GitHub Actions confirmed.", source: "Statement_of_Work.docx", confidence: "High" },
  { id: "ev-007", factType: "Missing Evidence", summary: "No DR runbook or RTO/RPO documentation found in any uploaded document. 99.95% SLA commitment is unsubstantiated.", source: "(absent)", confidence: "Low" },
  { id: "ev-008", factType: "Storage Configuration", summary: "Three storage accounts found: artefacts, reports, audit-logs. AllowBlobPublicAccess set to true on all three.", source: "Azure_LZ_Requirements.xlsx", confidence: "High" },
];

const DEMO_FINDINGS = [
  {
    findingId: "demo-f-001",
    severity: "Critical",
    domain: "Security",
    title: "Application subnet has no NSG",
    findingStatement: "The application-tier subnet in the Hub-Spoke topology has no Network Security Group attached. All traffic from the internet-facing load balancer flows unrestricted to application VMs.",
    whyItMatters: "Without an NSG, a compromised front-end VM can make lateral connections to any resource in the VNet — including the database subnet — with no network-layer enforcement.",
    recommendation: "Attach an NSG to the application subnet. Deny all inbound except the load balancer health probe and port 443 from the WAF subnet. Allow only port 1433 outbound to the database subnet.",
    evidenceBasis: "Extracted from Network_Architecture.drawio — subnet config table, row 4.",
    criticalBlocker: true,
    status: "Open",
    owner: null,
  },
  {
    findingId: "demo-f-002",
    severity: "Critical",
    domain: "Security",
    title: "Azure OpenAI endpoint exposed without APIM throttling",
    findingStatement: "The Azure OpenAI instance is reachable directly over its public endpoint from any authenticated caller. No APIM gateway, rate-limit policy, or per-consumer quota is defined.",
    whyItMatters: "Direct endpoint exposure allows a single compromised API key to exhaust the provisioned throughput unit (PTU) budget in minutes. For a financial-services workload this constitutes both a cost and an availability risk.",
    recommendation: "Route all OpenAI traffic through APIM. Apply a rate-limit-by-key policy (e.g. 60 RPM per consumer). Enable diagnostic logging to Application Insights.",
    evidenceBasis: "Extracted from Contoso_HLD_v2.1.pdf - section 6, model service integration.",
    criticalBlocker: true,
    status: "Open",
    owner: null,
  },
  {
    findingId: "demo-f-003",
    severity: "High",
    domain: "Reliability",
    title: "Single-region deployment with no failover target",
    findingStatement: "All workload resources are deployed to UK South. The SOW states 99.95% availability SLA but no secondary region, no Traffic Manager profile, and no geo-redundant storage replication is configured.",
    whyItMatters: "A regional Azure incident would take the entire workload offline. Current RPO is undefined and RTO exceeds the contractual SLA.",
    recommendation: "Add UK West as a paired failover region. Configure geo-redundant storage, Azure Site Recovery for IaaS VMs, and a Traffic Manager or Front Door endpoint failover policy.",
    evidenceBasis: "Extracted from Contoso_HLD_v2.1.pdf — deployment topology, section 3.",
    criticalBlocker: false,
    status: "Open",
    owner: "Platform Team",
  },
  {
    findingId: "demo-f-004",
    severity: "High",
    domain: "Security",
    title: "Storage accounts allow public blob access",
    findingStatement: "Three storage accounts (artefacts, reports, and audit-logs) have AllowBlobPublicAccess set to true. The audit-log container has anonymous read enabled.",
    whyItMatters: "Anonymous read on audit logs would allow any external party to enumerate log entries. For a PCI-DSS-scoped workload this is a compliance gap.",
    recommendation: "Set AllowBlobPublicAccess to false on all storage accounts. Use SAS tokens with expiry or Managed Identity + role assignment for authorised consumers. Enforce with Azure Policy.",
    evidenceBasis: "Extracted from Azure_LZ_Requirements.xlsx — Sheet: Storage, rows 12–14.",
    criticalBlocker: false,
    status: "Owner Assigned",
    owner: "Security Team",
  },
  {
    findingId: "demo-f-005",
    severity: "Medium",
    domain: "Governance",
    title: "No Azure Policy initiative assigned to Landing Zone subscription",
    findingStatement: "The workload subscription has no Policy initiative assigned. Mandatory tags (CostCenter, Environment, Owner) are absent on 14 of 22 resources.",
    whyItMatters: "Without policy enforcement, resources created by automation or ad-hoc can bypass naming, tagging, and SKU constraints.",
    recommendation: "Assign the CIS Azure v2.0.0 or Microsoft Cloud Security Benchmark initiative at the subscription level. Create a custom initiative for mandatory tags and set deny effect.",
    evidenceBasis: "Extracted from Contoso_HLD_v2.1.pdf — governance section.",
    criticalBlocker: false,
    status: "Open",
    owner: null,
  },
  {
    findingId: "demo-f-006",
    severity: "Low",
    domain: "Operational Excellence",
    title: "No resource lock on production resource group",
    findingStatement: "The production resource group has no CanNotDelete or ReadOnly lock. Accidental deletion would destroy all production resources without a confirmation gate.",
    whyItMatters: "Azure resource locks are a low-cost last-resort guard against operational incidents.",
    recommendation: "Apply a CanNotDelete lock to the production resource group. Document the lock-removal procedure in the operations runbook.",
    evidenceBasis: "Absence confirmed in Azure_LZ_Requirements.xlsx — Sheet: Ops Controls.",
    criticalBlocker: false,
    status: "Open",
    owner: null,
  },
];

const DEMO_DOMAIN_SCORES = [
  { domain: "Security",               score: 58, weight: 25, reason: "Two critical blockers (NSG gap, OpenAI exposure) and public storage access." },
  { domain: "Reliability",            score: 65, weight: 20, reason: "Single-region deployment without documented RTO/RPO or failover target." },
  { domain: "Governance",             score: 62, weight: 15, reason: "No Azure Policy initiative. Mandatory tag compliance is 36%." },
  { domain: "Operational Excellence", score: 75, weight: 15, reason: "IaC present (Bicep), CI/CD wired. Resource lock gap is low severity." },
  { domain: "Cost Optimization",      score: 83, weight: 10, reason: "Appropriate SKUs. Reserved instances planned. Minor gap: no APIM cost cap on OpenAI." },
  { domain: "Performance Efficiency", score: 88, weight:  8, reason: "Auto-scale configured. CDN in place. Load test results attached." },
  { domain: "Model Service Readiness", score: 70, weight:  5, reason: "Azure OpenAI integrated but lacking throttling and content filter configuration." },
  { domain: "Sustainability",         score: 85, weight:  2, reason: "UK South has high renewable energy mix. No over-provisioned SKUs identified." },
];

const DEMO_NEXT_ACTIONS = [
  "Attach NSG to application subnet with deny-all-inbound default rule before deployment proceeds.",
  "Route Azure OpenAI traffic through APIM with per-key rate limits and diagnostic logging.",
  "Document DR strategy with explicit RPO/RTO targets aligned to the 99.95% SLA commitment.",
  "Disable AllowBlobPublicAccess on all three storage accounts; verify audit-log container is private.",
  "Assign Policy initiative at subscription scope and enforce mandatory tag compliance.",
];

const STEPS: { key: StepKey; label: string }[] = [
  { key: "overview",     label: "Overview" },
  { key: "upload",       label: "Upload" },
  { key: "requirements", label: "Requirements" },
  { key: "evidence",     label: "Evidence" },
  { key: "findings",     label: "Findings" },
  { key: "scorecard",    label: "Scorecard" },
  { key: "decision",     label: "Decision" },
];

// ── Style helpers ─────────────────────────────────────────────────────────────

const SEV_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  Critical: { bg: "#FEF2F2", text: "#DC2626", border: "#FECACA" },
  High:     { bg: "#FFF7ED", text: "#D97706", border: "#FED7AA" },
  Medium:   { bg: "#FFFBEB", text: "#92400E", border: "#FDE68A" },
  Low:      { bg: "#F0FDF4", text: "#16A34A", border: "#BBF7D0" },
};

function scoreColor(score: number) {
  if (score >= 85) return "#16A34A";
  if (score >= 70) return "#D97706";
  return "#DC2626";
}

function overallScoreClass(score: number) {
  if (score >= 85) return "arb-shell-score-good";
  if (score >= 70) return "arb-shell-score-warning";
  return "arb-shell-score-risk";
}

// ── Tab content sections ──────────────────────────────────────────────────────

function OverviewTab({ onTab }: { onTab: (t: StepKey) => void }) {
  const criticalCount = DEMO_FINDINGS.filter(f => f.severity === "Critical").length;
  const highCount     = DEMO_FINDINGS.filter(f => f.severity === "High").length;
  const blockers      = DEMO_FINDINGS.filter(f => f.criticalBlocker).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Metrics row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        {[
          { label: "Overall Score",    value: "72 / 100",      color: "#D97706" },
          { label: "Recommendation",   value: "Needs Revision", color: "#DC2626" },
          { label: "Critical Blockers",value: String(blockers), color: "#DC2626" },
          { label: "Total Findings",   value: String(DEMO_FINDINGS.length), color: "#374151" },
          { label: "High Findings",    value: String(highCount), color: "#D97706" },
          { label: "Documents",        value: String(DEMO_REVIEW.documentCount), color: "#374151" },
          { label: "Requirements",     value: String(DEMO_REQUIREMENTS.length), color: "#374151" },
          { label: "Evidence Facts",   value: String(DEMO_EVIDENCE.length), color: "#374151" },
        ].map(m => (
          <div key={m.label} style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, padding: "14px 16px" }}>
            <p style={{ margin: "0 0 4px", fontSize: "0.75rem", fontWeight: 700, color: "#6B7280", letterSpacing: "0.06em", textTransform: "uppercase" }}>{m.label}</p>
            <p style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800, color: m.color }}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Assessment summary */}
      <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 10, padding: "16px 20px" }}>
        <p style={{ margin: "0 0 8px", fontSize: "0.82rem", fontWeight: 700, color: "#92400E", letterSpacing: "0.06em", textTransform: "uppercase" }}>Assessment summary</p>
        <p style={{ margin: 0, fontSize: "0.92rem", color: "#374151", lineHeight: 1.7 }}>
          Contoso Financial Services — Azure Landing Zone review is in progress. Review recommendation: <strong>Needs Revision</strong>.
          Evidence readiness: <em>Ready with Gaps</em>. Overall score: <strong>72/100</strong>.
          Security (58) and Reliability (65) domains are below the 70-point approval threshold.
          {" "}<strong>{blockers} critical blockers</strong> must be resolved — no NSG on the application subnet and Azure OpenAI exposed without APIM throttling — before final sign-off.
        </p>
      </div>

      {/* Workflow progress */}
      <div>
        <p style={{ margin: "0 0 12px", fontSize: "0.82rem", fontWeight: 700, color: "#6B7280", letterSpacing: "0.06em", textTransform: "uppercase" }}>Workflow progress</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { step: "upload",       label: "Documents uploaded",     done: true,  note: "4 files — extraction complete" },
            { step: "requirements", label: "Requirements confirmed",  done: true,  note: "8 requirements extracted" },
            { step: "evidence",     label: "Evidence mapped",         done: true,  note: "8 facts — 1 gap identified" },
            { step: "findings",     label: "Findings reviewed",       done: false, note: "6 findings — 4 unresolved" },
            { step: "scorecard",    label: "Scorecard reviewed",      done: false, note: "72/100 — needs blocker resolution" },
            { step: "decision",     label: "Decision recorded",       done: false, note: "Pending — awaiting blocker resolution" },
          ].map(item => (
            <div key={item.step} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8 }}>
              <span style={{ fontSize: "1rem", flexShrink: 0 }}>{item.done ? "✅" : "⏳"}</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: 600, fontSize: "0.9rem", color: "#111827" }}>{item.label}</p>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "#6B7280" }}>{item.note}</p>
              </div>
              <button
                onClick={() => onTab(item.step as StepKey)}
                style={{ background: "none", border: "1px solid #D1D5DB", borderRadius: 6, padding: "4px 12px", fontSize: "0.8rem", color: "#374151", cursor: "pointer" }}
              >
                View →
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UploadTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: "12px 16px" }}>
        <p style={{ margin: 0, fontSize: "0.9rem", color: "#166534", fontWeight: 600 }}>
          ✓ Extraction complete — 4 of 4 files processed successfully
        </p>
      </div>

      <div>
        <p style={{ margin: "0 0 12px", fontSize: "0.82rem", fontWeight: 700, color: "#6B7280", letterSpacing: "0.06em", textTransform: "uppercase" }}>Uploaded files</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {DEMO_FILES.map(f => (
            <div key={f.name} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 8 }}>
              <span style={{ fontSize: "1.6rem", flexShrink: 0 }}>
                {f.name.endsWith(".pdf") ? "📄" : f.name.endsWith(".docx") ? "📝" : f.name.endsWith(".xlsx") ? "📊" : "🗂️"}
              </span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: "0.95rem", color: "#111827" }}>{f.name}</p>
                <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#6B7280" }}>
                  {f.category} · {f.size}{f.pages ? ` · ${f.pages} pages` : ""}
                </p>
              </div>
              <span style={{ color: "#16A34A", fontSize: "0.82rem", fontWeight: 700, flexShrink: 0 }}>✓ Extracted</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, padding: "16px 20px" }}>
        <p style={{ margin: "0 0 8px", fontSize: "0.82rem", fontWeight: 700, color: "#6B7280", letterSpacing: "0.06em", textTransform: "uppercase" }}>Extraction pipeline</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {["Text extraction", "Requirement identification", "Evidence fact mining", "Gap detection"].map((step, i) => (
            <div key={step} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: "#16A34A", fontWeight: 700 }}>✓</span>
              <span style={{ fontSize: "0.88rem", color: "#374151" }}>{step}</span>
              {i === 2 && <span style={{ marginLeft: "auto", fontSize: "0.78rem", color: "#D97706", fontWeight: 600 }}>1 gap found</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RequirementsTab() {
  const criticColor: Record<string, string> = { Critical: "#DC2626", High: "#D97706", Medium: "#92400E" };
  const statusColor: Record<string, string> = { "Confirmed": "#16A34A", "Needs Clarification": "#D97706" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ margin: 0, fontSize: "0.88rem", color: "#6B7280" }}>
        {DEMO_REQUIREMENTS.length} requirements extracted from uploaded documents. Review and confirm each item before advancing to the findings stage.
      </p>
      {DEMO_REQUIREMENTS.map((req, i) => (
        <div key={req.id} style={{ border: "1px solid #E5E7EB", borderRadius: 8, padding: "14px 18px", background: "#FFFFFF" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#6B7280" }}>REQ-{String(i + 1).padStart(3, "0")}</span>
            <span style={{ background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE", borderRadius: 5, padding: "1px 8px", fontSize: "0.75rem", fontWeight: 600 }}>{req.category}</span>
            <span style={{ color: criticColor[req.criticality] ?? "#374151", fontSize: "0.78rem", fontWeight: 700 }}>{req.criticality}</span>
            <span style={{ marginLeft: "auto", color: statusColor[req.status] ?? "#6B7280", fontSize: "0.8rem", fontWeight: 700 }}>
              {req.status === "Confirmed" ? "✓ " : "⚠ "}{req.status}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: "0.9rem", color: "#374151", lineHeight: 1.6 }}>{req.text}</p>
        </div>
      ))}
    </div>
  );
}

function EvidenceTab() {
  const confColor: Record<string, string> = { High: "#16A34A", Medium: "#D97706", Low: "#DC2626" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ margin: 0, fontSize: "0.88rem", color: "#6B7280" }}>
        {DEMO_EVIDENCE.length} evidence facts extracted and mapped from uploaded documents. Facts drive finding confidence and traceability.
      </p>
      {DEMO_EVIDENCE.map(ev => (
        <div key={ev.id} style={{
          border: `1px solid ${ev.factType === "Missing Evidence" ? "#FECACA" : "#E5E7EB"}`,
          borderLeft: `4px solid ${ev.factType === "Missing Evidence" ? "#DC2626" : ev.confidence === "High" ? "#16A34A" : "#D97706"}`,
          borderRadius: 8, padding: "14px 18px", background: ev.factType === "Missing Evidence" ? "#FEF2F2" : "#FFFFFF",
        }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ background: "#F3F4F6", color: "#374151", border: "1px solid #E5E7EB", borderRadius: 5, padding: "1px 8px", fontSize: "0.75rem", fontWeight: 600 }}>{ev.factType}</span>
            <span style={{ color: confColor[ev.confidence] ?? "#6B7280", fontSize: "0.78rem", fontWeight: 700 }}>{ev.confidence} confidence</span>
            <span style={{ marginLeft: "auto", fontSize: "0.78rem", color: "#6B7280" }}>📎 {ev.source}</span>
          </div>
          <p style={{ margin: 0, fontSize: "0.9rem", color: "#374151", lineHeight: 1.6 }}>{ev.summary}</p>
        </div>
      ))}
    </div>
  );
}

function FindingsTab() {
  const criticalCount = DEMO_FINDINGS.filter(f => f.severity === "Critical").length;
  const highCount     = DEMO_FINDINGS.filter(f => f.severity === "High").length;
  const blockers      = DEMO_FINDINGS.filter(f => f.criticalBlocker).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <p style={{ margin: 0, fontSize: "0.88rem", color: "#6B7280" }}>{DEMO_FINDINGS.length} findings generated from extracted evidence.</p>
        <div style={{ display: "flex", gap: 8 }}>
          {criticalCount > 0 && <Chip bg="#FEF2F2" text="#DC2626" border="#FECACA">{criticalCount} Critical</Chip>}
          {highCount > 0    && <Chip bg="#FFF7ED" text="#D97706" border="#FED7AA">{highCount} High</Chip>}
          {blockers > 0     && <Chip bg="#FEF2F2" text="#991B1B" border="#FECACA">⛔ {blockers} Blockers</Chip>}
        </div>
      </div>
      {DEMO_FINDINGS.map(f => {
        const sev = SEV_COLOR[f.severity] ?? SEV_COLOR.Low;
        return (
          <div key={f.findingId} style={{ border: `1px solid ${f.criticalBlocker ? "#FECACA" : "#E5E7EB"}`, borderLeft: `4px solid ${sev.text}`, borderRadius: 8, padding: "16px 20px", background: f.criticalBlocker ? "#FFFAFA" : "#FFFFFF" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Chip bg={sev.bg} text={sev.text} border={sev.border}>{f.severity}</Chip>
              <Chip bg="#EFF6FF" text="#1D4ED8" border="#BFDBFE">{f.domain}</Chip>
              {f.criticalBlocker && <Chip bg="#FEF2F2" text="#991B1B" border="#FECACA">⛔ Blocker</Chip>}
              <span style={{ fontSize: "0.78rem", color: f.status === "Open" ? "#DC2626" : "#D97706", fontWeight: 600 }}>
                {f.status}{f.owner ? ` · ${f.owner}` : ""}
              </span>
            </div>
            <p style={{ margin: "0 0 6px", fontSize: "0.95rem", fontWeight: 700, color: "#111827" }}>{f.title}</p>
            <p style={{ margin: "0 0 6px", fontSize: "0.88rem", color: "#4B5563", lineHeight: 1.6 }}>{f.findingStatement}</p>
            <p style={{ margin: "0 0 6px", fontSize: "0.83rem", color: "#6B7280", fontStyle: "italic" }}>Why it matters: {f.whyItMatters}</p>
            <p style={{ margin: "0 0 4px", fontSize: "0.83rem", color: "#374151" }}><strong>Recommendation: </strong>{f.recommendation}</p>
            <p style={{ margin: 0, fontSize: "0.78rem", color: "#9CA3AF" }}>Evidence: {f.evidenceBasis}</p>
          </div>
        );
      })}
    </div>
  );
}

function ScorecardTab() {
  const sorted = [...DEMO_DOMAIN_SCORES].sort((a, b) => a.score - b.score);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Hero */}
      <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 10, padding: "20px 24px", display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: "3rem", fontWeight: 800, color: "#D97706", lineHeight: 1 }}>72</p>
          <p style={{ margin: "4px 0 0", fontSize: "0.75rem", color: "#6B7280", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>Overall</p>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <p style={{ margin: "0 0 4px", fontSize: "1.05rem", fontWeight: 700, color: "#111827" }}>Needs Revision — 2 critical blockers must be resolved</p>
          <p style={{ margin: 0, fontSize: "0.9rem", color: "#4B5563", lineHeight: 1.6 }}>
            Security and Reliability are below the 70-point approval threshold. Cost Optimization and Performance Efficiency meet board standards.
          </p>
        </div>
      </div>

      {/* Domain bars */}
      <div>
        <p style={{ margin: "0 0 12px", fontSize: "0.82rem", fontWeight: 700, color: "#6B7280", letterSpacing: "0.06em", textTransform: "uppercase" }}>Domain scores</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map(ds => {
            const color = scoreColor(ds.score);
            return (
              <div key={ds.domain}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
                  <span style={{ width: 180, fontSize: "0.85rem", fontWeight: 600, color: "#374151", flexShrink: 0 }}>
                    {ds.domain} <span style={{ color: "#9CA3AF", fontWeight: 400, fontSize: "0.75rem" }}>({ds.weight}%)</span>
                  </span>
                  <div style={{ flex: 1, background: "#F3F4F6", borderRadius: 6, height: 14, position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${ds.score}%`, background: color, borderRadius: 6 }} />
                  </div>
                  <span style={{ width: 32, textAlign: "right", fontSize: "0.88rem", fontWeight: 700, color, flexShrink: 0 }}>{ds.score}</span>
                </div>
                <p style={{ margin: "0 0 0 192px", fontSize: "0.78rem", color: "#6B7280", lineHeight: 1.5 }}>{ds.reason}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Conditions to close */}
      <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 10, padding: "16px 20px" }}>
        <p style={{ margin: "0 0 12px", fontSize: "0.82rem", fontWeight: 700, color: "#6B7280", letterSpacing: "0.06em", textTransform: "uppercase" }}>Conditions to close</p>
        <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          {DEMO_NEXT_ACTIONS.map((action, i) => (
            <li key={i} style={{ fontSize: "0.9rem", color: "#374151", lineHeight: 1.6 }}>{action}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function DecisionTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ background: "#FEF2F2", border: "2px solid #FECACA", borderRadius: 10, padding: "20px 24px" }}>
        <p style={{ margin: "0 0 4px", fontSize: "0.82rem", fontWeight: 700, color: "#991B1B", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          ⛔ Decision blocked
        </p>
        <p style={{ margin: 0, fontSize: "0.92rem", color: "#374151", lineHeight: 1.6 }}>
          2 critical blockers must be resolved before the reviewer can record a decision. Resolve the NSG gap and the OpenAI APIM gap, then return to this step.
        </p>
      </div>

      {/* Decision fields */}
      <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 10, padding: "20px 24px" }}>
        <p style={{ margin: "0 0 16px", fontSize: "0.82rem", fontWeight: 700, color: "#6B7280", letterSpacing: "0.06em", textTransform: "uppercase" }}>Decision record</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            ["Review Recommendation",  "Needs Revision"],
            ["Reviewer Decision",  "Pending — awaiting blocker resolution"],
            ["Reviewer",           DEMO_REVIEW.assignedReviewer],
            ["Reviewer Role",      "Senior Cloud Architect"],
            ["Decision Date",      "Not yet recorded"],
            ["Review ID",          DEMO_REVIEW.reviewId],
          ].map(([label, value]) => (
            <div key={label}>
              <p style={{ margin: "0 0 2px", fontSize: "0.75rem", fontWeight: 700, color: "#0078D4", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</p>
              <p style={{ margin: 0, fontSize: "0.92rem", fontWeight: 600, color: "#111827" }}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Decision options */}
      <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 10, padding: "20px 24px" }}>
        <p style={{ margin: "0 0 12px", fontSize: "0.82rem", fontWeight: 700, color: "#6B7280", letterSpacing: "0.06em", textTransform: "uppercase" }}>Available decisions (after blockers resolved)</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            { label: "Approve",        color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0", desc: "Design meets board standards" },
            { label: "Needs Revision", color: "#D97706", bg: "#FFF7ED", border: "#FED7AA", desc: "Return with listed conditions" },
            { label: "Reject",         color: "#DC2626", bg: "#FEF2F2", border: "#FECACA", desc: "Fundamental rework required" },
          ].map(opt => (
            <div key={opt.label} style={{ background: opt.bg, border: `1px solid ${opt.border}`, borderRadius: 8, padding: "12px 16px", flex: 1, minWidth: 160 }}>
              <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: "0.9rem", color: opt.color }}>{opt.label}</p>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "#6B7280" }}>{opt.desc}</p>
            </div>
          ))}
        </div>
        <p style={{ margin: "14px 0 0", fontSize: "0.85rem", color: "#4B5563", fontStyle: "italic", lineHeight: 1.6 }}>
          The structured assessment provides a draft recommendation. The final decision, rationale, and any conditional approvals are recorded by the human reviewer and are immutable once submitted.
        </p>
      </div>
    </div>
  );
}

// ── Tiny chip component ───────────────────────────────────────────────────────

function Chip({ bg, text, border, children }: { bg: string; text: string; border: string; children: React.ReactNode }) {
  return (
    <span style={{ background: bg, color: text, border: `1px solid ${border}`, borderRadius: 5, padding: "1px 9px", fontSize: "0.75rem", fontWeight: 700 }}>
      {children}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function DemoReviewPage() {
  const [activeStep, setActiveStep] = useState<StepKey>("overview");

  const activeIndex = STEPS.findIndex(s => s.key === activeStep);

  function renderTab() {
    switch (activeStep) {
      case "overview":     return <OverviewTab onTab={setActiveStep} />;
      case "upload":       return <UploadTab />;
      case "requirements": return <RequirementsTab />;
      case "evidence":     return <EvidenceTab />;
      case "findings":     return <FindingsTab />;
      case "scorecard":    return <ScorecardTab />;
      case "decision":     return <DecisionTab />;
    }
  }

  return (
    <main className="arb-page-stack">

      {/* ── Demo banner ─────────────────────────────────────────── */}
      <div style={{ background: "#EFF6FF", borderBottom: "1px solid #BFDBFE", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <p style={{ margin: 0, fontSize: "0.88rem", color: "#1E40AF", fontWeight: 600 }}>
          Demo — This is a sample review with synthetic data. No authentication required.
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          <Link href="/arb" className="primary-button" style={{ fontSize: "0.85rem", padding: "6px 14px" }}>
            Start a real review →
          </Link>
          <Link href="/" style={{ fontSize: "0.85rem", color: "#1E40AF", textDecoration: "none", display: "flex", alignItems: "center" }}>
            ← Home
          </Link>
        </div>
      </div>

      {/* ── Command panel ───────────────────────────────────────── */}
      <section className="review-command-panel">
        <div className="detail-command-grid">
          <div className="detail-command-copy">
            <p className="header-badge">Review Workspace</p>
            <h1 className="review-command-title">{DEMO_REVIEW.projectName}</h1>
            <p className="review-command-summary">
              Architecture review for a financial-services Azure Landing Zone migration.
              Two critical blockers prevent approval. Five findings require owner assignment before the next board date.
            </p>
            <div className="board-summary-row">
              <span className="pill">Customer: {DEMO_REVIEW.customerName}</span>
              <span className="pill">Reviewer: {DEMO_REVIEW.assignedReviewer}</span>
              <span className="pill">Review ID: {DEMO_REVIEW.reviewId}</span>
              <span className="pill">{DEMO_REVIEW.documentCount} documents uploaded</span>
            </div>
            <div className="button-row">
              <Link href="/arb" className="primary-button">Start a real review</Link>
              <Link href="/" className="secondary-button">Back to home</Link>
            </div>
          </div>

          <aside className="detail-command-sidecar future-card arb-shell-sidecar-card">
            <p className="board-card-subtitle">Current status</p>
            <div className="arb-shell-sidecar-metrics">
              {[
                ["Workflow",       DEMO_REVIEW.workflowState],
                ["Evidence",       DEMO_REVIEW.evidenceReadinessState],
                ["Recommendation", DEMO_REVIEW.recommendation],
              ].map(([label, value]) => (
                <div key={label} className="arb-shell-metric">
                  <p className="arb-shell-metric-label">{label}</p>
                  <p className="arb-shell-metric-value">{value}</p>
                </div>
              ))}
              <div className="arb-shell-metric">
                <p className="arb-shell-metric-label">Score</p>
                <p className={`arb-shell-metric-value arb-shell-score ${overallScoreClass(DEMO_REVIEW.overallScore)}`}>
                  {DEMO_REVIEW.overallScore}
                </p>
              </div>
            </div>
            <p className="arb-shell-posture-note">Resolve 2 critical blockers before advancing to final sign-off.</p>
          </aside>
        </div>

        {/* ── Step strip — fully clickable ────────────────────── */}
        <nav className="arb-step-strip" aria-label="ARB workflow steps">
          {STEPS.map((step, i) => (
            <button
              key={step.key}
              onClick={() => setActiveStep(step.key)}
              className={`arb-step-link${
                step.key === activeStep
                  ? " arb-step-link-active"
                  : i < activeIndex
                    ? " arb-step-link-complete"
                    : ""
              }`}
              style={{ background: "none", border: "none", cursor: "pointer", font: "inherit" }}
              aria-current={step.key === activeStep ? "step" : undefined}
            >
              {step.label}
            </button>
          ))}
        </nav>
      </section>

      {/* ── Main body ───────────────────────────────────────────── */}
      <div className="arb-shell-grid">
        <section className="surface-panel arb-shell-main" style={{ padding: "24px" }}>
          {renderTab()}
        </section>

        {/* ── Sidecar ─────────────────────────────────────────── */}
        <aside className="arb-sidecar-stack" style={{ minWidth: 0 }}>
          <section style={{ padding: "20px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFFFFF" }}>
            <p style={{ margin: "0 0 12px", color: "#111827", fontSize: "0.82rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Assessment summary</p>
            <p style={{ color: "#374151", fontSize: "0.9rem", lineHeight: 1.65, margin: 0 }}>
              {DEMO_REVIEW.projectName} review is in progress. Review recommendation: Needs Revision.
              Evidence readiness: Ready with Gaps. Overall score: 72/100.
              Security and Reliability are below the 70-point threshold. 2 critical blockers must be resolved.
            </p>
          </section>

          <section style={{ padding: "20px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFFFFF" }}>
            <p style={{ margin: "0 0 12px", color: "#111827", fontSize: "0.82rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Review status</p>
            <div style={{ display: "grid", gap: 0 }}>
              {[
                ["Workflow State",    DEMO_REVIEW.workflowState],
                ["Evidence",         DEMO_REVIEW.evidenceReadinessState],
                ["Recommendation",   DEMO_REVIEW.recommendation],
                ["Final Decision",   "Pending"],
                ["Reviewer",         DEMO_REVIEW.assignedReviewer],
                ["Review ID",        DEMO_REVIEW.reviewId],
                ["Last Updated",     DEMO_REVIEW.lastUpdated],
              ].map(([label, value], i, arr) => (
                <div key={label} style={{ padding: "8px 0", borderBottom: i < arr.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                  <div style={{ color: "#0078D4", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 2 }}>{label}</div>
                  <div style={{ color: "#111827", fontSize: "0.92rem", fontWeight: 600 }}>{value}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Tab quick-jump */}
          <section style={{ padding: "20px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#F9FAFB" }}>
            <p style={{ margin: "0 0 10px", color: "#111827", fontSize: "0.82rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Jump to</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {STEPS.map(s => (
                <button
                  key={s.key}
                  onClick={() => setActiveStep(s.key)}
                  style={{
                    background: s.key === activeStep ? "#0078D4" : "#FFFFFF",
                    color: s.key === activeStep ? "#FFFFFF" : "#374151",
                    border: "1px solid #D1D5DB",
                    borderRadius: 6,
                    padding: "4px 10px",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    fontWeight: s.key === activeStep ? 700 : 400,
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </section>

          <section style={{ padding: "20px", borderRadius: "8px", border: "1px solid #EFF6FF", background: "#EFF6FF" }}>
            <p style={{ margin: "0 0 8px", color: "#1E40AF", fontSize: "0.82rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>This is a demo</p>
            <p style={{ color: "#1E40AF", fontSize: "0.88rem", lineHeight: 1.6, margin: "0 0 14px" }}>
              Upload your own architecture documents and get scored findings, reviewer override, and a full board export.
            </p>
            <Link href="/arb" className="primary-button" style={{ display: "block", textAlign: "center", fontSize: "0.88rem" }}>
              Start a real review →
            </Link>
          </section>
        </aside>
      </div>
    </main>
  );
}
