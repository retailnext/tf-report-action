# Fixture: state-operations
# Stage 1: Three independent state-only operations in one plan:
#   - Move:   null_resource.original → null_resource.renamed (moved {} block)
#   - Forget: null_resource.ephemeral removed from state (removed {} block)
#   - Import: random_string.imported brought under management (import {} block)
#   - null_resource.keeper is unchanged (filtered as no-op)

terraform {
  required_providers {
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

# Move: rename original → renamed
resource "null_resource" "renamed" {
  triggers = {
    version = "1"
  }
}

moved {
  from = null_resource.original
  to   = null_resource.renamed
}

# Forget: remove ephemeral from state without destroying
removed {
  from = null_resource.ephemeral

  lifecycle {
    destroy = false
  }
}

# Unchanged
resource "null_resource" "keeper" {
  triggers = {
    version = "1"
  }
}

# Pre-existing managed resource (unchanged)
resource "random_string" "existing" {
  length  = 8
  special = false
}

# Import: bring a new random_string under management
import {
  to = random_string.imported
  id = "fixedval"
}

resource "random_string" "imported" {
  length = 8
}
