# Fixture: deferred-data-source
# Stage 2: change one entry in the config file (worker_a: "alpha" → "ALPHA").
#          The config file replacement defers the data source, so all workers
#          show as "will be updated in-place" during planning. At apply time
#          only worker_a actually changes because workers b and c still resolve
#          to their prior values.
#
#   Plan:  1 to add, 3 to change, 1 to destroy
#   Apply: 1 added, 1 changed, 1 destroyed

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
    worker_a = "ALPHA"
    worker_b = "bravo"
    worker_c = "charlie"
  })
  filename = "${path.module}/config.json"
}

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
