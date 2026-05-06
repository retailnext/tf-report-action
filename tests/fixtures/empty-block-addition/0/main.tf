# Fixture: empty-block-addition
# Stage 0: Initial resource with no empty nested blocks
# Stage 1: Add an empty nested object to demonstrate visibility of empty block changes

terraform {
}

resource "terraform_data" "example" {
  input = {
    name  = "test"
    value = "hello"
  }
}
