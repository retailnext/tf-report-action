# Fixture: plan-error
# Stage 1: Config that passes validate but fails at plan time.
# Using a local_file data source that references a nonexistent file
# causes a plan-time error (the file must exist to be read during plan).

terraform {
  required_providers {
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}

data "local_file" "missing" {
  filename = "/nonexistent/path/to/file.txt"
}

resource "null_resource" "uses_data" {
  triggers = {
    content = data.local_file.missing.content
  }
}
