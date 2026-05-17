# CARI Claude Code Execution Runbook
## Safe, Token-Efficient, Cost-Controlled Implementation Guide

> **DOCUMENT STATUS — PARTIALLY OBSOLETE (last reviewed 2026-05-17)**
>
> This runbook was written before v0.6.0 shipped. Several items it plans to build are already done:
>
> - **Evaluation framework (PR 2)** — COMPLETE. 27/27 on deployed Azure. Do not rebuild.
>   - Runner: `evals/run_cari_eval.py` (not `evals/run_cari_eval.py`)
>   - Dataset: `evals/datasets/cari_arb_baseline_extended.jsonl` (not `service-explorer-golden-dataset.jsonl`)
>   - Endpoint: `/api/arb-eval/review` (not `/api/arb-eval/review`)
> - **ARB Output Framework + Excel export** — COMPLETE (v0.6.0, main).
> - **Networking domain** — COMPLETE (v0.6.0, main).
>
> **Still valid and actionable:** backup/restore workflows (PR 1), Azure budget alerts (Section 22),
> cost guardrails (Section 21), gate structure (Section 5), owner mapping (Section 15).
>
> **Service Explorer V2 (PR 3):** "Service Explorer" is not a live route name. Map any new UI work
> against actual current routes: `/arb`, `/review`, scorecard, and findings pages.

## Purpose

This runbook is the revised execution version of the earlier master guide.

It is designed for Claude Code and developers.

Use it to implement CARI improvements safely without breaking the current working website.

## Scope

Current live website:

```text
https://thankful-pond-04383960f.7.azurestaticapps.net/
```

Codebase:

```text
https://github.com/upendra25312/Cloud-Architecture-Review-Intelligence
```

Current live cloud scope:

```text
Azure
```

Future roadmap only:

```text
AWS
GCP
```

AWS and GCP must not be represented as live capabilities.

---

# 1. Executive Summary

Do not implement the Service Explorer improvements, evaluations, backup, restore, cost guardrails, and deployment changes in one large change.

Use this order:

```text
1. Inspect repo
2. Configure Azure budget alerts
3. Add backup and restore foundation
4. Test restore once
5. Add evaluation dataset and Python runner
6. Run evaluation manually against preview
7. Add evaluation GitHub Action
8. Improve Service Explorer behind feature flag or safe route
9. Deploy only after backup, smoke test, and preview validation
```

Main principle:

```text
Protect the working website first. Improve it second.
```

---

# 2. Global Rules for Every Claude Code Session

Paste these rules into every Claude Code prompt.

```text
Do not run Terraform locally (no terraform apply, plan, destroy, or init against live state).
All infrastructure changes go via GitHub Actions CI/CD or targeted az CLI only.
Terraform IaC already exists under infrastructure/terraform/ — do not duplicate or bypass it.
Use Azure CLI and GitHub Actions for non-infrastructure changes.
Do not directly change production without backup and rollback.
Do not remove or rename existing routes, fields, filters, APIs, or workflows unless backward compatibility is preserved.
Do not run full evaluations against the live production website by default.
Do not allow evaluations to automatically change agent system instructions.
Azure is the current live scope.
AWS and GCP are future planned rubric packs only.
Do not represent AWS or GCP as live capability.
Final architecture approval must remain with human reviewers or ARB.
Preserve current website behavior first, improve second.
Do not refactor unrelated code.
Do not rewrite working components.
Show planned changes before editing.
Show concise diff after editing.
AI agent uses model-router via Azure AI Foundry — never switch to a direct model name or call Azure OpenAI directly.
All Azure service-to-service auth uses Managed Identity — never introduce client secrets or API keys for Azure services.
Durable Functions orchestrate all long-running AI workflows — do not bypass orchestratorAgentReview or orchestratorExtraction.
```

---

# 3. Claude Code Token-Saving Rules

Use these rules to avoid wasting tokens.

```text
Read only files required for the current task.
Do not summarize the whole repo.
Do not paste full file contents unless changed.
Do not inspect large folders unless needed.
Do not generate long strategy explanations during implementation.
Do not make broad refactors.
Do not edit unrelated files.
Prefer small commits.
Ask before changing deployment, routing, authentication, export logic, or app settings.
```

