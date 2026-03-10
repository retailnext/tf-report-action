# Fixture: random-replace
# Stage 1: change keepers value — forces replacement (delete+create) of random_string

terraform {
  required_providers {
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

resource "random_string" "token" {
  length  = 16
  special = false
  keepers = {
    rotation = "v2"
  }
}

output "token_length" {
  value = random_string.token.length
}
