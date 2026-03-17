# Fixture: validate-error
# Stage 0: Baseline — valid config, creates a resource.
# Stage 1: Invalid config that passes init but fails validate.

terraform {
  required_providers {
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}

resource "null_resource" "baseline" {
  triggers = {
    value = "v1"
  }
}