Recommended execution pattern:

```text
Inspect → Plan → Implement one PR → Show diff → Test → Commit
```

Avoid:

```text
Implement everything from this package.
```

---

# 4. Required Branch Strategy

Use small branches.

```bash
main
  └── feat/cari-backup-restore-foundation
  └── feat/cari-evaluation-foundation
  └── feat/service-review-explorer-v2
```

Merge order:

```text
1. Backup and restore foundation
2. Evaluation foundation
3. Service Explorer V2
```

Do not combine these into one pull request.

---

# 5. Mandatory Delivery Gates

## Gate 0: Inspect only

Before any change:

```text
Claude Code must inspect the repo and return an implementation map.
No files modified.
```

## Gate 1: Cost guardrails

Before scheduled evaluations:

```text
Azure budget exists.
Budget alerts exist at 50%, 75%, 90%, and 100%.
Subscription billing currency is confirmed.
Evaluation schedule defaults to preview/staging, not live.
```

## Gate 2: Backup readiness

Before Service Explorer or evaluation changes:

```text
Backup workflow exists.
Release tagging exists.
App settings export approach is documented.
Artifact retention is configured.
Raw secrets are not stored permanently as plain artifacts.
```

## Gate 3: Restore readiness

Before production deployment:

```text
Restore workflow exists.
Restore workflow uses the same build settings as the existing working deployment workflow.
Restore process is tested at least once.
Post-restore smoke test passes.
```

## Gate 4: Evaluation readiness

Before using evaluations as a quality signal:

```text
Evaluation dataset is reviewed.
Evaluation endpoint is confirmed.
Evaluation endpoint is protected if exposed.
Runner does not update agent instructions.
Reports are uploaded as GitHub artifacts.
Full evaluations target preview/staging.
```

## Gate 5: Production rollout

Before merge to production:

```text
Backup workflow completed.
Preview deployment tested.
Evaluation run completed against preview.
Live smoke test completed.
Rollback tag available.
Budget alerts active.
```

---

# 6. Hard Stop Conditions

Stop implementation or rollback immediately if:

```text
Homepage is unavailable.
Service Explorer route fails.
ARB/review route fails.
Upload/review flow fails.
Decision pack export fails.
Authentication breaks.
Production deployment introduces data loss.
Logs show repeated 500 errors.
Evaluation cost spikes.
App settings artifact exposes secrets.
```

---

# 7. Pre-Check Commands

Run these before asking Claude Code to implement.

## Confirm evals folder exists

```bash
test -d ./evals && echo "evals exists" || echo "Missing evals folder"
ls ./evals
```

## Confirm Git status is clean

```bash
git status --short
```

Expected:

```text
No uncommitted changes before starting each PR.
```

## Confirm current branch

```bash
git branch --show-current
```

## Confirm existing workflows

```bash
ls .github/workflows
```

---

# 8. Claude Prompt 1: Repo Inspection Only

Use this first.

```markdown
You are working as one expert team:
- Azure Cloud Architect
- GitHub Actions expert
- Senior Full Stack Developer
- UI/UX Specialist
- Azure AI Architect
- Senior Technical Writer

Goal:
Inspect this repository and understand how the current website is built, deployed, and structured.

Global rules:
- Do not modify any files.
- Do not implement anything yet.
- Do not use Terraform.
- Read only files needed for this task.
- Do not summarize the whole repo.
- Do not paste full files.
- Return a concise implementation map.

Focus files:
- package.json
- existing .github/workflows/*
- src/*
- api/*
- staticwebapp.config.json if present
- any Service Explorer related files
- any export or decision-pack files

Return:
1. Framework and build command
2. Existing deployment workflow
3. app_location, api_location, output_location from working workflow
4. Service Explorer files
5. API routes
6. Export/decision-pack files
7. Risk areas
8. Recommended PR sequence
```

Expected output:

```text
Implementation map only.
No code changes.
```

---

# 9. Claude Prompt 2: Safe Plan Only

Use after repo inspection.

