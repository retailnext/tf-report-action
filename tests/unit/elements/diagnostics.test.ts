import { describe, expect, it } from "vitest";
import type { ReportElement } from "../../../src/renderable/types.js";
import { DiagnosticsElement } from "../../../src/elements/diagnostics.js";
import type { Diagnostic } from "../../../src/model/diagnostic.js";

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

describe("DiagnosticsElement", () => {
  it("has correct metadata", () => {
    const el = new DiagnosticsElement("diag-plan", []);
    expect(el.id).toBe("diag-plan");
    expect(el.fixed).toBe(true);
    expect(el.levels).toBe(1);
  });

  it("renders EMPTY for empty diagnostics", () => {
    const el = new DiagnosticsElement("diag", []);
    expect(el.render("markdown", 0)).toBe("");
    expect(el.render("html", 0)).toBe("");
    expect(el.size("markdown", 0)).toBe(0);
    expect(el.size("html", 0)).toBe(0);
  });

  it("renders errors under Errors heading", () => {
    const diags: Diagnostic[] = [
      { severity: "error", summary: "Missing variable", detail: "" },
    ];
    const el = new DiagnosticsElement("diag", diags);
    const md = el.render("markdown", 0);
    expect(md).toContain("### Errors");
    expect(md).toContain("**Missing variable**");
  });

  it("renders warnings under Warnings heading", () => {
    const diags: Diagnostic[] = [
      { severity: "warning", summary: "Deprecated feature", detail: "" },
    ];
    const el = new DiagnosticsElement("diag", diags);
    const md = el.render("markdown", 0);
    expect(md).toContain("### Warnings");
    expect(md).toContain("**Deprecated feature**");
  });

  it("renders errors before warnings", () => {
    const diags: Diagnostic[] = [
      { severity: "warning", summary: "warn1", detail: "" },
      { severity: "error", summary: "err1", detail: "" },
    ];
    const el = new DiagnosticsElement("diag", diags);
    const md = el.render("markdown", 0);
    const errorsIdx = md.indexOf("### Errors");
    const warningsIdx = md.indexOf("### Warnings");
    expect(errorsIdx).toBeGreaterThanOrEqual(0);
    expect(warningsIdx).toBeGreaterThan(errorsIdx);
  });

  it("default heading level is 3", () => {
    const diags: Diagnostic[] = [
      { severity: "error", summary: "err", detail: "" },
    ];
    const el = new DiagnosticsElement("diag", diags);
    const md = el.render("markdown", 0);
    expect(md).toContain("### Errors");

    const html = el.render("html", 0);
    expect(html).toContain("<h3>Errors</h3>");
  });

  it("can override heading level to 2", () => {
    const diags: Diagnostic[] = [
      { severity: "error", summary: "err", detail: "" },
    ];
    const el = new DiagnosticsElement("diag", diags, 2);
    const md = el.render("markdown", 0);
    expect(md).toContain("## Errors");
    expect(md).not.toContain("### Errors");

    const html = el.render("html", 0);
    expect(html).toContain("<h2>Errors</h2>");
  });

  it("renders detail as blockquote", () => {
    const diags: Diagnostic[] = [
      {
        severity: "error",
        summary: "Invalid config",
        detail: "Check your settings",
      },
    ];
    const el = new DiagnosticsElement("diag", diags);
    const md = el.render("markdown", 0);
    expect(md).toContain("> Check your settings");

    const html = el.render("html", 0);
    expect(html).toContain("<blockquote>");
    expect(html).toContain("Check your settings");
  });

  it("renders address suffix when present", () => {
    const diags: Diagnostic[] = [
      {
        severity: "error",
        summary: "Cycle detected",
        detail: "",
        address: "aws_instance.web",
      },
    ];
    const el = new DiagnosticsElement("diag", diags);
    const md = el.render("markdown", 0);
    expect(md).toContain("`aws_instance.web`");
  });

  it("satisfies the size invariant for errors only", () => {
    const diags: Diagnostic[] = [
      { severity: "error", summary: "err1", detail: "" },
      { severity: "error", summary: "err2", detail: "detail here" },
    ];
    assertElementSizeInvariant(
      new DiagnosticsElement("diag", diags),
      "errors-only",
    );
  });

  it("satisfies the size invariant for warnings only", () => {
    const diags: Diagnostic[] = [
      { severity: "warning", summary: "warn1", detail: "details" },
    ];
    assertElementSizeInvariant(
      new DiagnosticsElement("diag", diags),
      "warnings-only",
    );
  });

  it("satisfies the size invariant for mixed diagnostics", () => {
    const diags: Diagnostic[] = [
      {
        severity: "error",
        summary: "Missing required argument",
        detail: "The argument 'name' is required.",
        address: "module.vpc.aws_vpc.main",
      },
      {
        severity: "warning",
        summary: "Deprecated attribute",
        detail: "Use 'tags_all' instead.",
      },
    ];
    assertElementSizeInvariant(new DiagnosticsElement("diag", diags), "mixed");
  });

  it("satisfies the size invariant for empty diagnostics", () => {
    assertElementSizeInvariant(new DiagnosticsElement("diag", []), "empty");
  });

  it("satisfies the size invariant with heading level 2", () => {
    const diags: Diagnostic[] = [
      { severity: "error", summary: "err", detail: "detail" },
    ];
    assertElementSizeInvariant(
      new DiagnosticsElement("diag", diags, 2),
      "level-2",
    );
  });
});
