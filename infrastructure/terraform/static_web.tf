# Static Web App — hosts the Next.js 16 frontend
# East US 2 is a supported SWA region, same as all other resources
resource "azurerm_static_web_app" "main" {
  name                = "stapp-${var.prefix}-${var.env}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku_tier            = "Standard"
  sku_size            = "Standard"

  tags = azurerm_resource_group.main.tags

  lifecycle {
    ignore_changes = [
      app_settings,
      repository_branch,
      repository_url,
    ]
  }
}

# Links the Function App as the API backend for the SWA.
# Without this, /api/* requests from the browser return 404.
# The SWA proxies /api/* to the Function App and injects x-ms-client-principal auth headers.
resource "azurerm_static_web_app_function_app_registration" "api" {
  static_web_app_id = azurerm_static_web_app.main.id
  function_app_id   = azurerm_function_app_flex_consumption.main.id
}
