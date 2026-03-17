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
2. Reads optional `workspace.conf` for workspace-level options:
   - `no-json=true` — run commands without `-json` flag (tests Tier 3 rendering)
   - `no-detailed-exitcode=true` — run plan without `-detailed-exitcode`
3. For each stage N (0, 1, 2, … in ascending order):
   a. Copies `.tf` files and supporting HCL from `tests/fixtures/<workspace>/<N>/`
   into the temporary directory (files not present in stage N are carried forward
   from the previous stage)
   b. Reads the optional `expect-fail` file (see below) to determine which commands
   are expected to return non-zero exit codes
   c. Runs `<tool> init [-json]` → writes stdout to `init.stdout`, stderr to `init.stderr`
   d. Runs `<tool> validate [-json]` → writes to `validate.stdout` / `validate.stderr`
   e. Runs `<tool> plan [-json] [-detailed-exitcode] -out=tfplan` → writes to `plan.stdout` / `plan.stderr`
   f. Runs `<tool> show -json tfplan` → writes to `show-plan.stdout` / `show-plan.stderr`
   g. Runs `<tool> apply [-json] tfplan` → writes to `apply.stdout` / `apply.stderr`
   h. Runs `<tool> state pull` → writes to `state.stdout` (always JSON, no `-json` flag)
   i. Generates `steps.json` with step outcomes and file references
   j. State carries forward to the next stage
4. Removes the temporary directory

### `-detailed-exitcode` handling

By default, `plan` is run with `-detailed-exitcode`. This means:

- Exit code 0 = no changes
- Exit code 1 = error
- Exit code 2 = changes present (treated as success)

Workspaces with `no-detailed-exitcode=true` skip this flag.

### Expected failures

A stage directory may contain an `expect-fail` file listing commands expected to fail
(one per line: `init`, `validate`, `plan`, `apply`). When present:

- A listed command that exits non-zero → continues normally (output is captured)
- A listed command that exits zero → script aborts ("expected to fail but succeeded")
- An unlisted command that exits non-zero → script aborts (unexpected failure)

When a prerequisite command fails, dependent commands are skipped:

- `init` failure → skip `validate`, `plan`, `show`, `apply`, `state`
- `plan` failure → skip `show`, `apply`, `state`
- `validate` failure → skip `plan`, `show`, `apply`, `state`
- `apply` failure → `state` still runs (partial state may exist)

Skipped commands produce no output files. The `expect-fail` file itself is NOT copied
to the generated output directory.

## Output Location

Generated files land at:

```text
tests/fixtures/generated/
  <tool>/
    <workspace>/
      <stage>/
        init.stdout          ← init stdout
        init.stderr          ← init stderr (omitted if empty)
        validate.stdout      ← validate stdout
        validate.stderr      ← validate stderr (omitted if empty)
        plan.stdout          ← plan stdout (JSONL with -json, plain text without)
        plan.stderr          ← plan stderr (omitted if empty)
        show-plan.stdout     ← show -json stdout (always JSON)
        show-plan.stderr     ← show -json stderr (omitted if empty)
        apply.stdout         ← apply stdout (JSONL with -json, plain text without)
        apply.stderr         ← apply stderr (omitted if empty)
        state.stdout         ← state pull stdout (always JSON)
        steps.json           ← step outcomes and file references
        plan-steps.json      ← plan-only variant (no apply or state step)
        no-show-steps.json   ← no show-plan variant (forces Tier 3 fallback)
        apply-no-show-steps.json ← apply present but no show-plan
        apply-only-steps.json    ← only init/validate/apply (no plan or show-plan)
        no-state-steps.json  ← full pipeline without state (tests missing-state warning)
```

### Step variant files

In addition to the canonical `steps.json`, the generation script produces
variant files that exercise different rendering tiers by omitting specific steps:

| Variant                    | Omitted steps                 | Purpose                                                   |
| -------------------------- | ----------------------------- | --------------------------------------------------------- |
| `plan-steps.json`          | `apply`, `state`              | Plan-only report (Tier 1 without apply)                   |
| `no-show-steps.json`       | `show-plan`, `apply`, `state` | Forces Tier 3 raw text fallback                           |
| `apply-no-show-steps.json` | `show-plan`, `state`          | Apply present but no structured plan                      |
| `apply-only-steps.json`    | `plan`, `show-plan`, `state`  | Only init/validate/apply steps                            |
| `no-state-steps.json`      | `state`                       | Full pipeline without state (tests missing-state warning) |

### `steps.json` format

Each stage generates a `steps.json` describing the outcome of each step:

```json
{
  "init": {
    "outcome": "success",
    "conclusion": "success",
    "outputs": {
      "exit_code": "0",
      "stdout_file": "init.stdout",
      "stderr_file": "init.stderr"
    }
  },
  "plan": {
    "outcome": "success",
    "conclusion": "success",
    "outputs": {
      "exit_code": "2",
      "stdout_file": "plan.stdout"
    }
  }
}
```

File references in `steps.json` are relative to the stage directory. The
test helper resolves them to absolute paths. Empty stderr files are deleted
and omitted from the outputs.

Manual fixture directories live under `tests/fixtures/manual/` and are
not processed by the generation script. They contain hand-crafted
`steps.json` files for testing scenarios that can't be generated by
running terraform/tofu (e.g., `unrelated-workflow`).

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

4. Review the snapshot diffs carefully — they show the exact Markdown output that
   changed. Confirm every change is intentional.

5. Commit the updated fixture files, any updated snapshot files, and any updated
   `vitest.integration.config.ts` thresholds together in one commit.

## Integration Test Input Rule

Integration tests may **only** load inputs that were produced by actually running
`terraform` or `tofu` against a fixture workspace. No inline-constructed or
manually-crafted plan objects are permitted in `tests/integration/` — those belong in
`tests/unit/` instead. See `.github/copilot-instructions.md` for the full reviewer rule.