```markdown
Using the repo inspection, create a safe implementation plan for adding the CARI safe evaluation and backup package.

Rules:
- No code changes yet.
- No Terraform.
- Use Azure CLI and GitHub Actions only.
- Do not break existing website features.
- Use small PRs only.

Required PRs:
1. Backup and restore workflows
2. Evaluation dataset and Python runner (ALREADY SHIPPED — skip)
3. UI feature improvement behind safe route or feature flag
4. Cost guardrails documentation

Return:
- exact files to copy
- exact files to modify
- files not to touch
- risks
- test commands
- rollback plan
- merge gates
```

---

# 10. PR 1: Backup and Restore Foundation

## Objective

Create production safety before any functional change.

## Important Warning

Do not create restore workflow with guessed build settings.

The restore workflow must copy these values from the existing working deployment workflow:

```text
app_location
api_location
output_location
build command
node version
environment variables
deployment action settings
```

If these are unknown, stop and ask.

## Claude Prompt for PR 1

```markdown
Implement PR 1 only: backup and restore foundation.

Use these source files:
- .github/workflows/ (copy settings from existing deploy-frontend.yml / deploy-api.yml)
- docs/runbooks/ (reference existing rollback runbooks for pattern)
- Section 22 of this document (Azure cost guardrails setup)

Rules:
- Do not modify application code.
- Do not modify Service Explorer.
- Do not modify evaluation logic.
- Do not run terraform locally or add new Terraform files for this PR.
- Do not guess build settings.
- Copy app_location, api_location, output_location, build command, and deployment settings from the existing working deployment workflow.
- Add artifact retention to backup artifacts.
- Do not upload raw secrets as long-lived artifacts.
- Keep current deployment behavior unchanged.
- Show planned changes before editing.
- Show concise diff after editing.
- Do not touch unrelated files.

Before editing:
1. Identify existing working deployment workflow.
2. Extract deployment settings.
3. Explain changes.
4. Wait for approval.
```

## Manual Commands for PR 1

```bash
git checkout -b feat/cari-backup-restore-foundation
git diff
git add .
git commit -m "Add CARI backup and restore foundation"
```

## PR 1 Acceptance Criteria

```text
Backup workflow exists.
Restore workflow exists.
No app code changed.
No Service Explorer code changed.
No Terraform introduced.
Restore workflow uses actual working deployment settings.
Artifact retention is configured.
Required GitHub secrets are documented.
App settings secret handling is documented.
```

## Recommended PR Title

```text
Add CARI backup and restore foundation
```

---

# 11. PR 2: Evaluation Foundation

> **ALREADY SHIPPED — DO NOT REBUILD.**
>
> The evaluation framework shipped in v0.6.0 (2026-05-17). Score: 27/27 on deployed Azure, CI green.
>
> - Runner: `evals/run_cari_eval.py`
> - Dataset: `evals/datasets/cari_arb_baseline_extended.jsonl` (27 labelled cases)
> - Endpoint: `/api/arb-eval/review`
> - CI: mock mode runs on every push; deployed mode requires `CARI_FUNCTIONS_URL`
> - Calibration rules and keyword notes: `docs/CARI-EVAL-FRAMEWORK.md`
>
> **To add new eval cases:** edit `evals/datasets/cari_arb_baseline_extended.jsonl`
> and follow the calibration rules in `docs/CARI-EVAL-FRAMEWORK.md` before raising a PR.

## Run eval against deployed Azure

```bash
export CARI_FUNCTIONS_URL="https://func-arb-review-api.azurewebsites.net"
export CARI_EVAL_MODE=deployed
python evals/run_cari_eval.py
```

Windows PowerShell:

```powershell
$env:CARI_FUNCTIONS_URL="https://func-arb-review-api.azurewebsites.net"
$env:CARI_EVAL_MODE="deployed"
python evals/run_cari_eval.py
```

---

# 12. PR 3: UI / Feature Improvement

> **"Service Explorer" is not a live route name.**
>
> The current product uses these actual routes: `/arb`, `/review`, scorecard, and findings pages.
> Map any new UI work against these real routes — do not create a phantom `/service-explorer` route.
>
> Also note: the ARB Output Framework (Excel export, cross-exporter parity) shipped in v0.6.0.
> Any export-touching work must account for the existing `ArbReviewOutputPack` normalisation pipeline
> in `api/src/shared/arb-normalize-review.js`. Do not bypass it.

