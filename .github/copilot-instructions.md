# tf-report-action — Copilot Instructions

## Project Purpose

`tf-report-action` is a GitHub Action that posts OpenTofu/Terraform workflow reports
as PR comments or status issues. It converts plan and apply outputs into rich Markdown
with attribute-level diffs, module grouping, and tiered degradation.

The rendering engine provides three internal pipeline functions (in `src/pipelines/`):

- `planToMarkdown(json, options?)` — converts plan JSON (from `show -json <planfile>`)
  into a plan report
- `applyToMarkdown(planJson, applyJsonl, options?)` — converts plan JSON plus apply
  JSONL (from `apply -json`) into an apply report showing only actually-changed
  resources. When `options.stateJson` is provided, resolves unknown attribute values
  from post-apply state.
- `reportFromSteps(stepsJson, options?)` — accepts a GitHub Actions steps context JSON
  and produces a report with tiered degradation (structured plan → raw text → general
  workflow table)

The action entry point (`src/action/main.ts`) orchestrates input parsing, calls
`reportFromSteps()`, and posts the result via the GitHub API.

---

## Session Bootstrap (mandatory first action)

Before **any** other work — including planning, investigation, reading files, or
delegating to sub-agents — you must verify the Node.js version:

1. Read `.node-version` to determine the required major version.
2. Run `node --version` and compare.
3. If the major version does not match, **find and activate the correct version**
   before doing anything else. Search common locations and version managers:
   - Homebrew: `/opt/homebrew/opt/node@<major>/bin/` or `/usr/local/opt/node@<major>/bin/`
   - Version managers: `nvm`, `fnm`, `volta`, `mise`, `asdf`
   - Other: `which -a node`, `ls /usr/local/bin/node*`

   Once found, fix PATH in your shell session and re-verify with `node --version`.

4. **Do not** run any `npm`, `node`, or `npx` command until verification succeeds.
5. **Do not** delegate to any sub-agent (explore, task, general-purpose) that might
   run `node`/`npm`/`npx` until verification succeeds. When delegating after
   verification, include the PATH export command in the sub-agent prompt so it
   uses the same version.

This is a **blocking prerequisite**. No exceptions. If Node.js at the required major
version cannot be found, stop and tell the user.

---

## Module Boundaries

The source is organized into layered modules with narrow, single-responsibility scopes.
Follow these boundaries strictly — do not add cross-cutting logic.

### Layer 0 — Foundation (zero project dependencies)

| Module        | Responsibility                                                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tfjson/` | Type definitions for the plan JSON wire format and machine-readable UI log format. **Never modify** files copied from tfplanjson; new type files may be added.                        |
| `src/model/`  | Shared TypeScript interfaces and constants: `Report`, `ResourceChange`, `StepIssue`, `StepOutcome`, `Section`, `CompositionResult`, sentinels, status icons. **No executable logic.** |
| `src/env/`    | `Env` type alias (`Record<string, string \| undefined>`). DI abstraction over `process.env`.                                                                                          |
| `src/http/`   | HTTP primitives: `ActionsError`, exponential-backoff retry, proxy detection (matching `@actions/http-client`), `node:http`/`node:https` transport with CONNECT tunneling.             |
| `src/logger/` | `Logger` interface and `actionsLogger()` production implementation. The **only** module permitted to write to `process.stdout`/`process.stderr`.                                      |

### Layer 1 — Pure algorithms (depend only on Layer 0)

| Module               | Responsibility                                                                                                                                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/diff/`          | Pure LCS, line-diff, char-diff, and context-diff algorithms with diff formatting. No I/O.                                                                                                                            |
| `src/flattener/`     | Flatten nested `JsonValue` → `Map<string, string \| null>` with dotted-path keys.                                                                                                                                    |
| `src/sensitivity/`   | Detect whether a flattened attribute path is sensitive. Pure predicate.                                                                                                                                              |
| `src/raw-formatter/` | Format raw command output (JSON Lines, validate results, plain text) into Markdown fragments.                                                                                                                        |
| `src/jsonl-scanner/` | Scan and classify JSON Lines output from Terraform/OpenTofu commands into structured results.                                                                                                                        |
| `src/renderable/`    | Core `Renderable` interface, `OutputFormat` type, `ReportElement`/`ComposedReport` interfaces, primitive renderable classes (Heading, Table, CodeBlock, etc.), and HTML escaping with size estimation. Pure, no I/O. |

