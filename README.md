# OpenTofu Report Action

A lightweight GitHub Action for reporting the status of OpenTofu (or Terraform) workflow executions as pull request comments. This action automatically posts workflow status updates with command outputs and cleans up previous comments for the same workspace.

## Features

- 📊 Reports workflow execution status as PR comments
- 📄 Displays stdout/stderr from failed steps (using retailnext/exec-action outputs)
- 🧹 Automatically deletes previous bot comments for the same workspace
- 🏷️ Supports multiple workspaces with unique identifiers
- 🪶 Lightweight - no external dependencies, small dist bundle (~10KB)
- ✅ Clear success/failure indicators with step-level details
- 📏 Handles GitHub comment size limits with intelligent truncation

## Usage

This action works with [retailnext/exec-action](https://github.com/retailnext/exec-action) to capture command outputs. Use `exec-action` to run your OpenTofu commands, then pass all steps to this action for reporting.

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
        uses: retailnext/exec-action@v1
        with:
          command: tofu init

      - name: OpenTofu Plan
        id: plan
        uses: retailnext/exec-action@v1
        with:
          command: tofu plan -no-color
        continue-on-error: true

      - name: Report Status
        if: always()
        uses: eriksw/tf-report-action@v1
        with:
          steps: ${{ toJSON(steps) }}
          workspace: 'production'
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `steps` | JSON string of workflow steps (use `${{ toJSON(steps) }}`) | Yes | - |
| `workspace` | Workspace name to disambiguate comments from multiple workspaces | Yes | - |
| `github-token` | GitHub token for posting comments | No | `${{ github.token }}` |

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
        uses: retailnext/exec-action@v1
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

  tofu-prod:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup OpenTofu
        uses: opentofu/setup-opentofu@v1
      
      - name: OpenTofu Plan (Prod)
        id: plan-prod
        uses: retailnext/exec-action@v1
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
```

## How It Works

1. The action receives all workflow steps as JSON input
2. Analyzes step outcomes to determine which steps failed
3. For failed steps, extracts stdout/stderr from step outputs (populated by retailnext/exec-action)
4. Generates a formatted comment with the workspace status and outputs
5. Posts the comment to the pull request
6. Deletes any previous comments for the same workspace (identified by HTML comment marker)

## Comment Format

The action posts comments in the following format:

**Success:**
```
## OpenTofu Workflow Report - `production`

### ✅ Success

All 3 step(s) completed successfully.
```

**Failure with outputs:**
```
## OpenTofu Workflow Report - `production`

### ❌ Failed

1 of 3 step(s) failed:

#### ❌ Step: `plan`

**Status:** failure
**Exit Code:** 1

<details>
<summary>📄 Output</summary>

```
Terraform will perform the following actions...
```

</details>

<details>
<summary>⚠️ Errors</summary>

```
Error: Invalid configuration
...
```

</details>
```

## Size Limits

GitHub has a comment size limit of 65,536 characters. This action:
- Truncates individual step outputs to ~20KB each
- Truncates the entire comment to ~60KB if needed
- Preserves the beginning and end of truncated output for context

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

```
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