# Fixture: local-files
# Stage 1: update file content — some lines change, some stay the same
#          exercises LCS line-diff with a mix of unchanged/added/removed lines

terraform {
  required_providers {
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
  }
}

resource "local_file" "readme" {
  filename = "${path.module}/output/readme.txt"
  content  = <<-EOT
    Project: tf-plan-md fixture
    Version: 2.0.0
    Status: active

    This file is managed by Terraform.
    It contains multiple lines of plain text
    so that the large-value renderer is exercised.

    Line 9: updated content
    Line 10: additional content
    Line 11: new line inserted here
    Line 12: additional content
    Line 13: end of file
  EOT
}

output "readme_path" {
  value = local_file.readme.filename
}
