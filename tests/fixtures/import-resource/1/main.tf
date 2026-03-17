# Fixture: import-resource
# Stage 1: add a second random_string via an import block with a hardcoded ID.
#           The import block causes an "import" action in the plan JSON —
#           the resource is brought under management without being re-created.

terraform {
  required_providers {
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

resource "random_string" "existing" {
  length  = 8
  special = false
}

import {
  to = random_string.imported
  id = "fixedval"
}

resource "random_string" "imported" {
  length = 8
}
