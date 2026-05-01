# Fixture: update-drift
# Stage 1: Same configuration as stage 0. The pre-plan hook modifies the
#   managed file content on disk. The filesystem provider detects the change
#   during refresh and reports resource_drift with an "update" action where
#   both before and after are non-null objects with differing attribute values.
#   This exercises the flatten-and-compare path in hasRawValueChanges().

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
