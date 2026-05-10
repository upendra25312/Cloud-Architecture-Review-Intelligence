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
    cors_rule {
      allowed_headers = ["*"]
      allowed_methods = ["GET", "HEAD", "PUT", "DELETE", "OPTIONS", "POST", "PATCH"]
      allowed_origins = [
        "https://mlworkspace.azure.ai",
        "https://ml.azure.com",
        "https://*.ml.azure.com",
        "https://ai.azure.com",
        "https://*.ai.azure.com",
      ]
      exposed_headers    = ["*"]
      max_age_in_seconds = 1800
    }

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
  storage_account_id    = azurerm_storage_account.main.id
  container_access_type = "private"
}

# Foundry IQ knowledge files (rubrics, guidance, schema)
resource "azurerm_storage_container" "arb_knowledge" {
  name                  = "arb-agent-knowledge"
  storage_account_id    = azurerm_storage_account.main.id
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

# Project metadata table — partitioned by userId, keyed by ULID projectId (FR-PROJ-001)
resource "azurerm_storage_table" "arb_projects" {
  name                 = "arbprojects"
  storage_account_name = azurerm_storage_account.main.name
}

# ── Output Container (Project Workspace) ──────────────────────────────────────

# Review exports: scorecard JSON, findings JSON, PDF/XLSX reports, project ZIP exports
# All files organized under {projectId}/{reviewId}/ prefix (FR-PROJ-003)
resource "azurerm_storage_container" "arb_outputfiles" {
  name                  = "arb-outputfiles"
  storage_account_id    = azurerm_storage_account.main.id
  container_access_type = "private"
}

# ── Blob Lifecycle — auto-delete input files after 30 days ───────────────────
# FR-PROJ-014 (P1): ZIP project exports are cleaned up via application-level
# logic in arbCleanupExpired.js — blob tag filtering is not available in the
# azurerm_storage_management_policy filters block in this provider version.

resource "azurerm_storage_management_policy" "main" {
  storage_account_id = azurerm_storage_account.main.id

  rule {
    name    = "delete-input-files-after-30-days"
    enabled = true

    filters {
      prefix_match = ["arb-inputfiles/"]
      blob_types   = ["blockBlob"]
    }

    actions {
      base_blob {
        delete_after_days_since_modification_greater_than = 30
      }
    }
  }
}
