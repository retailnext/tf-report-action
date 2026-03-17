# Fixture: with-modules
# Stage 1: update root resource trigger (in-place update) and change module prefix
#          (forces replacement of random_string in child module)

terraform {
  required_providers {
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

# Root-level resource (trigger updated)
resource "null_resource" "root" {
  triggers = {
    stage = "1"
  }
}

# Child module (prefix change forces random_string replacement)
module "naming" {
  source = "./modules/naming"
  prefix = "fixture-updated"
}

# Root-level output
output "root_id" {
  value = null_resource.root.id
}

# Output sourced from child module
output "generated_name" {
  value = module.naming.name
}
