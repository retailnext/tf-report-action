import { describe, it, expect } from "vitest";
import { buildCharDiff } from "../../../src/diff/char-diff.js";

describe("buildCharDiff", () => {
  it("returns empty array for two empty strings", () => {
    expect(buildCharDiff("", "")).toEqual([]);
  });

  it("marks all chars as added when before is empty", () => {
    const result = buildCharDiff("", "abc");
    expect(result).toEqual([
      { kind: "added", value: "a" },
      { kind: "added", value: "b" },
      { kind: "added", value: "c" },
    ]);
  });

  it("marks all chars as removed when after is empty", () => {
    const result = buildCharDiff("abc", "");
    expect(result).toEqual([
      { kind: "removed", value: "a" },
      { kind: "removed", value: "b" },
      { kind: "removed", value: "c" },
    ]);
  });

  it("returns all unchanged for identical strings", () => {
    const result = buildCharDiff("hello", "hello");
    expect(result.every((e) => e.kind === "unchanged")).toBe(true);
    expect(result.map((e) => e.value).join("")).toBe("hello");
  });

  it("handles single character change", () => {
    const result = buildCharDiff("cat", "bat");
    const kinds = result.map((e) => e.kind);
    expect(kinds).toContain("removed");
    expect(kinds).toContain("added");
    expect(kinds).toContain("unchanged");
  });

  it("produces a diff that reconstructs both strings", () => {
    const before = "hello world";
    const after = "hello earth";
    const result = buildCharDiff(before, after);

    const reconstructBefore = result
      .filter((e) => e.kind !== "added")
      .map((e) => e.value)
      .join("");
    const reconstructAfter = result
      .filter((e) => e.kind !== "removed")
      .map((e) => e.value)
      .join("");

    expect(reconstructBefore).toBe(before);
    expect(reconstructAfter).toBe(after);
  });

  it("handles unicode characters", () => {
    const result = buildCharDiff("café", "cafe");
    expect(result.length).toBeGreaterThan(0);
    const reconstructAfter = result
      .filter((e) => e.kind !== "removed")
      .map((e) => e.value)
      .join("");
    expect(reconstructAfter).toBe("cafe");
  });

  it("handles completely different strings", () => {
    const result = buildCharDiff("abc", "xyz");
    // No unchanged entries
    expect(result.every((e) => e.kind !== "unchanged")).toBe(true);
  });
});
