# Fixture: nested-modules
# Stage 0: create resources via nested module hierarchy with for_each + count
#          exercises complex address resolution:
#          module.parent["key"].module.child.null_resource.item[N]
# Stage 1: change for_each map — deletes some instances, adds others

terraform {
  required_providers {
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}

# Parent module instantiated per map entry.
# The map value controls how many child resources are created.
module "parent" {
  source   = "./modules/parent"
  for_each = { "0" = 0, "1" = 1, "2" = 2 }

  resource_count = each.value
  label          = each.key
}
