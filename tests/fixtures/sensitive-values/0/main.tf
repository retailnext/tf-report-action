# Fixture: sensitive-values
# Stage 0: create a local_file using a sensitive variable as content
#          The file content is marked sensitive so it is always masked in plan output.
#          Also demonstrates a sensitive output.

terraform {
  required_providers {
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
  }
}

variable "secret_content" {
  type        = string
  description = "Sensitive file content"
  sensitive   = true
  default     = "initial-secret-value"
}

resource "local_sensitive_file" "secret" {
  filename = "${path.module}/output/secret.txt"
  content  = var.secret_content
}

output "secret_path" {
  value = local_sensitive_file.secret.filename
}

output "secret_checksum" {
  value     = local_sensitive_file.secret.content_md5
  sensitive = true
}
