output "resource_group_name" {
  description = "Name of the provisioned resource group"
  value       = azurerm_resource_group.main.name
}

output "function_app_name" {
  description = "Azure Function App name (used in GitHub Actions deploy)"
  value       = azurerm_linux_function_app.main.name
}

output "function_app_url" {
  description = "Base URL for the API"
  value       = "https://${azurerm_linux_function_app.main.default_hostname}"
}

output "storage_account_name" {
  description = "Storage account name (set as AZURE_STORAGE_ACCOUNT_NAME env var)"
  value       = azurerm_storage_account.main.name
}

output "ai_services_endpoint" {
  description = "AI Services endpoint (Foundry Agents + OpenAI)"
  value       = azurerm_cognitive_account.ai_services.endpoint
}

output "foundry_agent_model_deployment" {
  description = "Chat model deployment used by the ARB review runtime"
  value       = azurerm_cognitive_deployment.model_router.name
}

output "doc_intel_endpoint" {
  description = "Document Intelligence endpoint (set as AZURE_DOCINT_ENDPOINT)"
  value       = azurerm_cognitive_account.doc_intel.endpoint
}

output "vision_endpoint" {
  description = "Vision endpoint (set as AZURE_VISION_ENDPOINT)"
  value       = azurerm_cognitive_account.vision.endpoint
}

output "search_endpoint" {
  description = "AI Search endpoint (set as AZURE_SEARCH_ENDPOINT)"
  value       = "https://${azurerm_search_service.main.name}.search.windows.net"
}

output "static_web_app_url" {
  description = "Static Web App default hostname"
  value       = "https://${azurerm_static_web_app.main.default_host_name}"
}

output "static_web_app_deploy_token" {
  description = "SWA deployment token (stored in GitHub secret AZURE_STATIC_WEB_APPS_API_TOKEN)"
  value       = azurerm_static_web_app.main.api_key
  sensitive   = true
}

output "foundry_project_endpoint" {
  description = "Foundry project endpoint (set as FOUNDRY_PROJECT_ENDPOINT)"
  value       = var.foundry_project_endpoint
}

output "key_vault_uri" {
  description = "Key Vault URI"
  value       = azurerm_key_vault.main.vault_uri
}

output "app_insights_connection_string" {
  description = "App Insights connection string (set as APPLICATIONINSIGHTS_CONNECTION_STRING)"
  value       = azurerm_application_insights.main.connection_string
  sensitive   = true
}

output "function_app_mi_principal_id" {
  description = "Function App Managed Identity principal ID (for RBAC verification)"
  value       = azurerm_linux_function_app.main.identity[0].principal_id
}

output "office_renderer_container_registry_name" {
  description = "ACR name for the CARI Office Renderer image"
  value       = azurerm_container_registry.cari_office_renderer.name
}

output "office_renderer_container_registry_login_server" {
  description = "ACR login server for the CARI Office Renderer image"
  value       = azurerm_container_registry.cari_office_renderer.login_server
}

output "office_renderer_container_app_name" {
  description = "Azure Container App name for the CARI Office Renderer"
  value       = azurerm_container_app.cari_office_renderer.name
}

output "office_renderer_endpoint" {
  description = "HTTPS endpoint for the CARI Office Renderer"
  value       = "https://${azurerm_container_app.cari_office_renderer.latest_revision_fqdn}"
}
