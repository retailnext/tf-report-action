# Fixture: apply-error
# Stage 1: Modify null_resource.will_fail's provisioner to exit 1.
# Plan shows updates to will_fail (trigger change) and depends_on_fail.
# Apply: will_fail fails, depends_on_fail is skipped, success is unchanged.

terraform {
  required_providers {
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}

resource "terraform_data" "success" {
  input = "stable"
}

resource "null_resource" "will_fail" {
  triggers = {
    value = "v2"
  }

  provisioner "local-exec" {
    command = "exit 1"
  }
}

resource "terraform_data" "depends_on_fail" {
  input = null_resource.will_fail.id

  depends_on = [null_resource.will_fail]
}

output "success_output" {
  value = terraform_data.success.output
}

output "depends_on_fail_output" {
  value = terraform_data.depends_on_fail.output
}
