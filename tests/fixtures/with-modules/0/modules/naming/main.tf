# Child module: naming
# Creates a random_string and exposes it as a named output

terraform {
  required_providers {
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

variable "prefix" {
  type        = string
  description = "Name prefix"
}

resource "random_string" "suffix" {
  length  = 8
  special = false
  upper   = false
  keepers = {
    prefix = var.prefix
  }
}

output "name" {
  value = "${var.prefix}-${random_string.suffix.result}"
}
