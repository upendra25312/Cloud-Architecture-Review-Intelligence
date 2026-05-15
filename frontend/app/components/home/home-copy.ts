/**
 * Central copy module for the redesigned homepage.
 *
 * Every visible string rendered by the new home components lives here so that
 * copy guardrails (forbidden terminology, hyperbole, endorsement) can be
 * reviewed and unit-tested against a single module.
 *
 * See .kiro/specs/product-grade-homepage-redesign/design.md § "home-copy.ts".
 */

export const HOME_COPY = {
  hero: {
    eyebrow: "Architecture Review Intelligence",
    title: "Turn uploaded architecture evidence into board-ready review decisions.",
    kicker:
      "What used to take 4–12 hours now runs in minutes, with full packages typically completing in 10–20 minutes.",
    sub: "Upload your architecture documents, get evidence-linked findings and framework-aligned decisions, then export a board-ready review pack — reviewed and signed off by your architects.",
    primaryCta: "Start a Review",
    secondaryCta: "View Sample Output",
    trustBar: [
      "10–20 min full package",
      "Evidence-linked findings",
      "Framework-aligned decisions",
      "Human-reviewed sign-off",
    ] as const,
  },

  /**
   * "What the platform does" — exactly four cards in documented order.
   * Each body MUST remain ≤ 18 whitespace-separated words (Req 2.3, Property P2).
   */
  platformValues: [
    {
      title: "Project Category Workflow",
      body: "Select Landing Zone, Cloud Readiness, WAR, Migration, or Pre-Sales POC to tailor the assessment.",
    },
    {
      title: "SOW-Aligned Assessment",
      body: "Upload SOWs to set scope, deliverables, and acceptance criteria for the review.",
    },
    {
      title: "Framework-Aligned Checks",
      body: "Map findings to WAF, CAF, ALZ, and Azure Migrate guidance automatically.",
    },
    {
      title: "Human-Led Governance",
      body: "Architects review, approve, reject, or override every AI-assisted recommendation.",
    },
    {
      title: "Executive-Ready Outputs",
      body: "Export PowerPoint decks, findings registers, and decision logs for leadership readouts.",
    },
  ] as const,

  /**
   * "How it works" — seven sequential workflow steps.
   * Each explanation is a single line.
   */
  workflow: [
    {
      number: "01",
      label: "Select Project Category",
      explanation: "Choose Landing Zone, Cloud Readiness, WAR, Migration, or Pre-Sales POC.",
    },
    {
      number: "02",
      label: "Upload SOW and Evidence",
      explanation: "Submit SOWs, HLDs, diagrams, and supporting artifacts.",
    },
    {
      number: "03",
      label: "Analyze Against Frameworks",
      explanation: "Compare evidence with CAF, WAF, ALZ, and Azure Migrate guidance.",
    },
    {
      number: "04",
      label: "Generate Findings",
      explanation: "Surface evidence-linked risks and gaps, mapped to SOW scope.",
    },
    {
      number: "05",
      label: "Architect Review",
      explanation: "Accept, reject, override, or annotate findings.",
    },
    {
      number: "06",
      label: "Approve Decisions",
      explanation: "Capture sign-off with reviewer rationale.",
    },
    {
      number: "07",
      label: "Export Report",
      explanation: "Download Markdown, CSV, HTML, or executive PowerPoint.",
    },
  ] as const,

  /**
   * "See the Review Cockpit" — section heading and tile labels (Req 4).
   */
  cockpit: {
    sectionTitle: "See the Review Cockpit",
    tileLabels: {
      score: "Review score",
      severity: "Findings by severity",
      confidence: "Evidence confidence",
      waf: "WAF pillar status",
      caf: "CAF design area coverage",
      heatmap: "Risk heatmap",
      decisions: "Reviewer decisions",
      status: "Overall status",
      risks: "Open risks",
      exports: "Export controls",
    },
    exportDisabledNote:
      "Sample preview. Open a review to enable exports.",
    exportFormats: ["PDF", "Word", "Excel"] as const,
    overallStatus: "In Review",
  },

  /**
   * Sample architecture finding card (Req 5.3 — literal defaults).
   */
  sampleFinding: {
    sectionTitle: "Evidence-linked finding example",
    title: "Public access is enabled on a storage account",
    severity: "High",
    affectedService: "Azure Storage Account",
    frameworkMapping: "Security / Governance / Policy",
    evidenceSource: "Uploaded design document",
    recommendation: "Use private endpoint",
    reviewerDecision: "Accepted",
    exportStatus: "Included in board pack",
  },

  /**
   * "Aligned to Enterprise Cloud Review Frameworks" — framework alignment
   * section headings (Req 6).  List items are exported as standalone
   * `as const` arrays below so Property P3 is a compile-time invariant.
   */
  framework: {
    sectionTitle: "Aligned to Enterprise Cloud Review Frameworks",
    cafHeading: "Microsoft Cloud Adoption Framework design areas",
    wafHeading: "Azure Well-Architected Framework pillars",
    alzHeading: "Azure Landing Zone alignment",
  },

  /**
   * "Cloud Review Tracks" — section heading and planned-badge copy (Req 7).
   */
  tracks: {
    sectionTitle: "Cloud Review Tracks",
    availableBadge: "Available Today",
    plannedBadge: "Planned",
  },

  /**
   * "Built for Enterprise Architecture Reviews" — landing-zone diagram
   * section (Req 8).  Node names are the labelled <g> elements inside the
   * SVG; the diagram aria-label and the SVG title/desc deliver the
   * accessible name and description (Req 8.2, 8.4).
   */
  landingZone: {
    sectionTitle: "Built for Enterprise Architecture Reviews",
    diagramAriaLabel:
      "Azure Landing Zone reference topology diagram showing tenant, Entra ID, management groups, platform and application subscriptions, hub-and-spoke network, shared services, and governance building blocks.",
    svgTitle: "Azure Landing Zone reference topology",
    svgDesc:
      "Diagram of a tenant containing Entra ID, management groups, platform and application landing zone subscriptions, a hub-and-spoke network with Azure Firewall and Private DNS Resolver, private endpoints for workloads, Azure Monitor and Log Analytics, Backup and DR, Policy guardrails, and CI/CD with infrastructure as code.",
    nodes: {
      tenant: "Tenant",
      entraId: "Entra ID",
      managementGroups: "Management groups",
      platformSubscriptions: "Platform subscriptions",
      applicationLandingZones: "Application landing zones",
      hubNetwork: "Hub network",
      spokeNetwork: "Spoke network",
      azureFirewall: "Azure Firewall",
      privateDnsResolver: "Private DNS Resolver",
      privateEndpoints: "Private Endpoints",
      azureMonitor: "Azure Monitor",
      logAnalytics: "Log Analytics",
      backupAndDr: "Backup and DR",
      policyGuardrails: "Policy guardrails",
      cicdIac: "CI/CD with IaC",
    },
  },

  /**
   * "From Technical Findings to Board-Ready Decisions" — report pack
   * preview (Req 9).  The six sections and five formats below are the
   * exact ordered tuples referenced by Req 9.2 / 9.3.
   */
  reportPack: {
    sectionTitle: "From Technical Findings to Board-Ready Decisions",
    subheading: "Preview the structure of a review output bundle.",
    sectionsHeading: "Report sections",
    formatsHeading: "Export formats",
    note: "Each section is assembled from reviewer-approved findings and exported on demand.",
    sections: [
      "Executive Summary",
      "Risk Register",
      "Findings Register",
      "Architecture Decision Log",
      "Framework Alignment Summary",
      "Evidence Traceability",
    ] as const,
    formats: ["PowerPoint (PPTX)", "Markdown", "CSV", "HTML"] as const,
  },

  /**
   * "Trust and Governance" — exactly five tiles, fixed order (Req 10.2).
   * Each description is ≤ 20 whitespace-separated words (Req 10.3,
   * Property P2).  No compliance-certification or perfect-accuracy
   * claims (Req 10.4).
   */
  trust: {
    sectionTitle: "Built for Enterprise Security and Governance",
    tiles: [
      {
        label: "Zero Secrets in Code",
        description:
          "Managed Identity everywhere. No API keys, passwords, or connection strings in code or environment variables.",
      },
      {
        label: "Immutable Audit Trail",
        description:
          "Append-only record of every finding state transition, reviewer decision, and export. Nothing is deleted or overwritten.",
      },
      {
        label: "East US 2 Data Residency",
        description:
          "All customer documents and review data stay in East US 2. No cross-region replication.",
      },
      {
        label: "Encrypted End-to-End",
        description:
          "TLS 1.2+ in transit, AES-256 at rest. Architecture documents are never stored in plain text.",
      },
      {
        label: "Least-Privilege RBAC",
        description:
          "Each service has its own Managed Identity with only the permissions it needs. No shared credentials.",
      },
    ] as const,
  },

  /**
   * Final call-to-action section copy (Req 11).
   */
  finalCta: {
    heading:
      "Make every cloud architecture review consistent, evidence-based, and defensible.",
    primaryCta: "Start a Review",
    secondaryCta: "View Sample Output",
  },
} as const;

