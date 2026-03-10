# Fixture: moved-resource
# Stage 1: rename null_resource.original → null_resource.renamed using a moved {}
#          block. The plan will show a ["no-op"] action with previous_address set,
#          exercising the movedFromAddress rendering path.

terraform {
  required_providers {
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}

resource "null_resource" "renamed" {
  triggers = {
    version = "1"
  }
}

moved {
  from = null_resource.original
  to   = null_resource.renamed
}
