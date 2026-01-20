#!/bin/bash
# Script to generate real OpenTofu JSON outputs for examples and tests

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURES_DIR="$SCRIPT_DIR/../__fixtures__"

echo "Creating OpenTofu example configurations..."

# Create example 1: Plan with multiple changes
mkdir -p /tmp/tofu-example1
cd /tmp/tofu-example1
cat >main.tf <<'EOF'
terraform {
  required_providers {
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

resource "random_pet" "server" {
  length = 2
}

resource "random_string" "password" {
  length  = 16
  special = true
}

output "server_name" {
  value = random_pet.server.id
}
EOF

echo "Initializing example 1..."
tofu init >/dev/null 2>&1

echo "Generating plan JSON for example 1..."
tofu plan -json >"$FIXTURES_DIR/plan-with-changes-real.jsonl" 2>&1 || true

# Create example 2: Plan with no changes (empty state)
mkdir -p /tmp/tofu-example2
cd /tmp/tofu-example2
cat >main.tf <<'EOF'
terraform {
  required_providers {
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

variable "example" {
  default = "test"
}

output "example_output" {
  value = var.example
}
EOF

echo "Initializing example 2..."
tofu init >/dev/null 2>&1

echo "Generating plan JSON for no changes..."
tofu plan -json >"$FIXTURES_DIR/plan-no-changes-real.jsonl" 2>&1 || true

# Create example 3: Plan with error
mkdir -p /tmp/tofu-example3
cd /tmp/tofu-example3
cat >main.tf <<'EOF'
terraform {
  required_providers {
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

resource "random_pet" "server" {
  # Missing required argument
}

output "server_name" {
  value = random_pet.invalid.id
}
EOF

echo "Initializing example 3..."
tofu init >/dev/null 2>&1

echo "Generating plan JSON with errors..."
tofu plan -json >"$FIXTURES_DIR/plan-with-errors-real.jsonl" 2>&1 || true

# Create example 4: Apply
mkdir -p /tmp/tofu-example4
cd /tmp/tofu-example4
cat >main.tf <<'EOF'
terraform {
  required_providers {
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

resource "random_pet" "demo" {
  length = 2
}

output "pet_name" {
  value = random_pet.demo.id
}
EOF

echo "Initializing example 4..."
tofu init >/dev/null 2>&1

echo "Generating apply JSON..."
tofu apply -auto-approve -json >"$FIXTURES_DIR/apply-success-real.jsonl" 2>&1 || true

echo "Done! Generated fixtures:"
ls -lh "$FIXTURES_DIR"/*.jsonl 2>/dev/null || echo "No .jsonl files generated"

echo ""
echo "Cleaning up temporary directories..."
rm -rf /tmp/tofu-example*

echo "Complete!"