export type HomeCopy = typeof HOME_COPY;

/**
 * Microsoft Cloud Adoption Framework design areas (Req 6.2).
 */
export const CAF_DESIGN_AREAS = [
  "Identity and access",
  "Resource organization",
  "Network topology",
  "Security",
  "Management",
  "Governance",
  "Platform automation and DevOps",
] as const;

/**
 * The five official Azure Well-Architected Framework pillars (Req 6.3,
 * Property P3).  Any extended review domain (Sustainability / Experience)
 * MUST appear under a separate "Extended Review Domains" heading — never
 * under the WAF pillar heading.
 */
export const WAF_PILLARS = [
  "Reliability",
  "Security",
  "Cost Optimization",
  "Operational Excellence",
  "Performance Efficiency",
] as const;

/**
 * Azure Landing Zone alignment components (Req 6.5).
 */
export const AZURE_LANDING_ZONE_COMPONENTS = [
  "Management groups",
  "Subscription organisation",
  "Platform landing zones",
  "Application landing zones",
  "Hub-and-spoke networking",
  "Private connectivity",
  "Policy guardrails",
  "Monitoring and logging",
  "Security baseline",
  "Automation and DevOps",
] as const;

/**
 * Cloud Review Tracks (Req 7).  Order is Azure, AWS, Google Cloud.
 * Azure has an `href`; AWS and GCP do not (they are non-interactive
 * planned cards, Req 7.7).
 */
