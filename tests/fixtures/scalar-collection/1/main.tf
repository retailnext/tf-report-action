# Fixture: scalar-collection
# Stage 1: Permissions updated (some added, some removed) and rules reordered.
# - Set (permissions): 4 removed, 5 added — clean set diff expected
# - List (ordered_rules): rules reordered and one swapped — order change visible

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
    "compute.instances.getEffectiveFirewalls",
    "compute.instances.getIamPolicy",
    "compute.instances.list",
    "compute.instances.listReferrers",
    "compute.networks.get",
    "compute.networks.list",
    "compute.subnetworks.get",
    "compute.subnetworks.list",
    "container.clusters.get",
    "container.clusters.list",
    "dns.managedZones.get",
    "dns.managedZones.list",
    "monitoring.alertPolicies.get",
    "monitoring.alertPolicies.list",
    "monitoring.dashboards.get",
    "monitoring.dashboards.list",
  ])

  ordered_rules = [
    "allow 10.0.0.0/8",
    "deny 192.168.1.0/24",
    "allow 172.16.0.0/12",
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
