# OpenTofu JSON Lines Test Fixtures

This directory contains test fixtures for OpenTofu JSON Lines output format.

## Documentation Source

All message types and formats are based on the official OpenTofu documentation:

**Primary Source:**
<https://github.com/opentofu/opentofu/blob/main/website/docs/internals/machine-readable-ui.mdx>

**Published Documentation:**
<https://opentofu.org/docs/internals/machine-readable-ui/>

## Fixture Files

- `plan-with-changes.jsonl` - Example plan output with create, update, and
  delete operations
- `plan-with-errors.jsonl` - Example plan output with diagnostic error messages
- `plan-with-replace.jsonl` - Example plan output with replace operation
- `plan-no-changes.jsonl` - Example plan output when no changes are needed
- `apply-success.jsonl` - Example apply output with successful resource creation
- `resource-drift.jsonl` - Example output showing resource drift detection

## Message Types Covered

These fixtures demonstrate the following OpenTofu JSON message types:

- `version` - OpenTofu version and UI schema version
- `planned_change` - Resources that will be created/updated/deleted
- `change_summary` - Summary of all planned or applied changes
- `diagnostic` - Error and warning messages
- `resource_drift` - Resources changed outside of OpenTofu
- `apply_start` - Start of apply operation on a resource
- `apply_progress` - Progress updates during apply
- `apply_complete` - Completion of apply operation

## Updating Fixtures

When updating these fixtures or adding new ones:

1. Refer to the official documentation (link above) for the correct format
1. Ensure all required fields are present (@level, @message, @module,
   @timestamp, type)
1. Use realistic timestamps and resource addresses
1. Test that the parser correctly handles the new fixtures
