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
      "Azure reviews available today — AWS and Google Cloud arriving Q3 2026.",
    sub: "Upload your architecture documents, get evidence-linked findings and framework-aligned decisions, then export a board-ready review pack — reviewed and signed off by your architects.",
    primaryCta: "Start a Review",
    secondaryCta: "View Sample Output",
    trustBar: [
      "Evidence-linked findings",
      "Framework-aligned",
      "Human-reviewed decisions",
    ] as const,
  },

  /**
   * "What the platform does" — exactly four cards in documented order.
   * Each body MUST remain ≤ 18 whitespace-separated words (Req 2.3, Property P2).
   */
  platformValues: [
    {
      title: "Evidence-backed Review",
      body: "Upload architecture documents and generate traceable findings.",
    },
    {
      title: "Framework-Aligned Checks",
      body: "Map findings to WAF, CAF, Landing Zone, and security controls.",
    },
    {
      title: "Human-Led Governance",
      body: "Architects review, approve, reject, or override recommendations.",
    },
    {
      title: "Board-Ready Outputs",
      body: "Export executive summaries, findings registers, and decision packs.",
    },
  ] as const,

  /**
   * "How it works" — six sequential workflow steps (Req 3.1–3.2).
   * Each explanation is a single line.
   */
  workflow: [
    {
      number: "01",
      label: "Upload Evidence",
      explanation: "Submit HLDs, SOWs, diagrams, and artifacts.",
    },
    {
      number: "02",
      label: "Analyze Against Frameworks",
      explanation: "Compare evidence with CAF, WAF, and Landing Zone.",
    },
    {
      number: "03",
      label: "Generate Findings",
      explanation: "Surface evidence-linked risks and gaps.",
    },
    {
      number: "04",
      label: "Architect Review",
      explanation: "Accept, reject, override, or annotate findings.",
    },
    {
      number: "05",
      label: "Approve Decisions",
      explanation: "Capture sign-off with reviewer rationale.",
    },
    {
      number: "06",
      label: "Export Board Pack",
      explanation: "Produce summaries, risks, and decision logs.",
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
    formats: ["PDF", "Word", "Excel", "Markdown", "HTML"] as const,
  },

  /**
   * "Trust and Governance" — exactly five tiles, fixed order (Req 10.2).
   * Each description is ≤ 20 whitespace-separated words (Req 10.3,
   * Property P2).  No compliance-certification or perfect-accuracy
   * claims (Req 10.4).
   */
  trust: {
    sectionTitle: "Trust and Governance",
    tiles: [
      {
        label: "Permission-aware",
        description:
          "Respects user roles across projects, findings, and exports.",
      },
      {
        label: "Evidence-linked",
        description:
          "Findings cite the supporting document or artifact.",
      },
      {
        label: "Human-reviewed",
        description:
          "Architects approve each finding before decisions are recorded.",
      },
      {
        label: "Export-controlled",
        description:
          "Exports capture reviewer intent and evidence version.",
      },
      {
        label: "Enterprise-ready",
        description:
          "Fits existing frameworks, review practices, and governance.",
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