export interface CloudTrack {
  readonly name: "Azure" | "AWS" | "Google Cloud";
  readonly status: "Available Today" | "Planned";
  readonly frameworkTags: ReadonlyArray<string>;
  readonly logo: "/cloud-azure.svg" | "/cloud-aws.png" | "/cloud-gcp.svg";
  readonly logoAlt: string;
  readonly href?: "/arb";
}

/**
 * Supported project categories that drive intake, scoring, findings, and report structure.
 * Each category has a different assessment focus aligned to the engagement type.
 */
export interface ProjectCategory {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly focus: string;
  readonly status: "Available" | "Planned";
}

export const PROJECT_CATEGORIES: ReadonlyArray<ProjectCategory> = [
  {
    id: "landing-zone",
    label: "Landing Zone",
    description: "Azure foundation, governance, identity, networking, security, and operating model review.",
    focus: "CAF Ready, ALZ, Policy, Hub-Spoke, Identity, Management",
    status: "Available",
  },
  {
    id: "cloud-readiness",
    label: "Cloud Readiness Assessment",
    description: "Current estate discovery, readiness gaps, landing zone prerequisites, and next-step roadmap.",
    focus: "Azure Migrate Discovery, Readiness Scoring, Operating Model, Cost Estimate",
    status: "Available",
  },
  {
    id: "well-architected-review",
    label: "Well-Architected Review",
    description: "WAF pillar assessment: Reliability, Security, Cost Optimisation, Operational Excellence, Performance.",
    focus: "WAF 5 Pillars, Service Guides, Architecture Best Practices",
    status: "Available",
  },
  {
    id: "migration-readiness",
    label: "Migration Readiness Assessment",
    description: "Migration feasibility, Azure Migrate discovery, dependency mapping, wave planning, and blockers.",
    focus: "Azure Migrate, MEG, Wave Planning, Landing Zone Readiness, RAID",
    status: "Available",
  },
  {
    id: "migration",
    label: "Migration",
    description: "Execution readiness, migration waves, cutover planning, rollback, validation, and hypercare.",
    focus: "Migration Execution Guide, Cutover, Rollback, Hypercare, Operational Handover",
    status: "Available",
  },
  {
    id: "presales-poc",
    label: "Pre-Sales POC",
    description: "Business problem, success criteria, demo scope, feasibility, assumptions, and next-step recommendation.",
    focus: "Value Hypothesis, Technical Feasibility, Scope, Effort, Risk",
    status: "Available",
  },
];

export const TRACKS: ReadonlyArray<CloudTrack> = [
  {
    name: "Azure",
    status: "Available Today",
    frameworkTags: [
      "CAF",
      "WAF",
      "Azure Landing Zone",
      "Azure Architecture Center",
    ],
    logo: "/cloud-azure.svg",
    logoAlt: "Microsoft Azure logo",
    href: "/arb",
  },
  {
    name: "AWS",
    status: "Planned",
    frameworkTags: [
      "AWS Well-Architected Framework",
      "AWS Landing Zone",
      "AWS Control Tower",
    ],
    logo: "/cloud-aws.png",
    logoAlt: "Amazon Web Services logo",
  },
  {
    name: "Google Cloud",
    status: "Planned",
    frameworkTags: [
      "Google Cloud Architecture Framework",
      "Google Cloud Landing Zone",
      "Google Cloud Security Foundations",
    ],
    logo: "/cloud-gcp.svg",
    logoAlt: "Google Cloud logo",
  },
];
