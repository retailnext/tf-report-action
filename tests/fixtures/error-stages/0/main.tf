# Fixture: error-stages
# Stage 0: Baseline — valid config, creates a resource.
# Stage 1: Config that fails validation (undefined variable reference).
# Stage 2: Config that passes validate but fails at plan time.

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
    value = "v1"
  }
}
