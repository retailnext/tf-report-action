import { describe, it, expect } from "vitest";
import {
  composeSections,
  DEFAULT_MAX_OUTPUT_LENGTH,
} from "../../../src/compositor/index.js";
import type { Section } from "../../../src/compositor/types.js";

describe("composeSections", () => {
  describe("basic assembly", () => {
    it("assembles sections in order when budget allows", () => {
      const sections: Section[] = [
        { id: "title", full: "# Title\n", fixed: true },
        { id: "summary", full: "Summary text\n" },
        { id: "details", full: "Detail text\n" },
      ];
      const result = composeSections(sections, 1000);
      expect(result.output).toBe("# Title\nSummary text\nDetail text\n");
      expect(result.degradedCount).toBe(0);
      expect(result.omittedCount).toBe(0);
    });

    it("returns empty output for empty sections", () => {
      const result = composeSections([], 1000);
      expect(result.output).toBe("");
      expect(result.degradedCount).toBe(0);
      expect(result.omittedCount).toBe(0);
    });

    it("assembles only fixed sections when all flex sections are empty strings", () => {
      const sections: Section[] = [
        { id: "marker", full: "<!-- marker -->\n", fixed: true },
        { id: "content", full: "" },
      ];
      const result = composeSections(sections, 1000);
      expect(result.output).toBe("<!-- marker -->\n");
    });
  });

  describe("progressive degradation", () => {
    it("degrades section to compact when full doesn't fit", () => {
      const sections: Section[] = [
        { id: "title", full: "Title", fixed: true },
        { id: "resources", full: "x".repeat(100), compact: "x".repeat(20) },
      ];
      const result = composeSections(sections, 30);
      expect(result.output).toBe("Title" + "x".repeat(20));
      expect(result.degradedCount).toBe(1);
      expect(result.degradedIds).toEqual(["resources"]);
      expect(result.omittedCount).toBe(0);
    });

    it("omits section when neither full nor compact fits", () => {
      const sections: Section[] = [
        { id: "title", full: "Title", fixed: true },
        { id: "resources", full: "x".repeat(100), compact: "x".repeat(50) },
      ];
      const result = composeSections(sections, 10);
      expect(result.output).toBe("Title");
      expect(result.omittedCount).toBe(1);
      expect(result.omittedIds).toEqual(["resources"]);
      expect(result.degradedCount).toBe(0);
    });

    it("omits section without compact when full doesn't fit", () => {
      const sections: Section[] = [
        { id: "title", full: "Title", fixed: true },
        { id: "resources", full: "x".repeat(100) },
      ];
      const result = composeSections(sections, 10);
      expect(result.output).toBe("Title");
      expect(result.omittedCount).toBe(1);
      expect(result.omittedIds).toEqual(["resources"]);
    });

    it("degrades some sections and omits others", () => {
      const sections: Section[] = [
        { id: "title", full: "T", fixed: true },
        { id: "a", full: "aaaa", compact: "aa" },
        { id: "b", full: "bbbb", compact: "bb" },
        { id: "c", full: "cccc", compact: "cc" },
      ];
      // Budget = 1 (title) + 4 (a full) + 2 (b compact) = 7
      const result = composeSections(sections, 7);
      expect(result.output).toBe("Taaaabb");
      expect(result.degradedIds).toEqual(["b"]);
      expect(result.omittedIds).toEqual(["c"]);
    });
  });

  describe("fixed sections", () => {
    it("always includes fixed sections even when over budget", () => {
      const sections: Section[] = [
        { id: "title", full: "x".repeat(20), fixed: true },
      ];
      const result = composeSections(sections, 5);
      // Fixed sections always included even if they exceed budget
      expect(result.output).toBe("x".repeat(20));
    });

    it("preserves order of fixed and flex sections", () => {
      const sections: Section[] = [
        { id: "marker", full: "[M]", fixed: true },
        { id: "content", full: "[C]" },
        { id: "footer", full: "[F]", fixed: true },
      ];
      const result = composeSections(sections, 1000);
      expect(result.output).toBe("[M][C][F]");
    });

    it("preserves order when flex sections are omitted", () => {
      const sections: Section[] = [
        { id: "marker", full: "[M]", fixed: true },
        { id: "content", full: "x".repeat(100) },
        { id: "footer", full: "[F]", fixed: true },
      ];
      const result = composeSections(sections, 10);
      expect(result.output).toBe("[M][F]");
      expect(result.omittedIds).toEqual(["content"]);
    });
  });

  describe("budget edge cases", () => {
    it("fits section at exactly the remaining budget", () => {
      const sections: Section[] = [{ id: "a", full: "12345" }];
      const result = composeSections(sections, 5);
      expect(result.output).toBe("12345");
      expect(result.degradedCount).toBe(0);
      expect(result.omittedCount).toBe(0);
    });

    it("degrades when one character over budget", () => {
      const sections: Section[] = [{ id: "a", full: "123456", compact: "123" }];
      const result = composeSections(sections, 5);
      expect(result.output).toBe("123");
      expect(result.degradedIds).toEqual(["a"]);
    });

    it("handles zero budget", () => {
      const sections: Section[] = [{ id: "a", full: "text", compact: "" }];
      const result = composeSections(sections, 0);
      expect(result.output).toBe("");
      expect(result.degradedIds).toEqual(["a"]);
    });

    it("handles negative remaining budget from fixed sections", () => {
      const sections: Section[] = [
        { id: "title", full: "x".repeat(100), fixed: true },
        { id: "content", full: "y" },
      ];
      const result = composeSections(sections, 50);
      expect(result.output).toBe("x".repeat(100));
      expect(result.omittedIds).toEqual(["content"]);
    });
  });

  describe("DEFAULT_MAX_OUTPUT_LENGTH", () => {
    it("is 63 * 1024", () => {
      expect(DEFAULT_MAX_OUTPUT_LENGTH).toBe(63 * 1024);
    });
  });
});
