# AI Foundry Hub — governance layer (owns Key Vault, Storage, App Insights references)
resource "azapi_resource" "foundry_hub" {
  type      = "Microsoft.MachineLearningServices/workspaces@2024-07-01-preview"
  name      = "hub-${var.prefix}-${var.env}"
  parent_id = azurerm_resource_group.main.id
  location  = var.location

  identity {
    type = "SystemAssigned"
  }

  body = {
    kind = "Hub"
    properties = {
      storageAccount      = azurerm_storage_account.main.id
      keyVault            = azurerm_key_vault.main.id
      applicationInsights = azurerm_application_insights.main.id
    }
  }

  tags = azurerm_resource_group.main.tags

  depends_on = [
    azurerm_storage_account.main,
    azurerm_key_vault.main,
    azurerm_application_insights.main,
  ]
}

# AI Foundry Project — hosts the ARB Review Agent and vector stores
resource "azapi_resource" "foundry_project" {
  type      = "Microsoft.MachineLearningServices/workspaces@2024-07-01-preview"
  name      = "proj-${var.prefix}-${var.env}"
  parent_id = azurerm_resource_group.main.id
  location  = var.location

  identity {
    type = "SystemAssigned"
  }

  body = {
    kind = "Project"
    properties = {
      hubResourceId = azapi_resource.foundry_hub.id
    }
  }

  tags = azurerm_resource_group.main.tags

  depends_on = [azapi_resource.foundry_hub]
}

# AI Services connection — links the Foundry Hub to the AI Services account
# so the agent can use gpt-4.1-mini and text-embedding-3-large deployments
resource "azapi_resource" "ai_services_connection" {
  type      = "Microsoft.MachineLearningServices/workspaces/connections@2024-07-01-preview"
  name      = "ai-services-connection"
  parent_id = azapi_resource.foundry_hub.id

  body = {
    properties = {
      category      = "AIServices"
      target        = azurerm_cognitive_account.ai_services.endpoint
      authType      = "AAD" # Managed Identity — no API key
      isSharedToAll = true
      metadata = {
        ApiVersion      = "2024-05-01-preview"
        ApiType         = "azure"
        ResourceId      = azurerm_cognitive_account.ai_services.id
      }
    }
  }

  depends_on = [
    azapi_resource.foundry_hub,
    azurerm_cognitive_account.ai_services,
    azurerm_role_assignment.hub_ai_user,
  ]
}
