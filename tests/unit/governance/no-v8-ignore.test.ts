import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SRC = resolve(ROOT, "src");
const TESTS = resolve(ROOT, "tests");

/**
 * v8 ignore comments suppress coverage for the following line. They
 * hide untested code rather than fixing the coverage gap and are
 * unconditionally banned in this project.
 */
const V8_IGNORE = /\/[/*]\s*v8 ignore/;

/** Recursively collect all .ts files under a directory, skipping fixtures. */
function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "fixtures") continue;
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...collectTsFiles(full));
    } else if (entry.endsWith(".ts")) {
      results.push(full);
    }
  }
  return results;
}

describe("no v8 ignore comments", () => {
  const files = [...collectTsFiles(SRC), ...collectTsFiles(TESTS)];

  it("found source files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("does not use v8 ignore comments in source or test files", () => {
    const violations: string[] = [];

    for (const file of files) {
      const rel = relative(ROOT, file);
      const source = readFileSync(file, "utf-8");
      const lines = source.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (V8_IGNORE.test(line)) {
          violations.push(`${rel}:${String(i + 1)}`);
        }
      }
    }

    expect(
      violations,
      `v8 ignore comments are banned — fix the coverage gap instead:\n${violations.join("\n")}`,
    ).toHaveLength(0);
  });
});
