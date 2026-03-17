# Fixture: no-op
# Stage 1: identical configuration to stage 0
#          After stage 0 is applied, planning stage 1 produces a no-op plan
#          (all resources already exist and are unchanged)

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
