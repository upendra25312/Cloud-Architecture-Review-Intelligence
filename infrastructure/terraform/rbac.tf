# ─── FUNCTION APP MANAGED IDENTITY → ALL DEPENDENT SERVICES ───────────────────
# All role assignments use the Function App's system-assigned MI.
# Zero API keys or service principal secrets anywhere in the application.

locals {
  func_principal_id = azurerm_linux_function_app.main.identity[0].principal_id
  hub_principal_id  = azapi_resource.foundry_hub.identity[0].principal_id
}

# Storage Blob Data Contributor — upload/read/delete ARB review files and knowledge blobs
resource "azurerm_role_assignment" "func_storage_blob" {
  scope                = azurerm_storage_account.main.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = local.func_principal_id
}

# Storage Table Data Contributor — read/write review state, job tracking, quota tables
resource "azurerm_role_assignment" "func_storage_table" {
  scope                = azurerm_storage_account.main.id
  role_definition_name = "Storage Table Data Contributor"
  principal_id         = local.func_principal_id
}

# Cognitive Services OpenAI User — call Foundry Agents API and embedding model
resource "azurerm_role_assignment" "func_ai_user" {
  scope                = azurerm_cognitive_account.ai_services.id
  role_definition_name = "Cognitive Services OpenAI User"
  principal_id         = local.func_principal_id
}

# Key Vault Secrets User — read foundry-agent-id secret at runtime
resource "azurerm_role_assignment" "func_kv_secrets_user" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = local.func_principal_id
}

# Search Index Data Contributor — create index, index documents, run queries
resource "azurerm_role_assignment" "func_search_contributor" {
  scope                = azurerm_search_service.main.id
  role_definition_name = "Search Index Data Contributor"
  principal_id         = local.func_principal_id
}

# Search Service Contributor — create/manage the index schema itself
resource "azurerm_role_assignment" "func_search_service" {
  scope                = azurerm_search_service.main.id
  role_definition_name = "Search Service Contributor"
  principal_id         = local.func_principal_id
}

# Cognitive Services User — call Document Intelligence REST API (PDF extraction)
resource "azurerm_role_assignment" "func_docint_user" {
  scope                = azurerm_cognitive_account.doc_intel.id
  role_definition_name = "Cognitive Services User"
  principal_id         = local.func_principal_id
}

# ─── FOUNDRY HUB MANAGED IDENTITY ──────────────────────────────────────────────

# Storage Blob Data Contributor — Foundry reads knowledge files from blob container
resource "azurerm_role_assignment" "hub_storage_blob" {
  scope                = azurerm_storage_account.main.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = local.hub_principal_id
}

# Cognitive Services OpenAI User — Foundry Hub calls AI Services for embeddings
resource "azurerm_role_assignment" "hub_ai_user" {
  scope                = azurerm_cognitive_account.ai_services.id
  role_definition_name = "Cognitive Services OpenAI User"
  principal_id         = local.hub_principal_id
}

# Key Vault Secrets User — Foundry Hub reads Key Vault during project operations
resource "azurerm_role_assignment" "hub_kv_user" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = local.hub_principal_id
}

# ─── GITHUB ACTIONS SERVICE PRINCIPAL (set by CI/CD) ───────────────────────────
# The GitHub Actions workflow uses federated identity (OIDC) — no client secret.
# These roles are assigned to the GitHub Actions SP, not a static credential.

data "azurerm_resource_group" "main" {
  name = azurerm_resource_group.main.name

  depends_on = [azurerm_resource_group.main]
}

# Website Contributor — deploy Function App code via GitHub Actions
resource "azurerm_role_assignment" "gh_func_contributor" {
  scope                = azurerm_linux_function_app.main.id
  role_definition_name = "Website Contributor"
  principal_id         = var.github_actions_principal_id
}

# Static Web Apps Contributor — deploy frontend via GitHub Actions
resource "azurerm_role_assignment" "gh_swa_contributor" {
  scope                = azurerm_static_web_app.main.id
  role_definition_name = "Contributor"
  principal_id         = var.github_actions_principal_id
}

# Terraform state storage — GitHub Actions reads/writes Terraform state
resource "azurerm_role_assignment" "gh_tf_state" {
  scope                = "/subscriptions/${var.subscription_id}/resourceGroups/rg-tf-state"
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = var.github_actions_principal_id
}
