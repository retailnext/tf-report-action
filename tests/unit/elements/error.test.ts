import { describe, expect, it } from "vitest";
import type { ReportElement } from "../../../src/renderable/types.js";
import {
  ErrorMessageElement,
  ErrorStepTableElement,
} from "../../../src/elements/error.js";
import type { StepOutcome } from "../../../src/model/step-outcome.js";

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
// ErrorMessageElement
// ---------------------------------------------------------------------------

describe("ErrorMessageElement", () => {
  it("has correct metadata", () => {
    const el = new ErrorMessageElement("Something went wrong");
    expect(el.id).toBe("message");
    expect(el.fixed).toBe(true);
    expect(el.levels).toBe(1);
  });

  it("renders as a paragraph in markdown", () => {
    const el = new ErrorMessageElement("Plan failed");
    expect(el.render("markdown", 0)).toBe("Plan failed\n\n");
  });

  it("renders as a paragraph in HTML", () => {
    const el = new ErrorMessageElement("Plan failed");
    expect(el.render("html", 0)).toBe("<p>Plan failed</p>\n");
  });

  it("escapes HTML entities in HTML format", () => {
    const el = new ErrorMessageElement("Error: <unexpected>");
    const html = el.render("html", 0);
    expect(html).toContain("&lt;unexpected&gt;");
  });

  it("satisfies the size invariant", () => {
    assertElementSizeInvariant(new ErrorMessageElement("Something went wrong"));
    assertElementSizeInvariant(
      new ErrorMessageElement("Error: <html>"),
      "html-entities",
    );
  });
});

// ---------------------------------------------------------------------------
// ErrorStepTableElement
// ---------------------------------------------------------------------------

describe("ErrorStepTableElement", () => {
  it("has correct metadata", () => {
    const el = new ErrorStepTableElement([]);
    expect(el.id).toBe("step-statuses");
    expect(el.fixed).toBe(true);
    expect(el.levels).toBe(1);
  });

  it("renders EMPTY for empty steps in both formats", () => {
    const el = new ErrorStepTableElement([]);
    expect(el.render("markdown", 0)).toBe("");
    expect(el.render("html", 0)).toBe("");
    expect(el.size("markdown", 0)).toBe(0);
    expect(el.size("html", 0)).toBe(0);
  });

  it("renders heading and table with steps", () => {
    const steps: StepOutcome[] = [
      { id: "init", outcome: "success" },
      { id: "plan", outcome: "failure" },
    ];
    const el = new ErrorStepTableElement(steps);
    const md = el.render("markdown", 0);
    expect(md).toContain("### Steps");
    expect(md).toContain("`init`");
    expect(md).toContain("`plan`");
  });

  it("renders heading and table in HTML", () => {
    const steps: StepOutcome[] = [{ id: "init", outcome: "success" }];
    const el = new ErrorStepTableElement(steps);
    const html = el.render("html", 0);
    expect(html).toContain("<h3>Steps</h3>");
    expect(html).toContain("<code>init</code>");
  });

  it("satisfies the size invariant with steps", () => {
    const steps: StepOutcome[] = [
      { id: "init", outcome: "success" },
      { id: "plan", outcome: "failure", exitCode: "1" },
    ];
    assertElementSizeInvariant(new ErrorStepTableElement(steps), "with-steps");
  });

  it("satisfies the size invariant with empty steps", () => {
    assertElementSizeInvariant(new ErrorStepTableElement([]), "empty-steps");
  });
});
