# Fixture: apply-error
# Stage 0: Baseline — create all resources successfully.
#   - terraform_data.success: standalone resource, not affected by failures
#   - null_resource.will_fail: has a local-exec provisioner that succeeds in this stage
#   - terraform_data.depends_on_fail: depends on null_resource.will_fail
# Stage 1: Modify null_resource.will_fail's provisioner to exit 1, causing
#   the apply to fail. terraform_data.depends_on_fail is skipped due to the
#   dependency on the failed resource.

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
    value = "v1"
  }

  provisioner "local-exec" {
    command = "echo ok"
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
