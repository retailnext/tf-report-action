import { describe, expect, it } from "vitest";
import type { ReportElement } from "../../../src/renderable/types.js";
import { RawStdoutElement } from "../../../src/elements/raw-stdout.js";

function assertElementSizeInvariant(el: ReportElement, label?: string): void {
  for (const fmt of ["markdown", "html"] as const) {
    for (let lvl = 0; lvl < el.levels; lvl++) {
      const rendered = el.render(fmt, lvl);
      expect(
        el.size(fmt, lvl),
        `${label ?? el.id} size(${fmt}, ${String(lvl)})`,
      ).toBe(rendered.length);
    }
  }
}

describe("RawStdoutElement", () => {
  it("has correct metadata", () => {
    const el = new RawStdoutElement("plan", "Plan Output", "some content");
    expect(el.id).toBe("raw-plan");
    expect(el.fixed).toBe(true);
    expect(el.levels).toBe(1);
  });

  it("derives id from stepId", () => {
    const el = new RawStdoutElement("apply", "Apply Output", "content");
    expect(el.id).toBe("raw-apply");
  });

  it("renders as details with escaped label in markdown", () => {
    const el = new RawStdoutElement("plan", "Plan Output", "hello world");
    const md = el.render("markdown", 0);
    expect(md).toContain("<details>");
    expect(md).toContain("<summary>Plan Output</summary>");
  });

  it("renders as details with escaped label in HTML", () => {
    const el = new RawStdoutElement("plan", "Plan Output", "hello world");
    const html = el.render("html", 0);
    expect(html).toContain("<details>");
    expect(html).toContain("<summary>Plan Output</summary>");
  });

  it("escapes HTML entities in label", () => {
    const el = new RawStdoutElement("plan", "Output <raw>", "content");
    const md = el.render("markdown", 0);
    expect(md).toContain("&lt;raw&gt;");
    expect(md).not.toContain("<raw>");
  });

  it("formats content through buildRawOutputRenderable", () => {
    const el = new RawStdoutElement("plan", "Plan", "plain text content");
    const md = el.render("markdown", 0);
    // Plain text falls back to 4-backtick code block
    expect(md).toContain("````");
    expect(md).toContain("plain text content");
  });

  it("satisfies the size invariant for plain text content", () => {
    const el = new RawStdoutElement("plan", "Plan Output", "some content here");
    assertElementSizeInvariant(el, "plain-text");
  });

  it("satisfies the size invariant with HTML entities in label", () => {
    const el = new RawStdoutElement(
      "apply",
      "Apply <staging> & more",
      "content",
    );
    assertElementSizeInvariant(el, "html-entities");
  });

  it("satisfies the size invariant for empty content", () => {
    const el = new RawStdoutElement("plan", "Plan", "");
    assertElementSizeInvariant(el, "empty-content");
  });
});
