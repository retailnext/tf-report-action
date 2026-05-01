# Fixture: update-drift
# Stage 2: Same configuration as stages 0-1. The pre-plan hook writes the
#   SAME content that Terraform expects. During refresh the provider re-reads
#   the file and finds it matches the desired state. Some providers (like
#   Kubernetes) would still report spurious drift here; the filesystem provider
#   should detect no change. If drift IS reported with identical values, it
#   exercises the suppression path in hasRawValueChanges() (returns false).

terraform {
  required_providers {
    filesystem = {
      source  = "sethvargo/filesystem"
      version = "1.0.0"
    }
  }
}

resource "filesystem_file_writer" "managed" {
  path     = "managed.txt"
  contents = "original-content"
}
