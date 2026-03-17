# Fixture: null-lifecycle
# Stage 4: Same configuration as stage 3, but the pre-plan hook deletes the
#   managed file on disk. Terraform detects this during refresh, producing
#   a resource_drift entry (delete action) in the plan JSON and a planned
#   re-create of local_file.managed.

terraform {
  required_providers {
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
  }
}

resource "null_resource" "alpha" {
  triggers = {
    version = "2"
    label   = "alpha"
  }
}

resource "terraform_data" "meta" {
  input = "v2"
}

resource "local_file" "managed" {
  content  = "managed-by-terraform"
  filename = "${path.module}/managed.txt"
}

check "readiness" {
  assert {
    condition     = null_resource.alpha.id != ""
    error_message = "Alpha resource must have a non-empty ID."
  }
}