## Goal

Improve an existing UI page or add a new feature safely behind a feature flag or new route.

## Required Product Positioning

Use this current-state framing:

```text
Azure is live now.
AWS and GCP are planned future rubric packs.
```

Do not say or imply:

```text
AWS and GCP are live.
Multi-cloud review is already fully implemented.
```

## Claude Prompt for PR 3

```markdown
Implement PR 3 only: safe UI improvement or new feature page.

Rules:
- Do not remove or rename existing routes unless redirect/backward compatibility is preserved.
- Add improved version behind a new route or feature flag.
- Azure is current live scope.
- AWS and GCP are future roadmap only.
- Do not change export decision-pack logic or bypass arb-normalize-review.js.
- Do not modify deployment workflow.
- Use current design system/components where possible.
- Keep UI clean, professional, and ARB-ready.
- Do not refactor unrelated components.
- Do not rewrite working app structure.
- Show planned changes before editing.
- Show concise diff after editing.

Before editing:
1. Identify the actual current route files in frontend/app/.
2. Identify the specific change being made.
3. Propose safe implementation (new route or feature flag).
4. Explain risk.
5. Wait for approval.
```

## PR 3 Acceptance Criteria

```text
Existing routes and pages still work.
New feature is behind safe route or feature flag.
Existing APIs remain backward-compatible.
Export decision-pack logic and arb-normalize-review.js are untouched.
Azure is shown as current live scope.
AWS/GCP are clearly future roadmap only.
No deployment workflow changes.
npm run build passes before merging.
```

## Recommended PR Title

```text
Add [feature name] behind safe route / feature flag
```

---

# 13. Smoke Test Checklist

Homepage check alone is not enough.

Minimum smoke tests should cover:

```text
Homepage
Service Explorer route
Improved Service Explorer V2 route if added
ARB/review route
Upload/review flow if available
Decision pack export flow if available
API health endpoint if available
```

Recommended endpoints to verify, adjust based on actual repo routes:

```text
/
 /services or existing Service Explorer route
 /service-review-explorer-v2 if added
 /arb or review route
 /api/health if available
```

If no health endpoint exists, add or identify a read-only health endpoint before relying on automated deployment validation.

---

# 14. Merge Gate Checklist

Do not merge if any item fails.

```text
Repo inspection completed.
No Terraform files added.
Backup workflow exists.
Restore workflow exists.
Restore workflow uses actual working deployment settings.
Restore process has been tested once.
Azure budget alerts are configured.
Artifact retention is configured.
No raw secrets are stored in long-lived artifacts.
Evaluation endpoint is confirmed or TODO is documented.
Evaluation endpoint is not public and unauthenticated.
Evaluation runner does not update agent instructions.
Full evaluations target preview/staging.
Live site only uses smoke checks.
Existing Service Explorer still works.
Export decision pack still works.
Preview deployment passes.
Live smoke test passes.
Rollback tag is available.
```

---

# 15. Owner Mapping

Assign owners before execution.

| Workstream | Owner | Responsibility |
|---|---|---|
| Backup and restore | Platform / DevOps owner | Release tags, backup workflow, restore workflow |
| Cost guardrails | Azure owner | Budget, alerts, weekly cost review |
| Evaluation dataset | Azure AI / ARB owner | Golden prompts, expected controls, pass criteria |
| Evaluation runner | Full stack / AI engineer | Python runner, GitHub Action, report artifacts |
| Service Explorer V2 | UI/UX + full stack owner | Safe route, feature flag, UX changes |
| Production approval | ARB/product owner | Final go/no-go decision |

If this is a solo pilot, explicitly mark yourself as temporary owner for each workstream.

---

# 16. Evaluation Mental Model

Use this to explain the evaluation approach.

```text
Service Explorer = syllabus and answer-key source
Foundry Evaluation = exam checker
CARI agent = student being tested
```

Evaluations should prove:

