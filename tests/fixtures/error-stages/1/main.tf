# Fixture: error-stages
# Stage 1: Invalid config — references a nonexistent variable, which
# passes init (providers are fine) but fails validate.

terraform {
  required_providers {
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}

resource "null_resource" "baseline" {
  triggers = {
    value = var.nonexistent_variable
  }
}
