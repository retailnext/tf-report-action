import { describe, expect, it } from "vitest";
import { htmlEscape } from "../../../src/renderable/html-escape.js";

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
