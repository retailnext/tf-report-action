# Fixture: random-replace
# Stage 0: create a random_string with initial keepers value

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
    rotation = "v1"
  }
}

output "token_length" {
  value = random_string.token.length
}
