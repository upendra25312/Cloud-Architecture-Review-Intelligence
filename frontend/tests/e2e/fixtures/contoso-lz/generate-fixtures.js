'use strict';
/**
 * Generates synthetic Contoso Financial Services Landing Zone test fixtures.
 *
 * Creates files with the EXACT names used in production so that the
 * file-name-based suppression logic is exercised correctly:
 *   - "Contoso_ALZ_Hub_Spoke_Network_Topology.drawio" → suppresses boundary-control FP
 *   - "Contoso_ALZ_Statement_of_Work_v1.0.docx"       → SOW document
 *
 * Content is synthetic but structurally valid so the extraction pipeline
 * can process it without errors.
 *
 * Usage:
 *   node generate-fixtures.js [output-dir]
 *
 * Output dir defaults to the directory containing this script.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const OUT_DIR = process.argv[2] ?? __dirname;
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Helper: build a minimal OOXML (docx/xlsx) ZIP ─────────────────────────
// draw.io and OOXML files are ZIP archives. We use Node.js zlib (deflateRaw)
// to create a minimal but structurally valid archive without any dependencies.

function uint16LE(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n, 0); return b; }
function uint32LE(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n, 0); return b; }

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  const table = crc32.table || (crc32.table = (() => {
    const t = [];
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : (c >>> 1);
      t.push(c);
    }
    return t;
  })());
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function buildZip(entries) {
  // entries: [{ name: string, content: Buffer }]
  const localHeaders = [];
  let offset = 0;
  const parts = [];

  for (const { name, content } of entries) {
    const deflated = zlib.deflateRawSync(content, { level: 6 });
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = crc32(content);

    const local = Buffer.concat([
      Buffer.from([0x50, 0x4B, 0x03, 0x04]), // signature
      uint16LE(20),           // version needed
      uint16LE(0),            // flags
      uint16LE(8),            // deflate
      uint16LE(0), uint16LE(0), // mod time/date
      uint32LE(crc),
      uint32LE(deflated.length),
      uint32LE(content.length),
      uint16LE(nameBytes.length),
      uint16LE(0),            // extra field length
      nameBytes,
      deflated,
    ]);

    localHeaders.push({ name: nameBytes, crc, deflated: deflated.length, raw: content.length, offset });
    offset += local.length;
    parts.push(local);
  }

  const centralDir = [];
  for (const { name: nameBytes, crc, deflated, raw, offset: lhOffset } of localHeaders) {
    centralDir.push(Buffer.concat([
      Buffer.from([0x50, 0x4B, 0x01, 0x02]), // central dir signature
      uint16LE(20), uint16LE(20),             // version made / needed
      uint16LE(0),            // flags
      uint16LE(8),            // deflate
      uint16LE(0), uint16LE(0),
      uint32LE(crc),
      uint32LE(deflated),
      uint32LE(raw),
      uint16LE(nameBytes.length),
      uint16LE(0), uint16LE(0), uint16LE(0), uint16LE(0),
      uint32LE(0),
      uint32LE(lhOffset),
      nameBytes,
    ]));
  }

  const cdBuf = Buffer.concat(centralDir);
  const cdOffset = offset;
  const eocd = Buffer.concat([
    Buffer.from([0x50, 0x4B, 0x05, 0x06]),
    uint16LE(0), uint16LE(0),
    uint16LE(localHeaders.length),
    uint16LE(localHeaders.length),
    uint32LE(cdBuf.length),
    uint32LE(cdOffset),
    uint16LE(0),
  ]);

  return Buffer.concat([...parts, cdBuf, eocd]);
}

// ── 1. Hub-Spoke drawio (key file for boundary-control suppression) ─────────

const hubSpokeDrawio = `<?xml version="1.0" encoding="UTF-8"?>
<mxGraphModel dx="1034" dy="546" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0">
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />
    <mxCell id="2" value="Hub VNet&#xa;(Connectivity Hub)" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
      <mxGeometry x="200" y="200" width="160" height="80" as="geometry" />
    </mxCell>
    <mxCell id="3" value="Azure Firewall&#xa;(Boundary Control)" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
      <mxGeometry x="200" y="320" width="160" height="80" as="geometry" />
    </mxCell>
    <mxCell id="4" value="Spoke VNet — Workload A" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
      <mxGeometry x="440" y="160" width="160" height="80" as="geometry" />
    </mxCell>
    <mxCell id="5" value="Spoke VNet — Workload B" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
      <mxGeometry x="440" y="280" width="160" height="80" as="geometry" />
    </mxCell>
    <mxCell id="6" value="NSG — Hub Subnet" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
      <mxGeometry x="200" y="440" width="160" height="60" as="geometry" />
    </mxCell>
    <mxCell id="7" value="Forced Tunneling&#xa;(Egress Control)" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
      <mxGeometry x="440" y="400" width="160" height="60" as="geometry" />
    </mxCell>
    <mxCell id="8" edge="1" source="2" target="3" parent="1">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    <mxCell id="9" edge="1" source="2" target="4" parent="1">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    <mxCell id="10" edge="1" source="2" target="5" parent="1">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
  </root>
</mxGraphModel>`;

fs.writeFileSync(path.join(OUT_DIR, 'Contoso_ALZ_Hub_Spoke_Network_Topology.drawio'), hubSpokeDrawio, 'utf8');
console.log('✓ Contoso_ALZ_Hub_Spoke_Network_Topology.drawio');

// ── 2. Architecture drawio ─────────────────────────────────────────────────

const archDrawio = `<?xml version="1.0" encoding="UTF-8"?>
<mxGraphModel>
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />
    <mxCell id="2" value="Contoso ALZ Architecture&#xa;Hub-Spoke with Azure Firewall" style="text;html=1;align=center;verticalAlign=middle;resizable=0;points=[];" vertex="1" parent="1">
      <mxGeometry x="100" y="40" width="400" height="60" as="geometry" />
    </mxCell>
    <mxCell id="3" value="Management Group Hierarchy" style="rounded=1;" vertex="1" parent="1">
      <mxGeometry x="100" y="140" width="200" height="60" as="geometry" />
    </mxCell>
    <mxCell id="4" value="Azure Policy — Connectivity Hub" style="rounded=1;" vertex="1" parent="1">
      <mxGeometry x="340" y="140" width="200" height="60" as="geometry" />
    </mxCell>
    <mxCell id="5" value="Perimeter / DMZ Layer&#xa;(Application Gateway + WAF)" style="rounded=1;" vertex="1" parent="1">
      <mxGeometry x="100" y="240" width="440" height="60" as="geometry" />
    </mxCell>
  </root>
</mxGraphModel>`;

fs.writeFileSync(path.join(OUT_DIR, 'contoso-alz-architecture.drawio'), archDrawio, 'utf8');
console.log('✓ contoso-alz-architecture.drawio');

// ── 3. HLD docx (minimal valid OOXML) ──────────────────────────────────────

const hldText = `Contoso Financial Services — Azure Landing Zone High-Level Design v1.0

NETWORK ARCHITECTURE
Hub-spoke topology deployed with a central Connectivity Hub subscription.
Azure Firewall deployed in Hub VNet providing centralised egress control and boundary protection.
All spoke VNets peer to Hub VNet; forced tunnelling routes all egress through Azure Firewall.
Network Security Groups applied to all subnets.

IDENTITY AND ACCESS
Microsoft Entra ID as authoritative identity provider.
Privileged Identity Management (PIM) configured for all privileged roles.
Conditional Access Policies enforced: MFA required, compliant-device required.
Break-glass accounts documented and secured.

SECURITY CONTROLS
Microsoft Defender for Cloud enabled across all subscriptions.
Azure Key Vault for all secret and certificate management.
Encryption at rest and in transit enforced by policy.

GOVERNANCE
Management Group hierarchy: Tenant Root > Contoso > Platform > Landing Zones.
Azure Policy deployed for naming, tagging, networking, and security baseline.
RBAC model documented with least-privilege principles.
Budget alerts configured per subscription.

RELIABILITY
Availability Zones used for all critical services.
Cross-region DR plan documented with RPO ≤ 4h, RTO ≤ 8h.
Backup policy: daily snapshots, 30-day retention.
`;

const hldDocXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${hldText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, ' ')}</w:t></w:r></w:p>
  </w:body>
</w:document>`;

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const wordRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

const hldDocx = buildZip([
  { name: '[Content_Types].xml', content: Buffer.from(contentTypes, 'utf8') },
  { name: '_rels/.rels', content: Buffer.from(relsXml, 'utf8') },
  { name: 'word/document.xml', content: Buffer.from(hldDocXml, 'utf8') },
  { name: 'word/_rels/document.xml.rels', content: Buffer.from(wordRelsXml, 'utf8') },
]);
fs.writeFileSync(path.join(OUT_DIR, 'Contoso_ALZ_High_Level_Design_v1.0.docx'), hldDocx);
console.log('✓ Contoso_ALZ_High_Level_Design_v1.0.docx');

// ── 4. SOW docx ─────────────────────────────────────────────────────────────

const sowText = `Contoso Financial Services — Statement of Work v1.0

SCOPE OF WORK
Rackspace Technology will deliver an Azure Landing Zone design and implementation for Contoso Financial Services.

IN SCOPE
- Azure Landing Zone architecture design (hub-spoke topology)
- Azure Firewall deployment and policy configuration
- Management Group hierarchy and Azure Policy deployment
- Identity and access management design (Entra ID, PIM, Conditional Access)
- Security baseline configuration (Defender for Cloud, Key Vault)
- Network design: Hub VNet, Spoke VNets, NSGs, forced tunneling
- Governance framework: RBAC, tagging, budget alerts
- High Availability and Disaster Recovery design

OUT OF SCOPE
- Day-2 operational runbook authoring (Managed Services / Operations team responsibility)
- Ongoing incident management and operational ownership (Operations team)
- Deployment ownership post go-live (Managed Services)

DELIVERABLES
1. High-Level Design document
2. Low-Level Design document
3. Azure Firewall policy baseline
4. Management Group and Policy definitions
5. RBAC model and role assignments
`;

const sowDocXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${sowText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, ' ')}</w:t></w:r></w:p>
  </w:body>
</w:document>`;

const sowDocx = buildZip([
  { name: '[Content_Types].xml', content: Buffer.from(contentTypes, 'utf8') },
  { name: '_rels/.rels', content: Buffer.from(relsXml, 'utf8') },
  { name: 'word/document.xml', content: Buffer.from(sowDocXml, 'utf8') },
  { name: 'word/_rels/document.xml.rels', content: Buffer.from(wordRelsXml, 'utf8') },
]);
fs.writeFileSync(path.join(OUT_DIR, 'Contoso_ALZ_Statement_of_Work_v1.0.docx'), sowDocx);
console.log('✓ Contoso_ALZ_Statement_of_Work_v1.0.docx');

// ── 5. LLD xlsx (minimal valid OOXML spreadsheet) ──────────────────────────

const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>Contoso ALZ Low-Level Design</t></is></c></row>
    <row r="2"><c r="A2" t="inlineStr"><is><t>Component</t></is></c><c r="B2" t="inlineStr"><is><t>Design Decision</t></is></c><c r="C2" t="inlineStr"><is><t>Details</t></is></c></row>
    <row r="3"><c r="A3" t="inlineStr"><is><t>Hub VNet</t></is></c><c r="B3" t="inlineStr"><is><t>10.0.0.0/16</t></is></c><c r="C3" t="inlineStr"><is><t>Connectivity Hub VNet with Azure Firewall subnet, Gateway subnet</t></is></c></row>
    <row r="4"><c r="A4" t="inlineStr"><is><t>Azure Firewall</t></is></c><c r="B4" t="inlineStr"><is><t>Premium SKU</t></is></c><c r="C4" t="inlineStr"><is><t>Centralised egress control, IDPS enabled, TLS inspection enabled</t></is></c></row>
    <row r="5"><c r="A5" t="inlineStr"><is><t>Spoke VNet A</t></is></c><c r="B5" t="inlineStr"><is><t>10.1.0.0/24</t></is></c><c r="C5" t="inlineStr"><is><t>Workload A — App tier, Data tier, Management subnet</t></is></c></row>
    <row r="6"><c r="A6" t="inlineStr"><is><t>NSG Policy</t></is></c><c r="B6" t="inlineStr"><is><t>Deny-all default</t></is></c><c r="C6" t="inlineStr"><is><t>All NSGs default-deny inbound; explicit allow rules only</t></is></c></row>
    <row r="7"><c r="A7" t="inlineStr"><is><t>Forced Tunneling</t></is></c><c r="B7" t="inlineStr"><is><t>Enabled on all spokes</t></is></c><c r="C7" t="inlineStr"><is><t>0.0.0.0/0 via Azure Firewall private IP</t></is></c></row>
  </sheetData>
</worksheet>`;

const xlsxContentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

const xlsxRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="LLD" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

const xlsxWorkbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

const lldXlsx = buildZip([
  { name: '[Content_Types].xml', content: Buffer.from(xlsxContentTypes, 'utf8') },
  { name: '_rels/.rels', content: Buffer.from(xlsxRels, 'utf8') },
  { name: 'xl/workbook.xml', content: Buffer.from(workbookXml, 'utf8') },
  { name: 'xl/_rels/workbook.xml.rels', content: Buffer.from(xlsxWorkbookRels, 'utf8') },
  { name: 'xl/worksheets/sheet1.xml', content: Buffer.from(sheetXml, 'utf8') },
]);
fs.writeFileSync(path.join(OUT_DIR, 'Contoso_ALZ_Low_Level_Design_v1.0.xlsx'), lldXlsx);
console.log('✓ Contoso_ALZ_Low_Level_Design_v1.0.xlsx');

// ── 6. HLD PNG (1×1 white pixel) ──────────────────────────────────────────
// Minimal valid PNG: signature + IHDR + IDAT + IEND
const PNG_1X1_WHITE = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108020000009001' +
  '2e000000000c4944415408d76360f8ff0f0000000200012d2f0a000000004945' +
  '4e44ae426082', 'hex'
);
// Use a known-good 1x1 white PNG (base64 decoded)
const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==',
  'base64'
);
fs.writeFileSync(path.join(OUT_DIR, 'contoso-alz-hld.png'), png1x1);
console.log('✓ contoso-alz-hld.png');

console.log(`\nAll 6 test fixtures generated in: ${OUT_DIR}`);
