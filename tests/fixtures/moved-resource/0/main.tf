# Fixture: moved-resource
# Stage 0: create a null_resource that will be renamed in stage 1

terraform {
  required_providers {
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}

resource "null_resource" "original" {
  triggers = {
    version = "1"
  }
}
