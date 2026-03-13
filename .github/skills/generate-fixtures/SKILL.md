---
name: generate-fixtures
description: Run the fixture generation script to produce or refresh the Terraform/OpenTofu output files used by integration tests. Use this when asked to regenerate fixtures, refresh test data, or update fixture JSON files.
---

The fixture generation script runs `terraform` and `tofu` against every fixture
workspace and captures their machine-readable outputs. Both tools are **always** run
together — there is no option to generate output for only one tool.

## Prerequisites

Both `terraform` and `tofu` must be on `PATH`:

```bash
terraform version
tofu version
```

If either is missing, install it before proceeding.

## Running the Script

**Regenerate all fixtures (both tools, all workspaces):**
```bash
bash scripts/generate-fixtures.sh
```

**Regenerate a single workspace (still runs both tools):**
```bash
bash scripts/generate-fixtures.sh --workspace <name>
```

The script is idempotent — safe to re-run at any time.

## What the Script Does

For each workspace × each tool (`terraform` and `tofu`):

1. Creates a temporary directory under `tests/fixtures/tmp/<tool>/<workspace>/`
2. For each stage N (0, 1, 2, … in ascending order):
   a. Copies `.tf` files and supporting HCL from `tests/fixtures/<workspace>/<N>/`
      into the temporary directory (files not present in stage N are carried forward
      from the previous stage)
   b. Reads the optional `expect-fail` file (see below) to determine which commands
      are expected to return non-zero exit codes
   c. Runs `<tool> init -json` → writes to `init.jsonl`
   d. Runs `<tool> validate -json` → writes to `validate.json`
   e. Runs `<tool> plan -json -out=tfplan` → writes to `plan-log.jsonl`
   f. Runs `<tool> show -json tfplan` → writes to `plan.json`
   g. Runs `<tool> apply -json -auto-approve tfplan` → writes to `apply.jsonl`
   h. State carries forward to the next stage
3. Removes the temporary directory

### Expected failures

A stage directory may contain an `expect-fail` file listing commands expected to fail
(one per line: `init`, `validate`, `plan`, `apply`). When present:

- A listed command that exits non-zero → continues normally (output is captured)
- A listed command that exits zero → script aborts ("expected to fail but succeeded")
- An unlisted command that exits non-zero → script aborts (unexpected failure)

When a prerequisite command fails, dependent commands are skipped:
- `init` failure → skip `validate`, `plan`, `show`, `apply`
- `plan` failure → skip `show`, `apply`
- `validate` failure → does NOT block `plan` or `apply`
- `apply` failure → terminal

Skipped commands produce no output files. The `expect-fail` file itself is NOT copied
to the generated output directory.

## Output Location

Generated files land at:
```
tests/fixtures/generated/
  <tool>/
    <workspace>/
      <stage>/
        init.jsonl        ← init -json (JSON Lines)
        validate.json     ← validate -json (single JSON object)
        plan-log.jsonl    ← plan -json (JSON Lines)
        plan.json         ← show -json (single JSON object)
        apply.jsonl       ← apply -json (JSON Lines)
```

These files **are** committed to the repository.

## After Running

1. Review the diffs to `tests/fixtures/generated/` to confirm the changes look correct.

2. Run the integration coverage report to verify the fixtures meet coverage thresholds:
   ```bash
   npm run test:integration:coverage
   ```

3. If the integration snapshot tests now fail, update the Vitest snapshots:
   ```bash
   npm run test:integration:coverage -- --update-snapshots
   ```

4. Review the snapshot diffs carefully — they show the exact markdown output that
   changed. Confirm every change is intentional.

5. Commit the updated fixture files, any updated snapshot files, and any updated
   `vitest.integration.config.ts` thresholds together in one commit.

## Integration Test Input Rule

Integration tests may **only** load inputs that were produced by actually running
`terraform` or `tofu` against a fixture workspace. No inline-constructed or
manually-crafted plan objects are permitted in `tests/integration/` — those belong in
`tests/unit/` instead. See `.github/copilot-instructions.md` for the full reviewer rule.
