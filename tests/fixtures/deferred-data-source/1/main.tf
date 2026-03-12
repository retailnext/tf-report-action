# Fixture: deferred-data-source
# Stage 1: add local_file.metadata and include it in the data source's
#          depends_on. Because a new resource is pending creation, the data
#          source is deferred to apply time, making its outputs unknown during
#          planning. All downstream workers show as "will be updated in-place"
#          but none actually change because the resolved config is identical.
#          terraform_data.independent is explicitly changed (input "v1" → "v2")
#          to produce one real update alongside the phantom ones.
#
#   Plan:  1 to add, 4 to change, 0 to destroy
#   Apply: 1 added, 1 changed, 0 destroyed

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

# New resource — its pending creation defers the data source
resource "local_file" "metadata" {
  content  = "metadata-v1"
  filename = "${path.module}/metadata.txt"
}

data "local_command" "read_config" {
  command    = "cat"
  arguments  = ["${path.module}/config.json"]
  depends_on = [local_file.config, local_file.metadata]
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
  input = "v2"
}

output "config_value" {
  value = data.local_command.read_config.stdout
}
