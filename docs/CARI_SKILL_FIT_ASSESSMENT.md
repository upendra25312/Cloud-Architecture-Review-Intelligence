# CARI Skill Fit Assessment

_Mode B output — generated 2026-05-26. Assesses Claude Code skill fit against the current CARI product._

---

## Assessment Summary

CARI is a production Azure-native platform. Claude Code skills that help improve, validate, test, and extend CARI are the target — not skills that replace the existing Foundry ARB agent or redesign the platform.

---

## Tier 1: High-Fit Skills (Use Now)

### `webapp-testing` / Playwright
**Fit:** Very High  
**Use for:**
- ARB review workflow E2E tests (`frontend/tests/e2e/`)
- Upload → extraction → findings → export golden path (C7 done)
- Multi-user RBAC scenario tests
- Visual regression on finding cards and scorecard

**Current state:** 1 golden-path spec at `frontend/tests/e2e/arb-golden-path.spec.js`. Not yet in CI.  
**Gap:** CI integration (`test-e2e.yml`). Needs passkey-rejector pattern for AAD auth.

---

### `frontend-design`
**Fit:** High  
**Use for:**
- 'Why CARI says this' panel UX (C6 done)
- Finding card accessibility (ARIA labels, keyboard nav)
- Scorecard UX improvements
- Evidence inventory screen
- Board-pack export UX

**Current state:** WhyCariSaysThis component implemented. Finding detail panel updated.  
**Gap:** Accessibility audit on new toggle component; keyboard navigation test.

---

### `pdf`, `docx`, `pptx`, `xlsx`
**Fit:** High  
**Use for:**
- Validating PPTX board-pack template correctness
- Reviewing DOCX export quality
- Checking XLSX decision register completeness
- Improving evidence extraction quality checks

**Important:** These skills inspect code and templates. They do NOT replace Azure Document Intelligence runtime extraction.  
**Current state:** PPTX export is implemented in `api/src/shared/arb-pptx-export.js`. No template validation tests yet.  
**Gap:** Board-pack PPTX validation tests (N2 in backlog).

---

## Tier 2: Method Skills (Use as Discipline)

### Superpowers workflow
**Fit:** High (as engineering discipline)  
**Use for:**
- Brainstorm → plan → implement → validate for each Mode C slice
- Change-control method before modifying production files
- Test-driven development for new API endpoints
- Systematic debugging of Durable Functions

**Not:** A runtime feature or installable dependency.

---

## Tier 3: CARI-Specific Skills (Created in `.claude/skills/`)

These are repo-local Claude Code skills under `.claude/skills/`. They help Claude Code work correctly inside CARI without re-discovering the product on every session.

| Skill | Purpose | Status |
|---|---|---|
| `cari-evidence-grounding` | Ensure findings are grounded in customer evidence | ✅ Created |
| `cari-microsoft-learn-mcp-grounding` | Use MS Learn MCP correctly as guidance layer | ✅ Created |
| `cari-waf-caf-alz-review` | Support WAF/CAF/ALZ architecture review | ✅ Created |
| `cari-durable-functions` | Improve Durable orchestration reliability | ✅ Created |
| `cari-document-intelligence` | Improve evidence extraction quality | ✅ Created |
| `cari-arb-board-pack` | Improve board-pack export quality | ✅ Created |
| `cari-secure-ai` | Review CARI and customer AI architecture for security | ✅ Created |
| `cari-finops` | Add FinOps review support to findings | ✅ Created |

---

## Tier 4: Community Skills (Inspect Before Use)

| Skill Source | Fit | Action |
|---|---|---|
| `upendra25312/Skill_Seekers` | Medium — useful for creating CARI skill specs | Inspect before use; do not execute scripts |
| `alirezarezvani/claude-skills` | Low–Medium — security audit support | Review individually; not auto-approved |
| Awesome-lists catalogs | Catalog only | Do not install without manual review |

---

## Skill Gaps

| Gap | Impact | Recommended Action |
|---|---|---|
| No security-auditor skill configured | Medium | Use `cari-secure-ai` SKILL.md as reference instead |
| Playwright not in CI | High | Add `test-e2e.yml` workflow |
| No FinOps rule file in `api/data/arb-rules/` | Low | Blocked until FinOps rules are defined |

---

## Skills NOT Applicable to CARI

| Skill type | Reason |
|---|---|
| Skills that replace the Foundry ARB agent | Agent is a product contract — do not replace |
| Generic data science or ML pipeline skills | CARI uses Azure AI services — not custom ML |
| Skills requiring new cloud credentials | All Azure service auth uses Managed Identity |
| Skills that modify `infrastructure/terraform/` | Terraform is frozen; changes go through CI/CD only |

---

_This assessment should be refreshed after any major CARI product change or new skill release._
