# Fixture: no-op
# Stage 0: a stable resource with no pending changes
#          The generation script applies stage 0, then plans again.
#          The resulting plan shows all resources as no-op.

terraform {
  required_providers {
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}

resource "null_resource" "stable" {
  triggers = {
    version = "1"
  }
}
