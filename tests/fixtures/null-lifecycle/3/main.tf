# Fixture: null-lifecycle
# Stage 3: Same configuration as stage 2 — re-planning after stage 2 is
#   applied produces a no-op plan (all resources already match desired state).
#   Exercises the "No Changes" rendering path.
#   The check block passes (alpha has a known ID), so no diagnostic is emitted.

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

# terraform_data.meta input change → in-place ["update"]
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
