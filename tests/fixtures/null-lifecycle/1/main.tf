# Fixture: null-lifecycle
# Stage 1: create two null_resource instances with triggers,
#          a terraform_data resource (for in-place update in stage 2),
#          a local_file resource (for drift detection in stage 3),
#          and a check block (produces non-resource warning diagnostics).

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
    version = "1"
    label   = "alpha"
  }
}

resource "null_resource" "beta" {
  triggers = {
    version = "1"
    label   = "beta"
  }
}

# terraform_data is a built-in resource (no provider needed).
# Changing `input` produces an in-place ["update"] action.
resource "terraform_data" "meta" {
  input = "v1"
}

# local_file writes a file that can be deleted externally to produce drift.
resource "local_file" "managed" {
  content  = "managed-by-terraform"
  filename = "${path.module}/managed.txt"
}

# check block: produces a warning diagnostic with a snippet and expression
# values when the condition cannot be evaluated at plan time.
check "readiness" {
  assert {
    condition     = null_resource.alpha.id != ""
    error_message = "Alpha resource must have a non-empty ID."
  }
}
