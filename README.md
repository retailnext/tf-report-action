# OpenTofu Report Action

A lightweight GitHub Action for reporting the status of OpenTofu (or Terraform)
workflow executions as pull request comments. This action automatically posts
workflow status updates with command outputs and cleans up previous comments for
the same workspace.

## Features

- 📊 Reports workflow execution status as PR comments
- 🎯 Optional target step focus for highlighting specific operations (e.g.,
  `tofu plan`, `tofu apply`)
- 📄 Displays stdout/stderr from failed steps or successful target steps (using
  retailnext/exec-action outputs)
- 🧹 Automatically deletes previous bot comments for the same workspace
- 🏷️ Supports multiple workspaces with unique identifiers
- 🪶 Lightweight - no external dependencies, small dist bundle (~10KB)
- ✅ Clear success/failure indicators with step-level details
- 📏 Handles GitHub comment size limits with intelligent truncation
- 🔗 Includes links to full logs when output is truncated

## Usage

This action works with
[retailnext/exec-action](https://github.com/retailnext/exec-action) to capture
command outputs. Use `exec-action` to run your OpenTofu commands, then pass all
steps to this action for reporting.

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
        continue-on-error: true

      - name: Report Status
        if: always()
        uses: eriksw/tf-report-action@v1
        with:
          steps: ${{ toJSON(steps) }}
          workspace: 'production'
          github-token: ${{ github.token }}
```

## Inputs

| Input          | Description                                                                                                  | Required | Default            |
| -------------- | ------------------------------------------------------------------------------------------------------------ | -------- | ------------------ |
| `steps`        | JSON string of steps (`${{ toJSON(steps) }}`)                                                                | Yes      | -                  |
| `workspace`    | Workspace name for comment disambiguation. If not provided, uses workflow name and job name.                 | No       | `{workflow}/{job}` |
| `target-step`  | Optional step ID to focus the comment on (e.g., `plan`, `apply`). Highlights this step's status and outputs. | No       | -                  |
| `github-token` | GitHub token for posting comments                                                                            | Yes      | -                  |

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
        continue-on-error: true

      - name: Report Plan Status
        if: always()
        uses: eriksw/tf-report-action@v1
        with:
          steps: ${{ toJSON(steps) }}
          workspace: 'production'
          target-step: 'plan'
          github-token: ${{ github.token }}
```

When `target-step` is specified:

- The comment title includes both workspace and step: `## ✅ \`production\`
  \`plan\` Succeeded`
- On success, the step's stdout/stderr are displayed
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
        continue-on-error: true

      - name: Report Apply Status
        if: always()
        uses: eriksw/tf-report-action@v1
        with:
          steps: ${{ toJSON(steps) }}
          target-step: 'apply'
          github-token: ${{ github.token }}
```

Note: In this example, `workspace` is not specified, so the comment will use the
workflow name and job name (e.g., `Deploy/tofu-apply`).

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
        continue-on-error: true

      - name: Report Dev Status
        if: always()
        uses: eriksw/tf-report-action@v1
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
        continue-on-error: true

      - name: Report Prod Status
        if: always()
        uses: eriksw/tf-report-action@v1
        with:
          steps: ${{ toJSON(steps) }}
          workspace: 'production'
          github-token: ${{ github.token }}
```

## How It Works

1. The action receives all workflow steps as JSON input
1. Analyzes step outcomes to determine which steps failed
1. If a `target-step` is specified, focuses the comment on that step's status
   and outputs
1. For failed steps (or successful target steps), extracts stdout/stderr from
   step outputs (populated by retailnext/exec-action)
1. Generates a formatted comment with the workspace/step status and outputs
1. Posts the comment to the pull request
1. Deletes any previous comments for the same workspace (identified by HTML
   comment marker with quoted workspace name)

## Comment Format

The action posts comments in different formats depending on whether a target
step is specified.

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
