# Fixture: removed-resource
# Stage 0: create two null_resources — one will be removed in stage 1
# Stage 1: remove null_resource.ephemeral using a removed {} block,
#           keeping null_resource.keeper unchanged

terraform {
  required_providers {
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}

resource "null_resource" "keeper" {
  triggers = {
    version = "1"
  }
}

resource "null_resource" "ephemeral" {
  triggers = {
    version = "1"
  }
}
