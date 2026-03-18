import { describe, it, expect } from "vitest";
import { MarkdownWriter } from "../../../src/renderer/writer.js";

describe("MarkdownWriter", () => {
  it("builds an empty string when nothing is written", () => {
    const w = new MarkdownWriter();
    expect(w.build()).toBe("");
  });

  it("renders a heading with a blank line after", () => {
    const w = new MarkdownWriter();
    w.heading("Hello", 2);
    expect(w.build()).toContain("## Hello");
  });

  it("renders headings at all levels", () => {
    for (const level of [1, 2, 3, 4, 5, 6] as const) {
      const w = new MarkdownWriter();
      w.heading("Test", level);
      expect(w.build()).toContain(`${"#".repeat(level)} Test`);
    }
  });

  it("renders a paragraph", () => {
    const w = new MarkdownWriter();
    w.paragraph("Some text");
    expect(w.build()).toContain("Some text");
  });

  it("renders a table header with separator", () => {
    const w = new MarkdownWriter();
    w.tableHeader(["A", "B"]);
    const output = w.build();
    expect(output).toContain("| A | B |");
    expect(output).toContain("| --- | --- |");
  });

  it("renders table rows", () => {
    const w = new MarkdownWriter();
    w.tableHeader(["Col1", "Col2"]);
    w.tableRow(["val1", "val2"]);
    const output = w.build();
    expect(output).toContain("| val1 | val2 |");
  });

  it("renders details block", () => {
    const w = new MarkdownWriter();
    w.detailsOpen("Summary text");
    w.paragraph("Inner content");
    w.detailsClose();
    const output = w.build();
    expect(output).toContain("<details>");
    expect(output).toContain("<summary>Summary text</summary>");
    expect(output).toContain("</details>");
  });

  it("renders open details block when open=true", () => {
    const w = new MarkdownWriter();
    w.detailsOpen("Open block", true);
    w.detailsClose();
    expect(w.build()).toContain("<details open>");
  });

  it("renders code fence", () => {
    const w = new MarkdownWriter();
    w.codeFence("const x = 1;", "typescript");
    const output = w.build();
    expect(output).toContain("```typescript");
    expect(output).toContain("const x = 1;");
    expect(output).toContain("```");
  });

  it("renders raw text verbatim", () => {
    const w = new MarkdownWriter();
    w.raw("<custom>tag</custom>");
    expect(w.build()).toContain("<custom>tag</custom>");
  });

  it("collapses three or more consecutive blank lines to two", () => {
    const w = new MarkdownWriter();
    w.blankLine();
    w.blankLine();
    w.blankLine();
    w.blankLine();
    w.paragraph("text");
    const output = w.build();
    expect(output).not.toMatch(/\n{4,}/);
  });

  it("ensures blank line before headings", () => {
    const w = new MarkdownWriter();
    w.paragraph("intro");
    w.heading("Title", 2);
    const output = w.build();
    // heading must be preceded by at least one blank line
    expect(output).toMatch(/intro\n\n## Title/);
  });

  it("is chainable", () => {
    const w = new MarkdownWriter();
    const result = w.heading("H", 1).paragraph("p").blankLine();
    expect(result).toBe(w);
  });

  describe("static helpers", () => {
    it("escapeCell escapes pipe characters", () => {
      expect(MarkdownWriter.escapeCell("a|b|c")).toBe("a\\|b\\|c");
    });

    it("escapeCell escapes backslash characters", () => {
      expect(MarkdownWriter.escapeCell("a\\b")).toBe("a\\\\b");
    });

    it("escapeCell escapes backslash before pipe", () => {
      expect(MarkdownWriter.escapeCell("a\\|b")).toBe("a\\\\\\|b");
    });

    it("escapeCell leaves non-pipe text unchanged", () => {
      expect(MarkdownWriter.escapeCell("hello world")).toBe("hello world");
    });

    it("inlineCode wraps in code tags", () => {
      expect(MarkdownWriter.inlineCode("value")).toBe("<code>value</code>");
    });
  });
});
