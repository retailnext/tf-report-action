import { describe, it, expect } from "vitest";
import { formatRawOutput } from "../../../src/report-from-steps.js";

describe("formatRawOutput", () => {
  it("returns a code block for plain text", () => {
    const result = formatRawOutput("hello world\nline 2");
    expect(result).toContain("```");
    expect(result).toContain("hello world");
    expect(result).not.toContain("Raw JSON output");
  });

  it("returns (empty) for empty/whitespace content", () => {
    expect(formatRawOutput("")).toContain("(empty)");
    expect(formatRawOutput("   \n  ")).toContain("(empty)");
  });

  it("formats JSON Lines with @message fields", () => {
    const input = [
      '{"@level":"info","@message":"Terraform 1.14.6","type":"version"}',
      '{"@level":"info","@message":"Plan: 1 to add, 0 to change","type":"change_summary"}',
    ].join("\n");

    const result = formatRawOutput(input);
    expect(result).toContain("Terraform 1.14.6");
    expect(result).toContain("Plan: 1 to add, 0 to change");
    expect(result).toContain("Raw JSON output");
    expect(result).toContain("<details>");
  });

  it("shows 🚨 for error-level JSON Lines messages", () => {
    const input = '{"@level":"error","@message":"Error occurred","type":"diagnostic","diagnostic":{"severity":"error","summary":"Something broke","detail":"details here"}}';
    const result = formatRawOutput(input);
    expect(result).toContain("🚨");
    expect(result).toContain("**Something broke**");
    expect(result).toContain("details here");
  });

  it("shows ⚠️ for warn-level JSON Lines messages", () => {
    const input = '{"@level":"warn","@message":"Warning message"}';
    const result = formatRawOutput(input);
    expect(result).toContain("⚠️");
    expect(result).toContain("Warning message");
  });

  it("collapses trace/debug messages with count", () => {
    const input = [
      '{"@level":"info","@message":"visible"}',
      '{"@level":"trace","@message":"trace msg 1"}',
      '{"@level":"debug","@message":"debug msg 1"}',
      '{"@level":"trace","@message":"trace msg 2"}',
    ].join("\n");

    const result = formatRawOutput(input);
    expect(result).toContain("visible");
    expect(result).toContain("2 trace");
    expect(result).toContain("1 debug");
    expect(result).toContain("message(s) omitted");
    // Collapsed but not dropped
    expect(result).toContain("trace msg 1");
    expect(result).toContain("debug msg 1");
  });

  it("never silently drops log lines", () => {
    const input = [
      '{"@level":"info","@message":"info msg"}',
      '{"@level":"debug","@message":"debug msg"}',
    ].join("\n");

    const result = formatRawOutput(input);
    // info visible
    expect(result).toContain("info msg");
    // debug in collapsed section
    expect(result).toContain("debug msg");
  });

  it("formats validate output with diagnostics", () => {
    const input = JSON.stringify({
      format_version: "1.0",
      valid: false,
      error_count: 1,
      warning_count: 0,
      diagnostics: [
        {
          severity: "error",
          summary: "Reference to undeclared variable",
          detail: 'Variable "foo" has not been declared.',
          snippet: {
            context: 'resource "null_resource" "test"',
            code: "    value = var.foo",
            start_line: 10,
          },
        },
      ],
    });

    const result = formatRawOutput(input);
    expect(result).toContain("❌");
    expect(result).toContain("**invalid**");
    expect(result).toContain("🚨");
    expect(result).toContain("**Reference to undeclared variable**");
    expect(result).toContain('Variable "foo" has not been declared.');
    expect(result).toContain("`    value = var.foo`");
    expect(result).toContain("line 10");
    expect(result).toContain("Raw JSON output");
  });

  it("formats valid validate output", () => {
    const input = JSON.stringify({
      format_version: "1.0",
      valid: true,
      error_count: 0,
      warning_count: 0,
      diagnostics: [],
    });

    const result = formatRawOutput(input);
    expect(result).toContain("✅");
    expect(result).toContain("Configuration is valid");
  });

  it("falls back to code block for non-JSON-Lines JSON", () => {
    // A JSON object that doesn't match validate or JSON Lines patterns
    const input = JSON.stringify({ foo: "bar", baz: 42 });
    const result = formatRawOutput(input);
    expect(result).toContain("```");
    expect(result).toContain("foo");
  });

  it("falls back to code block for mixed JSON/non-JSON lines", () => {
    const input = '{"@message":"first"}\nnot json\n{"@message":"third"}';
    const result = formatRawOutput(input);
    expect(result).toContain("```");
    expect(result).not.toContain("Raw JSON output");
  });

  it("includes diagnostic snippet context and address", () => {
    const input = [
      '{"@level":"error","@message":"Error","type":"diagnostic","diagnostic":{"severity":"error","summary":"Bad thing","detail":"Details","address":"aws_instance.foo","snippet":{"context":"resource \\"aws_instance\\" \\"foo\\"","code":"instance_type = bad","start_line":5}}}',
    ].join("\n");

    const result = formatRawOutput(input);
    expect(result).toContain("**Bad thing**");
    expect(result).toContain("(aws_instance.foo)");
    expect(result).toContain("`instance_type = bad`");
    expect(result).toContain("line 5");
  });
});