### Layer 2 — I/O and parsing (depend on Layers 0–1)

| Module        | Responsibility                                                                                                                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/parser/` | Parse Terraform/OpenTofu formats: plan JSON, state JSON (raw tfstate from `state pull`), apply JSONL, validate output.                                                                               |
| `src/steps/`  | GitHub Actions steps context: parsing, secure file reading, step-data-aware I/O wrappers, outcome helpers. This is the I/O boundary between the external world and the pure transformation pipeline. |
| `src/github/` | GitHub REST API client with DI HTTP transport. Comment CRUD, issue search/create/update, pagination, Markdown rendering. No domain model dependency.                                                 |
| `src/inputs/` | Parse GitHub Actions runtime context into typed data: `INPUT_*` env var parsing and event payload reading. Pure functions taking `Env` or file paths.                                                |

### Layer 3 — Business logic (depend on Layers 0–2)

| Module         | Responsibility                                                                                                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/builder/` | Build `Report` from parsed input. Plan JSON → Report with flat resource arrays and full attribute detail, JSONL → Report with flat resource arrays but no attribute detail, steps context → progressively enriched Report (tier detection, step issue collection, title generation). |

**Builder internal structure:**

The `report-from-steps.ts` orchestrator delegates per-step processing to
dedicated files:

| File                   | Responsibility                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `report-from-steps.ts` | Pipeline orchestrator: phases, sequencing, `ReportOptions`, error/helper functions    |
| `process-helpers.ts`   | Shared helpers (`addScannerWarnings`, `uiDiagnosticToModel`) used by process-\* files |
| `process-validate.ts`  | Validate step: diagnostic extraction, StepIssue on failure                            |
| `process-show-plan.ts` | Show-plan step: parse plan JSON, build structured/apply report, merge fields          |
| `process-plan.ts`      | Plan step: JSONL scanning for resources/diagnostics/drift, raw text fallback          |
| `process-apply.ts`     | Apply step: JSONL scanning for apply statuses/diagnostics, raw text fallback          |
| `state-enrichment.ts`  | State enrichment: resolves unknown attribute values from post-apply state             |

**Dependency rule:** `process-*.ts` files are dependency leaves — they may
import from `process-helpers.ts` and lower-layer modules, but **never from
each other**.

### Layer 4a — Rendering (depends on Layers 0–3)

| Module          | Responsibility                                                                                                                                                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/renderer/` | Render any `Report` variant to Markdown. Groups resources by module address (derived from address + type) for display — module grouping is a renderer concern. StructuredReport → full Markdown string, TextFallbackReport/WorkflowReport/ErrorReport → Section arrays. Title, step issue, step table, and variant-specific body renderers. |
| `src/elements/` | Domain-specific `ReportElement` classes that compose primitive `Renderable` objects (from `renderable/`) into dual-format report sections. Each class holds pre-built renderable trees at multiple detail levels and renders to both Markdown and HTML on demand. Replaces `renderer/` during migration (both coexist temporarily).         |

### Layer 4b — Composition (depends on Layers 0–4a)

| Module         | Responsibility                                                                                                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/compose/` | Budget-aware progressive enhancement assembly. Renders categories at progressive tiers (flat listing → compact → attrs → full diffs) within an output size limit. Notice builders for truncation/logs/artifact. |

### Layer 5 — Pipelines and comment construction

| Module           | Responsibility                                                                                                                                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/pipelines/` | Three end-to-end report generation pipelines: `planToMarkdown` (`plan.ts`), `applyToMarkdown` (`apply.ts`), `reportFromSteps` (`steps.ts`). Each follows parse → build → render (→ compose). No barrel — consumers import from the specific file they need. |
| `src/comment/`   | Comment structure: footer, marker, body assembly. Everything about how the final GitHub comment is constructed that does NOT require GitHub API calls. Pure functions operating on strings and env vars.                                                    |

### Layer 6 — Action (depends on Layers 0–5)

| Module        | Responsibility                                                                                                                                                                                                                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/action/` | Action entry point. **Strictly limited to**: (1) guarded `main()` invocation, (2) `handlePr()`/`handleIssue()` GitHub API orchestration, (3) `run()` top-level wiring of DI dependencies, (4) artifact upload orchestration. All pure logic lives in `src/comment/`, `src/inputs/`, or lower layers. |

