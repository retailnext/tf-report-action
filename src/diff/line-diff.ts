/**
 * Portions of this file are derived from tfplan2md by oocx (https://github.com/oocx/tfplan2md),
 * used under the MIT License.
 */

import type { DiffEntry } from "./types.js";
import { computeLcsPairs } from "./lcs.js";

/**
 * Builds a line-level diff. Results are cached in the provided cache map
 * (pass a new Map() per render pass; clear it between passes).
 */
export function buildLineDiff(
  before: string,
  after: string,
  cache: Map<string, DiffEntry[]>,
): DiffEntry[] {
  const cacheKey = `${before}\x00${after}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");

  const result = buildDiffFromSequences(beforeLines, afterLines);
  cache.set(cacheKey, result);
  return result;
}

function buildDiffFromSequences(before: string[], after: string[]): DiffEntry[] {
  const pairs = computeLcsPairs(before, after);
  const result: DiffEntry[] = [];

  let bi = 0;
  let ai = 0;
  let pi = 0;

  while (bi < before.length || ai < after.length) {
    const pair = pi < pairs.length ? pairs[pi] : undefined;

    if (pair?.beforeIndex === bi && pair.afterIndex === ai) {
      // Matched pair — unchanged
      result.push({ kind: "unchanged", value: before[bi] ?? "" });
      bi++;
      ai++;
      pi++;
    } else if (
      ai >= after.length ||
      (pair !== undefined && bi < pair.beforeIndex)
    ) {
      // before has items left that aren't in LCS — removed
      result.push({ kind: "removed", value: before[bi] ?? "" });
      bi++;
    } else {
      // after has items left that aren't in LCS — added
      result.push({ kind: "added", value: after[ai] ?? "" });
      ai++;
    }
  }

  return result;
}
