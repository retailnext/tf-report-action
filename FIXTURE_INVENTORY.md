# Fixture Inventory

## Overview

- **9 fixture workspaces**, each run with both Terraform and OpenTofu (18 suites)
- **23 stages** across all workspaces (46 stage-tool combos)
- **~540 generated files** under `tests/fixtures/generated/`
- **~2.4 MB** total generated fixture data
- **4 integration test files** with ~1800 parameterized test cases
- **8 manual fixtures** for error paths that cannot be generated

## Workspaces

Location: `tests/fixtures/<workspace>/<stage>/main.tf`

| Workspace            | Stages | Purpose                                                        |
| -------------------- | ------ | -------------------------------------------------------------- |
| null-lifecycle       | 0–4    | Core lifecycle: create, update, replace, destroy, no-op, drift |
| apply-error          | 0–1    | Provisioner failure, cascading skips, error diagnostics        |
| sensitive-values     | 0–1    | Sensitive value masking across all tiers                       |
| deferred-data-source | 0–2    | Phantom filtering with deferred data sources                   |
| modules              | 0–1    | Simple child module + nested for_each/count modules            |
| local-files          | 0–1    | Multi-line LCS line-diff rendering                             |
| state-operations     | 0–1    | Move, forget, and import in one plan                           |
| error-stages         | 0–2    | Validate-time error (stage 1), plan-time error (stage 2)       |
| invocation-variants  | 0–1    | No `-json` flag + no `-detailed-exitcode`                      |

### Workspace details

**null-lifecycle** — The workhorse fixture. Stage 0 is empty, stage 1 creates
resources (null, terraform_data, local_file) plus a `check` block that produces
non-resource warning diagnostics with HCL snippets. Stage 2 replaces/updates/deletes.
Stage 3 re-plans stage 2 for a no-op. Stage 4 uses a pre-plan hook to delete the
managed file externally, triggering resource drift detection.

**apply-error** — Stage 0 creates resources including a `null_resource` with a
local-exec provisioner. Stage 1 changes the provisioner to `exit 1`, exercising
apply failure, dependency-based phantom filtering, and inline error diagnostics.

**sensitive-values** — Creates and updates a `local_sensitive_file`. Both the
variable default and the output are sensitive. Tests that neither
`initial-secret-value` nor `updated-secret-value` ever appears in rendered output.

**deferred-data-source** — Three stages exercising Terraform 1.8+ deferred data
sources. Stage 1 adds a dependency that defers the data source, producing phantom
plan entries. Stage 2 changes one config value so only one worker actually updates.

**modules** — Combines simple module grouping (root + `module.naming` child) with
complex nested modules (`module.parent` with `for_each` delegating to a
count-based child). Stage 1 changes the prefix and for_each map.

**local-files** — Creates a `local_file` with 12+ lines of content, then updates
it with a mix of changed/added/removed lines to exercise the LCS line-diff.

**state-operations** — Stage 0 creates baseline resources. Stage 1 performs three
independent state-only operations in one plan: move (`moved {}` block), forget
(`removed {}` block), and import (`import {}` block).

**error-stages** — Stage 0 creates a baseline. Stage 1 references an undefined
variable (fails validate). Stage 2 references a nonexistent file (passes validate,
fails plan).

**invocation-variants** — Runs without `-json` or `-detailed-exitcode` flags
(`workspace.conf`). Tests Tier 3 text fallback and ambiguous exit-code-0 handling.

## Generation features

### Workspace options (`workspace.conf`)

| Option                      | Description                                    |
| --------------------------- | ---------------------------------------------- |
| `no-json=true`              | Run without `-json` flag                       |
| `no-detailed-exitcode=true` | Run plan without `-detailed-exitcode`          |
| `log-level=<level>`         | Set `TF_LOG` for plan and apply (e.g. `trace`) |

### Stage hooks

A stage directory may contain a `pre-plan` executable script. It runs inside the
tool working directory immediately before the plan command. Use this to simulate
external changes (e.g. deleting a managed file to produce resource drift).

### Expected failures (`expect-fail`)

A stage directory may contain an `expect-fail` file listing one command name per
line (`init`, `validate`, `plan`, `apply`). Listed commands are expected to fail.

## Generated output

Location: `tests/fixtures/generated/<tool>/<workspace>/<stage>/`

Each stage produces:

- `init.stdout`, `validate.stdout`, `plan.stdout` — command outputs
- `show-plan.stdout` — JSON plan (when plan succeeds)
- `apply.stdout` — JSONL apply output (when apply runs)
- `state.stdout` — state pull output (when apply runs)
- `steps.json` — full workflow context
- `plan-steps.json` — plan-only (no apply/state steps)
- `no-show-steps.json` — no show-plan/apply/state (Tier 3)
- `apply-no-show-steps.json` — apply present, no show-plan
- `apply-only-steps.json` — init/validate/apply only
- `no-state-steps.json` — all steps except state

## Manual fixtures

Location: `tests/fixtures/manual/<name>/`

| Fixture                        | Purpose                                   |
| ------------------------------ | ----------------------------------------- |
| read-errors                    | Absolute paths to nonexistent files       |
| missing-outputs                | Steps without `stdout_file`/`stderr_file` |
| parse-failure                  | Invalid JSON in `show-plan.stdout`        |
| unrelated-workflow             | No IaC steps (general workflow table)     |
| ci-workflow                    | All steps succeed, logs URL construction  |
| step-with-stderr               | Successful step with non-empty stderr     |
| failed-plan-unreadable-outputs | Failed plan, missing output files         |
| successful-workflow            | All-green non-IaC workflow                |

## Generating fixtures

```bash
# All workspaces (requires both terraform and tofu on PATH)
bash scripts/generate-fixtures.sh

# Single workspace
bash scripts/generate-fixtures.sh --workspace null-lifecycle
```

After regenerating, update snapshots:

```bash
npx vitest run -u
```
