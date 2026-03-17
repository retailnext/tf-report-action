---
name: render
description: Render a steps.json fixture to markdown output for inspection. Use this when asked to preview, render, or inspect the markdown output for a fixture or steps.json file.
---

# Rendering Steps JSON to Markdown

Use the `render` npm script to convert a steps.json file into Markdown output.

## Render to stdout

```bash
npm -s run render -- <steps.json> --format markdown --no-open --output -
```

- `-s` suppresses npm lifecycle noise so only the Markdown appears on stdout.
- `--format markdown` produces raw Markdown (default is HTML).
- `--no-open` prevents opening a browser.
- `--output -` writes to stdout.

## Render to a file

```bash
npm -s run render -- <steps.json> --format markdown --no-open --output <output-file>
```

## Common fixture paths

Steps JSON files live under `tests/fixtures/generated/<tool>/<workspace>/<stage>/`.
Each stage directory contains several step variants:

| File                       | Description                                           |
| -------------------------- | ----------------------------------------------------- |
| `steps.json`               | Full pipeline (init → validate → plan → show → apply) |
| `plan-steps.json`          | Plan-only (no apply step)                             |
| `no-show-steps.json`       | No show-plan (forces Tier 3 fallback)                 |
| `apply-no-show-steps.json` | Apply present but no structured plan                  |
| `apply-only-steps.json`    | Only init/validate/apply (no plan or show-plan)       |

## Example

```bash
npm -s run render -- tests/fixtures/generated/terraform/null-lifecycle/2/steps.json --format markdown --no-open --output -
```

## Additional options

| Flag                             | Description                               |
| -------------------------------- | ----------------------------------------- |
| `--title <text>`                 | Heading title for the report              |
| `--show-unchanged`               | Show unchanged resource attributes        |
| `--diff-format <inline\|simple>` | Diff format                               |
| `--workspace <name>`             | Workspace name for title and dedup marker |

Run `npm -s run render -- --help` for the full list.
