/**
 * Portions of this file are derived from tfplan2md by oocx (https://github.com/oocx/tfplan2md),
 * used under the MIT License.
 */

import type { LcsPair } from "./types.js";

const MAX_LCS_CELLS = 10_000_000;

/**
 * Computes LCS pairs between two sequences.
 * Returns empty array if the matrix would exceed MAX_LCS_CELLS (10,000,000)
 * to prevent memory/CPU blowup on large values.
 */
export function computeLcsPairs(before: string[], after: string[]): LcsPair[] {
  const m = before.length;
  const n = after.length;

  if (m === 0 || n === 0) return [];
  if (m * n > MAX_LCS_CELLS) return [];

  // Build DP table
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (before[i - 1] === after[j - 1]) {
        (dp[i] as number[])[j] = (dp[i - 1]?.[j - 1] ?? 0) + 1;
      } else {
        (dp[i] as number[])[j] = Math.max(
          dp[i - 1]?.[j] ?? 0,
          dp[i]?.[j - 1] ?? 0,
        );
      }
    }
  }

  // Backtrack to find pairs
  const pairs: LcsPair[] = [];
  let i = m;
  let j = n;

  while (i > 0 && j > 0) {
    if (before[i - 1] === after[j - 1]) {
      pairs.push({ beforeIndex: i - 1, afterIndex: j - 1 });
      i--;
      j--;
    } else if ((dp[i - 1]?.[j] ?? 0) >= (dp[i]?.[j - 1] ?? 0)) {
      i--;
    } else {
      j--;
    }
  }

  pairs.reverse();
  return pairs;
}
