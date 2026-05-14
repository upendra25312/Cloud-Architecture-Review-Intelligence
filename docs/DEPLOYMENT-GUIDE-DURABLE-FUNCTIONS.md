# Durable Functions Migration — Deployment Guide

This guide walks you through deploying the Azure Durable Functions migration for the Cloud Architecture Review Intelligence (CARI) application.

## Prerequisites

Before deploying, ensure you have:
- Azure subscription with appropriate permissions
- GitHub repository access
- Azure CLI installed locally (optional, for manual verification)

## Current Status

✅ **Code Changes**: All implementation complete and committed  
✅ **Pull Request**: Created at https://github.com/upendra25312/Cloud-Architecture-Review-Intelligence/pull/1  
✅ **Tests**: All 46 tests passing  
✅ **Security Scan**: No issues detected  
⚠️ **Terraform Plan**: Requires Azure OIDC configuration fix (see below)

---

## Step 1: Fix Azure OIDC Configuration (Required)

The Terraform workflow failed because the Azure AD federated identity credential needs to be configured for the `staging` environment (used for PRs).

### Option A: Add Staging Federated Credential (Recommended)

1. Go to **Azure Portal** → **Microsoft Entra ID** → **App registrations**
2. Find your GitHub Actions app registration
3. Go to **Certificates & secrets** → **Federated credentials**
4. Click **Add credential** and configure:
   - **Federated credential scenario**: GitHub Actions deploying Azure resources
   - **Organization**: `upendra25312`
   - **Repository**: `Cloud-Architecture-Review-Intelligence`
   - **Entity type**: `Environment`
   - **Environment name**: `staging`
   - **Name**: `github-actions-staging`
5. Click **Add**

### Option B: Skip Terraform on PRs

Alternatively, you can merge the PR directly since the API tests pass. The Terraform changes will be applied on merge to main.

---

## Step 2: Merge the Pull Request

