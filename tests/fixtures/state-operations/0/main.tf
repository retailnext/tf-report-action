# Fixture: state-operations
# Stage 0: Baseline — create all resources that will be moved, removed, or
#   serve as the basis for an import in stage 1.
#   - null_resource.original: will be moved → renamed in stage 1
#   - null_resource.ephemeral: will be removed (forgotten) in stage 1
#   - null_resource.keeper: stays unchanged across both stages
#   - random_string.existing: already managed; proves import is additive

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

resource "null_resource" "original" {
  triggers = {
    version = "1"
  }
}

resource "null_resource" "ephemeral" {
  triggers = {
    version = "1"
  }
}

resource "null_resource" "keeper" {
  triggers = {
    version = "1"
  }
}

resource "random_string" "existing" {
  length  = 8
  special = false
}