```text
The agent detects missing architecture evidence.
The finding is relevant to the service and scenario.
The agent does not invent unsupported claims.
The recommendation is practical.
The response keeps human decision ownership.
The exported decision pack remains consistent.
```

---

# 17. Evaluation Frequency

| Trigger | What to run | Target |
|---|---:|---|
| Pull request | 5-10 prompt smoke eval | PR preview URL |
| Weekly | 30 prompt full eval | Preview/staging |
| Before demo | 30 prompt full eval | Demo/preview |
| Live daily | 3-5 prompt smoke eval only | Live website |
| Production pilot release | Full eval + human review | Controlled environment |

Rule:

```text
Preview/staging = full evaluations.
Live website = smoke evaluations only.
```

---

# 18. Estimated Monthly Cost

Expected cost if prompts are small and evaluation runs are controlled:

```text
Small controlled pilot: $5-$25/month
Active pilot: $25-$75/month
Heavy testing/demo month: $75-$150/month
```

Recommended personal guardrail:

```text
Target: $20-$40/month
Hard cap mindset: $60/month
```

Rackspace-controlled production pilot planning:

```text
$100-$300/month
```

Only move toward `$300-$400/month` if adding:

```text
multiple environments
stronger monitoring
private networking
larger evaluation runs
richer logs
more AI usage
```

Important:

```text
Validate actual usage weekly in Azure Cost Management.
```

---

# 19. Cost Drivers

| Component | Expected pilot cost | Notes |
|---|---:|---|
| Azure Static Web Apps | $0-$9/month | Depends on tier |
| Model Router for CARI agent | $10-$30/month | Main token cost |
| Embedding model | $1-$5/month | Usually low |
| Evaluation judge model | $5-$20/month | Depends on eval count and judge model |
| GitHub Actions | $0-$5/month | Usually low if controlled |
| Backup and restore workflows | $0-$2/month | Mostly artifacts and CLI operations |
| Log Analytics / monitoring | $0-$10/month | Can grow with verbose logs |
| Evaluation reports | $0-$2/month | Store as GitHub artifacts first |

Likely total for controlled pilot:

```text
$20-$60/month
```

---

# 20. Evaluation Cost Example

```text
PR runs:       5 prompts × 8 PRs   = 40 prompts
Weekly runs:   30 prompts × 4      = 120 prompts
Demo runs:     30 prompts × 2      = 60 prompts
Daily smoke:   3 prompts × 30      = 90 prompts

Total: ~310 eval prompts/month
```

One eval prompt may create 2-5 model calls:

```text
1 call = CARI agent response
1 call = judge/evaluator score
Optional calls = groundedness, relevance, safety, tool-use checks
```

So:

```text
310 eval prompts/month may behave like 620-1,550 model calls/month.
```

---

# 21. Cost Stop Rules

| Threshold | Action |
|---|---|
| 50% | Review usage trend |
| 75% | Reduce evaluation frequency |
| 90% | Disable full scheduled evaluations |
| 100% | Disable scheduled workflows and review cost source |

Avoid:

```text
Daily full evaluations against live production
Large red-team runs every day
Large judge model for every evaluation
Verbose Log Analytics ingestion
Repeated indexing of large files
Long prompts with full document content every time
Multiple evaluator calls per finding without sampling
```

---

# 22. Azure Cost Guardrails Setup

## Billing Currency Warning

Azure budgets use the billing currency of the subscription.

If your subscription is billed in INR, convert the intended USD guardrail into INR before creating the budget.

Example:

```text
Target guardrail: 60 USD
Use equivalent INR amount based on current billing conversion.
```

## Prerequisites

```bash
az login
az account show
az account set --subscription "<SUBSCRIPTION_ID>"
```

Set variables manually:

```bash
export SUBSCRIPTION_ID="<SUBSCRIPTION_ID>"
export BUDGET_NAME="cari-pilot-monthly-budget"
export MONTHLY_BUDGET_AMOUNT="<AMOUNT_IN_SUBSCRIPTION_BILLING_CURRENCY>"
export ALERT_EMAIL="your-email@example.com"
export START_DATE="<FIRST_DAY_OF_CURRENT_MONTH_YYYY-MM-DD>"
export END_DATE="<DATE_12_MONTHS_FROM_START_YYYY-MM-DD>"
```

