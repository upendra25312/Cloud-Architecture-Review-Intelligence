/**
 * LandingZoneDiagram — "Built for Enterprise Architecture Reviews" (Req 8).
 *
 * Original inline SVG authored in this repository.  No Microsoft reference
 * architecture assets are embedded (Req 8.3, 20.3).  The diagram mirrors
 * the canonical ALZ conceptual layout at a high level:
 *
 *   Tenant → Entra ID
 *     └── Management groups
 *           ├── Platform subscriptions  ── Hub network (Azure Firewall,
 *           │                                  Private DNS Resolver)
 *           └── Application landing zones ── Spoke network (Private
 *                                             Endpoints)
 *   Cross-cutting: Azure Monitor, Log Analytics, Backup and DR,
 *                  Policy guardrails, CI/CD with IaC.
 *
 * Accessibility strategy (Req 8.4):
 *   • Outer <div class="review-lz-frame" role="img" aria-label="...">
 *   • Inner <svg role="img" aria-labelledby="lz-svg-title lz-svg-desc">
 *   • <title id="lz-svg-title"> + <desc id="lz-svg-desc">
 *   • Every significant node is a <g> with its own <title> child so
 *     assistive tools that traverse the SVG tree can expose node names.
 *
 * Pure presentational component.
 */

import { HOME_COPY } from "./home-copy";

export interface LandingZoneDiagramProps {
  title?: string;
}

interface NodeBoxProps {
  x: number;
  y: number;
  width: number;
  height: number;
  id: string;
  label: string;
  accent?: boolean;
  container?: boolean;
  tag?: string;
}

function NodeBox({
  x,
  y,
  width,
  height,
  id,
  label,
  accent = false,
  container = false,
  tag,
}: NodeBoxProps) {
  const labelX = x + width / 2;
  const labelY = y + (tag ? height / 2 - 2 : height / 2 + 4);
  const tagY = y + height / 2 + 16;
  return (
    <g
      className={`review-lz-node${accent ? " review-lz-node--accent" : ""}${container ? " review-lz-node--container" : ""}`}
      data-node-id={id}
    >
      <title>{label}</title>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={10}
        ry={10}
      />
      <text
        x={labelX}
        y={labelY}
        textAnchor="middle"
        className="review-lz-label"
      >
        {label}
      </text>
      {tag ? (
        <text
          x={labelX}
          y={tagY}
          textAnchor="middle"
          className="review-lz-tag"
        >
          {tag}
        </text>
      ) : null}
    </g>
  );
}

