# tf-plan-md — Copilot Instructions

## Project Purpose

`tf-plan-md` is a TypeScript library that converts a Terraform/OpenTofu plan JSON
string (the output of `terraform show -json <planfile>` or `tofu show -json <planfile>`)
into a GitHub-comment-ready markdown string. It is **not** a GitHub Action; it will
be incorporated into one separately.

---

## Module Boundaries

The source is organized into modules with narrow, single-responsibility scopes.
Follow these boundaries strictly — do not add cross-cutting logic.

| Module | Responsibility |
|---|---|
| `src/tfjson/` | Copied type definitions for the plan JSON wire format. **Never modify.** |
| `src/parser/` | Parse a raw JSON string → typed `Plan`. Version validation only. |
| `src/flattener/` | Flatten nested `JsonValue` → `Map<string, string \| null>` with dotted-path keys. |
| `src/sensitivity/` | Detect whether a flattened attribute path is sensitive. Pure predicate. |
| `src/diff/` | Pure LCS, line-diff, and char-diff algorithms. No markdown, no I/O. |
| `src/model/` | Shared TypeScript interfaces consumed by `builder/` and `renderer/`. **No logic.** |
| `src/builder/` | Translate `Plan` → `Report` model. Uses `flattener/`, `sensitivity/`, `tfjson/`. |
| `src/renderer/` | Translate `Report` → markdown string. Uses `model/` and `diff/`. |
| `src/template/` | Select and apply rendering templates. Used by `renderer/`. |
| `src/index.ts` | Public API: `planToMarkdown(json, options?)`. Orchestrates parser → builder → renderer. |

**Dependency rules:**
- `diff/`, `sensitivity/`, and `flattener/` have zero internal project dependencies.
- `model/` has zero internal project dependencies.
- `builder/` may import from `tfjson/`, `flattener/`, `sensitivity/`, and `model/`. Nothing else.
- `renderer/` may import from `model/`, `diff/`, and `template/`. Nothing else.
- `index.ts` may import from `parser/`, `builder/`, and `renderer/`. Nothing else.

---

## Coding Conventions

- **ESM throughout**: `"type": "module"` in package.json. All relative imports use
  explicit `.js` extensions (e.g. `import { foo } from "./foo.js"`). No `require()`,
  no `__dirname`.