## Easiest setup: Azure Portal

Use this first if you want the lowest-risk setup.

```text
Azure Portal
→ Cost Management + Billing
→ Select subscription
→ Budgets
→ Create monthly budget
→ Amount: monthly guardrail in billing currency
→ Alerts: 50%, 75%, 90%, 100%
→ Recipient: your email
→ Save
```

## Azure CLI setup

Create `budget.json` with correct dates and billing currency amount:

```json
{
  "category": "Cost",
  "amount": 60,
  "timeGrain": "Monthly",
  "timePeriod": {
    "startDate": "2026-05-01T00:00:00Z",
    "endDate": "2027-05-01T00:00:00Z"
  },
  "notifications": {
    "Actual_GreaterThan_50_Percent": {
      "enabled": true,
      "operator": "GreaterThan",
      "threshold": 50,
      "contactEmails": ["your-email@example.com"]
    },
    "Actual_GreaterThan_75_Percent": {
      "enabled": true,
      "operator": "GreaterThan",
      "threshold": 75,
      "contactEmails": ["your-email@example.com"]
    },
    "Actual_GreaterThan_90_Percent": {
      "enabled": true,
      "operator": "GreaterThan",
      "threshold": 90,
      "contactEmails": ["your-email@example.com"]
    },
    "Actual_GreaterThan_100_Percent": {
      "enabled": true,
      "operator": "GreaterThan",
      "threshold": 100,
      "contactEmails": ["your-email@example.com"]
    }
  }
}
```

Run:

```bash
az rest \
  --method put \
  --url "https://management.azure.com/subscriptions/$SUBSCRIPTION_ID/providers/Microsoft.Consumption/budgets/$BUDGET_NAME?api-version=2023-11-01" \
  --body @budget.json
```

Verify:

```bash
az rest \
  --method get \
  --url "https://management.azure.com/subscriptions/$SUBSCRIPTION_ID/providers/Microsoft.Consumption/budgets/$BUDGET_NAME?api-version=2023-11-01"
```

---

# 23. Cost Tags

Apply these tags to CARI resources:

```text
Project=CARI
Environment=Pilot
Owner=Upendra
CostCenter=PersonalPilot
Workload=ArchitectureReview
```

Example:

```bash
az resource tag \
  --ids "<RESOURCE_ID>" \
  --tags Project=CARI Environment=Pilot Owner=Upendra CostCenter=PersonalPilot Workload=ArchitectureReview
```

---

# 24. Required GitHub Secrets

Add secrets here:

```text
GitHub repo
→ Settings
→ Secrets and variables
→ Actions
→ New repository secret
```

Required:

| Secret | Purpose |
|---|---|
| `AZURE_RESOURCE_GROUP` | Resource group containing CARI Static Web App |
| `SWA_NAME` | Azure Static Web App resource name |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | Deployment token |
| `CARI_FUNCTIONS_URL` | Deployed Azure Functions base URL for eval runner |
| `CARI_LIVE_URL` | Live website URL for smoke check |

Optional:

| Secret | Purpose |
|---|---|
| `CARI_EVAL_API_KEY` | If evaluation endpoint is additionally key-protected |
| `FOUNDRY_PROJECT_ENDPOINT` | Azure AI Foundry project endpoint (already wired via Managed Identity in prod) |

Security rules:

```text
Do not commit secrets into the repo.
Use GitHub OIDC federated credentials for ALL production workflows — no stored service principal credentials.
Do NOT add AZURE_CREDENTIALS (long-lived SP secret) — this project uses OIDC; adding SP credentials is a security regression.
Do NOT add AZURE_OPENAI_API_KEY or call Azure OpenAI directly — all AI calls go via the model-router Foundry agent.
Managed Identity handles all Azure service-to-service auth in production.
```

---

# 25. Artifact Retention and Secret Handling

Backup artifacts must not become a secret leak.

Rules:

```text
Do not upload raw long-lived secrets as plain artifacts.
If app settings contain secrets, use short artifact retention.
Prefer secret stores for sensitive values.
Do not keep app settings artifacts longer than needed.
```

