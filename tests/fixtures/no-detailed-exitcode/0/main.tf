# Fixture: no-detailed-exitcode
# Stage 0: creates resources (has changes, exits 0 without -detailed-exitcode)
# Stage 1: no-op re-plan (no changes, also exits 0)
# Tests the ambiguous exit code 0 path

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
