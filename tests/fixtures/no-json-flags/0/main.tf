# Fixture: no-json-flags
# Stage 0: simple workspace run without -json flag
# Tests Tier 3 (text fallback) rendering

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
