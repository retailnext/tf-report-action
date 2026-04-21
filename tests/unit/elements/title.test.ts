import { describe, expect, it } from "vitest";
import type { ReportElement } from "../../../src/renderable/types.js";
import {
  TitleElement,
  MarkerElement,
  WarningElement,
  UserTitleElement,
  LogsUrlElement,
} from "../../../src/elements/title.js";

/**
 * Verify the size invariant for a ReportElement at all levels and both
 * formats: size(format, level) === render(format, level).length.
 */
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

// ---------------------------------------------------------------------------
// TitleElement
// ---------------------------------------------------------------------------

describe("TitleElement", () => {
  it("has correct metadata", () => {
    const el = new TitleElement("Plan");
    expect(el.id).toBe("title");
    expect(el.fixed).toBe(true);
    expect(el.levels).toBe(1);
  });

  it("renders as H2 heading in markdown", () => {
    const el = new TitleElement("Apply");
    expect(el.render("markdown", 0)).toBe("## Apply\n\n");
  });

  it("renders as H2 heading in HTML", () => {
    const el = new TitleElement("Apply");
    expect(el.render("html", 0)).toBe("<h2>Apply</h2>\n");
  });

  it("satisfies the size invariant", () => {
    assertElementSizeInvariant(new TitleElement("Some Title"));
  });

  it("escapes HTML entities in HTML format", () => {
    const el = new TitleElement("Plan <staging>");
    expect(el.render("html", 0)).toBe("<h2>Plan &lt;staging&gt;</h2>\n");
    assertElementSizeInvariant(el, "title-with-entities");
  });
});

// ---------------------------------------------------------------------------
// MarkerElement
// ---------------------------------------------------------------------------

describe("MarkerElement", () => {
  it("has correct metadata", () => {
    const el = new MarkerElement("prod");
    expect(el.id).toBe("marker");
    expect(el.fixed).toBe(true);
    expect(el.levels).toBe(1);
  });

  it("renders as HTML comment in both formats", () => {
    const el = new MarkerElement("staging");
    const expected = '<!-- tf-report-action:"staging" -->\n';
    expect(el.render("markdown", 0)).toBe(expected);
    expect(el.render("html", 0)).toBe(expected);
  });

  it("escapes double dashes in workspace name", () => {
    const el = new MarkerElement("my--workspace");
    const rendered = el.render("markdown", 0);
    // Dashes are separated by zero-width space to prevent --> termination
    expect(rendered).toContain("-\u200B-");
    expect(rendered).not.toContain("my--workspace");
  });

  it("escapes quotes in workspace name", () => {
    const el = new MarkerElement('has"quote');
    const rendered = el.render("markdown", 0);
    expect(rendered).toContain('\\"');
  });

  it("satisfies the size invariant", () => {
    assertElementSizeInvariant(new MarkerElement("prod"));
    assertElementSizeInvariant(new MarkerElement("my--workspace"));
  });
});

// ---------------------------------------------------------------------------
// WarningElement
// ---------------------------------------------------------------------------

describe("WarningElement", () => {
  it("has correct metadata", () => {
    const el = new WarningElement("Something is wrong", 0);
    expect(el.id).toBe("warning-0");
    expect(el.fixed).toBe(true);
    expect(el.levels).toBe(1);
  });

  it("generates sequential warning IDs", () => {
    expect(new WarningElement("w1", 0).id).toBe("warning-0");
    expect(new WarningElement("w2", 3).id).toBe("warning-3");
  });

  it("renders warning blockquote in markdown", () => {
    const el = new WarningElement("State mismatch", 0);
    const md = el.render("markdown", 0);
    expect(md).toContain("**Warning:**");
    expect(md).toContain("State mismatch");
    expect(md).toMatch(/^> /);
  });

  it("renders warning blockquote in HTML", () => {
    const el = new WarningElement("State mismatch", 0);
    const html = el.render("html", 0);
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<strong>Warning:</strong>");
    expect(html).toContain("State mismatch");
  });

  it("escapes HTML entities in HTML format", () => {
    const el = new WarningElement("Use <caution>", 0);
    const html = el.render("html", 0);
    expect(html).toContain("&lt;caution&gt;");
  });

  it("satisfies the size invariant", () => {
    assertElementSizeInvariant(new WarningElement("test warning", 0));
    assertElementSizeInvariant(new WarningElement("warn <html>", 1));
  });
});

// ---------------------------------------------------------------------------
// UserTitleElement
// ---------------------------------------------------------------------------

describe("UserTitleElement", () => {
  it("has correct metadata", () => {
    const el = new UserTitleElement("PR #42");
    expect(el.id).toBe("user-title");
    expect(el.fixed).toBe(true);
    expect(el.levels).toBe(1);
  });

  it("renders like TitleElement", () => {
    const el = new UserTitleElement("Custom Title");
    expect(el.render("markdown", 0)).toBe("## Custom Title\n\n");
    expect(el.render("html", 0)).toBe("<h2>Custom Title</h2>\n");
  });

  it("satisfies the size invariant", () => {
    assertElementSizeInvariant(new UserTitleElement("PR #42"));
  });
});

// ---------------------------------------------------------------------------
// LogsUrlElement
// ---------------------------------------------------------------------------

describe("LogsUrlElement", () => {
  it("has correct metadata", () => {
    const el = new LogsUrlElement("https://github.com/run/1");
    expect(el.id).toBe("logs-url");
    expect(el.fixed).toBe(true);
    expect(el.levels).toBe(1);
  });

  it("renders as markdown link in markdown", () => {
    const url = "https://github.com/owner/repo/actions/runs/123/attempts/1";
    const el = new LogsUrlElement(url);
    expect(el.render("markdown", 0)).toBe(`[View full logs](${url})\n\n`);
  });

  it("renders as HTML anchor in HTML", () => {
    const url = "https://github.com/run/1";
    const el = new LogsUrlElement(url);
    const html = el.render("html", 0);
    expect(html).toContain("<a href=");
    expect(html).toContain(url);
    expect(html).toContain("View full logs");
  });

  it("escapes special chars in URL for HTML", () => {
    const url = "https://example.com/?a=1&b=2";
    const el = new LogsUrlElement(url);
    const html = el.render("html", 0);
    expect(html).toContain("&amp;");
  });

  it("satisfies the size invariant", () => {
    assertElementSizeInvariant(new LogsUrlElement("https://github.com/run/1"));
    assertElementSizeInvariant(
      new LogsUrlElement("https://example.com/?a=1&b=2"),
    );
  });
});
