resource "azurerm_storage_account" "main" {
  name                            = "st${var.prefix_short}${var.env}01"
  resource_group_name             = azurerm_resource_group.main.name
  location                        = azurerm_resource_group.main.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false
  shared_access_key_enabled       = true # Required for Functions runtime + Table Storage SDK

  identity {
    type = "SystemAssigned"
  }

  blob_properties {
    delete_retention_policy {
      days = 7
    }
    container_delete_retention_policy {
      days = 7
    }
  }

  tags = azurerm_resource_group.main.tags
}

# ARB uploaded review documents
resource "azurerm_storage_container" "arb_inputfiles" {
  name                  = "arb-inputfiles"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}

# Foundry IQ knowledge files (rubrics, guidance, schema)
resource "azurerm_storage_container" "arb_knowledge" {
  name                  = "arb-agent-knowledge"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}

# Table Storage for review state, findings, scorecards
resource "azurerm_storage_table" "arb_review" {
  name                 = "arbreviews"
  storage_account_name = azurerm_storage_account.main.name
}

# Table Storage for agent job tracking (multi-instance safe)
resource "azurerm_storage_table" "arb_jobs" {
  name                 = "arbjobs"
  storage_account_name = azurerm_storage_account.main.name
}

# Table Storage for extraction quota tracking
resource "azurerm_storage_table" "arb_quota" {
  name                 = "arbquota"
  storage_account_name = azurerm_storage_account.main.name
}
