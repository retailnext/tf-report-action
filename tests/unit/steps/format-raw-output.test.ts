import { describe, it, expect } from "vitest";
import { formatRawOutput } from "../../../src/raw-formatter/index.js";

describe("formatRawOutput", () => {
  it("returns a code block for plain text", () => {
    const result = formatRawOutput("hello world\nline 2");
    expect(result).toContain("```");
    expect(result).toContain("hello world");
    expect(result).not.toContain("Show raw JSON");
  });

  it("returns (empty) for empty/whitespace content", () => {
    expect(formatRawOutput("")).toContain("(empty)");
    expect(formatRawOutput("   \n  ")).toContain("(empty)");
  });

  it("formats JSON Lines with @message fields as backtick-wrapped messages", () => {
    const input = [
      '{"@level":"info","@message":"Terraform 1.14.6","type":"version"}',
      '{"@level":"info","@message":"Plan: 1 to add, 0 to change","type":"change_summary"}',
    ].join("\n");

    const result = formatRawOutput(input);
    expect(result).toContain("`Terraform 1.14.6`");
    expect(result).toContain("`type=version`");
    expect(result).toContain("`Plan: 1 to add, 0 to change`");
    expect(result).toContain("`type=change_summary`");
    // No bullet list format
    expect(result).not.toMatch(/^- /m);
  });

  it("shows 🚨 for error-level JSON Lines messages", () => {
    const input = '{"@level":"error","@message":"Error occurred","type":"diagnostic","diagnostic":{"severity":"error","summary":"Something broke","detail":"details here"}}';
    const result = formatRawOutput(input);
    expect(result).toContain("🚨");
    // Inside <summary>, <code> tags are used instead of backticks
    expect(result).toContain("<code>Error occurred</code>");
    expect(result).toContain("`diagnostic.summary=Something broke`");
    expect(result).toContain("`diagnostic.detail=details here`");
  });

  it("shows ⚠️ for warn-level JSON Lines messages", () => {
    const input = '{"@level":"warn","@message":"Warning message"}';
    const result = formatRawOutput(input);
    expect(result).toContain("⚠️");
    expect(result).toContain("`Warning message`");
  });

  it("collapses trace/debug messages with count and <br> spacing", () => {
    const input = [
      '{"@level":"info","@message":"visible"}',
      '{"@level":"trace","@message":"trace msg 1"}',
      '{"@level":"debug","@message":"debug msg 1"}',
      '{"@level":"trace","@message":"trace msg 2"}',
    ].join("\n");

    const result = formatRawOutput(input);
    expect(result).toContain("`visible`");
    expect(result).toContain("2 trace");
    expect(result).toContain("1 debug");
    expect(result).toContain("message(s) omitted");
    expect(result).toContain("</summary>\n<br>");
    // Collapsed but not dropped, wrapped in backticks
    expect(result).toContain("`trace msg 1`");
    expect(result).toContain("`debug msg 1`");
  });

  it("never silently drops log lines", () => {
    const input = [
      '{"@level":"info","@message":"info msg"}',
      '{"@level":"debug","@message":"debug msg"}',
    ].join("\n");

    const result = formatRawOutput(input);
    // info visible
    expect(result).toContain("`info msg`");
    // debug in collapsed section
    expect(result).toContain("`debug msg`");
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
    // Validate output includes raw JSON in collapsed details
    expect(result).toContain("Show raw JSON");
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
    expect(result).not.toContain("Show raw JSON");
  });

  it("includes diagnostic fields sorted lexicographically", () => {
    const input = [
      '{"@level":"error","@message":"Error","type":"diagnostic","diagnostic":{"severity":"error","summary":"Bad thing","detail":"Details","address":"aws_instance.foo","snippet":{"context":"resource \\"aws_instance\\" \\"foo\\"","code":"instance_type = bad","start_line":5}}}',
    ].join("\n");

    const result = formatRawOutput(input);
    expect(result).toContain("`diagnostic.address=aws_instance.foo`");
    expect(result).toContain("`diagnostic.detail=Details`");
    expect(result).toContain("`diagnostic.severity=error`");
    expect(result).toContain("`diagnostic.snippet.code=instance_type = bad`");
    expect(result).toContain("`diagnostic.snippet.start_line=5`");
    expect(result).toContain("`diagnostic.summary=Bad thing`");
    // Verify sort order: address before detail before severity before snippet before summary
    const addressIdx = result.indexOf("diagnostic.address");
    const detailIdx = result.indexOf("diagnostic.detail");
    const severityIdx = result.indexOf("diagnostic.severity");
    const snippetIdx = result.indexOf("diagnostic.snippet.code");
    const summaryIdx = result.indexOf("diagnostic.summary");
    expect(addressIdx).toBeLessThan(detailIdx);
    expect(detailIdx).toBeLessThan(severityIdx);
    expect(severityIdx).toBeLessThan(snippetIdx);
    expect(snippetIdx).toBeLessThan(summaryIdx);
  });

  it("wraps messages with extra fields in details/summary with <br> spacing", () => {
    const input = '{"@level":"info","@message":"Plan: 1 to add","type":"change_summary","changes":{"add":1,"change":0,"remove":0}}';
    const result = formatRawOutput(input);
    expect(result).toContain("<details>");
    expect(result).toContain("<summary>");
    expect(result).toContain("</summary>\n<br>");
    // Inside <summary>, <code> tags are used instead of backticks
    expect(result).toContain("<code>Plan: 1 to add</code>");
    expect(result).toContain("<code>type=change_summary</code>");
    // Fields in <details> body still use backticks
    expect(result).toContain("`changes.add=1`");
    expect(result).toContain("`changes.change=0`");
    expect(result).toContain("`changes.remove=0`");
  });

  it("renders messages without extra fields as plain paragraphs", () => {
    const input = '{"@level":"info","@message":"simple message"}';
    const result = formatRawOutput(input);
    expect(result).toContain("`simple message`");
    expect(result).not.toContain("<details>");
    expect(result).not.toContain("<summary>");
  });

  it("truncates long values at 80 characters", () => {
    const longVal = "x".repeat(100);
    const input = `{"@level":"info","@message":"test","longfield":"${longVal}"}`;
    const result = formatRawOutput(input);
    expect(result).toContain("x".repeat(77) + "...");
    expect(result).not.toContain("x".repeat(78));
  });
});
