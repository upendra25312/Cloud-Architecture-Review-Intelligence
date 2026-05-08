# Azure AI Search — full-text search index for uploaded ARB document chunks
# Free tier: 50MB storage, 3 indexes. Code falls back to simple search if
# semantic ranking is unavailable (arb-search.js line 182).
resource "azurerm_search_service" "main" {
  name                = "srch-${var.prefix}-${var.env}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "free"
  replica_count       = 1
  partition_count     = 1

  # Allow both AAD and API key — Free tier requires this.
  # Code uses Managed Identity (Bearer token); key kept for emergency CLI access only.
  authentication_failure_mode = "http403"

  identity {
    type = "SystemAssigned"
  }

  tags = azurerm_resource_group.main.tags
}