- **TypeScript strict mode**: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride` are all enabled. Do not use `any` or type assertions unless
  absolutely necessary and documented with a comment.
- **Pure functions**: prefer pure, side-effect-free functions. Every module in `diff/`,
  `sensitivity/`, and `flattener/` must be fully side-effect-free.
- **JSDoc on exported symbols**: every exported function, class, and interface must
  have a JSDoc comment explaining *why* it exists, not just what it does.
- **No unnecessary comments**: do not write comments that simply restate the code.
- **Error handling**: use descriptive `Error` messages with enough context to diagnose
  the problem (e.g. include the invalid value and what was expected).

---

## Attribution Policy

This project's output style is inspired by [tfplan2md](https://github.com/oocx/tfplan2md)
by oocx, used under the MIT License.

Any file whose logic is substantially derived from tfplan2md must include the following
header comment (after the licence header if present):

```ts
// Portions of this file are derived from tfplan2md by oocx
// (https://github.com/oocx/tfplan2md), used under the MIT License.
```

Modules most likely to need this: `src/flattener/`, `src/sensitivity/`, `src/diff/`,
`src/renderer/large-value.ts`, `src/renderer/diff-format.ts`, `src/renderer/writer.ts`,
`src/renderer/resource.ts`, `src/renderer/summary.ts`, `src/builder/attributes.ts`.

---

## Sensitive Values

Sensitive attribute values are **always masked** as `(sensitive)`. There is no option
to reveal them. This is a security invariant — do not add any bypass.

## Error Messages

Error messages must **never** contain plan attribute values or any data derived from
them, because attribute values may be sensitive. This means:

- When catching a `JSON.parse` error, **discard** the underlying `SyntaxError` and
  throw a new generic message. Node.js 20+ embeds a snippet of the raw input in
  `SyntaxError` messages, which would expose plan contents.
- Do not interpolate `before`, `after`, or any flattened attribute map entries into
  error strings.
- Structural metadata (format version, field names, template names) is safe to include
  in errors.

---

## Testing

- Every module with executable code must have a corresponding test file under `tests/unit/`.
- Integration tests live under `tests/integration/` and are driven by real plan JSON
  files generated from fixture Terraform workspaces.
- Coverage thresholds: 90% lines/functions/statements, 85% branches.
- Run `npm run test:coverage` locally; CI runs `npm run test:coverage:ci`.
- **After adding or modifying any source code, run `npm run test:coverage` and verify
  that coverage thresholds are still met.** If new code causes coverage to drop below
  thresholds, add unit tests until thresholds are satisfied before committing.
- Use the `/add-fixture-workspace` skill to add fixture workspaces.
- Use the `/generate-fixtures` skill to regenerate fixture JSON files.

### Integration Test Rule (non-negotiable)

**`tests/integration/` may only use inputs that were generated by actually running
`terraform` or `tofu` against a fixture workspace under `tests/fixtures/`.**

- Every plan JSON loaded in `tests/integration/` must come from
  `tests/fixtures/generated/<tool>/<workspace>/<N>/plan.json`.
- No inline-constructed plan objects are permitted in `tests/integration/`.
- No manually-crafted JSON strings are permitted in `tests/integration/`.
- Error-path tests (invalid JSON, unsupported format version, etc.) belong in
  `tests/unit/`, not `tests/integration/`.
- The integration-only coverage report (`npm run test:integration:coverage`) must
  independently meet the same thresholds as the full suite.

**Code review instructions:** When reviewing any change to files under
`tests/integration/`, flag as a blocking issue if:
- Any test constructs a plan JSON object or string inline (e.g. `{ format_version: "1.0", ... }`,
  `JSON.stringify({...})`, template literals containing plan-like JSON).
- Any test imports or uses a helper that returns a hardcoded plan object.
- Any `plan.json` file under `tests/integration/` is not a symlink or copy of a file
  from `tests/fixtures/generated/`.
- Any plan JSON is loaded from a path outside `tests/fixtures/generated/`.

The only permitted pattern for obtaining plan input in `tests/integration/` is
reading a file from `tests/fixtures/generated/<tool>/<workspace>/<N>/plan.json`.

---

## Development Tools

### `scripts/render-plan.ts` — local HTML preview

`scripts/render-plan.ts` is a developer tool that renders a plan JSON file to a
browser-viewable HTML page. It calls `planToMarkdown()`, writes the result to
`/tmp/tf-plan-preview.html` (using **marked** and **DOMPurify** from jsDelivr CDN),
and opens the file in the default browser.

```bash
# Render a fixture plan
npm run render -- tests/fixtures/generated/terraform/null-lifecycle/2/plan.json

# With options
npm run render -- plan.json --title "PR #42" --template summary
npm run render -- plan.json --show-unchanged --diff-format simple

# From stdin
cat plan.json | npm run render --
```

**Supported flags** (each maps 1:1 to an `Options` field or a render-script behaviour):

| Flag | `Options` field / behaviour | Default |
|---|---|---|
| `--title <text>` | `title` | _(none)_ |
| `--template <default\|summary>` | `template` | `"default"` |
| `--show-unchanged` | `showUnchangedAttributes` | `false` |
| `--diff-format <inline\|simple>` | `diffFormat` | `"inline"` |
| `--no-open` | Suppress browser opening (write HTML only) | _(browser opens by default)_ |

**Maintenance rule:** When `Options` (defined across `src/renderer/options.ts` and
`src/builder/options.ts`) gains, loses, or renames a field, update `parseArgs()` in
`scripts/render-plan.ts` to keep the CLI flags in sync. The flag table above must
also be kept current.

**Agent constraint — browser opening is forbidden:** Agents must **never** run any
command that causes the user's browser to open. This includes:
- `npm run render` (without `--no-open`) — always pass `--no-open` when running this script
- Any shell command invoking `open`, `xdg-open`, or `start` with a file or URL
- Any other script or tool that has a side effect of opening a browser window

When running `npm run render` as part of any task, always append `--no-open`:
```bash
npm run render -- plan.json --no-open
```
