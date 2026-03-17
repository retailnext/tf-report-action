# Fixture: null-lifecycle
# Stage 0: empty workspace — no resources yet (plan shows creates on first apply)
# Stage 1: two null_resource instances with triggers
# Stage 2: trigger value changed (in-place update), one resource removed (destroy)

terraform {
  required_providers {
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}
