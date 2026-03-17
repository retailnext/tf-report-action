# Fixture: modules
# Stage 0: Root resources, a simple child module (naming), and nested
#   for_each+count modules (parent/child). Exercises both simple and complex
#   module address resolution and grouping.
#
# Stage 1: Changes to root resource, module prefix, and for_each map.

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

# Simple child module (naming)
module "naming" {
  source = "./modules/naming"
  prefix = "fixture"
}

# Nested for_each parent module with count-based child resources
module "parent" {
  source   = "./modules/parent"
  for_each = { "0" = 0, "1" = 1, "2" = 2 }

  resource_count = each.value
  label          = each.key
}

# Root-level outputs
output "root_id" {
  value = null_resource.root.id
}

output "generated_name" {
  value = module.naming.name
}
