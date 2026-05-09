# ============================================================================
# Azure AI Vision (Computer Vision S1) — v1.2 addition (PRD audit C-01)
#
# Provides image analysis for architecture diagram extraction.
# S1 tier: 5,000 transactions/month free — sufficient for expected review load.
# Function App MI receives Cognitive Services User role (see rbac.tf).
# ============================================================================

resource "azurerm_cognitive_account" "vision" {
  name                = "vision-${var.prefix}-${var.env}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  kind                = "ComputerVision"
  sku_name            = "S1"

  identity {
    type = "SystemAssigned"
  }

  tags = azurerm_resource_group.main.tags
}
