import { describe, expect, it } from "vitest";
import type { ReportElement } from "../../../src/renderable/types.js";
import { TextFallbackElement } from "../../../src/elements/text-fallback.js";

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

describe("TextFallbackElement", () => {
  it("has correct metadata", () => {
    const el = new TextFallbackElement("plan", "Plan Output", "content");
    expect(el.id).toBe("raw-plan");
    expect(el.fixed).toBe(false);
    expect(el.levels).toBe(2);
  });

  it("derives id from stepId", () => {
    const el = new TextFallbackElement("apply", "Apply Output", "content");
    expect(el.id).toBe("raw-apply");
  });

  it("level 0 renders heading and omitted placeholder in markdown", () => {
    const el = new TextFallbackElement("plan", "Plan Output", "long content");
    const md = el.render("markdown", 0);
    expect(md).toContain("### Plan Output");
    expect(md).toContain("_(omitted due to size)_");
  });

  it("level 0 renders heading and omitted placeholder in HTML", () => {
    const el = new TextFallbackElement("plan", "Plan Output", "long content");
    const html = el.render("html", 0);
    expect(html).toContain("<h3>Plan Output</h3>");
    expect(html).toContain("omitted due to size");
  });

  it("level 1 renders heading and formatted raw output in markdown", () => {
    const el = new TextFallbackElement("plan", "Plan Output", "raw content");
    const md = el.render("markdown", 1);
    expect(md).toContain("### Plan Output");
    expect(md).toContain("raw content");
    expect(md).not.toContain("omitted");
  });

  it("level 1 renders heading and formatted raw output in HTML", () => {
    const el = new TextFallbackElement("plan", "Plan Output", "raw content");
    const html = el.render("html", 1);
    expect(html).toContain("<h3>Plan Output</h3>");
    expect(html).toContain("raw content");
    expect(html).not.toContain("omitted");
  });

  it("level 0 size < level 1 size for non-trivial content", () => {
    const el = new TextFallbackElement(
      "plan",
      "Plan Output",
      "This is some reasonably long content that should make level 1 bigger.",
    );
    for (const fmt of ["markdown", "html"] as const) {
      expect(el.size(fmt, 0), `compact < full in ${fmt}`).toBeLessThan(
        el.size(fmt, 1),
      );
    }
  });

  it("satisfies the size invariant at all levels", () => {
    const el = new TextFallbackElement(
      "plan",
      "Plan Output",
      "some content to render",
    );
    assertElementSizeInvariant(el, "text-fallback");
  });

  it("satisfies the size invariant with empty content", () => {
    const el = new TextFallbackElement("plan", "Plan Output", "");
    assertElementSizeInvariant(el, "empty-content");
  });
});
