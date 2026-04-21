/**
 * Primitive renderable classes — the building blocks of report content.
 *
 * Each class implements {@link Renderable} and knows how to render itself
 * to both markdown and HTML. Classes are immutable: content is fixed at
 * construction time, and sizes for both formats are eagerly cached.
 *
 * Composites (Sequence, Table, Details) delegate to their children's
 * `size()` and `render()` methods — the same recursive pattern used in
 * protobuf marshalling.
 */

import type { OutputFormat, Renderable } from "./types.js";
import { htmlEscape, htmlEscapeSize } from "./html-escape.js";

// ---------------------------------------------------------------------------
// Empty
// ---------------------------------------------------------------------------

/** A zero-size sentinel renderable. Always renders to `""`. */
export class Empty implements Renderable {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(format: OutputFormat): number {
    return 0;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(format: OutputFormat): string {
    return "";
  }
}

/** Shared singleton for zero-content nodes. */
export const EMPTY: Renderable = new Empty();

// ---------------------------------------------------------------------------
// RawText
// ---------------------------------------------------------------------------

/**
 * Verbatim text in markdown, HTML-escaped in HTML format.
 *
 * Use for text that should appear as-is in markdown but needs entity
 * escaping in HTML (e.g. user-provided labels, attribute names).
 */
export class RawText implements Renderable {
  private readonly text: string;
  private readonly mdSize: number;
  private readonly htSize: number;

  constructor(text: string) {
    this.text = text;
    this.mdSize = text.length;
    this.htSize = htmlEscapeSize(text);
  }

  size(format: OutputFormat): number {
    return format === "markdown" ? this.mdSize : this.htSize;
  }

  render(format: OutputFormat): string {
    return format === "markdown" ? this.text : htmlEscape(this.text);
  }
}

// ---------------------------------------------------------------------------
// HtmlText
// ---------------------------------------------------------------------------

/**
 * Text that is already safe HTML and should pass through verbatim in both
 * formats. Use for content containing intentional HTML markup (e.g. inline
 * diff tags `<del>/<ins>`) that is valid in both GitHub markdown and HTML.
 */
export class HtmlText implements Renderable {
  private readonly html: string;

