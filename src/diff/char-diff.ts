import type { DiffEntry } from "./types.js";
import { computeLcsPairs } from "./lcs.js";

/**
 * Builds a character-level diff between two single-line strings.
 */
export function buildCharDiff(before: string, after: string): DiffEntry[] {
  // Array.from iterates the string's Unicode code points (same as spread),
  // avoiding the no-misused-spread lint rule.
  const beforeChars = Array.from(before);
  const afterChars = Array.from(after);

  const pairs = computeLcsPairs(beforeChars, afterChars);
  const result: DiffEntry[] = [];

  let bi = 0;
  let ai = 0;
  let pi = 0;

  while (bi < beforeChars.length || ai < afterChars.length) {
    const pair = pi < pairs.length ? pairs[pi] : undefined;

    if (pair?.beforeIndex === bi && pair.afterIndex === ai) {
      result.push({ kind: "unchanged", value: beforeChars[bi] ?? "" });
      bi++;
      ai++;
      pi++;
    } else if (
      ai >= afterChars.length ||
      (pair !== undefined && bi < pair.beforeIndex)
    ) {
      result.push({ kind: "removed", value: beforeChars[bi] ?? "" });
      bi++;
    } else {
      result.push({ kind: "added", value: afterChars[ai] ?? "" });
      ai++;
    }
  }

  return result;
}
