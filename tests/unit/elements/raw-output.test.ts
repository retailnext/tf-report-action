import { describe, expect, it } from "vitest";
import type { Renderable } from "../../../src/model/renderable.js";
import { buildRawOutputRenderable } from "../../../src/elements/raw-output.js";

/**
 * Verify size invariant: size(format) === render(format).length for both formats.
 */
function assertSizeInvariant(node: Renderable, label?: string): void {
  for (const fmt of ["markdown", "html"] as const) {
    const rendered = node.render(fmt);
    expect(node.size(fmt), `${label ?? "node"} size(${fmt})`).toBe(
      rendered.length,
    );
  }
}

// ---------------------------------------------------------------------------
// Empty / whitespace input
// ---------------------------------------------------------------------------

describe("buildRawOutputRenderable - empty", () => {
  it("renders empty content as code block with (empty)", () => {
    const r = buildRawOutputRenderable("");
    expect(r.render("markdown")).toContain("(empty)");
    assertSizeInvariant(r, "empty");
  });

  it("renders whitespace-only as (empty)", () => {
    const r = buildRawOutputRenderable("   \n  ");
    expect(r.render("markdown")).toContain("(empty)");
    assertSizeInvariant(r, "whitespace");
  });
});

// ---------------------------------------------------------------------------
// Plain text fallback
// ---------------------------------------------------------------------------

describe("buildRawOutputRenderable - plain text", () => {
  it("wraps plain text in 4-backtick code block (markdown)", () => {
    const r = buildRawOutputRenderable("hello world\nnext line");
    const md = r.render("markdown");
    expect(md).toContain("````");
    expect(md).toContain("hello world");
    assertSizeInvariant(r, "plain-text");
  });

  it("wraps plain text in pre/code (HTML)", () => {
    const r = buildRawOutputRenderable("hello world");
    const html = r.render("html");
    expect(html).toContain("<pre><code>");
    expect(html).toContain("hello world");
    assertSizeInvariant(r, "plain-html");
  });

  it("uses 4-backtick fences to avoid conflict with content backticks", () => {
    const content = "```\nsome code\n```";
    const r = buildRawOutputRenderable(content);
    const md = r.render("markdown");
    expect(md).toMatch(/^````\n/);
    assertSizeInvariant(r, "backtick-content");
  });

  it("escapes HTML entities in HTML format", () => {
    const r = buildRawOutputRenderable("<script>alert('xss')</script>");
    const html = r.render("html");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    assertSizeInvariant(r, "html-escape");
  });
});

// ---------------------------------------------------------------------------
// JSON Lines detection
// ---------------------------------------------------------------------------

describe("buildRawOutputRenderable - JSON Lines", () => {
  it("formats JSONL with @message envelope", () => {
    const jsonl = [
      '{"@level":"info","@message":"Initializing...","@timestamp":"2024-01-01T00:00:00Z"}',
      '{"@level":"info","@message":"Plan complete","@timestamp":"2024-01-01T00:01:00Z"}',
    ].join("\n");

    const r = buildRawOutputRenderable(jsonl);
    const md = r.render("markdown");
    expect(md).toContain("Initializing...");
    expect(md).toContain("Plan complete");
    assertSizeInvariant(r, "jsonl");
  });

  it("adds error icon for error-level messages", () => {
    const jsonl = '{"@level":"error","@message":"Something broke"}';
    const r = buildRawOutputRenderable(jsonl);
    const md = r.render("markdown");
    expect(md).toContain("🚨");
    assertSizeInvariant(r, "jsonl-error");
  });

  it("adds warning icon for warn-level messages", () => {
    const jsonl = '{"@level":"warn","@message":"Deprecation notice"}';
    const r = buildRawOutputRenderable(jsonl);
    const md = r.render("markdown");
    expect(md).toContain("⚠️");
    assertSizeInvariant(r, "jsonl-warn");
  });

  it("collapses debug/trace messages", () => {
    const jsonl = [
      '{"@level":"info","@message":"visible"}',
      '{"@level":"debug","@message":"hidden1"}',
      '{"@level":"trace","@message":"hidden2"}',
    ].join("\n");

    const r = buildRawOutputRenderable(jsonl);
    const md = r.render("markdown");
    expect(md).toContain("visible");
    expect(md).toContain("omitted");
    assertSizeInvariant(r, "jsonl-debug");
  });

  it("shows extra fields in expandable details", () => {
    const jsonl =
      '{"@level":"info","@message":"Created","resource":"aws_instance.main"}';
    const r = buildRawOutputRenderable(jsonl);
    const md = r.render("markdown");
    expect(md).toContain("<details>");
    expect(md).toContain("resource=aws_instance.main");
    assertSizeInvariant(r, "jsonl-fields");
  });

  it("falls back to plain text for non-JSONL content", () => {
    const content = "not json\nat all";
    const r = buildRawOutputRenderable(content);
    const md = r.render("markdown");
    expect(md).toContain("````");
    assertSizeInvariant(r, "non-jsonl");
  });

  it("falls back when JSON objects lack @message", () => {
    const jsonl = '{"foo":"bar"}\n{"baz":42}';
    const r = buildRawOutputRenderable(jsonl);
    const md = r.render("markdown");
    // Should fall back to plain text since no @message
    expect(md).toContain("````");
    assertSizeInvariant(r, "no-message");
  });
});

