import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import-x";
import noBarrelFiles from "eslint-plugin-no-barrel-files";
import { createConfig, strict } from "eslint-plugin-boundaries/config";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Folder dependency graph — enforced by eslint-plugin-boundaries.
//
// Every src/ folder is declared as an element type. The boundaries/dependencies
// rule uses an allowlist (default: "disallow") so any import not listed below
// is an error. This statically guarantees the folder-level dependency graph is
// acyclic; a governance test (tests/unit/governance/no-folder-cycles.test.ts)
// additionally verifies that the declared policies cannot form a cycle.
//
// Built with the official createConfig helper, which registers the plugin and
// validates every settings/rule key. We deliberately do NOT set
// boundaries/include: classification is done entirely via element descriptors,
// and the flat-config `files` field below scopes the rules to architecture
// source files (root config files are simply not linted by this entry). Setting
// `include` would classify resolved node_modules targets as ignored files, which
// would make boundaries/no-ignored-dependencies fire on every external import.
//
// We start from the `strict` preset (all four rules at severity 2) and override
// boundaries/elements and boundaries/dependencies with the project graph.
// ---------------------------------------------------------------------------
const boundariesConfig = createConfig({
  files: ["src/**/*.ts", "tests/**/*.ts", "scripts/**/*.ts"],
  settings: {
    "boundaries/root-path": resolve(import.meta.dirname),
    "boundaries/legacy-templates": false,
    "boundaries/elements": [
      { type: "action", pattern: "src/action" },
      { type: "artifact", pattern: "src/artifact" },
      { type: "builder", pattern: "src/builder" },
      { type: "comment", pattern: "src/comment" },
      { type: "diff", pattern: "src/diff" },
      { type: "drift-filter", pattern: "src/drift-filter" },
      { type: "elements", pattern: "src/elements" },
      { type: "env", pattern: "src/env" },
      { type: "flattener", pattern: "src/flattener" },
      { type: "github", pattern: "src/github" },
      { type: "html", pattern: "src/html" },
      { type: "http", pattern: "src/http" },
      { type: "inputs", pattern: "src/inputs" },
      { type: "jsonl-scanner", pattern: "src/jsonl-scanner" },
      { type: "logger", pattern: "src/logger" },
      { type: "model", pattern: "src/model" },
      { type: "parser", pattern: "src/parser" },
      { type: "pipelines", pattern: "src/pipelines" },
      { type: "raw-formatter", pattern: "src/raw-formatter" },
      { type: "renderable", pattern: "src/renderable" },
      { type: "sensitivity", pattern: "src/sensitivity" },
      { type: "steps", pattern: "src/steps" },
      { type: "tfjson", pattern: "src/tfjson" },
      { type: "tests", pattern: "tests" },
      { type: "scripts", pattern: "scripts" },
    ],
  },
  rules: {
    ...strict.rules,
    "boundaries/dependencies": [
      "error",
      {
        default: "disallow",
        checkAllOrigins: true,
        checkUnknownLocals: true,
        policies: [
          // Folders with no local dependencies
          { from: { element: { type: "tfjson" } }, allow: [] },
          { from: { element: { type: "env" } }, allow: [] },
          { from: { element: { type: "diff" } }, allow: [] },
          { from: { element: { type: "sensitivity" } }, allow: [] },
          { from: { element: { type: "raw-formatter" } }, allow: [] },
          { from: { element: { type: "logger" } }, allow: [] },
          { from: { element: { type: "html" } }, allow: [] },

          {
            from: { element: { type: "model" } },
            allow: [{ to: { element: { type: "tfjson" } } }],
          },

          {
            from: { element: { type: "renderable" } },
            allow: [{ to: { element: { type: "model" } } }],
          },

          {
            from: { element: { type: "flattener" } },
            allow: [{ to: { element: { type: "tfjson" } } }],
          },

          {
            from: { element: { type: "jsonl-scanner" } },
            allow: [
              { to: { element: { type: "model" } } },
              { to: { element: { type: "tfjson" } } },
              { to: { module: { origin: "core", source: "node:fs" } } },
            ],
          },

          {
            from: { element: { type: "http" } },
            allow: [
              { to: { element: { type: "env" } } },
              { to: { module: { origin: "core", source: "node:http" } } },
              { to: { module: { origin: "core", source: "node:https" } } },
              { to: { module: { origin: "core", source: "node:tls" } } },
            ],
          },

          {
            from: { element: { type: "parser" } },
            allow: [
              { to: { element: { type: "model" } } },
              { to: { element: { type: "tfjson" } } },
            ],
          },

          {
            from: { element: { type: "steps" } },
            allow: [
              { to: { element: { type: "env" } } },
              { to: { element: { type: "model" } } },
              { to: { module: { origin: "core", source: "node:fs" } } },
              { to: { module: { origin: "core", source: "node:path" } } },
            ],
          },

          {
            from: { element: { type: "github" } },
            allow: [{ to: { element: { type: "http" } } }],
          },

          {
            from: { element: { type: "inputs" } },
            allow: [
              { to: { element: { type: "env" } } },
              { to: { module: { origin: "core", source: "node:fs" } } },
            ],
          },

          {
            from: { element: { type: "drift-filter" } },
            allow: [{ to: { element: { type: "model" } } }],
          },

          {
            from: { element: { type: "artifact" } },
            allow: [
              { to: { element: { type: "http" } } },
              { to: { module: { origin: "core", source: "node:crypto" } } },
            ],
          },

          {
            from: { element: { type: "comment" } },
            allow: [
              { to: { element: { type: "env" } } },
              { to: { element: { type: "model" } } },
            ],
          },

          {
            from: { element: { type: "builder" } },
            allow: [
              { to: { element: { type: "diff" } } },
              { to: { element: { type: "drift-filter" } } },
              { to: { element: { type: "env" } } },
              { to: { element: { type: "flattener" } } },
              { to: { element: { type: "jsonl-scanner" } } },
              { to: { element: { type: "model" } } },
              { to: { element: { type: "parser" } } },
              { to: { element: { type: "renderable" } } },
              { to: { element: { type: "sensitivity" } } },
              { to: { element: { type: "steps" } } },
              { to: { element: { type: "tfjson" } } },
              { to: { module: { origin: "core", source: "node:os" } } },
            ],
          },

          {
            from: { element: { type: "elements" } },
            allow: [
              { to: { element: { type: "builder" } } },
              { to: { element: { type: "diff" } } },
              { to: { element: { type: "model" } } },
              { to: { element: { type: "renderable" } } },
              { to: { element: { type: "tfjson" } } },
            ],
          },

          {
            from: { element: { type: "pipelines" } },
            allow: [
              { to: { element: { type: "builder" } } },
              { to: { element: { type: "elements" } } },
              { to: { element: { type: "jsonl-scanner" } } },
              { to: { element: { type: "model" } } },
              { to: { element: { type: "parser" } } },
              { to: { element: { type: "renderable" } } },
            ],
          },

          {
            from: { element: { type: "action" } },
            allow: [
              { to: { element: { type: "artifact" } } },
              { to: { element: { type: "builder" } } },
              { to: { element: { type: "comment" } } },
              { to: { element: { type: "env" } } },
              { to: { element: { type: "github" } } },
              { to: { element: { type: "html" } } },
              { to: { element: { type: "http" } } },
              { to: { element: { type: "inputs" } } },
              { to: { element: { type: "logger" } } },
              { to: { element: { type: "pipelines" } } },
              { to: { module: { origin: "core", source: "node:crypto" } } },
            ],
          },

          // tests and scripts may import anything
          {
            from: { element: { type: "tests" } },
            allow: [
              { to: { module: { origin: "local" } } },
              { to: { module: { origin: "core" } } },
              { to: { module: { origin: "external" } } },
            ],
          },
          {
            from: { element: { type: "scripts" } },
            allow: [
              { to: { module: { origin: "local" } } },
              { to: { module: { origin: "core" } } },
              { to: { module: { origin: "external" } } },
            ],
          },
        ],
      },
    ],
  },
});

// The import/resolver setting is not a boundaries/* key, so createConfig cannot
// accept it. Merge it onto the generated entry (it resolves .js specifiers to
// their .ts sources so boundaries can classify imports).
const boundariesEntry = {
  ...boundariesConfig,
  settings: {
    ...boundariesConfig.settings,
    "import/resolver": {
      typescript: { project: "./tsconfig.test.json" },
    },
  },
};

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
  boundariesEntry,
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
