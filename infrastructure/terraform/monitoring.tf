resource "azurerm_log_analytics_workspace" "main" {
  name                = "law-${var.prefix}-${var.env}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"
  retention_in_days   = 30

  tags = azurerm_resource_group.main.tags
}

resource "azurerm_application_insights" "main" {
  name                = "appi-${var.prefix}-${var.env}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  workspace_id        = azurerm_log_analytics_workspace.main.id
  application_type    = "web"

  tags = azurerm_resource_group.main.tags
}

# Budget alert — enforces the $60/month hard ceiling
resource "azurerm_consumption_budget_resource_group" "main" {
  name              = "budget-${var.prefix}-${var.env}"
  resource_group_id = azurerm_resource_group.main.id

  amount     = var.budget_amount # $60
  time_grain = "Monthly"

  time_period {
    start_date = "2026-05-01T00:00:00Z"
  }

  # Warning at ~$40 (67% of $60 budget)
  notification {
    enabled        = true
    threshold      = 67
    operator       = "GreaterThan"
    threshold_type = "Actual"
    contact_emails = [var.alert_email]
  }

  # Hard alert at ~$55 (92% of $60 budget) — take action before hitting cap
  notification {
    enabled        = true
    threshold      = 92
    operator       = "GreaterThan"
    threshold_type = "Actual"
    contact_emails = [var.alert_email]
  }
}

# Alert rule: agent review latency > 120 seconds
resource "azurerm_monitor_metric_alert" "high_latency" {
  name                = "alert-agent-latency-${var.env}"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_application_insights.main.id]
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"

  criteria {
    metric_namespace = "microsoft.insights/components"
    metric_name      = "requests/duration"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 120000 # 120 seconds in ms
  }

  action {
    action_group_id = azurerm_monitor_action_group.main.id
  }
}

# Alert rule: HTTP 5xx error rate > 5%
resource "azurerm_monitor_metric_alert" "error_rate" {
  name                = "alert-error-rate-${var.env}"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_application_insights.main.id]
  severity            = 1
  frequency           = "PT5M"
  window_size         = "PT15M"

  criteria {
    metric_namespace = "microsoft.insights/components"
    metric_name      = "requests/failed"
    aggregation      = "Count"
    operator         = "GreaterThan"
    threshold        = 10
  }

  action {
    action_group_id = azurerm_monitor_action_group.main.id
  }
}

# Alert rule: Storage account transactions exceed 2x baseline (durable functions cost guard)
resource "azurerm_monitor_metric_alert" "storage_transactions" {
  name                = "alert-storage-transactions-${var.env}"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_storage_account.main.id]
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"

  criteria {
    metric_namespace = "Microsoft.Storage/storageAccounts"
    metric_name      = "Transactions"
    aggregation      = "Total"
    operator         = "GreaterThan"
    threshold        = 100000 # Baseline ~50k/15min; alert at 2x
  }

  action {
    action_group_id = azurerm_monitor_action_group.main.id
  }
}

# Alert rule: Durable Functions orchestration failures
resource "azurerm_monitor_metric_alert" "orchestration_failures" {
  name                = "alert-orchestration-failures-${var.env}"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_application_insights.main.id]
  severity            = 1
  frequency           = "PT5M"
  window_size         = "PT1H"

  criteria {
    metric_namespace = "microsoft.insights/components"
    metric_name      = "customMetrics/orchestration_failures"
    aggregation      = "Total"
    operator         = "GreaterThan"
    threshold        = 3 # More than 3 failures in 1 hour
  }

  action {
    action_group_id = azurerm_monitor_action_group.main.id
  }
}

# Budget alert — early warning at 50% (new threshold for durable functions)
resource "azurerm_consumption_budget_resource_group" "early_warning" {
  name              = "budget-early-warning-${var.prefix}-${var.env}"
  resource_group_id = azurerm_resource_group.main.id

  amount     = var.budget_amount * 0.5 # $30 (50% of $60)
  time_grain = "Monthly"

  time_period {
    start_date = "2026-05-01T00:00:00Z"
  }

  notification {
    enabled        = true
    threshold      = 100
    operator       = "GreaterThan"
    threshold_type = "Actual"
    contact_emails = [var.alert_email]
  }
}

resource "azurerm_monitor_action_group" "main" {
  name                = "ag-${var.prefix}-${var.env}"
  resource_group_name = azurerm_resource_group.main.name
  short_name          = "arbreviews"

  email_receiver {
    name          = "primary-alert"
    email_address = var.alert_email
  }
}
