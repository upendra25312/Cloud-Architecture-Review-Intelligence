# ─── FLEX CONSUMPTION PLAN ───────────────────────────────────────────────────
# FC1 replaces Y1 (Consumption). Same pay-per-execution billing model but
# supports up to 60-min function timeouts (vs Y1's 10-min hard cap) and
# faster cold starts. One app per plan is an FC1 constraint.
resource "azurerm_service_plan" "main" {
  name                = "asp-${var.prefix}-${var.env}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  os_type             = "Linux"
  sku_name            = "FC1" # Flex Consumption — replaces Y1

  tags = azurerm_resource_group.main.tags
}

# Dedicated blob container for Flex Consumption deployment storage.
# Flex uses Managed Identity auth instead of a storage access key.
resource "azurerm_storage_container" "func_deployment" {
  name                  = "func-flex-deployment"
  storage_account_id    = azurerm_storage_account.main.id
  container_access_type = "private"
}

resource "azurerm_function_app_flex_consumption" "main" {
  name                = "func-${var.prefix}-api"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  service_plan_id     = azurerm_service_plan.main.id

  # Deployment storage — Managed Identity auth, no access key required
  storage_container_type      = "blobContainer"
  storage_container_endpoint  = "${azurerm_storage_account.main.primary_blob_endpoint}${azurerm_storage_container.func_deployment.name}"
  storage_authentication_type = "SystemAssignedIdentity"

  runtime_name           = "node"
  runtime_version        = "20"
  instance_memory_in_mb  = 2048 # 2048 MB for document-processing workloads
  maximum_instance_count = 100

  identity {
    type = "SystemAssigned"
  }

  site_config {
    cors {
      allowed_origins = [
        "https://${azurerm_static_web_app.main.default_host_name}",
        "http://localhost:3000",
      ]
      support_credentials = false
    }
  }

  app_settings = {
    # Runtime
    "FUNCTIONS_WORKER_RUNTIME"              = "node"
    "WEBSITE_NODE_DEFAULT_VERSION"          = "~20"
    "APPLICATIONINSIGHTS_CONNECTION_STRING" = azurerm_application_insights.main.connection_string

    # AzureWebJobsStorage workaround: Flex + SystemAssignedIdentity requires
    # setting the legacy key to "" and using __accountName for MI-based auth.
    # See: https://github.com/hashicorp/terraform-provider-azurerm/pull/29099
    "AzureWebJobsStorage"              = ""
    "AzureWebJobsStorage__accountName" = azurerm_storage_account.main.name

    # Foundry Agents API — Managed Identity auth
    "FOUNDRY_PROJECT_ENDPOINT" = var.foundry_project_endpoint
    "FOUNDRY_AGENT_NAME"       = "cari-arb-review-agent"
    "FOUNDRY_AGENT_VERSION"    = "7"
    "FOUNDRY_AGENT_MODEL"      = azurerm_cognitive_deployment.model_router.name

    # AI Search — Managed Identity auth
    "AZURE_SEARCH_ENDPOINT"   = "https://${azurerm_search_service.main.name}.search.windows.net"
    "AZURE_SEARCH_INDEX_NAME" = "arb-documents"
    "AZURE_SEARCH_USE_MI"     = "true"

    # Document Intelligence — Managed Identity auth
    "AZURE_DOCINT_ENDPOINT" = azurerm_cognitive_account.doc_intel.endpoint
    "AZURE_DOCINT_USE_MI"   = "true"

    # Storage — Managed Identity for blob/table ops
    "AZURE_STORAGE_ACCOUNT_NAME" = azurerm_storage_account.main.name
    "STORAGE_ACCOUNT_URL"        = azurerm_storage_account.main.primary_blob_endpoint

    # Azure AI Vision
    "AZURE_VISION_ENDPOINT" = azurerm_cognitive_account.vision.endpoint

    # Foundry Agent ID — only secret, stored in Key Vault
    "FOUNDRY_AGENT_ID" = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault.main.vault_uri}secrets/foundry-agent-id/)"

    # Durable Functions feature flag (ON, OFF, DRAIN)
    "USE_DURABLE_ORCHESTRATION" = var.use_durable_orchestration
  }

  tags = azurerm_resource_group.main.tags

  lifecycle {
    ignore_changes = [
      app_settings,
      auth_settings_v2,
    ]
  }

  depends_on = [
    azurerm_cognitive_deployment.model_router,
    azapi_resource.foundry_project,
  ]
}
