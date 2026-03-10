import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import-x";

export default tseslint.config(
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
    // tfjson/ is copied external code — skip linting it
    files: ["src/tfjson/**/*.ts"],
    rules: {
      "import-x/extensions": "off",
      "@typescript-eslint/consistent-indexed-object-style": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
    },
  },
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**"],
  },
);