**Dependency rules (layered — import only from same or lower layer):**

| Module           | May import from (beyond `model/`)                                                      |
| ---------------- | -------------------------------------------------------------------------------------- |
| `diff/`          | `raw-formatter/` (HTML escaping for diff formatting)                                   |
| `flattener/`     | _(nothing)_                                                                            |
| `sensitivity/`   | _(nothing)_                                                                            |
| `raw-formatter/` | _(nothing)_                                                                            |
| `renderable/`    | _(nothing)_                                                                            |
| `jsonl-scanner/` | `tfjson/`                                                                              |
| `env/`           | _(nothing)_                                                                            |
| `http/`          | `env/`                                                                                 |
| `logger/`        | _(nothing — only module allowed to use process.stdout/stderr)_                         |
| `parser/`        | `tfjson/`                                                                              |
| `steps/`         | `env/`                                                                                 |
| `github/`        | `http/` (types only — transport function is injected)                                  |
| `inputs/`        | `env/`                                                                                 |
| `builder/`       | `tfjson/`, `flattener/`, `sensitivity/`, `steps/`, `env/`, `parser/`, `jsonl-scanner/` |
| `renderer/`      | `diff/`, `raw-formatter/`                                                              |
| `elements/`      | `renderable/`, `diff/`, `flattener/`, `sensitivity/`                                   |
| `compose/`       | `renderer/`, `diff/`                                                                   |
| `comment/`       | `env/`, `compose/`                                                                     |
| `pipelines/`     | `parser/`, `builder/`, `renderer/`, `compose/`, `steps/`, `env/`                       |
| `action/`        | `pipelines/`, `model/`, `github/`, `env/`, `http/`, `logger/`, `inputs/`, `comment/`   |

**Additional constraints:**

- `model/` is universal — every module may import from it.
- `tfjson/` is restricted — only `model/`, `parser/`, `builder/`, and `jsonl-scanner/` may import.
- `builder/apply.ts` must NOT be reexported from the builder barrel (circular dep risk).
- `renderer/` must **not** import sentinel string constants from `model/sentinels.ts` —
  all display logic must use boolean flags (`isSensitive`, `isKnownAfterApply`). This
  is enforced by an ESLint `no-restricted-imports` rule.
- `logger/` is the **only** module permitted to write to `process.stdout`/`process.stderr`.
  This is enforced by both ESLint `no-restricted-syntax` rules and a governance test.

---

## Separation of Concerns

### Colocation Principle

"X is only used by Y" is **INVALID** as a reason for two concerns to be
colocated. Shared consumers and shared pipeline flow are not justifications
for colocation. The **only** valid reason for code to be in the same file or
directory is that it addresses the **same conceptual responsibility**.

**Antipattern example (do not do this):** A function is currently only called
from `src/action/`. The reasoning "it's used by the action, so put it in
`src/action/`" is the exact colocation-by-consumer error this rule prohibits.
`src/action/` has a single stated responsibility (guarded `main()`, GitHub API
orchestration, DI wiring, artifact upload). A function that orchestrates the
parse→build→render→compose pipeline does not belong there — it belongs in
`src/pipelines/`, which has "pipeline orchestration" as its stated
responsibility. Always check the stated responsibility of the target directory
before adding code, and only add code if the new concern matches it exactly.

### Integration-Excluded Code Rule

Directories and files excluded from integration test coverage may **only**
contain code that is **intrinsically impractical** to integration-test:

- Code that requires a live GitHub API connection
- Code that requires an Actions runtime environment (JWT tokens, Twirp
  services, Azure Blob Storage)
- Code that performs direct process I/O (`process.exit`, `process.stderr`)
- The guarded `main()` invocation

**Pure functions, interfaces, business logic, string formatting, and budget
management do NOT belong in integration-excluded files**, even if they are
only called from excluded code today. Extract them to a non-excluded module
so they are exercised by integration tests.

### Single Responsibility Per Module

