import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { ACTION_SYMBOLS } from "../../../src/model/plan-action.js";
import * as StatusIcons from "../../../src/model/status-icons.js";

const SRC_DIR = join(fileURLToPath(import.meta.url), "../../../../src");

/**
 * Files that are allowed to define emoji/symbol constants.
 * Every other source file must import from one of these.
 */
const EMOJI_TABLE_FILES = new Set([
  "model/plan-action.ts",
  "model/status-icons.ts",
]);

/**
 * Collect every exported string value from the status-icons module.
 * Using `import *` means new exports are automatically included.
 */
function collectStatusIcons(): Record<string, string> {
  const icons: Record<string, string> = {};
  for (const [key, value] of Object.entries(StatusIcons)) {
    if (typeof value === "string") {
      icons[key] = value;
    }
  }
  return icons;
}

/**
 * Enforces that no emoji/symbol is reused to mean two different things
 * and that no source file outside the canonical table files contains
 * hardcoded emoji or math symbols.
 */
describe("emoji governance", () => {
  const statusIcons = collectStatusIcons();

  describe("uniqueness", () => {
    it("no symbol appears in both ACTION_SYMBOLS and status icons", () => {
      const actionSet = new Map<string, string>();
      for (const [action, symbol] of Object.entries(ACTION_SYMBOLS)) {
        actionSet.set(normalizeEmoji(symbol), action);
      }

      for (const [name, symbol] of Object.entries(statusIcons)) {
        const normalized = normalizeEmoji(symbol);
        if (actionSet.has(normalized)) {
          const actionName = actionSet.get(normalized) ?? "unknown";
          expect.fail(
            `"${symbol}" is used for both action "${actionName}" ` +
              `and status icon "${name}"`,
          );
        }
      }
    });

    it("action symbols have no duplicates among themselves", () => {
      const seen = new Map<string, string>();
      for (const [action, symbol] of Object.entries(ACTION_SYMBOLS)) {
        const normalized = normalizeEmoji(symbol);
        if (seen.has(normalized)) {
          const prevAction = seen.get(normalized) ?? "unknown";
          expect.fail(
            `"${symbol}" is used for both action "${prevAction}" ` +
              `and action "${action}"`,
          );
        }
        seen.set(normalized, action);
      }
    });

    it("status icons have no duplicates among themselves", () => {
      const seen = new Map<string, string>();
      for (const [name, symbol] of Object.entries(statusIcons)) {
        const normalized = normalizeEmoji(symbol);
        if (seen.has(normalized)) {
          const prevName = seen.get(normalized) ?? "unknown";
          expect.fail(
            `"${symbol}" is used for both "${prevName}" ` + `and "${name}"`,
          );
        }
        seen.set(normalized, name);
      }
    });
  });

  describe("source lint", () => {
    it("no hardcoded emoji or math symbols in source files outside emoji tables", () => {
      const violations: string[] = [];

      for (const file of walkTs(SRC_DIR)) {
        const rel = relative(SRC_DIR, file);
        if (EMOJI_TABLE_FILES.has(rel)) continue;

        const raw = readFileSync(file, "utf-8");
        const stripped = stripComments(raw);
        const lines = stripped.split("\n");

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!;
          for (const m of findSymbols(line)) {
            const codepoints = Array.from(m)
              .map((c) => {
                const cp = c.codePointAt(0);
                return (
                  "U+" +
                  (cp !== undefined
                    ? cp.toString(16).toUpperCase().padStart(4, "0")
                    : "0000")
                );
              })
              .join(" ");
            violations.push(`${rel}:${String(i + 1)}: ${m} (${codepoints})`);
          }
        }
      }

      if (violations.length > 0) {
        expect.fail(
          "Found hardcoded emoji/symbols in source files outside emoji table definitions.\n" +
            "All emoji and symbols must be defined in ACTION_SYMBOLS (plan-action.ts)\n" +
            "or as named exports in status-icons.ts.\n\n" +
            violations.join("\n"),
        );
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip variation selectors so visually-identical emoji compare equal. */
function normalizeEmoji(s: string): string {
  return s.replace(/[\uFE0E\uFE0F]/g, "");
}

/** Recursively find all .ts files under a directory. */
function walkTs(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkTs(full));
    } else if (entry.name.endsWith(".ts")) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Remove single-line (`// ...`) and block comments so the
 * lint only flags symbols in executable code and string literals.
 */
function stripComments(source: string): string {
  let result = source.replace(/\/\/.*$/gm, "");
  result = result.replace(/\/\*[\s\S]*?\*\//g, "");
  return result;
}

/**
 * Yield every emoji (Extended_Pictographic, excluding ASCII digits/#/*)
 * and non-ASCII math symbol found in a line.
 */
function* findSymbols(line: string): Generator<string> {
  const emojiRe = /[\p{Extended_Pictographic}--[\x23\x2a\x30-\x39]]/gv;
  for (const m of line.matchAll(emojiRe)) {
    yield m[0];
  }
  for (const ch of line) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined && cp > 0x7f && /\p{Sm}/u.test(ch)) {
      yield ch;
    }
  }
}
