# Fixture: removed-resource
# Stage 1: remove null_resource.ephemeral from state without destroying it.
#           The removed {} block produces a "forget" action in the plan JSON.

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

removed {
  from = null_resource.ephemeral

  lifecycle {
    destroy = false
  }
}
