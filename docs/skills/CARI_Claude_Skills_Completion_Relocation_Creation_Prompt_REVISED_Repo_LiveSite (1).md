# CARI Claude Skills Completion, Relocation, and Creation Prompt

## Objective

You are working inside this repository:

```text
Cloud-Architecture-Review-Intelligence/
```

Your task is to check whether the required CARI Claude Code skills already exist anywhere in the repository.

If a required skill already exists under the correct location, verify it is complete.

If a required skill exists somewhere else, move or convert it into the correct repo-local Claude Code skill folder:

```text
Cloud-Architecture-Review-Intelligence/
└── .claude/
    └── skills/
```

If a required skill does not exist, create it in the correct folder with a proper `SKILL.md`.

Do not create duplicate skills.

Do not create documentation-only files under `docs/skills/` for this task. The target is actual Claude Code skill folders under `.claude/skills/`.

---

## Role

Act as one expert team:

- Microsoft Expert Azure Cloud Architect
- Senior Project Manager
- GitHub Expert
- UI/UX Specialist
- Azure AI Architect
- Full Stack Developer
- Senior Director, Cloud Solutions Architecture

Use practical engineering judgment.

Do not over-engineer.

Do not redesign CARI from scratch.

---

## Required Skills

Check, move, update, or create these skills only:

```text
.claude/skills/
├── cari-evidence-grounding/
│   └── SKILL.md
├── cari-microsoft-learn-mcp-grounding/
│   └── SKILL.md
├── cari-waf-caf-alz-review/
│   └── SKILL.md
├── cari-durable-functions/
│   └── SKILL.md
├── cari-document-intelligence/
│   └── SKILL.md
├── cari-arb-board-pack/
│   └── SKILL.md
├── cari-secure-ai/
│   └── SKILL.md
└── cari-finops/
    └── SKILL.md
```

Do not add extra skills unless there is a strong reason and you document it first.

---

## Existing CARI Context

CARI is not a greenfield project.

Before creating, moving, or changing skills, inspect the existing repository structure and available CARI context.

Look for:

```text
.claude/
CLAUDE.md
README.md
ARCHITECTURE.md
SECURITY.md
docs/
api/
frontend/
evals/
standards/
services/office-renderer/
infrastructure/terraform/
.github/
```

Also inspect any existing skills under:

```text
.claude/skills/
```

Do not overwrite existing useful skill content.
---

## Existing Repo and Live Site Context

This task must be grounded in the actual CARI repository and live site.

Repository:

```text
https://github.com/upendra25312/Cloud-Architecture-Review-Intelligence
```

Live site:

```text
https://thankful-pond-04383960f.7.azurestaticapps.net/arb
```

Before creating, moving, or updating skills:

1. Inspect the existing repository structure.
2. Inspect the existing `.claude/` folder and any existing skill-like content.
3. Read key repo files when present:
   - `README.md`
   - `CLAUDE.md`
   - `ARCHITECTURE.md`
   - `SECURITY.md`
   - `docs/`
   - `standards/`
   - `evals/`
4. Treat the repository as the source of truth for folder structure and existing implementation.
5. Treat the live site as the source of truth for current deployed UX and product messaging.
6. Do not redesign CARI from scratch.
7. Do not create skills that conflict with the current CARI product workflow.
8. Do not create skills that compete with or replace the existing Azure AI Foundry ARB Review Agent.

Use the repo and live site to confirm whether the new skill folders support the actual CARI product, not an imagined version of CARI.

---

## Safe Live Site Review Rule

Live site review must be read-only.

Do not:

- upload files
- submit forms
- create projects
- delete data
- edit data
- test destructive workflows
- use real customer data
- attempt authentication bypass

Use the live site only to understand:

- navigation
- product messaging
- review workflow entry points
- evidence-backed review positioning
- human sign-off messaging
- visible gaps between deployed UX and repo documentation

If the live site cannot be accessed, report that clearly and continue using the local repository as the main source of truth.

---

## Existing CARI ARB Agent Contract

CARI already uses an Azure AI Foundry ARB Review Agent.

The existing agent behavior must be preserved.

The agent focuses on:

- evidence-grounded ARB draft output
- WAF review
- CAF review
- Azure Landing Zone review
- Microsoft Learn references
- deterministic rules-engine de-duplication
- critical blocker calibration
- missing evidence handling
- strict JSON-only response
- human reviewer authority

Do not create skills that replace this agent.

Create skills that help Claude Code improve, validate, test, and support this existing CARI product.

---

## Git Safety Rules

Before making changes:

