import { describe, it, expect } from "vitest";
import { renderDiagnostics } from "../../../src/renderer/diagnostics.js";
import { MarkdownWriter } from "../../../src/renderer/writer.js";
import type { Diagnostic } from "../../../src/model/diagnostic.js";

function render(diagnostics: readonly Diagnostic[]): string {
  const writer = new MarkdownWriter();
  renderDiagnostics(diagnostics, writer);
  return writer.build();
}

describe("renderDiagnostics", () => {
  it("renders a single error with address and detail", () => {
    const md = render([
      {
        severity: "error",
        summary: "Failed to read data source",
        detail: "connection refused",
        address: "data.external.failing",
      },
    ]);
    expect(md).toContain("### Errors");
    expect(md).toContain("🚨 **Failed to read data source**");
    expect(md).toContain("`data.external.failing`");
    expect(md).toContain("```\nconnection refused\n```");
    expect(md).not.toContain("### Warnings");
  });

  it("renders a single warning without address", () => {
    const md = render([
      {
        severity: "warning",
        summary: "Deprecated attribute",
        detail: "Use new_attr instead",
      },
    ]);
    expect(md).toContain("### Warnings");
    expect(md).toContain("⚠️ **Deprecated attribute**");
    expect(md).not.toContain("### Errors");
    // No address suffix
    expect(md).not.toContain("—");
  });

  it("renders errors before warnings", () => {
    const md = render([
      { severity: "warning", summary: "warn1", detail: "" },
      { severity: "error", summary: "err1", detail: "" },
    ]);
    const errIdx = md.indexOf("### Errors");
    const warnIdx = md.indexOf("### Warnings");
    expect(errIdx).toBeLessThan(warnIdx);
  });

  it("omits detail code fence when detail is empty", () => {
    const md = render([
      { severity: "error", summary: "Something failed", detail: "" },
    ]);
    expect(md).toContain("🚨 **Something failed**");
    expect(md).not.toContain("```");
  });

  it("renders multiple errors", () => {
    const md = render([
      { severity: "error", summary: "Error A", detail: "detail A" },
      { severity: "error", summary: "Error B", detail: "detail B" },
    ]);
    expect(md).toContain("**Error A**");
    expect(md).toContain("**Error B**");
  });

  it("produces empty output for empty array", () => {
    const md = render([]);
    expect(md.trim()).toBe("");
  });

  it("uses H2 headings when headingLevel is 2", () => {
    const writer = new MarkdownWriter();
    renderDiagnostics(
      [{ severity: "error", summary: "Fail", detail: "" }],
      writer,
      2,
    );
    const md = writer.build();
    expect(md).toContain("## Errors");
    expect(md).not.toContain("### Errors");
  });

  it("uses H3 headings by default", () => {
    const md = render([
      { severity: "warning", summary: "Warn", detail: "" },
    ]);
    expect(md).toContain("### Warnings");
  });
});
