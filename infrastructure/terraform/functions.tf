resource "azurerm_service_plan" "main" {
  name                = "asp-${var.prefix}-${var.env}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  os_type             = "Linux"
  sku_name            = "Y1" # Consumption plan — zero fixed cost

  tags = azurerm_resource_group.main.tags
}

resource "azurerm_linux_function_app" "main" {
  name                = "func-${var.prefix}-api"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  service_plan_id     = azurerm_service_plan.main.id

  # Functions runtime storage — uses access key (required by Azure Functions host)
  storage_account_name       = azurerm_storage_account.main.name
  storage_account_access_key = azurerm_storage_account.main.primary_access_key

  identity {
    type = "SystemAssigned"
  }

  site_config {
    application_stack {
      node_version = "20"
    }

    cors {
      allowed_origins = [
        "https://${azurerm_static_web_app.main.default_host_name}",
        "http://localhost:3000",
      ]
      support_credentials = false
    }

    # Keep warm to reduce cold starts
    application_insights_connection_string = azurerm_application_insights.main.connection_string
  }

  app_settings = {
    # Runtime
    "FUNCTIONS_EXTENSION_VERSION"           = "~4"
    "FUNCTIONS_WORKER_RUNTIME"              = "node"
    "WEBSITE_NODE_DEFAULT_VERSION"          = "~20"
    "APPLICATIONINSIGHTS_CONNECTION_STRING" = azurerm_application_insights.main.connection_string

    # Foundry Agents API — Managed Identity auth (no key needed)
    "FOUNDRY_PROJECT_ENDPOINT" = "https://${azapi_resource.foundry_project.name}.${var.location}.api.azureml.ms"

    # AI Search — Managed Identity auth (Search Index Data Contributor role assigned in rbac.tf)
    "AZURE_SEARCH_ENDPOINT"    = "https://${azurerm_search_service.main.name}.search.windows.net"
    "AZURE_SEARCH_INDEX_NAME"  = "arb-documents"
    "AZURE_SEARCH_USE_MI"      = "true" # Signals code to use DefaultAzureCredential

    # Document Intelligence — Managed Identity auth (Cognitive Services User role in rbac.tf)
    "AZURE_DOCINT_ENDPOINT"    = azurerm_cognitive_account.doc_intel.endpoint
    "AZURE_DOCINT_USE_MI"      = "true" # Signals code to use DefaultAzureCredential

    # Storage — Managed Identity auth for blob/table ops; key used only by Functions host
    "AZURE_STORAGE_ACCOUNT_NAME" = azurerm_storage_account.main.name

    # Storage account URL — for Table Storage SDK with Managed Identity (DefaultAzureCredential)
    "STORAGE_ACCOUNT_URL" = azurerm_storage_account.main.primary_blob_endpoint

    # Azure AI Vision — diagram image analysis (PRD audit C-01, ai_vision.tf)
    "AZURE_VISION_ENDPOINT" = azurerm_cognitive_account.vision.endpoint

    # Foundry Agent ID — only secret; stored in Key Vault
    "FOUNDRY_AGENT_ID" = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault.main.vault_uri}secrets/foundry-agent-id/)"
  }

  tags = azurerm_resource_group.main.tags

  depends_on = [
    azurerm_cognitive_deployment.gpt41mini,
    azapi_resource.foundry_project,
  ]
}