export default function LandingZoneDiagram({
  title,
}: LandingZoneDiagramProps = {}) {
  const copy = HOME_COPY.landingZone;
  const n = copy.nodes;
  const heading = title ?? copy.sectionTitle;

  return (
    <section
      className="review-section"
      aria-labelledby="lz-title"
      data-home-section="landing-zone"
    >
      <div className="review-section-head">
        <p className="review-eyebrow">Enterprise architecture</p>
        <h2 id="lz-title">{heading}</h2>
      </div>

      <div
        className="review-lz-frame"
        role="img"
        aria-label={copy.diagramAriaLabel}
      >
        <svg
          className="review-lz-svg"
          viewBox="0 0 1200 720"
          role="img"
          aria-labelledby="lz-svg-title lz-svg-desc"
          preserveAspectRatio="xMidYMid meet"
          xmlns="http://www.w3.org/2000/svg"
        >
          <title id="lz-svg-title">{copy.svgTitle}</title>
          <desc id="lz-svg-desc">{copy.svgDesc}</desc>

          {/* Tenant container (outer) */}
          <NodeBox
            x={30}
            y={30}
            width={1140}
            height={660}
            id="tenant"
            label={n.tenant}
            container
            tag="Microsoft Entra tenant"
          />

          {/* Entra ID (top-right) */}
          <NodeBox
            x={900}
            y={60}
            width={240}
            height={70}
            id="entra-id"
            label={n.entraId}
            accent
            tag="Identity provider"
          />

          {/* Management groups */}
          <NodeBox
            x={70}
            y={70}
            width={320}
            height={60}
            id="management-groups"
            label={n.managementGroups}
            accent
            tag="Hierarchy root"
          />

          {/* Platform subscriptions container */}
          <NodeBox
            x={70}
            y={170}
            width={540}
            height={310}
            id="platform-subscriptions"
            label={n.platformSubscriptions}
            container
            tag="Shared services"
          />

          {/* Hub network */}
          <NodeBox
            x={90}
            y={220}
            width={230}
            height={90}
            id="hub-network"
            label={n.hubNetwork}
            accent
            tag="Transit + inspection"
          />

          {/* Azure Firewall */}
          <NodeBox
            x={340}
            y={220}
            width={250}
            height={70}
            id="azure-firewall"
            label={n.azureFirewall}
            tag="Centralised egress"
          />

          {/* Private DNS Resolver */}
          <NodeBox
            x={340}
            y={310}
            width={250}
            height={70}
            id="private-dns-resolver"
            label={n.privateDnsResolver}
            tag="Conditional forwarding"
          />

          {/* Azure Monitor */}
          <NodeBox
            x={90}
            y={400}
            width={230}
            height={60}
            id="azure-monitor"
            label={n.azureMonitor}
            tag="Metrics + alerts"
          />

          {/* Log Analytics */}
          <NodeBox
            x={340}
            y={400}
            width={250}
            height={60}
            id="log-analytics"
            label={n.logAnalytics}
            tag="Centralised logs"
          />

          {/* Application landing zones container */}
          <NodeBox
            x={640}
            y={170}
            width={510}
            height={310}
            id="application-landing-zones"
            label={n.applicationLandingZones}
            container
            tag="Workload subscriptions"
          />

          {/* Spoke network */}
          <NodeBox
            x={660}
            y={220}
            width={220}
            height={90}
            id="spoke-network"
            label={n.spokeNetwork}
            accent
            tag="Workload VNets"
          />

          {/* Private Endpoints */}
          <NodeBox
            x={900}
            y={220}
            width={230}
            height={90}
            id="private-endpoints"
            label={n.privateEndpoints}
            tag="PaaS private access"
          />

          {/* Backup and DR */}
          <NodeBox
            x={660}
            y={340}
            width={220}
            height={60}
            id="backup-and-dr"
            label={n.backupAndDr}
            tag="Recovery Services"
          />

          {/* Policy guardrails */}
          <NodeBox
            x={900}
            y={340}
            width={230}
            height={60}
            id="policy-guardrails"
            label={n.policyGuardrails}
            tag="Azure Policy"
          />

          {/* CI/CD with IaC (cross-cutting, spans bottom) */}
          <NodeBox
            x={70}
            y={540}
            width={1080}
            height={100}
            id="cicd-iac"
            label={n.cicdIac}
            container
            tag="GitHub / Azure DevOps pipelines deploying Bicep and Terraform"
          />

          {/* Edges — management groups to platform + application subscriptions */}
          <line x1={230} y1={130} x2={230} y2={170} />
          <line x1={230} y1={150} x2={895} y2={150} />
          <line x1={895} y1={150} x2={895} y2={170} />

          {/* Hub → Firewall, Hub → DNS Resolver */}
          <line x1={320} y1={255} x2={340} y2={255} />
          <line x1={320} y1={340} x2={340} y2={340} />

          {/* Hub → Spoke peering */}
          <path
            className="review-lz-edge"
            d="M 320 265 C 500 265 520 265 660 265"
            markerEnd="url(#lz-arrow)"
          />

          {/* Spoke → Private Endpoints */}
          <line x1={880} y1={265} x2={900} y2={265} />

          {/* Hub → Monitor / Log Analytics (diagnostic flows) */}
          <line x1={205} y1={310} x2={205} y2={400} />
          <line x1={465} y1={380} x2={465} y2={400} />

          {/* Spoke → Backup / Policy (management flows) */}
          <line x1={770} y1={310} x2={770} y2={340} />
          <line x1={1015} y1={310} x2={1015} y2={340} />

          {/* Platform + Application → CI/CD bus */}
          <line x1={340} y1={480} x2={340} y2={540} />
          <line x1={895} y1={480} x2={895} y2={540} />

          {/* Entra ID → Management groups (trust + admin) */}
          <path
            className="review-lz-edge"
            d="M 900 95 C 700 95 520 95 390 100"
            strokeDasharray="5 4"
          />

          {/* Arrow marker */}
          <defs>
            <marker
              id="lz-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path
                d="M 0 0 L 10 5 L 0 10 z"
                fill="var(--lz-stroke)"
                stroke="none"
              />
            </marker>
          </defs>
        </svg>
      </div>
    </section>
  );
}
