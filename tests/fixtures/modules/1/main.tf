# Fixture: modules
# Stage 1: Update root resource trigger (in-place update), change module prefix
#   (forces random_string replacement in naming module), and change for_each map
#   (removes keys "0" and "2", adds key "3" with 3 resources).

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

# Simple child module (prefix changed — forces random_string replacement)
module "naming" {
  source = "./modules/naming"
  prefix = "fixture-updated"
}

# Nested parent module: keys "0" and "2" removed, key "3" added with 3 resources.
# Key "1" is unchanged (no-op, filtered from report).
module "parent" {
  source   = "./modules/parent"
  for_each = { "1" = 1, "3" = 3 }

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