Each directory under `src/` must have a **single, clearly stated
responsibility** documented in its barrel file (`index.ts`) JSDoc.

Symptoms of mixed concerns (any of these is a blocking code review issue):

- A file imports from 5+ different modules across multiple layers
- A directory contains both pure algorithms AND I/O code
- A "helpers" file accumulates unrelated utility functions
- A module at layer N imports from layer N+1 or higher

When a file grows past 150 lines, ask: does it have multiple concerns that
should be separate files? Growth alone is not a problem (security-critical
code like `steps/reader.ts` is correctly large), but growth from accumulating
unrelated responsibilities is.

### Dead Code and Internal Stability

- **Dead code removal**: All plans must include removal of dead code.
  Superseded modules, deprecated aliases, and unused functions must be
  deleted, not left behind. This is non-negotiable.
- **No internal API stability**: This is **NOT** a library. The stability
  of internal interfaces (types, function signatures, module boundaries)
  is **NEVER** important. Only the action's inputs/behavior and the CLI
  scripts (`scripts/render.ts`) are stable surfaces.
  It is **ALWAYS WRONG** to treat any internal interface as important or to
  use backwards compatibility as a reason to preserve dead code, deprecated
  aliases, or suboptimal designs.
- **No exports from `src/` root files**: Root-level files directly under `src/`
  (i.e., `src/*.ts`) must contain **no `export` statements**. There is no
  library API. The bundle entry point is `src/action/main.ts` (via esbuild).
  All shared code lives in named modules (`src/<module>/`). Callers import
  directly from the module that owns the code — never from a root-level
  convenience hub. This is enforced by a governance test
  (`tests/unit/governance/no-src-root-exports.test.ts`).

### New Module Checklist

Before creating a new module directory, verify:

1. It has exactly one sentence describing its responsibility
2. It does not duplicate an existing module's responsibility
3. Its import dependencies only go downward (same layer or lower)
4. It is not excluded from integration coverage unless it meets the
   integration-excluded code rule above

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
  have a JSDoc comment explaining _why_ it exists, not just what it does.
- **No unnecessary comments**: do not write comments that simply restate the code.
- **Error handling**: use descriptive `Error` messages with enough context to diagnose
  the problem (e.g. include the invalid value and what was expected).
- **Dependency injection over mocking**: modules that perform I/O (HTTP requests,
  file reads, environment access) must accept their dependencies as parameters
  (functions, objects, or `Env`) rather than importing and calling concrete
  implementations directly. This keeps modules unit-testable by injecting fakes —
  prefer constructor/factory injection over `vi.mock()` or module-level monkey
  patching. Composition roots (`src/action/main.ts`) wire the concrete
  implementations.

---

## Commit and Pull Request Conventions

