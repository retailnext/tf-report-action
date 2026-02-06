# OpenTofu Report Action

A lightweight GitHub Action for reporting the status of OpenTofu (or Terraform)
workflow executions as pull request comments or status issues. This action
automatically posts workflow status updates with command outputs and cleans up
previous comments/issues for the same workspace.

## Features

- 📊 Reports workflow execution status as PR comments or status issues
- 🔀 **Automatically adapts to context**: posts comments in PRs, creates/updates
  status issues on main branch
- 🎯 Optional target step focus for highlighting specific operations (e.g.,
  `tofu plan`, `tofu apply`)
- 📄 Displays command outputs from failed steps or successful target steps
  (using retailnext/exec-action outputs)
- 🔍 **Automatically detects and formats OpenTofu JSON Lines output** with rich
  formatting and emoji annotations
- 🧹 Automatically deletes previous bot comments/updates issues for the same
  workspace
- 🏷️ Supports multiple workspaces with unique identifiers
- 🪶 Lightweight - no external dependencies, small dist bundle (~22KB)
- ✅ Clear success/failure indicators with step-level details
- 📏 Handles GitHub comment size limits with intelligent truncation
- 🔗 Includes links to full logs when output is truncated

## Usage

This action works with
[retailnext/exec-action](https://github.com/retailnext/exec-action) to capture
command outputs. Use `exec-action` to run your OpenTofu commands, then pass all
steps to this action for reporting.

### In Pull Requests

```yaml
name: OpenTofu Workflow

on:
  pull_request:

jobs:
  tofu-plan:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup OpenTofu
        uses: opentofu/setup-opentofu@v1

      - name: OpenTofu Init
        id: init
        uses: retailnext/exec-action@main
        with:
          command: tofu init

      - name: OpenTofu Plan
        id: plan
        uses: retailnext/exec-action@main
        with:
          command: tofu plan -no-color

      - name: Report Status
        if: always()
        uses: retailnext/tf-report-action@main
        with:
          steps: ${{ toJSON(steps) }}
          workspace: 'production'
          github-token: ${{ github.token }}
```

### On Main Branch (Status Issues)

When running outside of a pull request context (e.g., on the main branch), the
action creates or updates a status issue instead of posting comments. Each
workspace gets its own status issue that is updated with each run.

```yaml
name: OpenTofu Workflow

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read
  pull-requests: write
  issues: write # Required for status issues on main branch

jobs:
  tofu-plan:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup OpenTofu
        uses: opentofu/setup-opentofu@v1

      - name: OpenTofu Init
        id: init
        uses: retailnext/exec-action@main
        with:
          command: tofu init

      - name: OpenTofu Plan
        id: plan
        uses: retailnext/exec-action@main
        with:
          command: tofu plan -no-color

      - name: Report Status
        if: always()
        uses: retailnext/tf-report-action@main
        with:
          steps: ${{ toJSON(steps) }}
          workspace: 'production'
          github-token: ${{ github.token }}
```

**Behavior:**

- **In PR context**: Posts/updates a comment on the pull request
- **Outside PR context**: Creates/updates a status issue with a title like
  `✅ production Succeeded` or `❌ production plan Failed`

## Inputs

| Input          | Description                                                                                                  | Required | Default            |
| -------------- | ------------------------------------------------------------------------------------------------------------ | -------- | ------------------ |
| `steps`        | JSON string of steps (`${{ toJSON(steps) }}`)                                                                | Yes      | -                  |
| `workspace`    | Workspace name for comment disambiguation. If not provided, uses workflow name and job name.                 | No       | `{workflow}/{job}` |
| `target-step`  | Optional step ID to focus the comment on (e.g., `plan`, `apply`). Highlights this step's status and outputs. | No       | -                  |
| `github-token` | GitHub token for posting comments/issues                                                                     | Yes      | -                  |

## How It Works

### Pull Request Context

1. The action receives all workflow steps as JSON input
1. Analyzes step outcomes to determine which steps failed
1. If a `target-step` is specified, focuses the comment on that step's status
   and outputs
1. For failed steps (or successful target steps), extracts command outputs from
   step outputs (populated by retailnext/exec-action)
1. Generates a formatted comment with the workspace/step status and outputs
1. Posts the comment to the pull request
1. Deletes any previous comments for the same workspace (identified by HTML
   comment marker with quoted workspace name)

### Non-PR Context (Status Issues)

1. The action follows the same analysis as PR context
1. Searches for an existing status issue with the workspace marker
1. If found, updates the issue title and body with the new status
1. If not found, creates a new issue with a title matching the status (e.g.,
   `✅ production Succeeded`)
1. Each workspace maintains its own status issue, automatically updated on each
   run

## Target Step Feature

Use the `target-step` input to focus comments on a specific step (like
`tofu plan` or `tofu apply`). This is useful for highlighting the most important
operation in your workflow.

### Example: Focus on `tofu plan`

```yaml
jobs:
  tofu-plan:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup OpenTofu
        uses: opentofu/setup-opentofu@v1

      - name: OpenTofu Init
        id: init
        uses: retailnext/exec-action@main
        with:
          command: tofu init

      - name: OpenTofu Plan
        id: plan
        uses: retailnext/exec-action@main
        with:
          command: tofu plan -no-color

      - name: Report Plan Status
        if: always()
        uses: retailnext/tf-report-action@main
        with:
          steps: ${{ toJSON(steps) }}
          workspace: 'production'
          target-step: 'plan'
          github-token: ${{ github.token }}
```

When `target-step` is specified:

- The comment title includes both workspace and step: `## ✅ \`production\`
  \`plan\` Succeeded`
- On success, the step's output is displayed
- On failure, the step's error output is highlighted
- If the step didn't run, other failures are reported

### Example: Focus on `tofu apply`

```yaml
jobs:
  tofu-apply:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup OpenTofu
        uses: opentofu/setup-opentofu@v1

      - name: OpenTofu Init
        id: init
        uses: retailnext/exec-action@main
        with:
          command: tofu init

      - name: OpenTofu Apply
        id: apply
        uses: retailnext/exec-action@main
        with:
          command: tofu apply -auto-approve -no-color

      - name: Report Apply Status
        if: always()
        uses: retailnext/tf-report-action@main
        with:
          steps: ${{ toJSON(steps) }}
          target-step: 'apply'
          github-token: ${{ github.token }}
```

Note: In this example, `workspace` is not specified, so the comment will use the
workflow name and job name (e.g., `Deploy/tofu-apply`).

## JSON Lines Support

This action automatically detects and formats
[OpenTofu JSON Lines output](https://opentofu.org/docs/internals/machine-readable-ui/)
when you use the `-json` flag with OpenTofu commands. This provides rich,
structured formatting of plan and apply operations.

### Example: Using JSON Lines Format

```yaml
- name: OpenTofu Plan
  id: plan
  uses: retailnext/exec-action@main
  with:
    command: tofu plan -json

- name: Report Plan Status
  if: always()
  uses: retailnext/tf-report-action@main
  with:
    steps: ${{ toJSON(steps) }}
    target-step: 'plan'
    github-token: ${{ github.token }}
```

### JSON Lines Features

When JSON Lines format is detected, the action will:

- **Display change summaries prominently** outside of collapsible sections:
  - **2** to add :heavy_plus_sign:
  - **1** to change 🔄
  - **1** to remove :heavy_minus_sign:
- **Show planned changes** with emoji annotations in a collapsible section:
  - :heavy_plus_sign: for resources to be created
  - 🔄 for resources to be updated
  - :heavy_minus_sign: for resources to be deleted
  - ± for resources to be replaced
  - 🚚 for resources to be moved
- **Display diagnostic errors and warnings** with formatted details and code
  snippets
- **Show resource drift** when detected
- **Skip noisy progress messages** (apply_start, apply_progress, apply_complete)
  to keep comments focused

### Full Examples

For complete examples showing real OpenTofu JSON Lines input and formatted
output for various scenarios (plan with changes, apply success, errors, etc.),
see [`__fixtures__/EXAMPLES.md`](./__fixtures__/EXAMPLES.md).

These examples are generated by:

1. Running `scripts/generate-examples.sh` to create real OpenTofu JSON outputs
1. Running `npx tsx scripts/demonstrate-formatting.ts` to format them using the
   action code

### Fallback to Standard Formatting

If the output is not in JSON Lines format (e.g., when using `-no-color` without
`-json`), the action will display the output in standard collapsible sections as
usual.

## Multiple Workspaces Example

When working with multiple workspaces, use different workspace identifiers:

```yaml
jobs:
  tofu-dev:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup OpenTofu
        uses: opentofu/setup-opentofu@v1

      - name: OpenTofu Plan (Dev)
        id: plan-dev
        uses: retailnext/exec-action@main
        with:
          command: tofu plan -no-color
          working-directory: ./environments/dev

      - name: Report Dev Status
        if: always()
        uses: retailnext/tf-report-action@main
        with:
          steps: ${{ toJSON(steps) }}
          workspace: 'dev'
          github-token: ${{ github.token }}

  tofu-prod:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup OpenTofu
        uses: opentofu/setup-opentofu@v1

      - name: OpenTofu Plan (Prod)
        id: plan-prod
        uses: retailnext/exec-action@main
        with:
          command: tofu plan -no-color
          working-directory: ./environments/prod

      - name: Report Prod Status
        if: always()
        uses: retailnext/tf-report-action@main
        with:
          steps: ${{ toJSON(steps) }}
          workspace: 'production'
          github-token: ${{ github.token }}
```

## Comment/Issue Format

The action posts comments (in PRs) or issues (on main) in different formats
depending on whether a target step is specified.

### Without Target Step

**Success:**

```markdown
## ✅ `production` Succeeded

All 3 step(s) completed successfully.
```

**Failure:**

````markdown
## ❌ `production` Failed

2 of 3 step(s) failed:

#### ❌ Step: `plan`

**Status:** failure **Exit Code:** 1

<details>
<summary>📄 Output</summary>

```

Terraform will perform the following actions...

```

</details>

<details>
<summary>⚠️ Errors</summary>

```

Error: Invalid configuration ...

```

</details>
````

### With Target Step

**Success (with outputs):**

````markdown
## ✅ `production` `plan` Succeeded

<details>
<summary>📄 Output</summary>

```

OpenTofu will perform the following actions:
  + resource "example" "test" {
      ...
    }

Plan: 1 to add, 0 to change, 0 to destroy.

```

</details>
````

**Success (no outputs):**

```markdown
## ✅ `production` `apply` Succeeded

> [!NOTE] Completed successfully with no output.
```

**Failure:**

````markdown
## ❌ `production` `plan` Failed

**Status:** failure **Exit Code:** 1

<details>
<summary>⚠️ Errors</summary>

```

Error: Invalid configuration ...

```

</details>
````

**Target step not found (with other failures):**

```markdown
## ❌ `production` `plan` Failed

2 of 3 step(s) failed:

- ❌ `init` (failure)
- ❌ `validate` (failure)
```

**Target step not found (no other failures):**

```markdown
## ❌ `production` `plan` Failed

### Did Not Run

`plan` was not found in the workflow steps.
```

## Size Limits

GitHub has a comment size limit of 65,536 characters. This action:

- Truncates individual step outputs to ~20KB each
- Truncates the entire comment to ~60KB if needed
- Preserves the beginning and end of truncated output for context
- Includes links to full job logs when output is truncated

## Development

### Building

```bash
npm install
npm run build
```

### Testing

```bash
npm test
```

### Project Structure

```text
.
├── action.yml          # Action metadata
├── src/
│   ├── index.ts       # Main TypeScript source
│   └── test.ts        # Test suite
├── dist/
│   ├── index.js       # Compiled JavaScript (committed)
│   └── test.js        # Compiled tests
├── package.json
└── tsconfig.json
```

## License

MIT
