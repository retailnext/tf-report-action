# Fixture: empty-block-addition
# Stage 0: Network policy resource with egress policy type but no egress rules.
#   Replicates the essential shape of kubernetes_network_policy_v1 using
#   tfcoremock so the fixture runs without cloud credentials.
# Stage 1: Add an empty egress block to allow all egress traffic.

terraform {
  required_providers {
    tfcoremock = {
      source  = "hashicorp/tfcoremock"
      version = "0.1.1"
    }
  }
}

provider "tfcoremock" {
  use_only_state = true
}

resource "tfcoremock_network_policy" "deny_all" {
  name = "deny-all-egress"

  spec {
    policy_types = ["Egress"]

    egress {
    }
  }
}