- **Conventional Commits**: All commit messages must follow the
  [Conventional Commits](https://www.conventionalcommits.org/) specification.
  Use a type prefix, optional scope, and imperative subject:
  `<type>(<scope>): <description>`. Common types: `feat`, `fix`, `refactor`,
  `test`, `docs`, `chore`, `ci`, `perf`. Breaking changes use `!` after the
  type/scope (e.g. `refactor(compositor)!: change return type`).
- **Pull request descriptions**: Lead with user-facing impact — what changes
  for someone using the action, and what is the scope of those changes.
  Internal implementation details (refactors, new abstractions, test changes)
  belong in a secondary section. If there are no user-facing changes, state
  that explicitly up front.
- **Never replace an existing PR description**: When adding commits to a
  branch that already has an open PR, **read the current PR description
  first** (`gh pr view <number>`). Do not replace it. If your commits add
  scope not yet covered, append a new section. If the cumulative changes
  warrant a unified description, rewrite it so that **all** commits on the
  branch are represented — nothing from the original may be silently
  dropped. Only update the PR title if the original is now actively
  misleading; otherwise leave it unchanged.

---

## Node.js Version Management

The **source of truth** for the project's Node.js major version is the `runs.using`
field in `action.yml` (e.g. `node24`). No exact minor/patch version is pinned because
GitHub-hosted runners ship whichever 24.x release they choose.

The following files must all stay in sync with the major version derived from
`action.yml`:

| File                   | Must contain                                                                 |
| ---------------------- | ---------------------------------------------------------------------------- |
| `.node-version`        | `24\n` (major only, no minor/patch)                                          |
| `package.json` engines | `">=24.0.0"`                                                                 |
| `@types/node`          | `"^24.x.x"` (major must match)                                               |
| CI workflow steps      | `node-version-file: .node-version` (never a hardcoded `node-version:` input) |

A governance test (`tests/unit/governance/node-version.test.ts`) derives all
expectations from `action.yml` and fails if any file is out of sync. When upgrading
Node.js, update `action.yml` first, then let the governance test guide remaining
changes.

**Agent obligation** (see also **Session Bootstrap** above): Before running any
`npm` or `node` script, verify the active Node.js major version matches the project
requirement:

```bash
node --version   # must match the major in .node-version
```

If the major does not match, **do not proceed** until the shell environment resolves
to the correct version. Search for the required Node.js major version on the system
(e.g. check `/opt/homebrew/opt/node@<major>/bin/`, `/usr/local/opt/node@<major>/bin/`,
or the output of version managers like `nvm`, `fnm`, `volta`, `mise`, `asdf`). Fix
the PATH in your shell session and re-run `node --version` to confirm before
continuing. Never hardcode PATH manipulation inside source or test files — always
set it in the shell environment.

---

## Bundling and Distribution

`dist/index.js` and `dist/index.js.map` are **committed to the repository**. GitHub
Actions requires the entry point to be checked in — there is no install step at
action runtime.

**When to bundle**: After **any** change to a file under `src/`, including
comment-only or JSDoc-only edits. Configuration or dependency changes also require
a rebuild. Dist must be rebuilt whenever any tracked source file changes.

**No exceptions for "documentation-only" source edits**: Comments and JSDoc within
`.ts` source files are still source-code changes. The general rule that
"documentation changes do not need to be built" applies only to standalone
documentation files (e.g. `.md` files). It does **not** apply to comments or JSDoc
inside TypeScript files — those files are compiled into `dist/`, so even a
whitespace-only or comment-only edit to a `.ts` file under `src/` requires running
`npm run check:dist` before committing.

**Obligation**: Before every commit, run:

```bash
npm run ci && npm run check:dist
```

`npm run check:dist` runs `npm run bundle` then checks `git diff --exit-code dist/`
(working tree vs index). If it fails because dist changed, stage the updated dist
and include it in the commit:

```bash
git add dist/
git commit  # include dist/ in the commit
```

Never commit with a stale dist. Never run only `npm run ci` without also running
`npm run check:dist` before committing — `npm run ci` does not include bundling.

**Do not substitute ad-hoc checks**: Running `tsc --noEmit`, `eslint`, or any
individual tool directly is **not** a substitute for `npm run ci && npm run
check:dist`. These partial checks do not rebuild `dist/` and will allow a stale
bundle to be committed. The full two-command sequence is the only accepted
pre-commit verification.

---

## Linting Obligation

`npm run lint` is the single unified linting command. It runs:

1. `npm run lint:es` — ESLint (source + tests)
2. `npm run lint:markdown` — markdownlint-cli2 (all Markdown files)
3. `npm run lint:text` — textlint (terminology checking)
4. `npm run format:check` — Prettier (formatting verification)

All four must pass before any commit or `report_progress` call. When only one
specific linter needs debugging, run its sub-script directly.

**No documentation exemption in this repository**: The general agent rule that
"documentation changes do not need to be linted, built or tested" does **not**
apply here. This repository enforces markdownlint and textlint rules on every `.md`
file, and Prettier on all files including Markdown. Any change to any file —
source, test, or documentation — requires `npm run ci && npm run check:dist`
to pass before committing.

---

## Coverage Obligation

Both of these coverage checks must pass before any work is considered complete:

- `npm run test:coverage:ci` — overall coverage thresholds:
  90% lines/functions/statements, 85% branches
- `npm run test:integration:coverage` — integration-only thresholds:
  90% lines, 80% branches

If coverage drops below these thresholds after a change, add tests until thresholds
are satisfied. **Never reduce thresholds.**

### Integration Test Coverage Exclusions

The integration-only coverage config (`vitest.integration.config.ts`) may exclude
modules that **cannot** be meaningfully exercised by fixture-driven integration tests.
Allowed exclusion categories:

- **Type-only / no-logic modules** — `tfjson/`, `model/`, `env/`, `*.d.ts`,
  interface-only files (`builder/options.ts`, `renderer/options.ts`, `diff/types.ts`,
  `compose/types.ts`)
- **Error-path-only modules** — `parser/`, `steps/parse.ts`, `steps/reader.ts` —
  integration tests supply valid plan JSON from real tool runs; error paths are
  exercised by unit tests
- **Barrel reexports** — `steps/index.ts`, `compose/index.ts`
- **Requires live API / runtime** — `action/`, `github/`, `logger/`, `inputs/` —
  require GitHub API interaction, Actions runtime environment, or process I/O
  that cannot be exercised with fixture data
- **Comment construction** — `comment/` — assembles final GitHub comment bodies
  from rendered output; not reachable through `reportFromSteps()` fixture pipeline

Every exclusion must include a comment in `vitest.integration.config.ts` explaining
**why** the module cannot be covered by integration tests. Do not exclude modules
that have logic exercisable through `planToMarkdown`, `applyToMarkdown`, or
`reportFromSteps` with fixture data.

---

## Zero Runtime Dependencies

The action must have **no runtime dependencies** — only Node.js built-in modules.
All code is bundled into a single `dist/index.js` file. The `dependencies` field in
`package.json` must be absent or empty `{}`. This is enforced by a governance test
(`tests/unit/governance/no-runtime-deps.test.ts`).

Do NOT use external runtime dependencies like `@actions/core`, `@actions/github`,
`@octokit/rest`, or any other npm package at runtime. Use `node:https`, `node:fs`,
etc. instead.

---

## Style Guide

- **OpenTofu preference**: Use OpenTofu (`tofu`) in all examples and documentation
  unless specifically demonstrating Terraform compatibility.
- **`tofu_wrapper: false`**: Every `opentofu/setup-opentofu` step in examples must
  include `tofu_wrapper: false` with this explanation comment:

  ```yaml
  # The wrapper is disabled because it fails to forward signals properly
  # (opentofu/setup-opentofu#41), interferes with detailed exitcodes
  # (opentofu/setup-opentofu#42), and is generally discouraged when using
  # retailnext/exec-action to run OpenTofu.
  tofu_wrapper: false
  ```

- **Action references**: Always use `@main` (e.g. `retailnext/tf-report-action@main`),
  never version tags like `@v1`.

### Workflow Example Style Guide

Every example workflow step in user-facing documentation must demonstrate
best/recommended practices:

1. **`-json` required** — every `tofu`/`terraform` command that supports a
   `-json` flag must include it, even if the action does not consume that
   particular step's JSON output. This establishes a consistent best-practice
   pattern users can copy. (`state pull` always outputs JSON and has no
   `-json` flag — it is exempt.)
2. **No `-no-color`** — never use `-no-color` because `-json` implies
   `-no-color`. Including both is redundant and misleading.
3. **No `-auto-approve`** — never use `-auto-approve` in examples. When
   `apply` is given a saved plan file (e.g., `tofu apply -json tfplan`),
   no interactive approval is required — the plan file itself is the
   approval. Using `-auto-approve` is misleading and not necessary.
4. **`hide_outputs: true` for state** — any step that outputs the full
   OpenTofu/Terraform state (e.g., `state pull`) must use
   `hide_outputs: true` on `exec-action` to avoid leaking sensitive state
   values into GitHub Actions logs.

---

## Sensitive Values

Sensitive attribute values are **always masked** as `(sensitive)`. There is no option
to reveal them. This is a security invariant — do not add any bypass.

## Sentinel Value Architecture

Sentinel string constants (`SENSITIVE_MASK`, `KNOWN_AFTER_APPLY`, `VALUE_NOT_IN_PLAN`)
are defined in `src/model/sentinels.ts`. They serve as display text assigned in the
builder layer. **All logic must use boolean flags** (`isSensitive`, `isKnownAfterApply`)
on the model interfaces — never compare rendered strings against sentinel values.

- The renderer must **not** import from `model/sentinels.ts` (enforced by ESLint).
- `isKnownAfterApply` stays `true` even after replacement with `VALUE_NOT_IN_PLAN`
  in the apply builder, because the value is still a placeholder that should not be
  character-diffed.
- Values with `isSensitive` or `isKnownAfterApply` are rendered as-is without
  character-level diffing against previous values.

## Action Classification

The `PlanAction` type includes derived actions beyond the raw Terraform/OpenTofu
action strings:

- `"replace"` — derived from two-element action pairs (`create+delete` or `delete+create`)
- `"move"` — derived from `no-op` with `previous_address` set (moved block)
- `"import"` — derived from `no-op` with `importing` set (import block, no other changes)

Import combined with `create`/`update` retains the original action — `importId` is
metadata. True no-op resources (unchanged, not moved or imported) are filtered out
of the report entirely and never shown.

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
- **Read strategies**: parse reads load the full file, bounded by `maxFileSize`
  (256 MiB). Peek reads load only the first 8 KiB for format detection (e.g.
  JSONL). There is no separate display-truncation path — all content reaches
  the rendering layer intact, and budget/composition decides what fits.
- **Error messages** must never contain file paths (may reveal runner directory structure).

## Steps Context

The `reportFromSteps(stepsJson, options?)` entry point accepts a JSON-encoded GitHub
Actions steps context and produces a report. It **never throws** — all errors become
Markdown content. Output is bounded by `maxOutputLength` (default 63 KiB).

**Pipeline**: `parse steps → build Report → render Section[] → compose within budget`
— the same parse → build → render → compose pattern as the other two entry points.

**`ReportOptions`** extends `Options` with: `allowedDirs`, `maxOutputLength`, `workspace`,
`env` (DI for `process.env`), and step ID overrides (`initStepId`, `validateStepId`,
`planStepId`, `showPlanStepId`, `applyStepId`, `stateStepId`).

**Report variants** (discriminated union on `kind`):

- `StructuredReport` — Tier 1: full plan/apply detail from JSON
- `TextFallbackReport` — Tier 3: raw command output, no structured plan data
- `WorkflowReport` — Tier 4: just step statuses, no plan data
- `ErrorReport` — pipeline/parse errors

**Tiered degradation**:

- **Tier 1**: show-plan JSON available → full structured report (plan or apply)
- **Tier 3**: No show-plan, but plan/apply step present → raw text fallback with
  JSON Lines formatting where possible
- **Tier 4**: No recognized terraform steps → general workflow table

_(Tier 2 is reserved for future use.)_

**State enrichment** (Tier 1 apply reports only): When a `state` step provides
post-apply state JSON (via `state pull`), the builder resolves `isKnownAfterApply`
attribute placeholders to their actual values from the state. Sensitive values
discovered through the state are masked as `(sensitive)`. This runs after the
main report is built, as a progressive enrichment phase. When state is not
available and there are unresolved placeholders, a warning is added to the report.

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
- Structural metadata (format version, field names) is safe to include in errors.

Error and warning messages must **never** hardcode tool names (`"tofu"`,
`"terraform"`). Always use `expectedCommand(tool, role)` from
`src/model/step-commands.ts` or pass the detected `tool` value. This ensures
messages automatically reflect the tool that produced the input. Integration
tests enforce this: every fixture's rendered output is checked for mentions of
the wrong tool via `assertCorrectToolName()` in `tests/helpers/fixture-loader.ts`.

---

## Testing

- Every module with executable code must have a corresponding test file under `tests/unit/`.
- Integration tests live under `tests/integration/` and are driven by real plan JSON
  and apply JSONL files generated from fixture Terraform workspaces.
- Coverage thresholds: 90% lines/functions/statements, 85% branches.
- **After adding or modifying any source code, run `npm run ci` and verify all checks
  pass.** `npm run ci` runs lint, typecheck, full coverage (unit + integration combined),
  and integration-only coverage in sequence. If coverage drops below thresholds, add
  tests until thresholds are satisfied before committing. If snapshots need updating,
  run `npx vitest run -u` first, then re-run `npm run ci`.
- Use the `/add-fixture-workspace` skill to add fixture workspaces.
- Use the `/generate-fixtures` skill to regenerate fixture JSON files.

### Integration Test Rule (non-negotiable)

**`tests/integration/` may only use inputs that were generated by actually running
`terraform` or `tofu` against a fixture workspace under `tests/fixtures/`.**

- Every plan JSON loaded in `tests/integration/` must come from
  `tests/fixtures/generated/<tool>/<workspace>/<N>/show-plan.stdout`.
- Every apply JSONL loaded in `tests/integration/` must come from
  `tests/fixtures/generated/<tool>/<workspace>/<N>/apply.stdout`.
- Every state JSON loaded in `tests/integration/` must come from
  `tests/fixtures/generated/<tool>/<workspace>/<N>/state.stdout`.
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
- Any `show-plan.stdout` file under `tests/integration/` is not a symlink or copy of a file
  from `tests/fixtures/generated/`.
- Any plan JSON is loaded from a path outside `tests/fixtures/generated/`.

The only permitted pattern for obtaining plan input in `tests/integration/` is
reading a file from `tests/fixtures/generated/<tool>/<workspace>/<N>/show-plan.stdout`.

---

## Development Tools

### `scripts/render.ts` — local render tool

`scripts/render.ts` renders a steps.json file to Markdown or a browser-viewable HTML
page. It uses `reportFromSteps()` as its sole rendering API. Output format is
controlled by `--format` (default: `html`).

```bash
# Render a fixture to HTML and open in browser
npm run render -- tests/fixtures/generated/terraform/null-lifecycle/2/steps.json

# Render to Markdown on stdout
npm run render -- steps.json --format markdown --output -

# Render to a Markdown file
npm run render -- steps.json --format markdown --output report.md

# With options
npm run render -- steps.json --title "PR #42" --no-open

# Open the fixture gallery (all fixtures rendered in a navigable HTML page)
npm run gallery -- --no-open

# From stdin
cat steps.json | npm run render -- -
```

**Supported flags** (each maps 1:1 to an `Options` field or a render-script behaviour):

| Flag                             | `Options` field / behaviour                                                   | Default                             |
| -------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------- |
| `--format <html\|markdown>`      | Output format; `markdown` implies `--no-open`                                 | `"html"`                            |
| `--output <path>` / `-o`         | Output file; `"-"` for stdout                                                 | temp file (HTML), stdout (Markdown) |
| `--title <text>`                 | `title`                                                                       | _(none)_                            |
| `--show-unchanged`               | `showUnchangedAttributes`                                                     | `false`                             |
| `--diff-format <inline\|simple>` | `diffFormat`                                                                  | `"inline"`                          |
| `--workspace <name>`             | `workspace` (for title and dedup marker)                                      | _(none)_                            |
| `--logs-url <url>`               | Parses a GitHub Actions run URL into `env` vars                               | _(none)_                            |
| `--allowed-dirs <dirs>`          | Comma-separated allowed directories for file reading                          | _(directory of input file)_         |
| `--max-output-length <n>`        | Maximum output length in characters                                           | `64512` (63 KiB)                    |
| `--gallery`                      | Render all fixture steps JSONs into a navigable gallery HTML page (HTML only) | _(off)_                             |
| `--no-open`                      | Suppress browser opening (write HTML only)                                    | _(browser opens by default)_        |

The **gallery** (`npm run gallery`) renders all fixture steps JSON files into a single
HTML page with keyboard navigation (←/→ arrows), text filtering, and a "Copy Markdown"
button for each fixture. It uses marked.js and DOMPurify loaded from CDN — no npm UI
dependencies are added to the project. Gallery mode only supports HTML output.

**Maintenance rule:** When `Options` (defined across `src/renderer/options.ts` and
`src/builder/options.ts`) gains, loses, or renames a field, update `parseArgs()` in
`scripts/render.ts` to keep the CLI flags in sync. The flag table above must
also be kept current.

**Agent constraint — browser opening is forbidden:** Agents must **never** run any
command that causes the user's browser to open. This includes:

- `npm run render` (without `--no-open`) — always pass `--no-open` when running this script
- Any shell command invoking `open`, `xdg-open`, or `start` with a file or URL
- Any other script or tool that has a side effect of opening a browser window

When running `npm run render` as part of any task, always append `--no-open` and use
`--format markdown` to get raw Markdown output:

```bash
npm -s run render -- steps.json --format markdown --no-open --output -
```
