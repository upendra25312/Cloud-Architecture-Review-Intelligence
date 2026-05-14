# CARI Production Recovery Tracker

**Incident date:** 2026-05-14  
**Cause:** CAF resource naming Terraform apply (PR #27) triggered destroy+recreate of immutable-name Azure resources (Static Web App, Log Analytics, Cognitive Vision account) without pre-warning on live-URL impact.  
**Recovery owner:** upendra25312@gmail.com  
**Demo deadline:** 2026-05-15 (leadership demo — site must be fully functional)

---

## Live site URL (NEW — use this everywhere)

```
https://thankful-pond-04383960f.7.azurestaticapps.net
```

The old URL `https://red-coast-0b2d8700f.7.azurestaticapps.net` is **permanently deleted** — do not reference it.

---

## Task status

### ✅ DONE — Frontend site restored

| Task | Status | Notes |
|------|--------|-------|
| Deploy frontend to new SWA (`stapp-arb-review-prod`) | ✅ Done | Site live, UI identical to before |
| Update `AZURE_STATIC_WEB_APPS_API_TOKEN` GitHub secret | ✅ Done | Points to `stapp-arb-review-prod` deploy token |
| Update `STAGING_URL` GitHub secret | ✅ Done | Set to `https://thankful-pond-04383960f.7.azurestaticapps.net` |
| Fix `SITE_URL` in `frontend/app/layout.tsx` | ✅ Done | Updated from old URL to new URL |
| Fix hardcoded verify URL in `deploy-frontend.yml` | ✅ Done | Changed line 143 to new hostname |
| CI deploy green end-to-end | ✅ Done | CI run 25874212527 — Build ✓ Deploy ✓ Verify ✓ |

---

### ✅ DONE — Azure AD sign-in restored

| Task | Status | Notes |
|------|--------|-------|
| Add new SWA hostname to AAD app redirect URIs | ✅ Done | Added `https://thankful-pond-04383960f.7.azurestaticapps.net/.auth/login/aad/callback` to app `f9f6dd08-81f4-4a80-a631-6c3de8ae1343` ("ARB Agent") |
| Set `AZURE_CLIENT_ID` on new SWA | ✅ Done | `f9f6dd08-81f4-4a80-a631-6c3de8ae1343` set via `az staticwebapp appsettings set` |
| Create new client secret for new SWA | ✅ Done | Secret name: `stapp-arb-review-prod-auth`, expires 2028-05-14 |
| Set `AZURE_CLIENT_SECRET` on new SWA | ✅ Done | New secret value set via `az staticwebapp appsettings set` |
| Store client secret in Key Vault | ✅ Done | Stored as `stapp-arb-review-prod-client-secret` in `kv-arb-review-prod` |
| Verify sign-in redirect works | ✅ Done | Playwright confirmed redirect to `login.microsoftonline.com` with correct `redirect_uri` |

**Root causes:** (1) New SWA had no `AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET` app settings (not inherited on recreate). (2) AAD app registration only had the old `red-coast` hostname — new `thankful-pond` hostname was never registered.

---

### ⚠️ CRITICAL — Vision Cognitive Account deleted (AI vision features broken)

**Resource:** `vision-arb-review-prod` (eastus2) — **SOFT-DELETED** by failed Terraform apply  
**Impact:** Function App setting `AZURE_VISION_ENDPOINT` points to a deleted account. Any API calls using Azure Computer Vision will fail.  
**Function App setting:** `AZURE_VISION_ENDPOINT = https://vision-arb-review-prod-684f1.cognitiveservices.azure.com/`

#### Recovery steps:

**Option A — Restore soft-deleted account (preferred if within 48h window)**

```bash
# Check if soft-deleted account is recoverable
az cognitiveservices account list-deleted --query "[?name=='vision-arb-review-prod']" -o json

# If found, restore it
az cognitiveservices account recover --name vision-arb-review-prod --resource-group rg-arb-review-prod --location eastus2
```

**Option B — Create new account with CAF name (if restore window expired)**

```bash
# Create new Vision account with CAF-compliant name
az cognitiveservices account create \
  --name cog-vision-arb-review-prod \
  --resource-group rg-arb-review-prod \
  --kind ComputerVision \
  --sku S1 \
  --location eastus2 \
  --yes

# Get the new endpoint
az cognitiveservices account show --name cog-vision-arb-review-prod --resource-group rg-arb-review-prod --query properties.endpoint -o tsv

# Update Function App setting
az functionapp config appsettings set \
  --name func-arb-review-api \
  --resource-group rg-arb-review-prod \
  --settings "AZURE_VISION_ENDPOINT=<new-endpoint-from-above>"

# Update Terraform state to match (run locally)
# cd infrastructure/terraform
# terraform state rm azurerm_cognitive_account.vision  # if it still tracks old name
# Then update ai_vision.tf and re-apply
```

**Status:** ✅ DONE (2026-05-14 ~17:27 UTC) — Option A restore succeeded. `provisioningState: Succeeded`. Endpoint `https://vision-arb-review-prod-684f1.cognitiveservices.azure.com/` matches existing `AZURE_VISION_ENDPOINT` Function App setting — no update needed.

---

### ⚠️ MEDIUM — AI Services account rename incomplete (`ai-arb-review-prod` not renamed to `ais-`)

**Current state:** `ai-arb-review-prod` is ALIVE and working. Terraform state is out of sync — apply will try to delete it again next run.  
**Blocker:** Nested Foundry project (`arb-review-proj`) inside the account blocks deletion.  
**Impact on demo:** None — AI Services is working fine under the old name.

#### Recovery steps (do AFTER demo):

```bash
# Step 1 — Delete the Foundry project first (Azure CLI or Portal)
az resource delete \
  --ids "/subscriptions/87cf2b93-5e52-4533-9e6b-7182cd7dbde6/resourceGroups/rg-arb-review-prod/providers/Microsoft.CognitiveServices/accounts/ai-arb-review-prod/projects/arb-review-proj"

# Step 2 — Then run terraform apply (will rename ai- → ais-)
# NOTE: This will still require Microsoft.Authorization/roleAssignments/write on the SP
# Grant the GitHub Actions SP "User Access Administrator" first (see RBAC section below)
```

**Status:** ⏳ NOT DONE — defer until after demo

---

### ⚠️ MEDIUM — GitHub Actions SP lacks RBAC write permission

**Current state:** GitHub Actions SP has `Contributor` but not `User Access Administrator`.  
**Impact:** Terraform cannot create/delete role assignments. Every `terraform apply` involving new role assignments will fail with 403.

#### Fix:

```bash
# Get the SP object ID
az ad sp show --id app/<AZURE_CLIENT_ID> --query id -o tsv

# Grant User Access Administrator scoped to the resource group
az role assignment create \
  --role "User Access Administrator" \
  --assignee <SP-OBJECT-ID> \
  --scope /subscriptions/87cf2b93-5e52-4533-9e6b-7182cd7dbde6/resourceGroups/rg-arb-review-prod
```

**Status:** ⏳ NOT DONE — required before any future Terraform apply that touches RBAC

---

### ⚠️ MEDIUM — Terraform state partially out of sync

**Current state:** Several resources were renamed in Azure but Terraform state may not fully reflect the new names for Vision and AI Services accounts.

#### Steps to re-sync state after fixing Vision and AI Services:

```bash
cd infrastructure/terraform

# 1. Ensure Azure CLI is logged in locally
az login

# 2. Init with remote backend
ARM_USE_AZUREAD=true terraform init -reconfigure

# 3. Run plan to see what's out of sync
ARM_USE_AZUREAD=true terraform plan \
  -var="subscription_id=87cf2b93-5e52-4533-9e6b-7182cd7dbde6" \
  -var="alert_email=upendra25312@gmail.com" \
  -var="github_actions_principal_id=<GH_ACTIONS_PRINCIPAL_ID>"

# 4. Use terraform state rm / terraform import to fix any drift
```

**Status:** ⏳ NOT DONE — do after demo and after Vision + RBAC fixes

---

### ✅ DONE — Log Analytics renamed (no service impact)

`law-arb-review-prod` → `log-arb-review-prod` — Successfully recreated. No user-facing impact.

---

## Full integration validation checklist (for demo prep)

Run these checks before the leadership demo:

### Frontend
- [ ] Open https://thankful-pond-04383960f.7.azurestaticapps.net — site loads with Rackspace branding
- [ ] Sign in with Azure AD — redirects and completes successfully
- [ ] Navigate to `/arb` — ARB workspace loads
- [ ] Navigate to `/services` — Azure Service Explorer loads
- [ ] Navigate to `/demo` — Demo page loads

### API / Azure Functions
```bash
# Function App state
az functionapp show --name func-arb-review-api --resource-group rg-arb-review-prod --query state -o tsv
# Expected: Running

# Application Insights — check for errors in last 30 min
az monitor app-insights query \
  --app appi-arb-review-prod \
  --resource-group rg-arb-review-prod \
  --analytics-query "exceptions | where timestamp > ago(30m) | summarize count() by type" \
  --offset 30m
```

### Azure AI Services
```bash
# AI Services account alive
az cognitiveservices account show --name ai-arb-review-prod --resource-group rg-arb-review-prod --query properties.provisioningState -o tsv
# Expected: Succeeded

# Vision account — EXPECTED BROKEN until restored
az cognitiveservices account show --name vision-arb-review-prod --resource-group rg-arb-review-prod 2>&1
# Expected: ResourceNotFound (soft-deleted — needs recovery above)
```

### CI/CD
```bash
# Confirm latest frontend deploy is green
gh run list --workflow=deploy-frontend.yml --limit=3
```

---

## GitHub secrets — current values

| Secret | Current value |
|--------|--------------|
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | Updated to `stapp-arb-review-prod` token ✅ |
| `STAGING_URL` | `https://thankful-pond-04383960f.7.azurestaticapps.net` ✅ |
| `NEXT_PUBLIC_API_URL` | Unchanged — points to Function App ✅ |

---

## Resources that are currently LIVE and HEALTHY

| Resource | Name | Status |
|----------|------|--------|
| Static Web App | `stapp-arb-review-prod` | ✅ Running, site deployed |
| Function App | `func-arb-review-api` | ✅ Running |
| AI Services | `ai-arb-review-prod` | ✅ Running |
| Document Intelligence | `di-arb-review-prod` | ✅ Running |
| Azure Search | `srch-arb-review-prod` | ✅ Running |
| Storage Account | `starbrevprod01` | ✅ Running |
| Key Vault | `kv-arb-review-prod` | ✅ Running |
| Log Analytics | `log-arb-review-prod` | ✅ Running (renamed) |
| App Insights | `appi-arb-review-prod` | ✅ Running |
| Container Registry | `crarbrevrendererprod` | ✅ Running |
| Container App | `ca-cari-office-renderer-prod` | ✅ Running |
| **Vision Account** | `vision-arb-review-prod` | ✅ RESTORED (2026-05-14 17:27 UTC) |

---

## Session resume instructions

When starting a new Claude Code session to continue this recovery:

1. Read this file: `docs/ops/RECOVERY-TRACKER.md`
2. Start with the Vision account restore (Option A — check if 48h window is still open)
3. Then grant the GitHub Actions SP `User Access Administrator`
4. Then re-sync Terraform state
5. Then run `terraform apply` to complete the CAF rename
6. Update this file with completed tasks as you go