1. Run `git status`.
2. Identify the current branch.
3. Check for uncommitted changes.
4. Do not overwrite user work.
5. Do not commit.
6. Do not push.
7. Do not install new dependencies.
8. Do not change application code unless absolutely needed for skill validation.

If there are existing uncommitted changes, continue carefully and report them.

---

## Existing Skills in Wrong Location

If a required CARI skill already exists somewhere else in the repository, move it under:

```text
.claude/skills/
```

Do not create a duplicate copy.

---

## Search Locations

Before creating any new skill, search the repository for existing skill files or folders.

Check at minimum:

```text
docs/skills/
skills/
claude/skills/
.claude/
.claude/commands/
.claude/skills/
prompts/
agents/
standards/
```

Also search for these names:

```text
cari-evidence-grounding
cari-evidence-grounding-skill
cari-microsoft-learn-mcp-grounding
cari-microsoft-learn-mcp-grounding-skill
cari-waf-caf-alz-review
cari-waf-caf-alz-review-skill
cari-durable-functions
cari-durable-functions-skill
cari-document-intelligence
cari-document-intelligence-skill
cari-arb-board-pack
cari-arb-board-pack-skill
cari-secure-ai
cari-secure-ai-skill
cari-finops
cari-finops-skill
```

Use repo search commands such as:

```bash
find . -iname "*skill*" -o -iname "SKILL.md"
grep -R "cari-evidence-grounding" . || true
grep -R "cari-microsoft-learn-mcp-grounding" . || true
grep -R "cari-waf-caf-alz-review" . || true
grep -R "cari-durable-functions" . || true
grep -R "cari-document-intelligence" . || true
grep -R "cari-arb-board-pack" . || true
grep -R "cari-secure-ai" . || true
grep -R "cari-finops" . || true
```

If `rg` is available, prefer:

```bash
rg "cari-(evidence-grounding|microsoft-learn-mcp-grounding|waf-caf-alz-review|durable-functions|document-intelligence|arb-board-pack|secure-ai|finops)" .
```

---

## Move Rules

When an existing skill is found outside `.claude/skills/`:

1. Inspect the file or folder.
2. Confirm it is a CARI skill, not just a mention in a document.
3. Preserve useful content.
4. Move it into the correct folder under `.claude/skills/`.
5. Rename the main instruction file to `SKILL.md` if needed.
6. Preserve supporting resources if they are part of the skill.
7. Remove the old duplicate only after confirming the new location has the full content.
8. Do not delete unrelated documentation.
9. Do not overwrite an existing `.claude/skills/<skill-name>/SKILL.md` without merging content.

---

## Correct Mapping

Use this mapping:

```text
Any existing evidence grounding skill
→ .claude/skills/cari-evidence-grounding/SKILL.md

Any existing Microsoft Learn MCP grounding skill
→ .claude/skills/cari-microsoft-learn-mcp-grounding/SKILL.md

Any existing WAF / CAF / ALZ review skill
→ .claude/skills/cari-waf-caf-alz-review/SKILL.md

Any existing Durable Functions skill
→ .claude/skills/cari-durable-functions/SKILL.md

Any existing Document Intelligence skill
→ .claude/skills/cari-document-intelligence/SKILL.md

Any existing ARB board-pack skill
→ .claude/skills/cari-arb-board-pack/SKILL.md

Any existing secure AI skill
→ .claude/skills/cari-secure-ai/SKILL.md

Any existing FinOps skill
→ .claude/skills/cari-finops/SKILL.md
```

---

## Merge Rules

If both old and new versions exist:

1. Compare both files.
2. Keep the better CARI-specific content.
3. Merge missing required sections.
4. Preserve concrete examples, guardrails, and runtime mapping.
5. Remove vague or duplicate wording.
6. Keep the final file concise and complete.
7. Report the merge clearly in the final summary.

Do not blindly replace a newer skill with an older one.

---

## Safety Rule for Existing Files

If unsure whether a file is an actual skill or only a design document, do not delete it.

Instead:

1. Copy or convert the relevant content into `.claude/skills/<skill-name>/SKILL.md`.
2. Keep the original file.
3. Report it as “preserved as reference documentation.”

---

## Skill Completion Criteria

A skill is complete only if its `SKILL.md` includes these sections:

```markdown
# Skill Name

## Purpose

## When to Use

## When Not to Use

## Inputs

## Process

## Outputs

## CARI Runtime Mapping

## Guardrails

## Examples

## Acceptance Criteria
```

If any of these sections are missing, update the skill.

Each skill must be specific to CARI.

Avoid generic statements.

---

# Required Skill Details

