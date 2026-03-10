import { describe, it, expect } from "vitest";
import { formatDiff } from "../../../src/renderer/diff-format.js";

describe("formatDiff", () => {
  describe("both null/empty", () => {
    it("returns empty string when both are null", () => {
      expect(formatDiff(null, null, "inline")).toBe("");
    });

    it("returns empty string when both are empty strings", () => {
      expect(formatDiff("", "", "inline")).toBe("");
    });
  });

  describe("identical values", () => {
    it("wraps identical string in code tags", () => {
      const result = formatDiff("hello", "hello", "inline");
      expect(result).toBe("<code>hello</code>");
    });

    it("escapes pipes in identical values", () => {
      const result = formatDiff("a|b", "a|b", "inline");
      expect(result).toContain("a\\|b");
    });
  });

  describe("simple format", () => {
    it("shows - before and + after for changed values", () => {
      const result = formatDiff("old", "new", "simple");
      expect(result).toContain("- old");
      expect(result).toContain("+ new");
    });

    it("shows only + when before is empty", () => {
      const result = formatDiff(null, "new", "simple");
      expect(result).toContain("+ new");
      expect(result).not.toContain("-");
    });

    it("shows only - when after is empty", () => {
      const result = formatDiff("old", null, "simple");
      expect(result).toContain("- old");
      expect(result).not.toContain("+");
    });
  });

  describe("inline format", () => {
    it("wraps result in code tags", () => {
      const result = formatDiff("old", "new", "inline");
      expect(result).toMatch(/^<code>/);
      expect(result).toMatch(/<\/code>$/);
    });

    it("uses del for removed chars", () => {
      const result = formatDiff("old", "new", "inline");
      expect(result).toContain("<del");
    });

    it("uses ins for added chars", () => {
      const result = formatDiff("old", "new", "inline");
      expect(result).toContain("<ins");
    });

    it("handles multiline before/after", () => {
      const result = formatDiff("line1\nline2", "line1\nchanged", "inline");
      expect(result).toContain("<br>");
    });

    it("shows unchanged chars without del/ins wrapping", () => {
      // "cat" → "bat": only first char changes, "at" is preserved
      const result = formatDiff("cat", "bat", "inline");
      // Should contain "at" as plain text within code block
      expect(result).toContain("at");
    });

    it("handles one side null (before null)", () => {
      const result = formatDiff(null, "value", "inline");
      expect(result).toContain("value");
    });

    it("handles one side null (after null)", () => {
      const result = formatDiff("value", null, "inline");
      expect(result).toContain("value");
    });
  });
});
