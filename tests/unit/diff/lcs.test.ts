import { describe, it, expect } from "vitest";
import { computeLcsPairs } from "../../../src/diff/lcs.js";

describe("computeLcsPairs", () => {
  it("returns empty array for empty before", () => {
    expect(computeLcsPairs([], ["a", "b"])).toEqual([]);
  });

  it("returns empty array for empty after", () => {
    expect(computeLcsPairs(["a", "b"], [])).toEqual([]);
  });

  it("returns empty array for both empty", () => {
    expect(computeLcsPairs([], [])).toEqual([]);
  });

  it("computes LCS for identical sequences", () => {
    const pairs = computeLcsPairs(["a", "b", "c"], ["a", "b", "c"]);
    expect(pairs).toEqual([
      { beforeIndex: 0, afterIndex: 0 },
      { beforeIndex: 1, afterIndex: 1 },
      { beforeIndex: 2, afterIndex: 2 },
    ]);
  });

  it("computes LCS for completely different sequences", () => {
    const pairs = computeLcsPairs(["a", "b"], ["c", "d"]);
    expect(pairs).toEqual([]);
  });

  it("computes LCS for classic example", () => {
    // "ABCBDAB" vs "BDCAB" → LCS = "BCAB" or "BDAB" (length 4)
    const pairs = computeLcsPairs(
      ["A", "B", "C", "B", "D", "A", "B"],
      ["B", "D", "C", "A", "B"],
    );
    expect(pairs.length).toBe(4);
    // Verify all pairs reference matching values
    const before = ["A", "B", "C", "B", "D", "A", "B"];
    const after = ["B", "D", "C", "A", "B"];
    for (const pair of pairs) {
      expect(before[pair.beforeIndex]).toBe(after[pair.afterIndex]);
    }
  });

  it("returns pairs in increasing order of indices", () => {
    const pairs = computeLcsPairs(["a", "b", "c", "d"], ["b", "c"]);
    for (let i = 1; i < pairs.length; i++) {
      expect(pairs[i]!.beforeIndex).toBeGreaterThan(pairs[i - 1]!.beforeIndex);
      expect(pairs[i]!.afterIndex).toBeGreaterThan(pairs[i - 1]!.afterIndex);
    }
  });

  it("returns empty when matrix exceeds 10M cells", () => {
    // 3163 * 3163 ≈ 10,004,569 > 10M
    const large = Array.from({ length: 3163 }, (_, i) => String(i));
    const result = computeLcsPairs(large, large);
    expect(result).toEqual([]);
  });

  it("handles single element sequences that match", () => {
    expect(computeLcsPairs(["x"], ["x"])).toEqual([
      { beforeIndex: 0, afterIndex: 0 },
    ]);
  });

  it("handles single element sequences that don't match", () => {
    expect(computeLcsPairs(["x"], ["y"])).toEqual([]);
  });

  it("handles sequences at exactly MAX_LCS_CELLS boundary (allowed)", () => {
    // 3162 * 3162 = 9,998,244 < 10M, should compute
    const a = Array.from({ length: 100 }, (_, i) => String(i));
    const b = Array.from({ length: 100 }, (_, i) => String(i));
    const result = computeLcsPairs(a, b);
    expect(result.length).toBe(100);
  });
});
