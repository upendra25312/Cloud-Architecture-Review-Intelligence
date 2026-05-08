# Key Vault — stores only FOUNDRY_AGENT_ID (all other auth is Managed Identity)
resource "azurerm_key_vault" "main" {
  name                       = "kv-${var.prefix}-${var.env}"
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  enable_rbac_authorization  = true   # RBAC mode — no legacy access policies
  purge_protection_enabled   = false  # Allow hard-delete in non-prod
  soft_delete_retention_days = 7

  tags = azurerm_resource_group.main.tags
}

# Deployer gets Secrets Officer so Terraform can write secrets during provisioning
resource "azurerm_role_assignment" "deployer_kv_secrets_officer" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = data.azurerm_client_config.current.object_id
}

# Foundry Agent ID — written here as a placeholder; real value set in Phase 2
# after the agent is created via CLI. lifecycle.ignore_changes prevents
# Terraform from overwriting it on subsequent applies.
resource "azurerm_key_vault_secret" "foundry_agent_id" {
  name         = "foundry-agent-id"
  value        = "placeholder-update-after-agent-creation"
  key_vault_id = azurerm_key_vault.main.id

  lifecycle {
    ignore_changes = [value] # Phase 2 CLI command sets the real value
  }

  depends_on = [azurerm_role_assignment.deployer_kv_secrets_officer]
}
