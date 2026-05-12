variable "subscription_id" {
  description = "Azure subscription ID"
  type        = string
  sensitive   = true
}

variable "location" {
  description = "Azure region for all resources"
  type        = string
  default     = "eastus2"
}

variable "env" {
  description = "Environment name (prod, staging, dev)"
  type        = string
  default     = "prod"

  validation {
    condition     = contains(["prod", "staging", "dev"], var.env)
    error_message = "env must be one of: prod, staging, dev"
  }
}

variable "prefix" {
  description = "Resource name prefix (used in most resource names)"
  type        = string
  default     = "arb-review"
}

variable "prefix_short" {
  description = "Short prefix for storage account names (max 8 chars, lowercase alphanumeric only)"
  type        = string
  default     = "arbrev"

  validation {
    condition     = can(regex("^[a-z0-9]{1,8}$", var.prefix_short))
    error_message = "prefix_short must be 1-8 lowercase alphanumeric characters"
  }
}

variable "alert_email" {
  description = "Email address for cost alert notifications"
  type        = string
}

variable "model_router_deployment_name" {
  description = "Azure AI model router deployment name used by the ARB review runtime"
  type        = string
  default     = "model-router"
}

variable "model_router_version" {
  description = "model-router model version"
  type        = string
  default     = "2025-11-18"
}

variable "model_router_capacity" {
  description = "Model router GlobalStandard deployment capacity in thousands of TPM"
  type        = number
  default     = 125
}

variable "foundry_project_endpoint" {
  description = "Runtime Foundry project endpoint used by the Function App"
  type        = string
  default     = "https://ai-arb-review-prod.services.ai.azure.com/api/projects/arb-review-proj"
}

variable "embedding_model_version" {
  description = "text-embedding-3-large model version"
  type        = string
  default     = "1"
}

variable "budget_amount" {
  description = "Monthly budget cap in USD"
  type        = number
  default     = 60
}

variable "github_actions_principal_id" {
  description = "Object ID of the GitHub Actions service principal (federated OIDC identity)"
  type        = string
  default     = ""
}

variable "use_durable_orchestration" {
  description = "Feature flag for Durable Functions orchestration routing (ON, OFF, or DRAIN)"
  type        = string
  default     = "OFF"

  validation {
    condition     = contains(["ON", "OFF", "DRAIN"], var.use_durable_orchestration)
    error_message = "use_durable_orchestration must be one of: ON, OFF, DRAIN"
  }
}
