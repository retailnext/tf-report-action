# OpenTofu Report Action

A lightweight GitHub Action for reporting the status of OpenTofu (or Terraform) workflow executions as pull request comments. This action automatically posts workflow status updates and cleans up previous comments for the same workspace.

## Features

- 📊 Reports workflow execution status as PR comments
- 🧹 Automatically deletes previous bot comments for the same workspace
- 🏷️ Supports multiple workspaces with unique identifiers
- 🪶 Lightweight - no external dependencies, small dist bundle (~7.7KB)
- ✅ Clear success/failure indicators with step-level details

## Usage

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
        run: tofu init

      - name: OpenTofu Plan
        id: plan
        run: tofu plan -no-color
        continue-on-error: true

      - name: Report Status
        if: always()
        uses: eriksw/tf-report-action@v1
        with:
          steps: ${{ toJSON(steps) }}
          workspace: 'production'
          github-token: ${{ secrets.GITHUB_TOKEN }}
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
      
      - name: OpenTofu Plan (Dev)
        id: plan-dev
        run: tofu plan -no-color
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
      
      - name: OpenTofu Plan (Prod)
        id: plan-prod
        run: tofu plan -no-color
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

1. The action receives the workflow steps as JSON input
2. Analyzes step outcomes to determine success or failure
3. Generates a formatted comment with the workspace status
4. Posts the comment to the pull request
5. Deletes any previous comments for the same workspace (identified by HTML comment marker)

## Comment Format

The action posts comments in the following format:

**Success:**
```
## OpenTofu Workflow Report - `production`

### ✅ Success

All 3 step(s) completed successfully.
```

**Failure:**
```
## OpenTofu Workflow Report - `production`

### ❌ Failed

2 of 5 step(s) failed:

- ❌ `plan`
- ❌ `validate`
```

## Development

### Building

```bash
npm install
npm run build
```

### Project Structure

```
.
├── action.yml          # Action metadata
├── src/
│   └── index.ts       # Main TypeScript source
├── dist/
│   └── index.js       # Compiled JavaScript (committed)
├── package.json
└── tsconfig.json
```

## License

MIT