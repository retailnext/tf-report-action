import { describe, expect, it } from "vitest";
import {
  htmlEscape,
  htmlEscapeSize,
} from "../../../src/renderable/html-escape.js";

describe("htmlEscapeSize", () => {
  it("returns length unchanged for plain text", () => {
    expect(htmlEscapeSize("hello world")).toBe(11);
  });

  it("accounts for ampersand entity expansion", () => {
    // "&" → "&amp;" = 5 chars
    expect(htmlEscapeSize("a&b")).toBe(7); // "a" + "&amp;" + "b"
  });

  it("accounts for less-than entity expansion", () => {
    // "<" → "&lt;" = 4 chars
    expect(htmlEscapeSize("a<b")).toBe(6); // "a" + "&lt;" + "b"
  });

  it("accounts for greater-than entity expansion", () => {
    // ">" → "&gt;" = 4 chars
    expect(htmlEscapeSize("a>b")).toBe(6);
  });

  it("accounts for double-quote entity expansion", () => {
    // '"' → "&quot;" = 6 chars
    expect(htmlEscapeSize('a"b')).toBe(8); // "a" + "&quot;" + "b"
  });

  it("handles multiple special characters", () => {
    const input = '<div class="test">&</div>';
    expect(htmlEscapeSize(input)).toBe(htmlEscape(input).length);
  });

  it("returns 0 for empty string", () => {
    expect(htmlEscapeSize("")).toBe(0);
  });

  it("handles string with only special characters", () => {
    expect(htmlEscapeSize('<>&"')).toBe(htmlEscape('<>&"').length);
  });
});

describe("htmlEscape", () => {
  it("escapes ampersand", () => {
    expect(htmlEscape("a&b")).toBe("a&amp;b");
  });

  it("escapes less-than", () => {
    expect(htmlEscape("a<b")).toBe("a&lt;b");
  });

  it("escapes greater-than", () => {
    expect(htmlEscape("a>b")).toBe("a&gt;b");
  });

  it("escapes double-quote", () => {
    expect(htmlEscape('a"b')).toBe("a&quot;b");
  });

  it("escapes all special characters together", () => {
    expect(htmlEscape('<"&">')).toBe("&lt;&quot;&amp;&quot;&gt;");
  });

  it("returns empty string unchanged", () => {
    expect(htmlEscape("")).toBe("");
  });

  it("returns plain text unchanged", () => {
    expect(htmlEscape("hello world")).toBe("hello world");
  });
});

describe("htmlEscapeSize matches htmlEscape().length", () => {
  const testCases = [
    "",
    "plain text",
    "hello & world",
    "<script>alert('xss')</script>",
    '{"key": "value"}',
    "a < b > c & d",
    "<<<>>>",
    '"""',
    "no special chars here 123",
    'mixed <b>bold</b> & "quoted" text > 0',
  ];

  for (const input of testCases) {
    it(`size matches for: ${JSON.stringify(input)}`, () => {
      expect(htmlEscapeSize(input)).toBe(htmlEscape(input).length);
    });
  }
});
