# Fixture: local-files
# Stage 2: change ONLY outputs, leaving every resource byte-identical to stage 1.
#          Exercises the outputs-only plan path so the title reflects output
#          changes ("Plan: N output changes") instead of falsely reading
#          "No Changes" when there are no resource changes.

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

output "static_note" {
  value = "outputs-only change with no resource changes"
}
