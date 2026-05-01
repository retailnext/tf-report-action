import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import-x";
import noBarrelFiles from "eslint-plugin-no-barrel-files";
import boundaries from "eslint-plugin-boundaries";
import { resolve } from "node:path";

export default tseslint.config(
  // .mjs files in scripts/ use plain JS and can't be included in tsconfig —
  // exclude them from TypeScript type-aware linting.
  { ignores: ["scripts/*.mjs"] },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // tsconfig.test.json includes both src/**/*.ts and tests/**/*.ts,
        // making it the single source of truth for all linted files.
        project: "./tsconfig.test.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "import-x": importPlugin,
    },
    rules: {
      // Require .js extensions on all relative ESM imports
      "import-x/extensions": ["error", "ignorePackages", { js: "always" }],

      // Prefer explicit return types on exported functions for readability
      "@typescript-eslint/explicit-module-boundary-types": "error",

      // These are fine in well-typed code
      "@typescript-eslint/no-unnecessary-condition": "error",

      // Allow void as a statement (e.g. fire-and-forget patterns)
      "@typescript-eslint/no-confusing-void-expression": "off",

      // non-nullable-type-assertion-style conflicts with no-non-null-assertion:
      // the former wants "!", the latter forbids it. Disable the former.
      "@typescript-eslint/non-nullable-type-assertion-style": "off",
    },
  },
  {
    // Test files don't need explicit return types; relax several strict rules
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-explicit-any": "off",
      // Test assertions commonly use ! to access array elements after asserting length
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    // Sentinel string constants must only be used in the builder layer (where they
    // are assigned as display text). The elements layer must use boolean flags
    // (isSensitive, isKnownAfterApply) for logic, never string comparison.
    files: ["src/elements/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "../model/sentinels.js",
              message:
                "Elements must not import sentinel strings. Use boolean flags (isSensitive, isKnownAfterApply) instead of string comparison.",
            },
          ],
        },
      ],
    },
  },
  {
    // tfjson/ is copied external code — skip linting it
    files: ["src/tfjson/**/*.ts"],
    rules: {
      "import-x/extensions": "off",
      "@typescript-eslint/consistent-indexed-object-style": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
    },
  },
  // ---------------------------------------------------------------------------
  // Folder dependency graph — enforced by eslint-plugin-boundaries
  //
  // Every src/ folder is declared as an element type. The boundaries/dependencies
  // rule uses an allowlist (default: "disallow") so any import not listed below
  // is an error. This statically guarantees the folder-level dependency graph
  // is acyclic; a governance test (tests/unit/governance/no-folder-cycles.test.ts)
  // additionally verifies that the declared rules cannot form a cycle.
  // ---------------------------------------------------------------------------
  {
    settings: {
      // Resolve .js extensions to .ts files so boundaries can classify imports
      "import/resolver": {
        typescript: { project: "./tsconfig.test.json" },
      },
      "boundaries/root-path": resolve(import.meta.dirname),
      "boundaries/include": ["src/**/*.ts", "tests/**/*.ts", "scripts/**/*.ts"],
      "boundaries/legacy-templates": false,
      "boundaries/elements": [
        { type: "action", pattern: "src/action", mode: "folder" },
        { type: "artifact", pattern: "src/artifact", mode: "folder" },
        { type: "builder", pattern: "src/builder", mode: "folder" },
        { type: "comment", pattern: "src/comment", mode: "folder" },
        { type: "diff", pattern: "src/diff", mode: "folder" },
        { type: "drift-filter", pattern: "src/drift-filter", mode: "folder" },
        { type: "elements", pattern: "src/elements", mode: "folder" },
        { type: "env", pattern: "src/env", mode: "folder" },
        { type: "flattener", pattern: "src/flattener", mode: "folder" },
        { type: "github", pattern: "src/github", mode: "folder" },
        { type: "html", pattern: "src/html", mode: "folder" },
        { type: "http", pattern: "src/http", mode: "folder" },
        { type: "inputs", pattern: "src/inputs", mode: "folder" },
        { type: "jsonl-scanner", pattern: "src/jsonl-scanner", mode: "folder" },
        { type: "logger", pattern: "src/logger", mode: "folder" },
        { type: "model", pattern: "src/model", mode: "folder" },
        { type: "parser", pattern: "src/parser", mode: "folder" },
        { type: "pipelines", pattern: "src/pipelines", mode: "folder" },
        { type: "raw-formatter", pattern: "src/raw-formatter", mode: "folder" },
        { type: "renderable", pattern: "src/renderable", mode: "folder" },
        { type: "sensitivity", pattern: "src/sensitivity", mode: "folder" },
        { type: "steps", pattern: "src/steps", mode: "folder" },
        { type: "tfjson", pattern: "src/tfjson", mode: "folder" },
        { type: "tests", pattern: "tests", mode: "folder" },
        { type: "scripts", pattern: "scripts", mode: "folder" },
      ],
    },
    plugins: { boundaries },
    rules: {
      "boundaries/no-unknown": [2],
      "boundaries/no-unknown-files": [2],
      "boundaries/no-ignored": [2],
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          checkAllOrigins: true,
          checkUnknownLocals: true,
          rules: [
            // Folders with no local dependencies
            { from: { type: "tfjson" }, allow: [] },
            { from: { type: "env" }, allow: [] },
            { from: { type: "diff" }, allow: [] },
            { from: { type: "sensitivity" }, allow: [] },
            { from: { type: "raw-formatter" }, allow: [] },
            { from: { type: "logger" }, allow: [] },
            { from: { type: "html" }, allow: [] },

            { from: { type: "model" }, allow: [{ to: { type: "tfjson" } }] },

            {
              from: { type: "renderable" },
              allow: [{ to: { type: "model" } }],
            },

            {
              from: { type: "flattener" },
              allow: [{ to: { type: "tfjson" } }],
            },

            {
              from: { type: "jsonl-scanner" },
              allow: [
                { to: { type: "model" } },
                { to: { type: "tfjson" } },
                { to: { origin: "core" }, dependency: { module: "node:fs" } },
              ],
            },

            {
              from: { type: "http" },
              allow: [
                { to: { type: "env" } },
                { to: { origin: "core" }, dependency: { module: "node:http" } },
                {
                  to: { origin: "core" },
                  dependency: { module: "node:https" },
                },
                { to: { origin: "core" }, dependency: { module: "node:tls" } },
              ],
            },

            {
              from: { type: "parser" },
              allow: [{ to: { type: "model" } }, { to: { type: "tfjson" } }],
            },

            {
              from: { type: "steps" },
              allow: [
                { to: { type: "env" } },
                { to: { type: "model" } },
                { to: { origin: "core" }, dependency: { module: "node:fs" } },
                { to: { origin: "core" }, dependency: { module: "node:path" } },
              ],
            },

            { from: { type: "github" }, allow: [{ to: { type: "http" } }] },

            {
              from: { type: "inputs" },
              allow: [
                { to: { type: "env" } },
                { to: { origin: "core" }, dependency: { module: "node:fs" } },
              ],
            },

            {
              from: { type: "drift-filter" },
              allow: [{ to: { type: "model" } }],
            },

            {
              from: { type: "artifact" },
              allow: [
                { to: { type: "http" } },
                {
                  to: { origin: "core" },
                  dependency: { module: "node:crypto" },
                },
              ],
            },

            {
              from: { type: "comment" },
              allow: [{ to: { type: "env" } }, { to: { type: "model" } }],
            },

            {
              from: { type: "builder" },
              allow: [
                { to: { type: "diff" } },
                { to: { type: "drift-filter" } },
                { to: { type: "env" } },
                { to: { type: "flattener" } },
                { to: { type: "jsonl-scanner" } },
                { to: { type: "model" } },
                { to: { type: "parser" } },
                { to: { type: "renderable" } },
                { to: { type: "sensitivity" } },
                { to: { type: "steps" } },
                { to: { type: "tfjson" } },
                { to: { origin: "core" }, dependency: { module: "node:os" } },
              ],
            },

            {
              from: { type: "elements" },
              allow: [
                { to: { type: "builder" } },
                { to: { type: "diff" } },
                { to: { type: "model" } },
                { to: { type: "renderable" } },
                { to: { type: "tfjson" } },
              ],
            },

            {
              from: { type: "pipelines" },
              allow: [
                { to: { type: "builder" } },
                { to: { type: "elements" } },
                { to: { type: "jsonl-scanner" } },
                { to: { type: "model" } },
                { to: { type: "parser" } },
                { to: { type: "renderable" } },
              ],
            },

            {
              from: { type: "action" },
              allow: [
                { to: { type: "artifact" } },
                { to: { type: "builder" } },
                { to: { type: "comment" } },
                { to: { type: "env" } },
                { to: { type: "github" } },
                { to: { type: "html" } },
                { to: { type: "http" } },
                { to: { type: "inputs" } },
                { to: { type: "logger" } },
                { to: { type: "pipelines" } },
                {
                  to: { origin: "core" },
                  dependency: { module: "node:crypto" },
                },
              ],
            },

            // tests and scripts may import anything
            {
              from: { type: "tests" },
              allow: [
                { to: { origin: "local" } },
                { to: { origin: "core" } },
                { to: { origin: "external" } },
              ],
            },
            {
              from: { type: "scripts" },
              allow: [
                { to: { origin: "local" } },
                { to: { origin: "core" } },
                { to: { origin: "external" } },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    // Forbid direct process/console access in source files — all I/O must go
    // through the injected Logger interface. The only exception is
    // src/logger/index.ts which provides the production implementation.
    //
    // Also forbid inline import("...") type expressions; they are invisible to
    // eslint-plugin-boundaries and bypass folder dependency checks.
    files: ["src/**/*.ts"],
    ignores: ["src/logger/index.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSImportType",
          message:
            "Use a top-level 'import type' declaration instead of an inline import() type expression. Inline import() types are invisible to eslint-plugin-boundaries and bypass folder dependency checks.",
        },
        {
          selector:
            "MemberExpression[object.name='process'][property.name='stderr']",
          message:
            "Use the injected Logger interface instead of process.stderr. See src/logger/index.ts.",
        },
        {
          selector:
            "MemberExpression[object.name='process'][property.name='stdout']",
          message:
            "Use the injected Logger interface instead of process.stdout. See src/logger/index.ts.",
        },
        {
          selector:
            "MemberExpression[object.name='console'][property.name='log']",
          message:
            "Use the injected Logger interface instead of console.log. See src/logger/index.ts.",
        },
        {
          selector:
            "MemberExpression[object.name='console'][property.name='error']",
          message:
            "Use the injected Logger interface instead of console.error. See src/logger/index.ts.",
        },
        {
          selector:
            "MemberExpression[object.name='console'][property.name='warn']",
          message:
            "Use the injected Logger interface instead of console.warn. See src/logger/index.ts.",
        },
      ],
    },
  },
  {
    // Also forbid inline import("...") type expressions in tests and scripts.
    // Kept as a separate block because the src/ block above uses `ignores` to
    // carve out src/logger/index.ts; these two dirs have no such exception.
    files: ["tests/**/*.ts", "scripts/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSImportType",
          message:
            "Use a top-level 'import type' declaration instead of an inline import() type expression. Inline import() types are invisible to eslint-plugin-boundaries and bypass folder dependency checks.",
        },
      ],
    },
  },
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**"],
  },
  {
    // Prohibit barrel files (re-exporting imported bindings) across all source.
    // This codebase is not a library; every import must point to the file that
    // defines the symbol.
    files: ["src/**/*.ts", "tests/**/*.ts", "scripts/**/*.ts"],
    plugins: {
      "no-barrel-files": noBarrelFiles,
    },
    rules: {
      "no-barrel-files/no-barrel-files": "error",
    },
  },
);
