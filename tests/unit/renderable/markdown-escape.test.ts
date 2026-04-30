import { describe, expect, it } from "vitest";
import {
  markdownEscape,
  markdownEscapeBlock,
} from "../../../src/renderable/markdown-escape.js";

describe("markdownEscape", () => {
  it("returns plain text unchanged", () => {
    expect(markdownEscape("hello world 123")).toBe("hello world 123");
  });

  it("escapes markdown emphasis characters", () => {
    expect(markdownEscape("**bold** and _italic_")).toBe(
      "\\*\\*bold\\*\\* and \\_italic\\_",
    );
  });

  it("escapes backticks", () => {
    expect(markdownEscape("`code`")).toBe("\\`code\\`");
  });

  it("escapes link bracket syntax", () => {
    expect(markdownEscape("[text](url)")).toBe("\\[text\\](url)");
  });

  it("does not escape block-only characters in inline context", () => {
    // # is ATX heading (block-level only), - + are list markers (block-level only),
    // . is ordered list (block-level only), ! is image prefix (only with [)
    expect(markdownEscape("# heading")).toBe("# heading");
    expect(markdownEscape("+ item - other")).toBe("+ item - other");
    expect(markdownEscape("!image")).toBe("!image");
    expect(markdownEscape("1. item")).toBe("1. item");
  });

  it("escapes pipe for table context", () => {
    expect(markdownEscape("a | b")).toBe("a \\| b");
  });

  it("escapes backslash", () => {
    expect(markdownEscape("a\\b")).toBe("a\\\\b");
  });

  it("escapes strikethrough tildes", () => {
    expect(markdownEscape("~deleted~")).toBe("\\~deleted\\~");
  });

  it("does not escape parens and braces (not inline-significant)", () => {
    expect(markdownEscape("{a}")).toBe("{a}");
    expect(markdownEscape("(foo)")).toBe("(foo)");
  });

  // HTML escaping — critical for security
  it("escapes HTML angle brackets", () => {
    expect(markdownEscape("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  it("escapes ampersand", () => {
    expect(markdownEscape("AT&T")).toBe("AT&amp;T");
  });

  it("does not escape double quotes (not inline-significant)", () => {
    expect(markdownEscape('say "hello"')).toBe('say "hello"');
  });

  it("handles mixed markdown and HTML characters", () => {
    const input = '**<b>bold</b>** & "quoted"';
    const result = markdownEscape(input);
    expect(result).toBe('\\*\\*&lt;b&gt;bold&lt;/b&gt;\\*\\* &amp; "quoted"');
  });

  it("preserves emoji and unicode", () => {
    expect(markdownEscape("✅ hello 🚀")).toBe("✅ hello 🚀");
  });

  it("returns empty string for empty input", () => {
    expect(markdownEscape("")).toBe("");
  });
});

describe("markdownEscapeBlock", () => {
  it("returns plain text unchanged", () => {
    expect(markdownEscapeBlock("hello world")).toBe("hello world");
  });

  it("escapes unordered list triggers at line start", () => {
    expect(markdownEscapeBlock("- list item")).toBe("\\- list item");
    expect(markdownEscapeBlock("+ other item")).toBe("\\+ other item");
  });

  it("does not escape dash/plus without trailing space", () => {
    expect(markdownEscapeBlock("-compact")).toBe("-compact");
    expect(markdownEscapeBlock("+compact")).toBe("+compact");
  });

  it("escapes ordered list triggers at line start", () => {
    expect(markdownEscapeBlock("1. first")).toBe("1\\. first");
    expect(markdownEscapeBlock("99) item")).toBe("99\\) item");
  });

  it("escapes ATX heading triggers at line start", () => {
    expect(markdownEscapeBlock("# heading")).toBe("\\# heading");
    expect(markdownEscapeBlock("### deep")).toBe("\\### deep");
  });

  it("does not escape blockquote trigger (already entity-encoded by inline escaping)", () => {
    // `>` is entity-encoded to `&gt;` by markdownEscape, which prevents
    // block-level blockquote parsing without further escaping.
    expect(markdownEscapeBlock("> nested")).toBe("&gt; nested");
  });

  it("still applies inline escaping", () => {
    expect(markdownEscapeBlock("- **bold**")).toBe("\\- \\*\\*bold\\*\\*");
  });

  it("does not escape mid-line triggers", () => {
    expect(markdownEscapeBlock("text - item")).toBe("text - item");
    expect(markdownEscapeBlock("text > quote")).toBe("text &gt; quote");
  });
});