Once the checks pass (or you've verified the code manually):

1. Go to https://github.com/upendra25312/Cloud-Architecture-Review-Intelligence/pull/1
2. Review the changes
3. Click **Merge pull request**
4. Choose **Squash and merge** for a clean commit history

### What Happens on Merge

The GitHub Actions workflows will automatically:

1. **Deploy API** (`deploy-api.yml`):
   - Install production dependencies
   - Deploy to Azure Functions (`func-arb-review-api`)
   - Run smoke test on `/api/health`
   - Verify all functions are registered

2. **Apply Terraform** (`terraform.yml`):
   - Apply infrastructure changes
   - Add `USE_DURABLE_ORCHESTRATION` app setting (default: `OFF`)
   - Create monitoring alerts

---

## Step 3: Verify Deployment

After the workflows complete:

### Check Function App

```bash
# List all registered functions (should be 44+)
az functionapp function list \
  --name func-arb-review-api \
  --resource-group rg-arb-review-prod \
  --query "[].name" -o table

# Check app settings
az functionapp config appsettings list \
  --name func-arb-review-api \
  --resource-group rg-arb-review-prod \
  --query "[?name=='USE_DURABLE_ORCHESTRATION']" -o table
```

### Check Health Endpoint

```bash
curl -s https://func-arb-review-api.azurewebsites.net/api/health
```

---

## Step 4: Enable Durable Functions (Gradual Rollout)

The feature flag is deployed as `OFF` by default. Follow this rollout plan:

### Phase 1: Staging/Dev Environment

```bash
# Enable in staging first
az functionapp config appsettings set \
  --name func-arb-review-api-staging \
  --resource-group rg-arb-review-staging \
  --settings USE_DURABLE_ORCHESTRATION=ON
```

Test thoroughly:
- Run agent reviews
- Run document extractions
- Check Application Insights for orchestration logs

### Phase 2: Production Canary (10% traffic)

If you have traffic splitting configured:

```bash
# Enable for canary slot
az functionapp config appsettings set \
  --name func-arb-review-api \
  --resource-group rg-arb-review-prod \
  --slot canary \
  --settings USE_DURABLE_ORCHESTRATION=ON
```

### Phase 3: Production Full Rollout

After 24-48 hours of successful canary:

```bash
# Enable in production
az functionapp config appsettings set \
  --name func-arb-review-api \
  --resource-group rg-arb-review-prod \
  --settings USE_DURABLE_ORCHESTRATION=ON
```

---

## Step 5: Monitor

### Application Insights Queries

**Orchestration Duration**:
```kusto
customMetrics
| where name == "orchestrationDuration"
| extend orchestrationType = tostring(customDimensions.orchestrationType)
| extend status = tostring(customDimensions.status)
| summarize avg(value), percentile(value, 95), count() by orchestrationType, status, bin(timestamp, 1h)
| order by timestamp desc
```

**Orchestration Failures**:
```kusto
traces
| where message contains "completionStatus"
| extend parsed = parse_json(message)
| where parsed.completionStatus in ("error", "timeout")
| project timestamp, parsed.traceId, parsed.completionStatus, parsed.orchestrationDuration
| order by timestamp desc
```

**Storage Transactions**:
```kusto
AzureMetrics
| where ResourceProvider == "MICROSOFT.STORAGE"
| where MetricName == "Transactions"
| summarize sum(Total) by bin(TimeGenerated, 15m)
| order by TimeGenerated desc
```

### Alerts

The deployment includes these alerts:
- **Storage Transaction Alert**: Fires when transactions exceed 2× baseline (~100k/15min)
- **Orchestration Failure Alert**: Fires when failure rate exceeds threshold

---

## Step 6: Rollback (If Needed)

If issues arise, follow the tiered rollback procedure:

### Tier 1: DRAIN Mode (Graceful)

```bash
az functionapp config appsettings set \
  --name func-arb-review-api \
  --resource-group rg-arb-review-prod \
  --settings USE_DURABLE_ORCHESTRATION=DRAIN
```

- New requests use legacy path
- In-flight orchestrations complete naturally
- Wait 30-60 minutes for drain

### Tier 2: OFF Mode (Immediate)

```bash
az functionapp config appsettings set \
  --name func-arb-review-api \
  --resource-group rg-arb-review-prod \
  --settings USE_DURABLE_ORCHESTRATION=OFF
```

- All requests use legacy path immediately
- In-flight orchestrations may be orphaned (will timeout after 30 min)

### Tier 3: Code Rollback

```bash
# Revert to previous deployment
az functionapp deployment source config-zip \
  --name func-arb-review-api \
  --resource-group rg-arb-review-prod \
  --src <previous-deployment-zip>
```

See `docs/durable-functions-rollback-runbook.md` for detailed procedures.

---

## Troubleshooting

### Orchestration Not Starting

1. Check feature flag is `ON`:
   ```bash
   az functionapp config appsettings list \
     --name func-arb-review-api \
     --resource-group rg-arb-review-prod \
     --query "[?name=='USE_DURABLE_ORCHESTRATION'].value" -o tsv
   ```

2. Check function registration:
   ```bash
   az functionapp function list \
     --name func-arb-review-api \
     --resource-group rg-arb-review-prod \
     --query "[?contains(name, 'orchestrator')]" -o table
   ```

### Orchestration Stuck

1. Check orchestration status in Durable Functions storage
2. Look for timeout errors in Application Insights
3. Check activity function logs

### High Storage Costs

1. Check storage transaction alert
2. Review `maxConcurrentActivityFunctions` in host.json (should be 3)
3. Consider reducing orchestration frequency

---

## Cost Monitoring

Expected incremental cost: **$1-$5/month** on Consumption plan

Monitor via:
- Azure Cost Management → Filter by resource group
- Budget alert at 50% ($30 of $60/month)
- Storage transaction alert at 2× baseline

---

## Support

- **Architecture**: See `ARCHITECTURE.md` → Durable Functions section
- **Rollback**: See `docs/durable-functions-rollback-runbook.md`
- **Requirements**: See `.kiro/specs/durable-functions-migration/requirements.md`
- **Design**: See `.kiro/specs/durable-functions-migration/design.md`
