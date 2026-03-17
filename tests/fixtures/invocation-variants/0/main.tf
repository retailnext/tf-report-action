# Fixture: invocation-variants
# Stage 0: Creates a resource without -json or -detailed-exitcode flags.
# Tests Tier 3 (text fallback) rendering and ambiguous exit code 0 handling.
# Stage 1: Same configuration — re-plan produces no changes (also exit 0).

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
