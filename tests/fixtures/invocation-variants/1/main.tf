# Fixture: invocation-variants
# Stage 1: Same configuration as stage 0 — re-plan produces no changes.
# (Both stages use the same main.tf, carried forward from stage 0)

terraform {
  required_providers {
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}

resource "null_resource" "example" {
  triggers = {
    value = "hello"
  }
}