  constructor(html: string) {
    this.html = html;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(format: OutputFormat): number {
    return this.html.length;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(format: OutputFormat): string {
    return this.html;
  }
}

// ---------------------------------------------------------------------------
// Heading
// ---------------------------------------------------------------------------

/**
 * A heading element.
 *
 * - Markdown: `## text\n\n`
 * - HTML: `<hN>text</hN>\n`
 */
export class Heading implements Renderable {
  private readonly mdStr: string;
  private readonly htStr: string;

  constructor(text: string, level: 1 | 2 | 3 | 4 | 5 | 6 = 2) {
    this.mdStr = `${"#".repeat(level)} ${text}\n\n`;
    this.htStr = `<h${String(level)}>${htmlEscape(text)}</h${String(level)}>\n`;
  }

  size(format: OutputFormat): number {
    return format === "markdown" ? this.mdStr.length : this.htStr.length;
  }

  render(format: OutputFormat): string {
    return format === "markdown" ? this.mdStr : this.htStr;
  }
}

// ---------------------------------------------------------------------------
// Paragraph
// ---------------------------------------------------------------------------

/**
 * A paragraph of text.
 *
 * - Markdown: `text\n\n`
 * - HTML: `<p>text</p>\n`
 */
export class Paragraph implements Renderable {
  private readonly mdStr: string;
  private readonly htStr: string;

  constructor(text: string) {
    this.mdStr = `${text}\n\n`;
    this.htStr = `<p>${htmlEscape(text)}</p>\n`;
  }

  size(format: OutputFormat): number {
    return format === "markdown" ? this.mdStr.length : this.htStr.length;
  }

  render(format: OutputFormat): string {
    return format === "markdown" ? this.mdStr : this.htStr;
  }
}

// ---------------------------------------------------------------------------
// CodeBlock
// ---------------------------------------------------------------------------

/**
 * A fenced code block.
 *
 * - Markdown: `` ```lang\ncontent\n``` \n\n``
 * - HTML: `<pre><code class="language-lang">escaped</code></pre>\n`
 */
export class CodeBlock implements Renderable {
  private readonly mdStr: string;
  private readonly htStr: string;

  constructor(content: string, language = "") {
    this.mdStr = `\`\`\`${language}\n${content}\n\`\`\`\n\n`;
    const langAttr =
      language.length > 0 ? ` class="language-${htmlEscape(language)}"` : "";
    this.htStr = `<pre><code${langAttr}>${htmlEscape(content)}</code></pre>\n`;
  }

  size(format: OutputFormat): number {
    return format === "markdown" ? this.mdStr.length : this.htStr.length;
  }

  render(format: OutputFormat): string {
    return format === "markdown" ? this.mdStr : this.htStr;
  }
}

// ---------------------------------------------------------------------------
// Blockquote
// ---------------------------------------------------------------------------

/**
 * A blockquote.
 *
 * - Markdown: `> line1\n> line2\n\n`
 * - HTML: `<blockquote><p>escaped</p></blockquote>\n`
 */
export class Blockquote implements Renderable {
  private readonly mdStr: string;
  private readonly htStr: string;

  constructor(text: string) {
    const lines = text.split("\n");
    this.mdStr = lines.map((l) => `> ${l}`).join("\n") + "\n\n";
    this.htStr = `<blockquote><p>${htmlEscape(text)}</p></blockquote>\n`;
  }

  size(format: OutputFormat): number {
    return format === "markdown" ? this.mdStr.length : this.htStr.length;
  }

  render(format: OutputFormat): string {
    return format === "markdown" ? this.mdStr : this.htStr;
  }
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

/**
 * A row of table cells, each containing a {@link Renderable}.
 *
 * Cells are rendered inline — their content must not contain newlines
 * in markdown format (pipe-delimited tables require single-line cells).
 */
export interface TableRow {
  readonly cells: readonly Renderable[];
}

/**
 * A table with header and body rows.
 *
 * - Markdown: pipe-delimited table with `---` separator
 * - HTML: `<table>` with `<thead>`/`<tbody>`
 *
 * Sizes are computed eagerly from the pre-known cell sizes plus fixed
 * structural overhead per format.
 */
export class Table implements Renderable {
  private readonly headers: readonly Renderable[];
  private readonly rows: readonly TableRow[];
  private readonly mdSize: number;
  private readonly htSize: number;

  constructor(headers: readonly Renderable[], rows: readonly TableRow[]) {
    this.headers = headers;
    this.rows = rows;
    this.mdSize = this.computeMdSize();
    this.htSize = this.computeHtSize();
  }

  size(format: OutputFormat): number {
    return format === "markdown" ? this.mdSize : this.htSize;
  }

  render(format: OutputFormat): string {
    return format === "markdown" ? this.renderMarkdown() : this.renderHtml();
  }

  private computeMdSize(): number {
    const cols = this.headers.length;
    // Header row: "| " + cell + " | " + cell + " |\n"
    let size = this.rowMdSize(this.headers);
    // Separator: "| --- | --- |\n"
    // = "| " (2) + "---" (3) * cols + " | " (3) * (cols-1) + " |\n" (3)
    // = 2 + 3*cols + 3*(cols-1) + 3 = 6*cols + 2
    size += 6 * cols + 2;
    for (const row of this.rows) {
      size += this.rowMdSize(row.cells);
    }
    size += 1; // trailing newline
    return size;
  }

  /** Size of one markdown row: `| cell | cell |\n` */
  private rowMdSize(cells: readonly Renderable[]): number {
    // "| " + cell + " | " + cell + " |\n"
    // = 2 + sum(cell sizes) + 3*(cols-1) + 3
    // = 2 + sum + 3*cols - 3 + 3 = 2 + sum + 3*cols
    // Actually: "| c1 | c2 | c3 |\n"
    // "| " = 2, " | " between cells = 3*(cols-1), " |\n" = 3
    // total overhead = 2 + 3*(cols-1) + 3 = 5 + 3*(cols-1) = 3*cols + 2
    let size = 3 * cells.length + 2;
    for (const cell of cells) {
      size += cell.size("markdown");
    }
    return size;
  }

  private computeHtSize(): number {
    const TH_OVERHEAD = 9; // "<th>" (4) + "</th>" (5)
    const TD_OVERHEAD = 9; // "<td>" (4) + "</td>" (5)
    let size = 8; // "<table>\n"
    size += 8; // "<thead>\n"
    size += 4; // "<tr>"
    for (const h of this.headers) {
      size += TH_OVERHEAD + h.size("html");
    }
    size += 6; // "</tr>\n"
    size += 9; // "</thead>\n"
    size += 8; // "<tbody>\n"
    for (const row of this.rows) {
      size += 4; // "<tr>"
      for (const cell of row.cells) {
        size += TD_OVERHEAD + cell.size("html");
      }
      size += 6; // "</tr>\n"
    }
    size += 9; // "</tbody>\n"
    size += 9; // "</table>\n"
    return size;
  }

  private renderMarkdown(): string {
    const cols = this.headers.length;
    let out = this.renderMdRow(this.headers);
    out += `| ${Array.from({ length: cols }, () => "---").join(" | ")} |\n`;
    for (const row of this.rows) {
      out += this.renderMdRow(row.cells);
    }
    out += "\n";
    return out;
  }

  private renderMdRow(cells: readonly Renderable[]): string {
    const rendered = cells.map((c) => c.render("markdown"));
    return `| ${rendered.join(" | ")} |\n`;
  }

  private renderHtml(): string {
    let out = "<table>\n<thead>\n<tr>";
    for (const h of this.headers) {
      out += `<th>${h.render("html")}</th>`;
    }
    out += "</tr>\n</thead>\n<tbody>\n";
    for (const row of this.rows) {
      out += "<tr>";
      for (const cell of row.cells) {
        out += `<td>${cell.render("html")}</td>`;
      }
      out += "</tr>\n";
    }
    out += "</tbody>\n</table>\n";
    return out;
  }
}

// ---------------------------------------------------------------------------
// Details
// ---------------------------------------------------------------------------

/**
 * A collapsible `<details>` block.
 *
 * Both markdown (GitHub) and HTML use the same `<details>`/`<summary>` tags.
 * The content is a child {@link Renderable} placed inside the block.
 *
 * In markdown format, a blank line is emitted after `<summary>` so that
 * GitHub renders the content as markdown (not inline HTML).
 */
export class Details implements Renderable {
  private readonly summary: string;
  private readonly content: Renderable;
  private readonly open: boolean;
  private readonly mdSize: number;
  private readonly htSize: number;

  constructor(summary: string, content: Renderable, open = false) {
    this.summary = summary;
    this.content = content;
    this.open = open;

    // Markdown: "<details[ open]>\n<summary>escaped</summary>\n\ncontent\n\n</details>\n\n"
    const escapedSummary = htmlEscape(summary);
    const openTag = open ? "<details open>" : "<details>";
    const mdPrefix = `${openTag}\n<summary>${escapedSummary}</summary>\n\n`;
    const mdSuffix = "\n\n</details>\n\n";
    this.mdSize = mdPrefix.length + content.size("markdown") + mdSuffix.length;

    // HTML: same structure but content is HTML-rendered
    const htPrefix = `${openTag}\n<summary>${escapedSummary}</summary>\n`;
    const htSuffix = "\n</details>\n";
    this.htSize = htPrefix.length + content.size("html") + htSuffix.length;
  }

  size(format: OutputFormat): number {
    return format === "markdown" ? this.mdSize : this.htSize;
  }

  render(format: OutputFormat): string {
    const escapedSummary = htmlEscape(this.summary);
    const openTag = this.open ? "<details open>" : "<details>";
    if (format === "markdown") {
      return `${openTag}\n<summary>${escapedSummary}</summary>\n\n${this.content.render("markdown")}\n\n</details>\n\n`;
    }
    return `${openTag}\n<summary>${escapedSummary}</summary>\n${this.content.render("html")}\n</details>\n`;
  }
}

// ---------------------------------------------------------------------------
// InlineDiff
// ---------------------------------------------------------------------------

/**
 * Inline diff markup using `<del>` and `<ins>` tags.
 *
 * Both formats produce identical HTML since GitHub markdown renders these
 * tags natively.
 */
export class InlineDiff implements Renderable {
  private readonly html: string;

  constructor(deleted: string, inserted: string) {
    const delPart =
      deleted.length > 0 ? `<del>${htmlEscape(deleted)}</del>` : "";
    const insPart =
      inserted.length > 0 ? `<ins>${htmlEscape(inserted)}</ins>` : "";
    this.html = delPart + insPart;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(format: OutputFormat): number {
    return this.html.length;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(format: OutputFormat): string {
    return this.html;
  }
}

// ---------------------------------------------------------------------------
// Sequence
// ---------------------------------------------------------------------------

/**
 * A composite renderable that concatenates its children.
 *
 * `size()` sums children's sizes. `render()` concatenates children's renders.
 * An optional separator string can be inserted between children.
 */
export class Sequence implements Renderable {
  private readonly children: readonly Renderable[];
  private readonly separator: string;
  private readonly mdSize: number;
  private readonly htSize: number;

  constructor(children: readonly Renderable[], separator = "") {
    this.children = children;
    this.separator = separator;

    const sepLen = separator.length;
    const count = children.length;
    const sepTotal = count > 1 ? sepLen * (count - 1) : 0;

    let md = sepTotal;
    let ht = sepTotal;
    for (const child of children) {
      md += child.size("markdown");
      ht += child.size("html");
    }
    this.mdSize = md;
    this.htSize = ht;
  }

  size(format: OutputFormat): number {
    return format === "markdown" ? this.mdSize : this.htSize;
  }

  render(format: OutputFormat): string {
    if (this.children.length === 0) return "";
    const first = this.children[0];
    if (this.children.length === 1 && first !== undefined) {
      return first.render(format);
    }
    return this.children.map((c) => c.render(format)).join(this.separator);
  }
}