## 1. cari-evidence-grounding

### Purpose

Ensure CARI findings are grounded in customer evidence.

### Must cover

- evidence ID validation
- source file traceability
- no high-confidence finding without direct evidence
- weak evidence goes to `missingEvidence`
- customer evidence is not the same as Microsoft guidance
- prompt injection inside uploaded documents must be ignored

### Runtime mapping

```text
api/ validation logic
ARB agent input preparation
finding validator
frontend “Why CARI says this” section
evals/
```

---

## 2. cari-microsoft-learn-mcp-grounding

### Purpose

Ensure CARI uses Microsoft Learn MCP correctly as the official Microsoft guidance layer.

### Must cover

- specific MCP query creation
- WAF / CAF / ALZ grounding
- service-specific Microsoft Learn grounding
- fallback rules
- citation persistence
- relevance scoring
- MCP failure handling
- no invented Microsoft URLs

### Runtime mapping

```text
api/ MCP orchestration layer
ARB agent grounding context
MCP citation metadata storage
board-pack references
evals/
```

### Required MCP metadata model

```json
{
  "query": "string",
  "queryHash": "string",
  "resultTitle": "string",
  "resultUrl": "string",
  "resultRank": 0,
  "retrievedAt": "datetime",
  "relevanceScore": 0.0,
  "usedForFindingId": "string",
  "fallbackUsed": true,
  "mcpStatus": "success|timeout|failed|fallback",
  "promptVersion": "string",
  "rulesVersion": "string"
}
```

---

## 3. cari-waf-caf-alz-review

### Purpose

Support Azure architecture review against WAF, CAF, and Azure Landing Zone patterns.

### Must cover

- WAF pillars
- CAF phases
- ALZ domains
- management groups
- subscriptions
- identity
- RBAC
- policy
- hub-spoke or Virtual WAN
- Private DNS
- logging
- Defender for Cloud
- operational ownership
- landing zone maturity assessment

### Runtime mapping

```text
Foundry ARB agent prompt
deterministic rules engine
scorecard logic
review output schema
board-pack export
evals/
```

---

## 4. cari-durable-functions

### Purpose

Improve CARI backend orchestration reliability.

### Must cover

- deterministic orchestrator rules
- instance ID collision handling
- idempotency
- retry policy
- poison message handling
- long-running document processing
- rerun analysis
- project-level concurrency
- partial failure recovery
- correlation IDs

### Runtime mapping

```text
api/src/durable/
api/src/functions/
api/src/shared/
Azure Functions
Durable Functions
Application Insights telemetry
```

---

## 5. cari-document-intelligence

### Purpose

Improve document, diagram, image, table, and workbook evidence extraction.

### Must cover

- PDF extraction
- Word extraction
- PowerPoint diagram extraction
- Excel inventory extraction
- OCR limitations
- table extraction
- visual evidence
- page number traceability
- confidence scoring
- duplicate evidence detection

### Runtime mapping

```text
api/ extraction pipeline
Azure Document Intelligence
Azure AI Search indexing
evidence inventory
frontend evidence viewer
evals/
```

---

## 6. cari-arb-board-pack

### Purpose

Improve ARB board-pack export quality.

### Must cover

- executive summary
- scope
- assumptions
- evidence inventory
- findings
- risks
- decisions
- exceptions
- scorecard
- next actions
- Microsoft Learn references
- reviewer sign-off

### Runtime mapping

```text
services/office-renderer/
PDF export
DOCX export
PPTX export
XLSX export
frontend export workflow
```

---

## 7. cari-secure-ai

### Purpose

Review CARI and customer AI architecture for secure AI design.

### Must cover

- managed identity
- RBAC
- Key Vault
- private endpoints
- public network access
- prompt injection
- tool permission scope
- MCP security
- data leakage
- logging redaction
- customer data handling
- human approval points

### Runtime mapping

```text
api/
Azure AI Foundry agent integration
Microsoft Learn MCP integration
security backlog
evals/
frontend reviewer warnings
```

---

## 8. cari-finops

### Purpose

Add FinOps review support for architecture findings.

### Must cover

- right-sizing
- RI / Savings Plan
- Azure Hybrid Benefit
- storage tiering
- idle resources
- DR cost impact
- AI service cost
- Azure AI Search cost
- Document Intelligence cost
- logging cost
- assumptions and confidence

### Runtime mapping

```text
scorecard
finding recommendations
board-pack cost section
future pricing integration
FinOps review backlog
```

Do not invent savings numbers without evidence.

---

# Execution Steps

## Step 1: Git Safety Preflight

