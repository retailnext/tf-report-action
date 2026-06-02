# Fixture: scalar-collection
# Exercises collection-aware rendering for large scalar arrays (sets and lists).
# Uses tfcoremock to simulate an IAM role resource with a set(string) permissions
# attribute and a list(string) ordered_rules attribute.
#
# Stage 0: Resource created with initial set of permissions, ordered rules, and
#           sensitive tags (exercises sensitive collection path).
# Stage 1: Permissions updated (some added, some removed) and rules reordered.
#           Tags unchanged (exercises unchanged collection skip).
#           Tests that sets show clean add/remove diffs and lists show reordering.

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

resource "tfcoremock_iam_role" "ops" {
  name        = "cloud-ops-reader"
  description = "Read-only access for cloud operations"

  permissions = toset([
    "compute.addresses.get",
    "compute.addresses.list",
    "compute.disks.get",
    "compute.disks.list",
    "compute.firewalls.get",
    "compute.firewalls.list",
    "compute.instances.get",
    "compute.instances.list",
    "compute.networks.get",
    "compute.networks.list",
    "compute.subnetworks.get",
    "compute.subnetworks.list",
    "container.clusters.get",
    "container.clusters.list",
    "dns.managedZones.get",
    "dns.managedZones.list",
    "iam.roles.get",
    "iam.roles.list",
    "monitoring.alertPolicies.get",
    "monitoring.alertPolicies.list",
    "storage.buckets.get",
    "storage.buckets.list",
  ])

  ordered_rules = [
    "allow 10.0.0.0/8",
    "allow 172.16.0.0/12",
    "deny 192.168.1.0/24",
    "allow 192.168.0.0/16",
    "deny all",
  ]

  tags = toset([
    "environment:production",
    "managed-by:terraform",
    "team:platform",
    "tier:core",
  ])

  labels = toset([
    "app:cloud-ops",
    "cost-center:engineering",
    "owner:platform-team",
    "region:us-central1",
  ])
}
