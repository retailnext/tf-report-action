import { describe, expect, it } from "vitest";
import type { Renderable } from "../../../src/renderable/types.js";
import {
  Blockquote,
  CodeBlock,
  Details,
  EMPTY,
  Empty,
  Heading,
  HtmlText,
  InlineDiff,
  Paragraph,
  RawText,
  Sequence,
  Table,
} from "../../../src/renderable/primitives.js";

/**
 * Verify the core size invariant: size(format) === render(format).length
 * for both formats.
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
// Empty
// ---------------------------------------------------------------------------

describe("Empty", () => {
  it("renders empty string in both formats", () => {
    const e = new Empty();
    expect(e.render("markdown")).toBe("");
    expect(e.render("html")).toBe("");
  });

  it("has size 0 in both formats", () => {
    assertSizeInvariant(new Empty(), "Empty");
  });

  it("EMPTY singleton has size 0", () => {
    assertSizeInvariant(EMPTY, "EMPTY");
  });
});

// ---------------------------------------------------------------------------
// RawText
// ---------------------------------------------------------------------------

describe("RawText", () => {
  it("renders text verbatim in markdown", () => {
    const r = new RawText("hello <world>");
    expect(r.render("markdown")).toBe("hello <world>");
  });

  it("HTML-escapes in html format", () => {
    const r = new RawText("hello <world>");
    expect(r.render("html")).toBe("hello &lt;world&gt;");
  });

  it("satisfies size invariant", () => {
    assertSizeInvariant(new RawText("a & b < c"), "RawText");
  });

  it("handles empty string", () => {
    const r = new RawText("");
    expect(r.size("markdown")).toBe(0);
    expect(r.size("html")).toBe(0);
    assertSizeInvariant(r, "RawText empty");
  });
});

// ---------------------------------------------------------------------------
// HtmlText
// ---------------------------------------------------------------------------

describe("HtmlText", () => {
  it("renders same content in both formats", () => {
    const h = new HtmlText("<del>old</del><ins>new</ins>");
    const expected = "<del>old</del><ins>new</ins>";
    expect(h.render("markdown")).toBe(expected);
    expect(h.render("html")).toBe(expected);
  });

  it("satisfies size invariant", () => {
    assertSizeInvariant(new HtmlText("<b>bold</b>"), "HtmlText");
  });
});

// ---------------------------------------------------------------------------
// Heading
// ---------------------------------------------------------------------------

describe("Heading", () => {
  it("renders markdown heading with ## by default", () => {
    const h = new Heading("Title");
    expect(h.render("markdown")).toBe("## Title\n\n");
  });

  it("renders HTML h2 by default", () => {
    const h = new Heading("Title");
    expect(h.render("html")).toBe("<h2>Title</h2>\n");
  });

  it("supports custom heading levels", () => {
    const h3 = new Heading("Sub", 3);
    expect(h3.render("markdown")).toBe("### Sub\n\n");
    expect(h3.render("html")).toBe("<h3>Sub</h3>\n");
  });

  it("escapes HTML in heading text for HTML format", () => {
    const h = new Heading("A & B <C>");
    expect(h.render("html")).toBe("<h2>A &amp; B &lt;C&gt;</h2>\n");
  });

  it("satisfies size invariant", () => {
    assertSizeInvariant(new Heading("Test"), "Heading");
    assertSizeInvariant(new Heading("A & B", 4), "Heading h4");
  });
});

// ---------------------------------------------------------------------------
// Paragraph
// ---------------------------------------------------------------------------

describe("Paragraph", () => {
  it("renders markdown paragraph", () => {
    const p = new Paragraph("Hello world");
    expect(p.render("markdown")).toBe("Hello world\n\n");
  });

  it("renders HTML paragraph", () => {
    const p = new Paragraph("Hello world");
    expect(p.render("html")).toBe("<p>Hello world</p>\n");
  });

  it("escapes HTML in content", () => {
    const p = new Paragraph("x < y & z");
    expect(p.render("html")).toBe("<p>x &lt; y &amp; z</p>\n");
  });

  it("satisfies size invariant", () => {
    assertSizeInvariant(new Paragraph("test"), "Paragraph");
  });
});

// ---------------------------------------------------------------------------
// CodeBlock
// ---------------------------------------------------------------------------

describe("CodeBlock", () => {
  it("renders markdown fenced code block", () => {
    const cb = new CodeBlock("const x = 1;", "ts");
    expect(cb.render("markdown")).toBe("```ts\nconst x = 1;\n```\n\n");
  });

  it("renders HTML pre/code block", () => {
    const cb = new CodeBlock("const x = 1;", "ts");
    expect(cb.render("html")).toBe(
      '<pre><code class="language-ts">const x = 1;</code></pre>\n',
    );
  });

  it("renders without language", () => {
    const cb = new CodeBlock("text");
    expect(cb.render("markdown")).toBe("```\ntext\n```\n\n");
    expect(cb.render("html")).toBe("<pre><code>text</code></pre>\n");
  });

  it("escapes HTML entities in code content", () => {
    const cb = new CodeBlock("<div>&test</div>", "html");
    expect(cb.render("html")).toContain("&lt;div&gt;&amp;test&lt;/div&gt;");
  });

  it("satisfies size invariant", () => {
    assertSizeInvariant(new CodeBlock("hello", "js"), "CodeBlock");
    assertSizeInvariant(new CodeBlock("x & y"), "CodeBlock no-lang");
  });
});

// ---------------------------------------------------------------------------
// Blockquote
// ---------------------------------------------------------------------------

describe("Blockquote", () => {
  it("renders markdown blockquote", () => {
    const bq = new Blockquote("note");
    expect(bq.render("markdown")).toBe("> note\n\n");
  });

  it("renders multi-line markdown blockquote", () => {
    const bq = new Blockquote("line1\nline2");
    expect(bq.render("markdown")).toBe("> line1\n> line2\n\n");
  });

  it("renders HTML blockquote", () => {
    const bq = new Blockquote("note");
    expect(bq.render("html")).toBe("<blockquote><p>note</p></blockquote>\n");
  });

  it("escapes HTML in blockquote content", () => {
    const bq = new Blockquote("a < b");
    expect(bq.render("html")).toBe(
      "<blockquote><p>a &lt; b</p></blockquote>\n",
    );
  });

  it("satisfies size invariant", () => {
    assertSizeInvariant(new Blockquote("test"), "Blockquote");
    assertSizeInvariant(new Blockquote("a\nb\nc"), "Blockquote multiline");
  });
});

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

describe("Table", () => {
  it("renders markdown table", () => {
    const t = new Table(
      [new RawText("Name"), new RawText("Value")],
      [{ cells: [new RawText("a"), new RawText("1")] }],
    );
    const md = t.render("markdown");
    expect(md).toContain("| Name | Value |");
    expect(md).toContain("| --- | --- |");
    expect(md).toContain("| a | 1 |");
  });

  it("renders HTML table", () => {
    const t = new Table(
      [new RawText("Name"), new RawText("Value")],
      [{ cells: [new RawText("a"), new RawText("1")] }],
    );
    const html = t.render("html");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>Name</th>");
    expect(html).toContain("<th>Value</th>");
    expect(html).toContain("<td>a</td>");
    expect(html).toContain("<td>1</td>");
    expect(html).toContain("</table>");
  });

  it("renders empty body", () => {
    const t = new Table([new RawText("H")], []);
    assertSizeInvariant(t, "Table empty body");
  });

  it("satisfies size invariant with multiple rows", () => {
    const t = new Table(
      [new RawText("A"), new RawText("B"), new RawText("C")],
      [
        { cells: [new RawText("1"), new RawText("2"), new RawText("3")] },
        { cells: [new RawText("x"), new RawText("y"), new RawText("z")] },
      ],
    );
    assertSizeInvariant(t, "Table 3x2");
  });

  it("handles cells with HTML entities", () => {
    const t = new Table(
      [new RawText("Key")],
      [{ cells: [new RawText("a<b")] }],
    );
    assertSizeInvariant(t, "Table with entities");
    expect(t.render("html")).toContain("<td>a&lt;b</td>");
  });
});

// ---------------------------------------------------------------------------
// Details
// ---------------------------------------------------------------------------

describe("Details", () => {
  it("renders markdown details", () => {
    const d = new Details("Summary", new RawText("Content"));
    const md = d.render("markdown");
    expect(md).toContain("<details>");
    expect(md).toContain("<summary>Summary</summary>");
    expect(md).toContain("Content");
    expect(md).toContain("</details>");
  });

  it("renders HTML details", () => {
    const d = new Details("Summary", new RawText("Content"));
    const html = d.render("html");
    expect(html).toContain("<details>");
    expect(html).toContain("<summary>Summary</summary>");
    expect(html).toContain("Content");
    expect(html).toContain("</details>");
  });

  it("supports open attribute", () => {
    const d = new Details("S", new RawText("C"), true);
    expect(d.render("markdown")).toContain("<details open>");
    expect(d.render("html")).toContain("<details open>");
  });

  it("escapes HTML in summary", () => {
    const d = new Details("A & B <C>", EMPTY);
    expect(d.render("markdown")).toContain(
      "<summary>A &amp; B &lt;C&gt;</summary>",
    );
  });

  it("satisfies size invariant", () => {
    assertSizeInvariant(
      new Details("Summary", new RawText("body text")),
      "Details",
    );
    assertSizeInvariant(
      new Details("Open", new CodeBlock("code", "js"), true),
      "Details open",
    );
  });
});

// ---------------------------------------------------------------------------
// InlineDiff
// ---------------------------------------------------------------------------

describe("InlineDiff", () => {
  it("renders both del and ins", () => {
    const d = new InlineDiff("old", "new");
    expect(d.render("markdown")).toBe("<del>old</del><ins>new</ins>");
    expect(d.render("html")).toBe("<del>old</del><ins>new</ins>");
  });

  it("renders only del when inserted is empty", () => {
    const d = new InlineDiff("removed", "");
    expect(d.render("markdown")).toBe("<del>removed</del>");
  });

  it("renders only ins when deleted is empty", () => {
    const d = new InlineDiff("", "added");
    expect(d.render("markdown")).toBe("<ins>added</ins>");
  });

  it("escapes HTML in diff content", () => {
    const d = new InlineDiff("<old>", "<new>");
    expect(d.render("html")).toBe(
      "<del>&lt;old&gt;</del><ins>&lt;new&gt;</ins>",
    );
  });

  it("satisfies size invariant", () => {
    assertSizeInvariant(new InlineDiff("a", "b"), "InlineDiff");
    assertSizeInvariant(new InlineDiff("a & b", "<c>"), "InlineDiff entities");
  });
});

// ---------------------------------------------------------------------------
// Sequence
// ---------------------------------------------------------------------------

describe("Sequence", () => {
  it("concatenates children renders", () => {
    const seq = new Sequence([new RawText("hello"), new RawText(" world")]);
    expect(seq.render("markdown")).toBe("hello world");
  });

  it("uses separator between children", () => {
    const seq = new Sequence(
      [new RawText("a"), new RawText("b"), new RawText("c")],
      ", ",
    );
    expect(seq.render("markdown")).toBe("a, b, c");
  });

  it("renders empty for no children", () => {
    const seq = new Sequence([]);
    expect(seq.render("markdown")).toBe("");
    expect(seq.size("markdown")).toBe(0);
  });

  it("renders single child without separator", () => {
    const seq = new Sequence([new RawText("only")], ", ");
    expect(seq.render("markdown")).toBe("only");
  });

  it("computes size as sum of children + separators", () => {
    const seq = new Sequence([new RawText("a"), new RawText("b")], " | ");
    // "a" + " | " + "b" = 1 + 3 + 1 = 5
    expect(seq.size("markdown")).toBe(5);
  });

  it("satisfies size invariant", () => {
    assertSizeInvariant(
      new Sequence([new RawText("hello"), new Paragraph("world")]),
      "Sequence",
    );
    assertSizeInvariant(
      new Sequence(
        [new RawText("a"), new RawText("b<c>"), new RawText("d")],
        "\n",
      ),
      "Sequence with sep",
    );
  });

  it("handles nested sequences", () => {
    const inner = new Sequence([new RawText("a"), new RawText("b")]);
    const outer = new Sequence([inner, new RawText("c")], " ");
    assertSizeInvariant(outer, "nested Sequence");
    expect(outer.render("markdown")).toBe("ab c");
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: deeply nested composite tree
// ---------------------------------------------------------------------------

describe("composite tree", () => {
  it("satisfies size invariant for a complex tree", () => {
    const tree = new Sequence([
      new Heading("Report", 2),
      new Paragraph("Summary of changes"),
      new Details(
        "Resource changes",
        new Sequence([
          new Table(
            [new RawText("Name"), new RawText("Action")],
            [
              {
                cells: [new RawText("aws_instance.web"), new RawText("create")],
              },
              {
                cells: [
                  new RawText("aws_s3_bucket.data"),
                  new RawText("update"),
                ],
              },
            ],
          ),
          new CodeBlock(
            'resource "aws_instance" "web" {\n  ami = "abc"\n}',
            "hcl",
          ),
        ]),
      ),
      new Blockquote("Warning: Some values are sensitive"),
    ]);

    assertSizeInvariant(tree, "complex composite tree");

    // Verify the tree actually renders something reasonable
    const md = tree.render("markdown");
    expect(md).toContain("## Report");
    expect(md).toContain("Summary of changes");
    expect(md).toContain("aws_instance.web");
    expect(md).toContain("```hcl");
    expect(md).toContain("> Warning:");

    const html = tree.render("html");
    expect(html).toContain("<h2>Report</h2>");
    expect(html).toContain("<p>Summary of changes</p>");
    expect(html).toContain("<table>");
    expect(html).toContain("<pre><code");
    expect(html).toContain("<blockquote>");
  });
});
