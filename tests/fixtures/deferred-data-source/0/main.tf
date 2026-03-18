# Fixture: deferred-data-source
# Stage 0: create a JSON config file with per-worker entries, a data source
#          that reads it, and workers that each consume their own key. All
#          values are known at plan time because the data source has no pending
#          dependencies.
#
# Stages overview:
#   Stage 0 → baseline: all resources created, all values known.
#   Stage 1 → phantom changes: data source deferred by new dependency, all
#             workers show "will be updated" but none actually change.
#   Stage 2 → partial real changes: config file content changes for one key,
#             data source deferred, only the affected worker actually updates.

terraform {
  required_providers {
    local = {
      source  = "hashicorp/local"
      version = ">= 2.5.0"
    }
  }
}

resource "local_file" "config" {
  content = jsonencode({
    worker_a = "alpha"
    worker_b = "bravo"
    worker_c = "charlie"
  })
  filename = "${path.module}/config.json"
}

data "local_command" "read_config" {
  command    = "cat"
  arguments  = ["${path.module}/config.json"]
  depends_on = [local_file.config]
}

locals {
  config = jsondecode(data.local_command.read_config.stdout)
}

resource "terraform_data" "worker_a" {
  input = local.config.worker_a
}

resource "terraform_data" "worker_b" {
  input = local.config.worker_b
}

resource "terraform_data" "worker_c" {
  input = local.config.worker_c
}

resource "terraform_data" "independent" {
  input = "v1"
}

output "config_value" {
  value = data.local_command.read_config.stdout
}
