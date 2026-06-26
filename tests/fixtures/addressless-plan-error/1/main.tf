# Fixture: addressless-plan-error
#
# Stage 1: The stage-0 null_resources remain (and refresh, emitting refresh
# hooks), while a new output indexes a map with a key that is only knowable
# after refresh (`null_resource.noise[0].id`). The map has no such key, so the
# plan fails with an addressless `Invalid index` diagnostic (a source range but
# no resource address). This is the focusing filter's target scenario: the one
# real error must survive while the unrelated refresh hooks are dropped.

terraform {
  required_providers {
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}

resource "null_resource" "noise" {
  count = 6

  triggers = {
    index = count.index
  }
}

output "noise_count" {
  value = 6
}

output "noise_enabled" {
  value = true
}

output "noise_config" {
  value = {
    name    = "noise"
    enabled = true
  }
}

output "noise_banner" {
  value = "line one\nline two\nline three\nline four\nline five"
}

locals {
  present_keys = {
    only = "value"
  }
}

output "broken_index" {
  value = local.present_keys[null_resource.noise[0].id]
}
