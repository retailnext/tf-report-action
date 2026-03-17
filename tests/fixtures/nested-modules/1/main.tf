# Fixture: nested-modules
# Stage 1: change for_each map — removes keys "0" and "2", adds key "3" with 3 resources
#          key "1" is unchanged (no-op, filtered from report)

terraform {
  required_providers {
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}

module "parent" {
  source   = "./modules/parent"
  for_each = { "1" = 1, "3" = 3 }

  resource_count = each.value
  label          = each.key
}
