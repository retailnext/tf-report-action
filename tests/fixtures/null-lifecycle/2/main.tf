# Fixture: null-lifecycle
# Stage 2: trigger change on alpha (replace: ["delete","create"]),
#          remove beta (destroy: ["delete"]),
#          input change on meta (in-place update: ["update"])

terraform {
  required_providers {
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
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
