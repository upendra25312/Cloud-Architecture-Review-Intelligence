# Durable Functions Rollback Runbook

This runbook describes the tiered rollback procedure for the Durable Functions migration (`USE_DURABLE_ORCHESTRATION` feature flag).

Every tier is designed to be reversible and fast. Start at Tier 1 and only escalate if the lower tier does not resolve the issue.

---

## Rollback decision triggers

Initiate rollback when any of the following occur:

**Automatic (page on-call via action group):**
- `POST /api/arb/reviews/{reviewId}/run-agent-review` 5xx rate > 2% over 15 minutes
- `GET /api/arb/reviews/{reviewId}/agent-status` P95 latency > 2 seconds for 15 minutes
- Azure Storage transactions > 3× baseline over 1 hour on `starbrevprod01`
- Durable orchestration failure alert fires (`alert-orchestration-failures-*`)
- Monthly budget alert fires at 50% mid-month

**Manual:**
- Any user-reported regression in the ARB flow
- Unexpected cost projection > $10/month incremental
- Support ticket volume increase after flag flip

---

## Tier 1 — Feature flag toggle (target: < 2 minutes)

**Use when:** New durable requests are failing but in-flight orchestrations may still be healthy.

**What it does:** Stops new durable orchestrations. New requests route to the legacy path. In-flight orchestrations continue running to completion.

**Procedure:**

1. Set the feature flag to `DRAIN`:
   ```bash
   az functionapp config appsettings set \
     --resource-group rg-arb-review-prod \
     --name func-arb-review-api \
     --settings USE_DURABLE_ORCHESTRATION=DRAIN
   ```

2. Verify the setting took effect:
   ```bash
   az functionapp config appsettings list \
     --resource-group rg-arb-review-prod \
     --name func-arb-review-api \
     --query "[?name=='USE_DURABLE_ORCHESTRATION']"
   ```

3. Confirm new requests use the legacy path by checking Application Insights:
   ```kusto
   requests
   | where timestamp > ago(10m)
   | where name == "POST /api/arb/reviews/{reviewId}/run-agent-review"
   | extend durable = customDimensions.useDurable
   | summarize count() by tostring(durable)
   ```

4. Monitor for 15 minutes. If the error rate drops, proceed to Tier 2 once in-flight orchestrations drain.

**To revert Tier 1:** Set `USE_DURABLE_ORCHESTRATION=ON`.

---

## Tier 2 — Flag off after drain (target: < 15 minutes)

**Use when:** Tier 1 is not sufficient, or in-flight orchestrations are themselves failing.

**What it does:** All new requests and any future polling go through the legacy path. Durable orchestrations are no longer started. In-flight orchestrations complete naturally or are terminated.

**Procedure:**

1. First, check in-flight orchestration count:
   ```kusto
   // Via Application Insights
   traces
   | where timestamp > ago(15m)
   | where message contains "orchestrator" and customDimensions.runtimeStatus == "Running"
   | summarize count() by tostring(customDimensions.orchestrationInstanceId)
   ```

2. Set the feature flag to `OFF`:
   ```bash
   az functionapp config appsettings set \
     --resource-group rg-arb-review-prod \
     --name func-arb-review-api \
     --settings USE_DURABLE_ORCHESTRATION=OFF
   ```

3. If critical orchestrations are stuck, terminate them via the Durable management API:
   ```bash
   # Get the function app's master key
   MASTER_KEY=$(az functionapp keys list \
     --resource-group rg-arb-review-prod \
     --name func-arb-review-api \
     --query masterKey -o tsv)

   # Terminate a specific instance (replace <instance-id>)
   curl -X POST "https://func-arb-review-api.azurewebsites.net/runtime/webhooks/durabletask/instances/<instance-id>/terminate?code=$MASTER_KEY" \
     -H "Content-Type: application/json" \
     -d '"Manual rollback - Tier 2"'
   ```

4. Affected reviews can be retried through the legacy path (they will use fire-and-forget).

**To revert Tier 2:** Set `USE_DURABLE_ORCHESTRATION=ON`.

---

## Tier 3 — Code rollback (target: < 30 minutes)

**Use when:** The durable code paths themselves are causing issues (e.g., misbehaving registration breaks the Function App even with flag OFF).

**What it does:** Deploys the previous known-good Function App build, removing durable code entirely from the runtime.

**Procedure:**

1. Identify the last known-good deployment in the pipeline (usually the last successful deploy before the migration PR).

2. Re-deploy the previous Function App package:
   ```bash
   # Via GitHub Actions (preferred) — re-run the last successful workflow
   gh workflow run "Deploy API" --ref <previous-good-commit-sha>

   # OR via Azure CLI zip deploy (emergency fallback)
   az functionapp deployment source config-zip \
     --resource-group rg-arb-review-prod \
     --name func-arb-review-api \
     --src <path-to-previous-api.zip>
   ```

3. Verify the Function App is healthy:
   ```bash
   curl https://func-arb-review-api.azurewebsites.net/api/health
   ```

4. Confirm `durable-functions` package is no longer loaded:
   ```kusto
   traces
   | where timestamp > ago(10m)
   | where message contains "orchestration"
   | count
   // Should be 0
   ```

5. Terraform `app_settings` change is protected by `lifecycle { ignore_changes = [app_settings] }` on the function app resource, so no Terraform apply is needed.

**To revert Tier 3:** Re-deploy the migration PR build.

---

## Tier 4 — Full feature revert (target: < 2 hours)

**Use when:** The migration has a fundamental design flaw and needs to come out of the codebase entirely.

**What it does:** Reverts the PR, removes all durable code, re-runs the full test matrix, deploys.

**Procedure:**

1. Revert the PR in GitHub:
   ```bash
   gh pr revert <migration-pr-number> --title "Revert: Durable Functions migration" --body "Rollback per runbook Tier 4. See incident #XXX."
   ```

2. Run the full test suite on the revert PR:
   ```bash
   cd api && npm test
   ```

3. Merge and deploy through the normal pipeline.

4. Document the failure mode in `.kiro/specs/durable-functions-migration/` for post-mortem analysis.

5. Re-enter the PLAN phase of the PDCA cycle with the lessons learned.

---

## Verification after any rollback tier

After completing any tier, verify system health:

1. **API health:**
   ```bash
   curl https://func-arb-review-api.azurewebsites.net/api/health
   ```

2. **End-to-end smoke test:**
   - Log in to https://red-coast-0b2d8700f.7.azurestaticapps.net/
   - Create a small review with 1 sample file
   - Run extraction → verify completes
   - Run agent review → verify completes
   - Check findings page renders

3. **Error rate check (Application Insights):**
   ```kusto
   requests
   | where timestamp > ago(30m)
   | where name startswith "POST /api/arb" or name startswith "GET /api/arb"
   | summarize total = count(), failed = countif(success == false) by bin(timestamp, 5m)
   | extend errorRate = todouble(failed) / total
   ```

4. **Cost check (Cost Management):** Confirm daily spend is trending within the $60/month budget.

---

## Contact

- **Primary on-call:** ARB platform team (action group `ag-arb-review-prod`)
- **Escalation:** Senior Director, Cloud Solutions Architecture

## Related documents

- `.kiro/specs/durable-functions-migration/requirements.md`
- `.kiro/specs/durable-functions-migration/design.md`
- `ARCHITECTURE.md`
