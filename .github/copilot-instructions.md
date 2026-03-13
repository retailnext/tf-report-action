# tf-plan-md — Copilot Instructions

## Project Purpose

`tf-plan-md` is a TypeScript library that converts Terraform/OpenTofu plan and apply
outputs into GitHub-comment-ready markdown strings. It is **not** a GitHub Action; it
will be incorporated into one separately.

It provides two main entry points:
- `planToMarkdown(json, options?)` — converts plan JSON (from `show -json <planfile>`)
  into a plan report
- `applyToMarkdown(planJson, applyJsonl, options?)` — converts plan JSON plus apply
  JSONL (from `apply -json`) into an apply report showing only actually-changed resources

---

## Module Boundaries

The source is organized into modules with narrow, single-responsibility scopes.
Follow these boundaries strictly — do not add cross-cutting logic.

| Module | Responsibility |
|---|---|
| `src/tfjson/` | Type definitions for the plan JSON wire format and machine-readable UI log format. **Never modify** files copied from tfplanjson; new type files may be added. |
| `src/parser/` | Parse raw input strings → typed objects. Plan JSON, UI log JSONL, validate output. Version validation only. |
| `src/flattener/` | Flatten nested `JsonValue` → `Map<string, string \| null>` with dotted-path keys. |
| `src/sensitivity/` | Detect whether a flattened attribute path is sensitive. Pure predicate. |
| `src/diff/` | Pure LCS, line-diff, and char-diff algorithms. No markdown, no I/O. |
| `src/model/` | Shared TypeScript interfaces consumed by `builder/` and `renderer/`. **No logic.** |
| `src/builder/` | Translate `Plan` → `Report` model (plan builder), or `Plan` + `UIMessage[]` → `Report` (apply builder). Uses `flattener/`, `sensitivity/`, `tfjson/`. |
| `src/renderer/` | Translate `Report` → markdown string. Auto-detects plan vs apply reports. Uses `model/`, `diff/`, and `template/`. |
| `src/template/` | Select and apply rendering templates. Used by `renderer/`. |
| `src/steps/` | GitHub Actions steps context parsing, validation, and secure file reading. Zero internal project dependencies — only Node.js built-ins. This is the I/O boundary between the external world and the pure transformation pipeline. |
| `src/compositor/` | Budget-aware section assembly. Composes markdown sections within an output size limit, progressively degrading from full → compact → omit. Zero internal project dependencies (strings only). |
| `src/index.ts` | Public API: `planToMarkdown(json, options?)`, `applyToMarkdown(planJson, applyJsonl, options?)`, and `reportFromSteps(stepsJson, options?)`. Orchestrates parser → builder → renderer; for `reportFromSteps`, also orchestrates steps/ and compositor/. |

**Dependency rules:**
- `diff/`, `sensitivity/`, and `flattener/` have zero internal project dependencies.
- `model/` has zero internal project dependencies.
- `steps/` has zero internal project dependencies (Node.js built-ins only).
- `compositor/` has zero internal project dependencies (strings only).
- `builder/` may import from `tfjson/`, `flattener/`, `sensitivity/`, and `model/`. Nothing else.
- `builder/apply.ts` additionally imports `buildReport` from `builder/index.ts` (internal to builder module) and `UIMessage` types from `tfjson/`. It must NOT be re-exported from the builder barrel to avoid circular dependencies.
- `renderer/` may import from `model/`, `diff/`, and `template/`. Nothing else.
- `index.ts` may import from `parser/`, `builder/`, `builder/apply`, `renderer/`, `steps/`, and `compositor/`. Nothing else.
- `report-from-steps.ts` may import from `parser/`, `builder/`, `builder/apply`, `renderer/`, `steps/`, `compositor/`, and `model/`. Nothing else.

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

## Data Source Exclusion

Data sources are **never** shown in plan or apply output. They are excluded by
`shouldSkip()` in `src/builder/resources.ts` which filters out all resources with
`mode === "data"`. Errors and warnings relating to data sources surface through the
diagnostics section of apply reports only.

## File Reading Safety