// ---------------------------------------------------------------------------
// Trailing newline invariant — markdown output must end with \n\n
// ---------------------------------------------------------------------------

describe("buildRawOutputRenderable - trailing newline invariant", () => {
  it("plain text code block ends with blank line", () => {
    const r = buildRawOutputRenderable("hello world\nnext line");
    expect(r.render("markdown")).toMatch(/\n\n$/);
  });

  it("JSON Lines output ends with blank line", () => {
    const jsonl = [
      '{"@level":"info","@message":"Initializing..."}',
      '{"@level":"info","@message":"Plan complete"}',
    ].join("\n");
    const r = buildRawOutputRenderable(jsonl);
    expect(r.render("markdown")).toMatch(/\n\n$/);
  });

  it("JSON Lines with debug/trace messages ends with blank line", () => {
    const jsonl = [
      '{"@level":"info","@message":"visible"}',
      '{"@level":"debug","@message":"hidden"}',
    ].join("\n");
    const r = buildRawOutputRenderable(jsonl);
    expect(r.render("markdown")).toMatch(/\n\n$/);
  });

  it("validate output ends with blank line", () => {
    const validate = JSON.stringify({
      valid: true,
      diagnostics: [],
    });
    const r = buildRawOutputRenderable(validate);
    expect(r.render("markdown")).toMatch(/\n\n$/);
  });

  it("validate output with diagnostics ends with blank line", () => {
    const validate = JSON.stringify({
      valid: false,
      diagnostics: [{ severity: "error", summary: "Bad" }],
    });
    const r = buildRawOutputRenderable(validate);
    expect(r.render("markdown")).toMatch(/\n\n$/);
  });

  it("empty content ends with blank line", () => {
    const r = buildRawOutputRenderable("");
    expect(r.render("markdown")).toMatch(/\n\n$/);
  });
});

describe("buildRawOutputRenderable - validate", () => {
  it("formats valid configuration result", () => {
    const validate = JSON.stringify({
      valid: true,
      error_count: 0,
      warning_count: 0,
      diagnostics: [],
    });
    const r = buildRawOutputRenderable(validate);
    const md = r.render("markdown");
    expect(md).toContain("✅");
    expect(md).toContain("Configuration is valid");
    assertSizeInvariant(r, "validate-valid");
  });

  it("formats invalid configuration result", () => {
    const validate = JSON.stringify({
      valid: false,
      error_count: 1,
      warning_count: 0,
      diagnostics: [
        {
          severity: "error",
          summary: "Missing resource type",
          detail: "The resource type does not exist",
        },
      ],
    });
    const r = buildRawOutputRenderable(validate);
    const md = r.render("markdown");
    expect(md).toContain("❌");
    expect(md).toContain("invalid");
    expect(md).toContain("Missing resource type");
    assertSizeInvariant(r, "validate-invalid");
  });

  it("includes raw JSON in collapsible block", () => {
    const validate = JSON.stringify({
      valid: true,
      diagnostics: [],
    });
    const r = buildRawOutputRenderable(validate);
    const md = r.render("markdown");
    expect(md).toContain("Show raw JSON");
    assertSizeInvariant(r, "validate-raw");
  });

  it("HTML format uses proper tags", () => {
    const validate = JSON.stringify({
      valid: false,
      diagnostics: [{ severity: "warning", summary: "Be careful" }],
    });
    const r = buildRawOutputRenderable(validate);
    const html = r.render("html");
    expect(html).toContain("<strong>");
    expect(html).toContain("Be careful");
    assertSizeInvariant(r, "validate-html");
  });
});
