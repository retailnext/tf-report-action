/**
 * Portions of this file are derived from tfplan2md by oocx (https://github.com/oocx/tfplan2md),
 * used under the MIT License.
 */

/**
 * A fluent markdown writer with helper methods for common markdown constructs.
 * All methods return `this` for chaining.
 */
export class MarkdownWriter {
  private lines: string[] = [];

  /** Appends a heading at the given level. */
  heading(text: string, level: 1 | 2 | 3 | 4 | 5 | 6): this {
    this.lines.push(`${"#".repeat(level)} ${text}`);
    this.lines.push("");
    return this;
  }

  /** Appends a paragraph (text followed by a blank line). */
  paragraph(text: string): this {
    this.lines.push(text);
    this.lines.push("");
    return this;
  }

  /** Appends a blockquote line (> prefix). */
  blockquote(text: string): this {
    this.lines.push(`> ${text}`);
    return this;
  }

  /** Appends a blank line. */
  blankLine(): this {
    this.lines.push("");
    return this;
  }

  /** Appends a table header row with separator. */
  tableHeader(columns: string[]): this {
    this.lines.push(`| ${columns.join(" | ")} |`);
    this.lines.push(`| ${columns.map(() => "---").join(" | ")} |`);
    return this;
  }

  /** Appends a table data row. */
  tableRow(cells: string[]): this {
    this.lines.push(`| ${cells.join(" | ")} |`);
    return this;
  }

  /** Opens a `<details>` block with a `<summary>` line. */
  detailsOpen(summary: string, open = false): this {
    this.lines.push(open ? "<details open>" : "<details>");
    this.lines.push(`<summary>${summary}</summary>`);
    this.lines.push("");
    return this;
  }

  /** Closes a `<details>` block. */
  detailsClose(): this {
    this.lines.push("</details>");
    this.lines.push("");
    return this;
  }

  /** Appends a fenced code block. */
  codeFence(content: string, language = ""): this {
    this.lines.push(`\`\`\`${language}`);
    this.lines.push(content);
    this.lines.push("```");
    this.lines.push("");
    return this;
  }

  /** Appends raw text verbatim (no trailing newline added). */
  raw(text: string): this {
    this.lines.push(text);
    return this;
  }

  /**
   * Post-processes and returns the accumulated markdown string.
   * 1. Collapses runs of 3+ blank lines to 2 blank lines.
   * 2. Ensures a blank line before each # heading.
   */
  build(): string {
    let text = this.lines.join("\n");

    // Collapse 3+ consecutive blank lines to 2
    text = text.replace(/\n{3,}/g, "\n\n");

    // Ensure blank line before headings (not at the very start)
    text = text.replace(/([^\n])\n(#{1,6} )/g, "$1\n\n$2");

    return text;
  }

  /** Escapes pipe characters in table cells. */
  static escapeCell(value: string): string {
    return value.replace(/\|/g, "\\|");
  }

  /** Wraps value in `<code>` tags. */
  static inlineCode(value: string): string {
    return `<code>${value}</code>`;
  }
}
