# TF Report Action

Reports OpenTofu/Terraform workflow status as PR comments or status issues with
rich plan and apply detail.

## Features

- **Rich plan diffs** — attribute-level changes with inline character diffs, grouped
  by module
- **Apply reports** — shows only actually-changed resources with per-resource outcomes
  and diagnostics
- **Tiered degradation** — structured plan → raw text fallback → general workflow table,
  depending on available data
- **PR comments** — automatically posts and updates comments on pull requests with
  workspace-based deduplication
- **Status issues** — creates and maintains status issues for non-PR workflows
  (push to main, scheduled runs)
- **Auto-discovery** — automatically identifies init, validate, plan, show-plan, and
  apply steps from the workflow context
- **Budget-aware** — intelligently truncates output to fit within GitHub's 65,536
  character limit while preserving the most important information
- **Zero runtime dependencies** — uses only Node.js built-in modules

## Quick Start

```yaml
name: OpenTofu Plan

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  plan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up OpenTofu
        uses: opentofu/setup-opentofu@v1
        with:
          # The wrapper is disabled because it fails to forward signals properly
          # (opentofu/setup-opentofu#41), interferes with detailed exitcodes
          # (opentofu/setup-opentofu#42), and is generally discouraged when using
          # retailnext/exec-action to run OpenTofu.
          tofu_wrapper: false

      - name: Init
        id: init
        uses: retailnext/exec-action@main
        with:
          command: tofu init -no-color

      - name: Plan
        id: plan
        uses: retailnext/exec-action@main
        with:
          command: tofu plan -no-color -out=tfplan
          success_exit_codes: "0,2"

      - name: Show Plan
        id: show-plan
        uses: retailnext/exec-action@main
        with:
          command: tofu show -json tfplan

      - name: Report
        if: always()
        uses: retailnext/tf-report-action@main
        with:
          steps: ${{ toJSON(steps) }}
          github-token: ${{ github.token }}
```

## Usage Examples

### PR Plan Workflow (Basic)

For the simplest setup without structured plan output:

```yaml
- name: Init
  id: init
  uses: retailnext/exec-action@main
  with:
    command: tofu init -no-color

- name: Plan
  id: plan
  uses: retailnext/exec-action@main
  with:
    command: tofu plan -no-color
    success_exit_codes: "0,2"

- name: Report
  if: always()
  uses: retailnext/tf-report-action@main
  with:
    steps: ${{ toJSON(steps) }}
    github-token: ${{ github.token }}
```

### Show-Plan Pattern for Richest Output

Adding a `show-plan` step that outputs plan JSON enables attribute-level diffs
with inline character highlighting:

```yaml
- name: Plan
  id: plan
  uses: retailnext/exec-action@main
  with:
    command: tofu plan -no-color -out=tfplan
    success_exit_codes: "0,2"

- name: Show Plan
  id: show-plan
  uses: retailnext/exec-action@main
  with:
    command: tofu show -json tfplan

- name: Report
  if: always()
  uses: retailnext/tf-report-action@main
  with:
    steps: ${{ toJSON(steps) }}
    github-token: ${{ github.token }}
```

### Apply with Environment Protection

```yaml
name: Apply

on:
  push:
    branches: [main]

permissions:
  contents: read
  issues: write

jobs:
  apply:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Set up OpenTofu
        uses: opentofu/setup-opentofu@v1
        with:
          tofu_wrapper: false

      - name: Init
        id: init
        uses: retailnext/exec-action@main
        with:
          command: tofu init -no-color

      - name: Apply
        id: apply
        uses: retailnext/exec-action@main
        with:
          command: tofu apply -auto-approve -no-color -json

      - name: Report
        if: always()
        uses: retailnext/tf-report-action@main
        with:
          steps: ${{ toJSON(steps) }}
          workspace: production
          github-token: ${{ github.token }}
```

### Status Issues on Main Branch Pushes

When triggered outside a PR context, the action creates or updates a status
issue instead of posting a PR comment:

```yaml
name: Deploy

on:
  push:
    branches: [main]

permissions:
  contents: read
  issues: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      # ... init, plan, apply steps ...

      - name: Report
        if: always()
        uses: retailnext/tf-report-action@main
        with:
          steps: ${{ toJSON(steps) }}
          workspace: production
          github-token: ${{ github.token }}
```

The action searches for an existing issue with the matching workspace marker
and updates it. If none exists, it creates a new one with the title
``:bar_chart: `production` Status``.

### Multiple Workspaces in a Single Job

Use the `workspace` input to distinguish reports when running multiple
workspaces in the same job:

```yaml
- name: Plan Staging
  id: plan-staging
  uses: retailnext/exec-action@main
  with:
    command: tofu plan -no-color -var-file=staging.tfvars

- name: Report Staging
  if: always()
  uses: retailnext/tf-report-action@main
  with:
    steps: ${{ toJSON(steps) }}
    workspace: staging
    github-token: ${{ github.token }}

- name: Plan Production
  id: plan-production
  uses: retailnext/exec-action@main
  with:
    command: tofu plan -no-color -var-file=production.tfvars

- name: Report Production
  if: always()
  uses: retailnext/tf-report-action@main
  with:
    steps: ${{ toJSON(steps) }}
    workspace: production
    github-token: ${{ github.token }}
```