The `src/steps/reader.ts` module enforces security constraints when reading files
referenced by exec-action step outputs:

- **Allowed directories** — files must reside directly within an allowed directory
  (no subdirectory traversal). Default: `RUNNER_TEMP` or the OS temp directory.
- **Regular files only** — rejects symlinks-to-non-regular-files, devices, FIFOs,
  sockets, and directories.
- **Two read strategies**: parse reads (full file, bounded by `maxFileSize` = 256 MiB)
  and display reads (first `maxDisplayRead` = 64 KiB bytes only).
- **Error messages** must never contain file paths (may reveal runner directory structure).

## Steps Context

The `reportFromSteps(stepsJson, options?)` entry point accepts a JSON-encoded GitHub
Actions steps context and produces a report. It **never throws** — all errors become
markdown content. Output is bounded by `maxOutputLength` (default 63 KiB).

**`ReportOptions`** extends `Options` with: `allowedDirs`, `maxOutputLength`, `workspace`,
`env` (DI for `process.env`), and step ID overrides (`initStep`, `validateStep`,
`planStep`, `showPlanStep`, `applyStep`).

**Tiered degradation**:
- **Tier 1**: show-plan JSON available → full structured report
- **Tier 3**: No show-plan, but plan/apply step present → raw text fallback
- **Tier 4**: No recognized terraform steps → general workflow table

**Dynamic title generation**: Title includes status icon, optional workspace prefix,
operation label, and change counts. Determined automatically from report content.

**Workspace marker**: When `workspace` is set, the first line of output is
`<!-- tf-report-action:"WORKSPACE" -->` for comment deduplication.

**Logs URL**: Auto-derived from `GITHUB_REPOSITORY`, `GITHUB_RUN_ID`, and
`GITHUB_RUN_ATTEMPT` environment variables via the `env` DI option.

## Emoji / Symbol Uniqueness

**No emoji or symbol may be used to mean two different things.** Every visual indicator
in the rendered output must be unambiguous. This is enforced by the tests in
`tests/unit/model/emoji-uniqueness.test.ts`.

All emojis and symbols used in the output **must** be defined in one of two constant
sources so the governance tests can check them:

- **Action symbols**: `ACTION_SYMBOLS` in `src/model/plan-action.ts`
- **All other icons**: named exports in `src/model/status-icons.ts`

A **source lint test** scans every `.ts` file under `src/` (excluding the two table
files above) for hardcoded emoji (`\p{Extended_Pictographic}`) and non-ASCII math
symbols (`\p{Sm}`). Comments are stripped before scanning, so documentation may use
arrows (`→`) or similar, but code and string literals must import from the constants.

When adding a new emoji or changing an existing one, update the appropriate constant
source. Do not hardcode emoji or math-symbol literals in renderer code — always import
from the constant sources above.

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
  and apply JSONL files generated from fixture Terraform workspaces.
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
- Every apply JSONL loaded in `tests/integration/` must come from
  `tests/fixtures/generated/<tool>/<workspace>/<N>/apply.jsonl`.
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
browser-viewable HTML page. It calls `planToMarkdown()` (or `applyToMarkdown()` when
`--apply` is provided), writes the result to `/tmp/tf-plan-preview.html` (using
**marked** and **DOMPurify** from jsDelivr CDN), and opens the file in the default browser.

```bash
# Render a fixture plan
npm run render -- tests/fixtures/generated/terraform/null-lifecycle/2/plan.json

# Render an apply report (plan + apply output)
npm run render -- plan.json --apply apply.jsonl --title "PR #42"

# With options
npm run render -- plan.json --title "PR #42" --template summary
npm run render -- plan.json --show-unchanged --diff-format simple

# From stdin
cat plan.json | npm run render --
```

**Supported flags** (each maps 1:1 to an `Options` field or a render-script behaviour):

| Flag | `Options` field / behaviour | Default |
|---|---|---|
| `--apply <file>` | Reads apply JSON Lines; calls `applyToMarkdown` instead of `planToMarkdown` | _(plan-only mode)_ |
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
