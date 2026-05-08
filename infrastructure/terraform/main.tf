terraform {
  required_version = ">= 1.7"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    azapi = {
      source  = "azure/azapi"
      version = "~> 2.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Remote state in Azure Blob Storage — bootstrap this container manually once
  # before running terraform init with this backend block enabled.
  backend "azurerm" {
    resource_group_name  = "rg-tf-state"
    storage_account_name = "starbrevtfstate"
    container_name       = "tfstate"
    key                  = "arb-review-prod.terraform.tfstate"
    use_azuread_auth     = true # Managed Identity / Azure AD auth — no storage key
  }
}

provider "azurerm" {
  subscription_id = var.subscription_id

  features {
    key_vault {
      purge_soft_delete_on_destroy    = true
      recover_soft_deleted_key_vaults = true
    }
    resource_group {
      prevent_deletion_if_contains_resources = false
    }
    cognitive_account {
      purge_soft_delete_on_destroy = true
    }
  }
}

provider "azapi" {
  subscription_id = var.subscription_id
}

# Current caller identity — used for Key Vault Secrets Officer assignment
data "azurerm_client_config" "current" {}

resource "azurerm_resource_group" "main" {
  name     = "rg-${var.prefix}-${var.env}"
  location = var.location

  tags = {
    project      = "arb-review"
    environment  = var.env
    budget-limit = "60USD"
    managed-by   = "terraform"
    auth-model   = "managed-identity"
  }
}
