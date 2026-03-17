# Fixture: with-modules
# Stage 0: root resource + child module resource, both with outputs
#          exercises module-address sorting and both root/module output rendering paths

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

# Root-level resource
resource "null_resource" "root" {
  triggers = {
    stage = "0"
  }
}

# Child module
module "naming" {
  source = "./modules/naming"
  prefix = "fixture"
}

# Root-level output
output "root_id" {
  value = null_resource.root.id
}

# Output sourced from child module
output "generated_name" {
  value = module.naming.name
}
