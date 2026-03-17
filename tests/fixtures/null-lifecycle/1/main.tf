# Fixture: null-lifecycle
# Stage 1: create two null_resource instances with triggers
#          and a terraform_data resource (for in-place update in stage 2)

terraform {
  required_providers {
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}

resource "null_resource" "alpha" {
  triggers = {
    version = "1"
    label   = "alpha"
  }
}

resource "null_resource" "beta" {
  triggers = {
    version = "1"
    label   = "beta"
  }
}

# terraform_data is a built-in resource (no provider needed).
# Changing `input` produces an in-place ["update"] action.
resource "terraform_data" "meta" {
  input = "v1"
}