Each workspace gets its own comment, identified by a unique deduplication
marker.

### Custom Step IDs

If your workflow uses non-default step IDs, override them:

```yaml
- name: Initialize
  id: tf-init
  uses: retailnext/exec-action@main
  with:
    command: tofu init -no-color

- name: Create Plan
  id: tf-plan
  uses: retailnext/exec-action@main
  with:
    command: tofu plan -no-color
    success_exit_codes: "0,2"

- name: Report
  if: always()
  uses: retailnext/tf-report-action@main
  with:
    steps: ${{ toJSON(steps) }}
    github-token: ${{ github.token }}
    init-step: tf-init
    plan-step: tf-plan
```

### Target Step for Non-IaC Use Cases

The `target-step` input focuses the report on a specific step. When specified,
the report treats that step being skipped or failing as a serious error that
is prominently reported:

```yaml
- name: Database Migration
  id: migrate
  uses: retailnext/exec-action@main
  with:
    command: npm run migrate

- name: Report
  if: always()
  uses: retailnext/tf-report-action@main
  with:
    steps: ${{ toJSON(steps) }}
    target-step: migrate
    github-token: ${{ github.token }}
```

## Inputs

| Input            | Required | Default                      | Description                                                                    |
| ---------------- | -------- | ---------------------------- | ------------------------------------------------------------------------------ |
| `steps`          | Yes      | —                            | JSON string of workflow steps (use `${{ toJSON(steps) }}`)                     |
| `workspace`      | No       | `GITHUB_WORKFLOW/GITHUB_JOB` | Workspace name for comment title, status issue title, and deduplication marker |
| `target-step`    | No       | —                            | Step ID to focus the report on; skipped/failed status is prominently reported  |
| `github-token`   | Yes      | —                            | GitHub token for API calls                                                     |
| `init-step`      | No       | `init`                       | Step ID for the init step                                                      |
| `validate-step`  | No       | `validate`                   | Step ID for the validate step                                                  |
| `plan-step`      | No       | `plan`                       | Step ID for the plan step                                                      |
| `show-plan-step` | No       | `show-plan`                  | Step ID for the show-plan step                                                 |
| `apply-step`     | No       | `apply`                      | Step ID for the apply step                                                     |

## How It Works

### Auto-Discovery

The action automatically identifies IaC workflow steps by their step IDs. It
looks for steps matching the configured step IDs (defaulting to `init`,
`validate`, `plan`, `show-plan`, and `apply`) and determines which operations
were performed.

### Tiered Degradation

The report quality depends on what data is available:

1. **Tier 1 — Structured report**: When a `show-plan` step provides plan JSON,
   the action renders a full report with attribute-level diffs, module grouping,
   and inline character highlighting.
2. **Tier 3 — Raw text fallback**: When no show-plan JSON is available but plan
   or apply steps ran, the action formats their raw output with JSON Lines
   parsing where possible.
3. **Tier 4 — Workflow table**: When no recognized IaC steps are found, the
   action renders a general workflow step status table.

### Comment Lifecycle

Each report includes an HTML comment marker for deduplication:

```html
<!-- tf-report-action:"WORKSPACE_NAME" -->
```

- **PR context**: Old comments with the same workspace marker are deleted before
  posting the new one, ensuring the latest status appears at the bottom of the
  conversation.
- **Non-PR context**: The action searches for an existing issue with the marker
  and updates it, or creates a new one if none exists.

Only bot-authored comments are deleted — human comments are never touched, even
if they contain the marker text.

## Permissions

| Context                   | Required Permission                             |
| ------------------------- | ----------------------------------------------- |
| Pull request              | `pull-requests: write`                          |
| Non-PR (status issues)    | `issues: write`                                 |
| Both PR and push triggers | Both `pull-requests: write` and `issues: write` |

The `contents: read` permission is always needed to check out the repository.

## Size Limits

GitHub enforces a 65,536 character limit on comment and issue bodies. The action
automatically manages this budget:

- The rendering engine uses a compositor that progressively degrades sections
  (full → compact → omit) to fit within the limit
- The footer (logs link, timestamp) is reserved from the budget before rendering
- A 512-character safety margin prevents edge cases from exceeding the limit

## Development

```bash
# Install dependencies
npm ci

# Run all linters
npm run lint

# Type check
npm run typecheck

# Run tests
npm run test

# Run tests with coverage
npm run test:coverage:ci

# Run integration tests with coverage
npm run test:integration:coverage

# Bundle for distribution
npm run bundle

# Format code
npm run format

# Full CI pipeline
npm run ci
```

## Attribution

Output format inspired by [tfplan2md](https://github.com/oocx/tfplan2md) by
oocx, used under the MIT License.

## License

MIT
