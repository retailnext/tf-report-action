# Fixture: sensitive-values
# Stage 1: update the sensitive variable default — the content attribute changes
#          but both before and after values must be masked as (sensitive).
#          This exercises the hasSensitiveValue code path in buildAttributeChanges().

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
  default     = "updated-secret-value"
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
