import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SRC = resolve(ROOT, "src");

/**
 * Allowed files that may reference process.stderr, process.stdout, or
 * console.* directly. Every other source file must use the injected
 * Logger interface from src/action/logger.ts.
 */
const ALLOWED_FILES = new Set([
  // Production logger — the sole provider of annotation output
  "src/action/logger.ts",
]);

/**
 * Patterns that indicate direct I/O access. Each pattern is a regex
 * that matches a line of TypeScript source (comments stripped).
 */
const FORBIDDEN_PATTERNS: { pattern: RegExp; description: string }[] = [
  {
    pattern: /\bprocess\.stderr\b/,
    description: "process.stderr",
  },
  {
    pattern: /\bprocess\.stdout\b/,
    description: "process.stdout",
  },
  {
    pattern: /\bconsole\.log\b/,
    description: "console.log",
  },
  {
    pattern: /\bconsole\.error\b/,
    description: "console.error",
  },
  {
    pattern: /\bconsole\.warn\b/,
    description: "console.warn",
  },
];

/** Recursively collect all .ts files under a directory. */
function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...collectTsFiles(full));
    } else if (entry.endsWith(".ts")) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Strip single-line and block comments from source.
 * This avoids false positives from JSDoc or explanatory comments.
 */
function stripComments(source: string): string {
  // Remove block comments (non-greedy, handles multiline)
  let result = source.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove single-line comments
  result = result.replace(/\/\/.*/g, "");
  return result;
}

describe("no direct I/O in source files", () => {
  const files = collectTsFiles(SRC);

  it("found source files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("does not use process.stderr, process.stdout, or console.* outside allowed files", () => {
    const violations: string[] = [];

    for (const file of files) {
      const rel = relative(ROOT, file);
      if (ALLOWED_FILES.has(rel)) continue;

      const source = readFileSync(file, "utf-8");
      const stripped = stripComments(source);
      const lines = stripped.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        for (const { pattern, description } of FORBIDDEN_PATTERNS) {
          if (pattern.test(line)) {
            violations.push(`${rel}:${String(i + 1)} — ${description}`);
          }
        }
      }
    }

    expect(
      violations,
      `Found direct I/O access in source files (use Logger instead):\n${violations.join("\n")}`,
    ).toHaveLength(0);
  });
});
