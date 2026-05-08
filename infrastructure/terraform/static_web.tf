# Static Web App — hosts the Next.js 16 frontend
# East US 2 is a supported SWA region, same as all other resources
resource "azurerm_static_web_app" "main" {
  name                = "swa-${var.prefix}-${var.env}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku_tier            = "Free"
  sku_size            = "Free"

  tags = azurerm_resource_group.main.tags
}
