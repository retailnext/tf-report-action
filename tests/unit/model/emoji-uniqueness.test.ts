import { describe, it, expect } from "vitest";
import { ACTION_SYMBOLS } from "../../../src/model/plan-action.js";
import {
  STATUS_SUCCESS,
  STATUS_FAILURE,
  DIAGNOSTIC_ERROR,
  DIAGNOSTIC_WARNING,
} from "../../../src/model/status-icons.js";

/**
 * Enforces that no emoji/symbol is reused to mean two different things.
 *
 * This is a design invariant: every visual indicator in the rendered output
 * must be unambiguous. For example, the same emoji must not represent both
 * "delete action" and "apply failure".
 */
describe("emoji uniqueness", () => {
  it("no emoji appears more than once across action symbols and status indicators", () => {
    const allSymbols = new Map<string, string>();

    // Collect action symbols
    for (const [action, symbol] of Object.entries(ACTION_SYMBOLS)) {
      const normalized = normalizeEmoji(symbol);
      if (allSymbols.has(normalized)) {
        // fail with a clear message showing which two uses collide
        expect.fail(
          `Emoji "${symbol}" is used for both action "${allSymbols.get(normalized)}" ` +
            `and action "${action}"`,
        );
      }
      allSymbols.set(normalized, `action:${action}`);
    }

    // Collect status indicators
    const statusIcons: Record<string, string> = {
      STATUS_SUCCESS,
      STATUS_FAILURE,
      DIAGNOSTIC_ERROR,
      DIAGNOSTIC_WARNING,
    };

    for (const [name, symbol] of Object.entries(statusIcons)) {
      const normalized = normalizeEmoji(symbol);
      if (allSymbols.has(normalized)) {
        expect.fail(
          `Emoji "${symbol}" is used for both "${allSymbols.get(normalized)}" ` +
            `and status indicator "${name}"`,
        );
      }
      allSymbols.set(normalized, `status:${name}`);
    }
  });

  it("action symbols have no duplicates among themselves", () => {
    const seen = new Map<string, string>();
    for (const [action, symbol] of Object.entries(ACTION_SYMBOLS)) {
      const normalized = normalizeEmoji(symbol);
      if (seen.has(normalized)) {
        expect.fail(
          `Emoji "${symbol}" is used for both action "${seen.get(normalized)}" ` +
            `and action "${action}"`,
        );
      }
      seen.set(normalized, action);
    }
  });
});

/**
 * Normalize emoji by stripping variation selectors (U+FE0E, U+FE0F) so
 * visually-identical emoji like 🗑 (U+1F5D1) and 🗑️ (U+1F5D1 U+FE0F)
 * are treated as the same symbol.
 */
function normalizeEmoji(s: string): string {
  return s.replace(/[\uFE0E\uFE0F]/g, "");
}
