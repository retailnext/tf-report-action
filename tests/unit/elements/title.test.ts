import { describe, expect, it } from "vitest";
import type { ReportElement } from "../../../src/renderable/types.js";
import type {
  Renderable,
  OutputFormat,
} from "../../../src/model/renderable.js";
import type { ReportTitle } from "../../../src/model/report-title.js";
import {
  TitleElement,
  MarkerElement,
  WarningElement,
  UserTitleElement,
  LogsUrlElement,
} from "../../../src/elements/title.js";

/** Simple Renderable that returns the same text in both formats. */
class PlainWarning implements Renderable {
  constructor(private readonly text: string) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(_format: OutputFormat): number {
    return this.text.length;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(_format: OutputFormat): string {
    return this.text;
  }
}

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

const planTitle: ReportTitle = {
  status: "success",
  body: { kind: "succeeded", operation: "plan" },
};

const applyTitle: ReportTitle = {
  status: "success",
  body: { kind: "succeeded", operation: "apply" },
};

// ---------------------------------------------------------------------------
// TitleElement
// ---------------------------------------------------------------------------

describe("TitleElement", () => {
  it("has correct metadata", () => {
    const el = new TitleElement(planTitle);
    expect(el.id).toBe("title");
    expect(el.fixed).toBe(true);
    expect(el.levels).toBe(1);
  });

  it("renders as H2 heading in markdown", () => {
    const el = new TitleElement(applyTitle);
    expect(el.render("markdown", 0)).toBe("## ✅ Apply Succeeded\n\n");
  });

  it("renders as H2 heading in HTML", () => {
    const el = new TitleElement(applyTitle);
    expect(el.render("html", 0)).toBe("<h2>✅ Apply Succeeded</h2>\n");
  });

  it("satisfies the size invariant", () => {
    assertElementSizeInvariant(
      new TitleElement({ status: "success", body: { kind: "succeeded" } }),
    );
  });

  it("escapes HTML entities in HTML format", () => {
    const el = new TitleElement({
      status: "success",
      workspace: "<staging>",
      body: { kind: "succeeded", operation: "plan" },
    });
    expect(el.render("html", 0)).toBe(
      "<h2>✅ <code>&lt;staging&gt;</code> Plan Succeeded</h2>\n",
    );
    assertElementSizeInvariant(el, "title-with-entities");
  });

  it("renders output changes for an outputs-only plan", () => {
    const el = new TitleElement({
      status: "success",
      body: {
        kind: "summary",
        operation: "plan",
        counts: [],
        failures: [],
        failureTotal: 0,
        outputChanges: 13,
        hasStepFailure: false,
      },
    });
    expect(el.render("markdown", 0)).toBe("## ✅ Plan: 13 output changes\n\n");
  });

  it("uses singular wording for a single output change", () => {
    const el = new TitleElement({
      status: "success",
      body: {
        kind: "summary",
        operation: "plan",
        counts: [],
        failures: [],
        failureTotal: 0,
        outputChanges: 1,
        hasStepFailure: false,
      },
    });
    expect(el.render("markdown", 0)).toBe("## ✅ Plan: 1 output change\n\n");
  });

  it("appends output changes after plan resource counts", () => {
    const el = new TitleElement({
      status: "success",
      body: {
        kind: "summary",
        operation: "plan",
        counts: [{ action: "create", count: 3 }],
        failures: [],
        failureTotal: 0,
        outputChanges: 2,
        hasStepFailure: false,
      },
    });
    expect(el.render("markdown", 0)).toBe(
      "## ✅ Plan: 3 to add, 2 output changes\n\n",
    );
  });

  it("renders output changes for an outputs-only apply", () => {
    const el = new TitleElement({
      status: "success",
      body: {
        kind: "summary",
        operation: "apply",
        counts: [],
        failures: [],
        failureTotal: 0,
        outputChanges: 2,
        hasStepFailure: false,
      },
    });
    expect(el.render("markdown", 0)).toBe("## ✅ Apply: 2 output changes\n\n");
  });

  it("appends output changes after apply resource counts", () => {
    const el = new TitleElement({
      status: "success",
      body: {
        kind: "summary",
        operation: "apply",
        counts: [{ action: "create", count: 3 }],
        failures: [],
        failureTotal: 0,
        outputChanges: 1,
        hasStepFailure: false,
      },
    });
    expect(el.render("markdown", 0)).toBe(
      "## ✅ Apply: 3 added, 1 output change\n\n",
    );
  });

  it("still shows Apply Complete when there are no output changes", () => {
    const el = new TitleElement({
      status: "success",
      body: {
        kind: "summary",
        operation: "apply",
        counts: [],
        failures: [],
        failureTotal: 0,
        outputChanges: 0,
        hasStepFailure: false,
      },
    });
    expect(el.render("markdown", 0)).toBe("## ✅ Apply Complete\n\n");
  });

  it("does not append output changes to an apply-failed title", () => {
    const el = new TitleElement({
      status: "failure",
      body: {
        kind: "summary",
        operation: "apply",
        counts: [],
        failures: [{ action: "failed", count: 1 }],
        failureTotal: 1,
        outputChanges: 5,
        hasStepFailure: false,
      },
    });
    const md = el.render("markdown", 0);
    expect(md).toContain("Apply Failed: 1 failed");
    expect(md).not.toContain("output change");
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
    const el = new WarningElement(new PlainWarning("Something is wrong"), 0);
    expect(el.id).toBe("warning-0");
    expect(el.fixed).toBe(true);
    expect(el.levels).toBe(1);
  });

  it("generates sequential warning IDs", () => {
    expect(new WarningElement(new PlainWarning("w1"), 0).id).toBe("warning-0");
    expect(new WarningElement(new PlainWarning("w2"), 3).id).toBe("warning-3");
  });

  it("renders warning blockquote in markdown", () => {
    const el = new WarningElement(new PlainWarning("State mismatch"), 0);
    const md = el.render("markdown", 0);
    expect(md).toContain("**Warning:**");
    expect(md).toContain("State mismatch");
    expect(md).toMatch(/^> /);
  });

  it("renders warning blockquote in HTML", () => {
    const el = new WarningElement(new PlainWarning("State mismatch"), 0);
    const html = el.render("html", 0);
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<strong>Warning:</strong>");
    expect(html).toContain("State mismatch");
  });

  it("delegates to body renderable for format-specific escaping", () => {
    const el = new WarningElement(new PlainWarning("Use <caution>"), 0);
    // The body is a PlainWarning which renders identically in both formats;
    // WarningBlockquoteChrome does NOT double-escape the body.
    const html = el.render("html", 0);
    expect(html).toContain("Use <caution>");
  });

  it("satisfies the size invariant", () => {
    assertElementSizeInvariant(
      new WarningElement(new PlainWarning("test warning"), 0),
    );
    assertElementSizeInvariant(
      new WarningElement(new PlainWarning("warn <html>"), 1),
    );
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
