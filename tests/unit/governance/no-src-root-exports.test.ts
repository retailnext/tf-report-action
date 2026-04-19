/**
 * Governance test: no root-level src/*.ts file may contain export statements.
 *
 * src/ root files are not a library API. The bundle entry point is
 * src/action/main.ts (via esbuild). All code that needs to be shared
 * lives in named modules under src/<module>/. Callers import directly
 * from the module they need — not from a root-level convenience hub.
 *
 * If this test fails, move the exported code to an appropriate module
 * under src/<module>/ and remove the export from the root-level file.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, "../../../src");

/** Strip single-line and multi-line comments from TypeScript source. */
function stripComments(source: string): string {
  // Remove block comments (/* ... */)
  let result = source.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove line comments (// ...)
  result = result.replace(/\/\/[^\n]*/g, "");
  return result;
}

describe("governance: no src root-level exports", () => {
  const rootFiles = readdirSync(srcDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => entry.name);

  it("no root-level src/*.ts file contains export statements", () => {
    const violations: string[] = [];

    for (const filename of rootFiles) {
      const fullPath = join(srcDir, filename);
      const source = readFileSync(fullPath, "utf-8");
      const stripped = stripComments(source);
      const lines = stripped.split("\n");
      const exportLines = lines
        .map((line, i) => ({ line: line.trim(), lineNumber: i + 1 }))
        .filter(({ line }) => /\bexport\b/.test(line));

      if (exportLines.length > 0) {
        violations.push(
          `${filename}: exports found on lines ${exportLines.map((e) => e.lineNumber).join(", ")}`,
        );
      }
    }

    expect(
      violations,
      `Root-level src/*.ts files must not have exports. Move exported code to src/<module>/:\n${violations.join("\n")}`,
    ).toHaveLength(0);
  });
});
