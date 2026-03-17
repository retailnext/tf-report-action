# `tf-report-action`

Reports OpenTofu/Terraform workflow status as PR comments or status issues with
rich plan and apply detail.

## Features

- **Rich plan diffs** — attribute-level changes with inline character diffs, grouped
  by module
- **Apply reports** — shows only actually-changed resources with per-resource outcomes
  and diagnostics
- **Progressive enrichment** — structured plan → raw text fallback → general workflow
  table, progressively enriched with whatever data is available
- **PR comments** — automatically posts and updates comments on pull requests with
  workspace-based deduplication
- **Status issues** — creates and maintains status issues for non-PR workflows
  (push to main, scheduled runs)
- **Auto-discovery** — automatically identifies init, validate, plan, show-plan, and
  apply steps from the workflow context
- **Limit-aware** — intelligently truncates output to fit within GitHub's 65,536
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
          tofu_wrapper: false

      - name: Init
        id: init
        uses: retailnext/exec-action@main
        with:
          command: tofu init -no-color

      - name: Validate
        id: validate
        uses: retailnext/exec-action@main
        with:
          command: tofu validate -json -no-color

      - name: Plan
        id: plan
        uses: retailnext/exec-action@main
        with:
          command: tofu plan -no-color -json -detailed-exitcode -out=tfplan
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

### Comprehensive Workflow (PR Plan + Merge Apply)

A single workflow that plans on pull requests and applies on merge to main.
All steps use `-json` where available for the richest output. The `workspace`
input identifies the report for deduplication.

On PRs, the action posts a comment with the plan. On push to main, it creates
or updates a status issue with the apply result.

<!-- textlint-disable terminology -->

```yaml
name: Infrastructure

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  pull-requests: write
  issues: write

jobs:
  deploy:
    runs-on: ubuntu-latest
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

      - name: Validate
        id: validate
        uses: retailnext/exec-action@main
        with:
          command: tofu validate -json -no-color

      - name: Plan
        id: plan
        uses: retailnext/exec-action@main
        with:
          command: tofu plan -no-color -json -detailed-exitcode -out=tfplan
          success_exit_codes: "0,2"

      - name: Show Plan
        id: show-plan
        uses: retailnext/exec-action@main
        with:
          command: tofu show -json tfplan

      - name: Apply
        id: apply
        if: github.event_name == 'push'
        uses: retailnext/exec-action@main
        with:
          command: tofu apply -auto-approve -json tfplan

      - name: Report
        if: always()
        uses: retailnext/tf-report-action@main
        with:
          steps: ${{ toJSON(steps) }}
          workspace: production
          github-token: ${{ github.token }}
```

<!-- textlint-enable terminology -->

### Multiple Workspaces via Matrix

When managing multiple workspaces from the same repository, use a matrix to run
each workspace in its own working directory. Each workspace gets a separate PR
comment, identified by its deduplication marker.

<!-- textlint-disable terminology -->

```yaml
name: Infrastructure

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  plan:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        workspace:
          - name: staging
            directory: envs/staging
          - name: production
            directory: envs/production
    defaults:
      run:
        working-directory: ${{ matrix.workspace.directory }}
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
          working_directory: ${{ matrix.workspace.directory }}

      - name: Plan
        id: plan
        uses: retailnext/exec-action@main
        with:
          command: tofu plan -no-color -json -detailed-exitcode -out=tfplan
          success_exit_codes: "0,2"
          working_directory: ${{ matrix.workspace.directory }}

      - name: Show Plan
        id: show-plan
        uses: retailnext/exec-action@main
        with:
          command: tofu show -json tfplan
          working_directory: ${{ matrix.workspace.directory }}

      - name: Report
        if: always()
        uses: retailnext/tf-report-action@main
        with:
          steps: ${{ toJSON(steps) }}
          workspace: ${{ matrix.workspace.name }}
          github-token: ${{ github.token }}
```

<!-- textlint-enable terminology -->

### Reporting Non-IaC Workflows with `target-step`

The action can report on any workflow, not just Terraform/OpenTofu. The
`target-step` input focuses the report on a specific step — if that step is
skipped or fails, the report prominently surfaces the failure.

When no recognized IaC steps are found, the action renders a general workflow
step status table showing each step's outcome, exit code, and duration.

```yaml
name: Database Migration

on:
  push:
    branches: [main]

permissions:
  contents: read
  issues: write

jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Migrations
        id: migrate
        uses: retailnext/exec-action@main
        with:
          command: npm run db:migrate

      - name: Verify Schema
        id: verify
        uses: retailnext/exec-action@main
        with:
          command: npm run db:verify

      - name: Report
        if: always()
        uses: retailnext/tf-report-action@main
        with:
          steps: ${{ toJSON(steps) }}
          target-step: migrate
          workspace: db-migrations
          github-token: ${{ github.token }}
```

## Inputs

| Input            | Required | Default                      | Description                                                                    |
| ---------------- | -------- | ---------------------------- | ------------------------------------------------------------------------------ |
| `steps`          | Yes      | —                            | JSON string of workflow steps (use `${{ toJSON(steps) }}`)                     |
| `workspace`      | No       | `GITHUB_WORKFLOW/GITHUB_JOB` | Workspace name for comment title, status issue title, and deduplication marker |
| `target-step`    | No       | —                            | Step ID to focus the report on; skipped/failed status is prominently reported  |
| `github-token`   | Yes      | —                            | GitHub token for API calls                                                     |
| `init-step`      | No       | `init`                       | Step ID for the init step (override when your workflow uses non-default IDs)   |
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

### Progressive Enrichment

The action progressively enriches the report with whatever data is available:

1. **Tier 1 — Structured report**: When a `show-plan` step provides plan JSON,
   the action renders a full report with attribute-level diffs, module grouping,
   and inline character highlighting. Adding `-json` to plan and apply steps
   further enriches the report with diagnostics, drift detection, and
   per-resource apply outcomes.
2. **Tier 3 — Raw text fallback**: When no show-plan JSON is available but plan
   or apply steps ran, the action formats their raw output with JSON Lines
   parsing where possible.
3. **Tier 4 — Workflow table**: When no recognized IaC steps are found, the
   action renders a general workflow step status table. This is the mode used
   when reporting non-IaC workflows via `target-step`.

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
automatically manages output within this limit:

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
