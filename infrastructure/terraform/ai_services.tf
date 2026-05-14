# AI Services account — hosts OpenAI model deployments and Foundry Agents API endpoint
resource "azurerm_cognitive_account" "ai_services" {
  name                       = "ais-${var.prefix}-${var.env}"
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  kind                       = "AIServices"
  sku_name                   = "S0"
  custom_subdomain_name      = "ais-${var.prefix}-${var.env}"
  project_management_enabled = true

  identity {
    type = "SystemAssigned"
  }

  # Disable local (key-based) auth — all callers must use Managed Identity
  local_auth_enabled = false

  tags = azurerm_resource_group.main.tags
}

moved {
  from = azurerm_cognitive_deployment.gpt41mini
  to   = azurerm_cognitive_deployment.model_router
}

# model-router — routes each ARB review prompt to the best eligible chat model
resource "azurerm_cognitive_deployment" "model_router" {
  name                 = var.model_router_deployment_name
  cognitive_account_id = azurerm_cognitive_account.ai_services.id

  model {
    format  = "OpenAI"
    name    = "model-router"
    version = var.model_router_version
  }

  sku {
    name     = "GlobalStandard"
    capacity = var.model_router_capacity
  }
}

# text-embedding-3-large — used by Foundry vector store for knowledge file embeddings
resource "azurerm_cognitive_deployment" "embedding" {
  name                 = "arb-embedding"
  cognitive_account_id = azurerm_cognitive_account.ai_services.id

  model {
    format  = "OpenAI"
    name    = "text-embedding-3-large"
    version = var.embedding_model_version
  }

  sku {
    name     = "GlobalStandard"
    capacity = 120 # 120K TPM
  }

  # Deploy sequentially to avoid capacity conflicts
  depends_on = [azurerm_cognitive_deployment.model_router]
}

# Azure Document Intelligence — PDF/DOCX extraction (Free: 500 pages/month)
resource "azurerm_cognitive_account" "doc_intel" {
  name                = "di-${var.prefix}-${var.env}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  kind                = "FormRecognizer"
  sku_name            = "F0" # Free tier: 500 pages/month. Change to S0 if exceeded.

  identity {
    type = "SystemAssigned"
  }

  # Managed Identity only — no local key auth
  local_auth_enabled = false

  tags = azurerm_resource_group.main.tags
}
