# Fixture: local-files
# Stage 0: create a local_file with multi-line plain text content (>10 lines)
#          to exercise the large-value renderer and LCS line-diff code paths

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
    Version: 1.0.0
    Status: active

    This file is managed by Terraform.
    It contains multiple lines of plain text
    so that the large-value renderer is exercised.

    Line 9: additional content
    Line 10: additional content
    Line 11: additional content
    Line 12: end of file
  EOT
}

output "readme_path" {
  value = local_file.readme.filename
}