Recommended artifact retention:

```yaml
retention-days: 7
```

Maximum for this pilot:

```text
14 days
```

---

# 26. Disable Scheduled Evaluations Quickly

If budget spikes, disable scheduled evaluations.

Edit:

```text
.github/workflows/evaluate-cari.yml
```

Comment this:

```yaml
schedule:
  - cron: "30 2 * * 1"
```

Or use GitHub UI:

```text
Repo
→ Actions
→ Evaluate CARI Agent
→ Disable workflow
```

---

# 27. Local Test Commands

## Install Python dependencies

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r evaluations/requirements.txt
```

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r evaluations/requirements.txt
```

## Run evaluation locally

```bash
export CARI_FUNCTIONS_URL="https://func-arb-review-api.azurewebsites.net"
export CARI_EVAL_MODE=deployed
python evals/run_cari_eval.py
```

Windows PowerShell:

```powershell
$env:CARI_FUNCTIONS_URL="https://func-arb-review-api.azurewebsites.net"
$env:CARI_EVAL_MODE="deployed"
python evals/run_cari_eval.py
```

Reports are written to:

```text
evals/reports/evaluation-report.json
evals/reports/evaluation-report.md
```

---

# 28. Final Safe Deployment Sequence

## PR 1: Safety foundation

Add:

```text
Backup workflow
Restore workflow
Cost guardrail documentation
GitHub secrets documentation
```

Validation:

```text
Backup workflow runs.
Restore workflow is reviewed.
App settings export works or safe alternative is documented.
Cost budget is configured.
```

## PR 2: Evaluation foundation

Add:

```text
Golden dataset
Python runner
Evaluation workflow
Evaluation documentation
Cost estimate
```

Validation:

```text
Script runs locally.
Script runs against preview URL if endpoint exists.
Reports are uploaded as artifact.
No production write action occurs.
No public unauthenticated evaluation endpoint is added.
```

## PR 3: Service Explorer V2

Add:

```text
Improved UI behind feature flag or safe route
Better service review guidance
Azure-current / AWS-GCP-future positioning
```

Validation:

```text
Existing Service Explorer still works.
New page works in preview.
No existing API contract breaks.
Export pack still works.
```

## PR 4: Controlled rollout

Before merge:

```text
Run backup workflow.
Run full eval against preview.
Run smoke test against live.
Confirm budget alerts exist.
Tag release.
```

After merge:

```text
Run production smoke test.
Monitor logs and cost.
Keep rollback tag ready.
```

---

# 29. Final Claude Code Master Prompt

Use this for each phase.

```markdown
You are working as one expert team:
- Azure Cloud Architect
- GitHub Actions expert
- Senior Full Stack Developer
- UI/UX Specialist
- Azure AI Architect
- Senior Technical Writer

Goal:
Implement the current phase only.

Global rules:
- No Terraform.
- Use Azure CLI and GitHub Actions only.
- Do not break existing working website features.
- Preserve current behavior first.
- Do not run full evaluations against live production by default.
- Do not update agent system instructions from evaluation results.
- Azure is current live scope.
- AWS and GCP are future roadmap only.
- Human reviewers keep final architecture approval.

Token-saving rules:
- Read only files required for this phase.
- Do not summarize the whole repo.
- Do not paste full files unless changed.
- Show concise diff summary.
- Ask before modifying unrelated files.
- Prefer small commits.
- Do not refactor unrelated code.

Task:
[Paste the specific PR task here: PR 1, PR 2, or PR 3]

Before editing:
1. Identify exact files needed.
2. Explain risk.
3. Show planned changes.
4. Wait for approval.
```

---

# 30. Final Recommendation

Proceed in this order:

```text
1. Inspect repo.
2. Configure Azure budget alerts.
3. Add backup and restore workflows.
4. Test restore once.
5. Add evaluation dataset and Python runner.
6. Run evaluation manually against preview.
7. Add GitHub Actions evaluation.
8. Improve Service Explorer behind safe route or feature flag.
9. Run preview validation.
10. Deploy only after backup and smoke test.
```

This is the safest, most token-efficient, and most professional way to implement the changes without damaging the current working CARI website.
