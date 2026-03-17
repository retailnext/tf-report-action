# Fixture: import-resource
# Stage 0: create a random_string that will be imported in stage 1
# Stage 1: add a second random_string via an import block with a hardcoded ID,
#           demonstrating an import-only (no-op) plan entry

terraform {
  required_providers {
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

resource "random_string" "existing" {
  length  = 8
  special = false
}
