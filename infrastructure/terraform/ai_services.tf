# AI Services account — hosts OpenAI model deployments and Foundry Agents API endpoint
resource "azurerm_cognitive_account" "ai_services" {
  name                  = "ai-${var.prefix}-${var.env}"
  location              = azurerm_resource_group.main.location
  resource_group_name   = azurerm_resource_group.main.name
  kind                  = "AIServices"
  sku_name              = "S0"
  custom_subdomain_name = "ai-${var.prefix}-${var.env}"

  identity {
    type = "SystemAssigned"
  }

  # Disable local (key-based) auth — all callers must use Managed Identity
  local_auth_enabled = false

  tags = azurerm_resource_group.main.tags
}

# gpt-4.1-mini — primary reasoning model for ARB agent reviews
resource "azurerm_cognitive_deployment" "gpt41mini" {
  name                 = "arb-gpt41mini"
  cognitive_account_id = azurerm_cognitive_account.ai_services.id

  model {
    format  = "OpenAI"
    name    = "gpt-4.1-mini"
    version = var.gpt_model_version
  }

  sku {
    name     = "GlobalStandard"
    capacity = 100 # 100K TPM
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
  depends_on = [azurerm_cognitive_deployment.gpt41mini]
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
