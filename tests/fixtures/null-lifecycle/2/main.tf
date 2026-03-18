# Fixture: null-lifecycle
# Stage 2: trigger change on alpha (replace: ["delete","create"]),
#          remove beta (destroy: ["delete"]),
#          input change on meta (in-place update: ["update"]),
#          local_file + check carried forward from stage 1.

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
