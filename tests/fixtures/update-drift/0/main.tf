# Fixture: update-drift
# Stage 0: Create a filesystem_file_writer resource. On first apply, the
#   resource creates a file on disk with known content.
# Stage 1: Same config. Pre-plan hook modifies the file content externally,
#   causing the provider to detect update-action drift (both before and after
#   non-null with differing values).

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
