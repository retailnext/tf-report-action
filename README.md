# tf-plan-md

A TypeScript library that converts Terraform and OpenTofu plan/apply outputs
into GitHub-comment-ready markdown. Designed for integration into GitHub Actions.

## Features

- **Plan reports** — structured plan JSON → markdown with resource details,
  attribute diffs, and change summaries
- **Apply reports** — plan JSON + apply JSONL → markdown showing only
  actually-changed resources, with error diagnostics and per-resource outcomes
- **Steps-based reports** — GitHub Actions steps context → tiered report with
  graceful degradation when structured output is unavailable
- **Inline diffs** — character-level change highlighting in attribute tables
- **Sensitive value masking** — sensitive attributes always displayed as
  `(sensitive)` with no bypass option
- **Collapsible resource details** — resources grouped by module with expandable
  attribute tables
- **Action classification** — create, update, delete, replace, move, import, and
  forget actions with distinct icons and summary counts
- **Template support** — default (full report) and summary-only templates
- **Size-bounded output** — budget-aware section assembly that progressively
  degrades within a configurable character limit
- **Works with both Terraform and OpenTofu** — tool-agnostic output that never
  assumes which tool was used

## Installation

```bash
npm install tf-plan-md
```

Requires Node.js 24 or later.

## Usage

### Plan report

```typescript
import { planToMarkdown } from "tf-plan-md";

// json = output of `terraform show -json <planfile>` or `tofu show -json <planfile>`
const markdown = planToMarkdown(json);
```

### Apply report

```typescript
import { applyToMarkdown } from "tf-plan-md";

// planJson = output of `terraform show -json <planfile>`
// applyJsonl = output of `terraform apply -json` (JSON Lines)
const markdown = applyToMarkdown(planJson, applyJsonl);
```

### Steps-based report (GitHub Actions)

```typescript
import { reportFromSteps } from "tf-plan-md";

// stepsJson = JSON.stringify(steps) from GitHub Actions steps context
const markdown = reportFromSteps(stepsJson, {
  workspace: "production",
  env: process.env,
});
```

### Options

All entry points accept an optional `Options` object:

| Option | Type | Default | Description |
|---|---|---|---|
| `title` | `string` | _(none)_ | Display title for the report |
| `template` | `"default" \| "summary"` | `"default"` | Output template |
| `showUnchangedAttributes` | `boolean` | `false` | Include unchanged attributes in resource details |
| `diffFormat` | `"inline" \| "simple"` | `"inline"` | Diff style for attribute changes |

`reportFromSteps` additionally accepts `ReportOptions`:

| Option | Type | Default | Description |
|---|---|---|---|
| `workspace` | `string` | _(none)_ | Workspace name for title and dedup marker |
| `allowedDirs` | `string[]` | `[RUNNER_TEMP]` | Allowed directories for file reading |
| `maxOutputLength` | `number` | `65000` | Maximum output length in characters |
| `env` | `Record<string, string>` | `process.env` | Environment variables (DI for testing) |

## Development

### Prerequisites

- Node.js 24+
- Terraform and OpenTofu (for fixture generation)

### Commands

```bash
npm run lint              # ESLint
npm run typecheck         # TypeScript type checking
npm run test              # Run all tests
npm run test:coverage     # Run tests with coverage thresholds
npm run render -- <file>  # Render a plan to HTML preview
npm run gallery           # Render all fixtures into a navigable gallery
```

### Fixture gallery

The gallery renders every fixture into a single HTML page with keyboard
navigation, text filtering, and a copy-to-clipboard button:

```bash
npm run gallery -- --no-open
# Open /tmp/tf-plan-gallery.html in your browser
```

## License

MIT