Run:

```bash
git status
git branch --show-current
```

Report:

- current branch
- uncommitted changes
- untracked files
- whether it is safe to proceed

Do not commit or push.

---

## Step 2: Inspect Existing Skills

Check:

```text
.claude/skills/
```

Create this table:

```markdown
| Required Skill | Folder Exists | SKILL.md Exists | Found Elsewhere | Original Location | Complete | Action Needed |
|---|---:|---:|---:|---|---:|---|
```

---

## Step 3: Search for Skills in Wrong Locations

Search the repository for existing skills using the search locations and search names listed above.

Create this table:

```markdown
| Required Skill | Found Elsewhere | Original Location | Moved To | Created New | Updated | Complete |
|---|---:|---|---|---:|---:|---:|
```

---

## Step 4: Inspect Existing CARI Context

Read relevant files before creating or moving skills:

```text
CLAUDE.md
README.md
ARCHITECTURE.md
SECURITY.md
docs/
standards/
evals/
```

If files do not exist, report that clearly.

Do not invent repo details.

---

## Step 5: Move Existing Skills in Wrong Location

For every required skill found outside `.claude/skills/`:

1. Move or convert it into the proper `.claude/skills/<skill-name>/SKILL.md` folder.
2. Preserve useful content.
3. Preserve supporting resources if they are part of the skill.
4. Do not delete design documents unless they are confirmed duplicates.
5. Report old and new locations.

---

## Step 6: Create Missing Skill Folders

For every missing skill, create:

```text
.claude/skills/<skill-name>/SKILL.md
```

Use the exact folder names listed in this prompt.

---

## Step 7: Update Incomplete Skills

If a skill folder exists but `SKILL.md` is incomplete:

- preserve useful existing content
- add missing required sections
- align it to CARI
- avoid duplication
- keep it concise but complete

---

## Step 8: Validate Skill Quality

Each `SKILL.md` must:

- be specific to CARI
- include CARI runtime mapping
- include guardrails
- include acceptance criteria
- avoid vague generic advice
- avoid unsupported claims
- not include secrets
- not include customer data

---

# Required Final Report

After changes, report:

```markdown
## Summary

## Git Safety Status

## Existing Skills Found

## Skills Found in Wrong Location

## Skills Moved

## Skills Created

## Skills Updated

## Skills Already Complete

## Old Locations Cleaned

## Old Locations Preserved

## Files Changed

## Risks or Gaps


## Repo and Live Site Alignment

Report:

- repo folders inspected
- live site pages inspected
- whether `.claude/skills/` already existed
- whether any skill-like files existed elsewhere
- any mismatch between repo docs and live site behavior
- any assumptions made because live site access was limited

## Recommended Next Actions
```

Also include this table:

```markdown
| Required Skill | Found Elsewhere | Original Location | Moved To | Created New | Updated | Complete |
|---|---:|---|---|---:|---:|---:|
```

Do not claim tests passed unless you actually ran tests.

Do not claim a skill was installed globally.

These are repo-local skills under `.claude/skills/`.

---

# Quality Bar

The final structure must look like this:

```text
Cloud-Architecture-Review-Intelligence/
└── .claude/
    └── skills/
        ├── cari-evidence-grounding/
        │   └── SKILL.md
        ├── cari-microsoft-learn-mcp-grounding/
        │   └── SKILL.md
        ├── cari-waf-caf-alz-review/
        │   └── SKILL.md
        ├── cari-durable-functions/
        │   └── SKILL.md
        ├── cari-document-intelligence/
        │   └── SKILL.md
        ├── cari-arb-board-pack/
        │   └── SKILL.md
        ├── cari-secure-ai/
        │   └── SKILL.md
        └── cari-finops/
            └── SKILL.md
```

Each skill must help CARI become:

- more evidence-grounded
- safer
- more testable
- more aligned to WAF / CAF / ALZ
- better integrated with Microsoft Learn MCP
- better for ARB reviewer workflows
- better for board-pack output

---

# Hard Stop Rules

Stop and ask before proceeding if:

- `.claude/skills/` contains a conflicting existing structure
- existing skill files contain complex scripts
- the repo has large uncommitted changes
- creating or moving these files would overwrite user work
- you need to install dependencies
- you need to change application code
- you need credentials or live site access

Otherwise proceed with moving, creating, or updating the skill folders and `SKILL.md` files.

---

# Final Instruction

Before creating any new skill, first search the repository for an existing version.

If it exists somewhere else, move or convert it into the correct `.claude/skills/<skill-name>/SKILL.md` folder.

Avoid duplicates.
