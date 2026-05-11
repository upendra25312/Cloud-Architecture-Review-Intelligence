resource "azurerm_container_registry" "cari_office_renderer" {
  name                = "acrcariofficerender${var.env}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Basic"
  admin_enabled       = true

  tags = merge(azurerm_resource_group.main.tags, {
    workload = "cari-office-renderer"
  })
}

resource "azurerm_container_app_environment" "cari_office_renderer" {
  name                       = "cae-cari-arb-review-${var.env}"
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id

  tags = azurerm_resource_group.main.tags
}

resource "random_password" "office_renderer_shared_secret" {
  length  = 40
  special = false
}

resource "azurerm_container_app" "cari_office_renderer" {
  name                         = "ca-cari-office-renderer-${var.env}"
  container_app_environment_id = azurerm_container_app_environment.cari_office_renderer.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"

  secret {
    name  = "renderer-shared-secret"
    value = random_password.office_renderer_shared_secret.result
  }

  ingress {
    external_enabled = true
    target_port      = 8080

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 0
    max_replicas = 1

    container {
      name   = "cari-office-renderer"
      image  = "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest"
      cpu    = 0.5
      memory = "1Gi"

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "PORT"
        value = "8080"
      }

      env {
        name  = "RENDERER_MAX_FILE_BYTES"
        value = "52428800"
      }

      env {
        name  = "RENDERER_MAX_PAGES"
        value = "20"
      }

      env {
        name  = "RENDERER_COMMAND_TIMEOUT_MS"
        value = "120000"
      }

      env {
        name        = "RENDERER_SHARED_SECRET"
        secret_name = "renderer-shared-secret"
      }
    }
  }

  tags = merge(azurerm_resource_group.main.tags, {
    workload       = "cari-office-renderer"
    cost-control   = "scale-to-zero"
    max-replicas   = "1"
    monthly-budget = "${var.budget_amount}USD"
  })

  lifecycle {
    ignore_changes = [
      template[0].container[0].image,
      secret,
    ]
  }
}
