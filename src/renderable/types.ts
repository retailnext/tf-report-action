/**
 * Core types for the format-agnostic renderable architecture.
 *
 * Every piece of report content implements {@link Renderable} — from leaf
 * text nodes to the top-level {@link ComposedReport}. The tree of Renderable
 * objects mirrors the report structure and supports rendering to both
 * markdown and HTML on demand.
 */

// ---------------------------------------------------------------------------
// Output format
// ---------------------------------------------------------------------------

/** Supported output formats for rendering. */
export type OutputFormat = "markdown" | "html";

// ---------------------------------------------------------------------------
// Renderable (the fundamental contract)
// ---------------------------------------------------------------------------

/**
 * A content node that can render itself to markdown or HTML.
 *
 * Implementations are immutable — content is fixed at construction time.
 * Sizes for both formats may be computed eagerly and cached so that
 * repeated `size()` calls return in O(1) without allocation.
 */
export interface Renderable {
  /**
   * Exact character count of the rendered output in the given format.
   *
   * **Invariant**: `size(f) === render(f).length` for all formats `f`.
   *
   * Must NOT build or allocate the full output string. For leaf nodes this
   * is an O(n) scan at construction time (e.g. counting HTML entities).
   * For composites it is the sum of children's sizes plus structural
   * overhead — cached at construction.
   */
  size(format: OutputFormat): number;

  /** Render to the given format. */
  render(format: OutputFormat): string;
}

// ---------------------------------------------------------------------------
// ReportElement (replaces Section)
// ---------------------------------------------------------------------------

/**
 * A report section that supports multi-level detail rendering.
 *
 * Each element holds pre-built {@link Renderable} trees for each detail
 * level. Level 0 is most compact; level `(levels - 1)` is most detailed.
 * Fixed elements (title, summary, warnings) have `levels: 1`.
 */
export interface ReportElement {
  /** Stable identifier for this element (e.g. "summary", "resources-module.vpc"). */
  readonly id: string;

  /** When true, always included at full detail regardless of budget. */
  readonly fixed: boolean;

  /** Number of detail levels (1 = only full, 2+ = degradable). */
  readonly levels: number;

  /**
   * Exact rendered size at the given detail level and format.
   * Delegates to the Renderable tree for that level.
   */
  size(format: OutputFormat, level: number): number;

  /**
   * Render at the given detail level and format.
   * Delegates to the Renderable tree for that level.
   */
  render(format: OutputFormat, level: number): string;
}

// ---------------------------------------------------------------------------
// RenderResult
// ---------------------------------------------------------------------------

/**
 * Result of rendering a report to a string.
 *
 * Plain immutable data — no behavior. The `truncated` flag tells the caller
 * whether any element was rendered below its maximum detail level.
 */
export interface RenderResult {
  /** The rendered output string. */
  readonly output: string;

  /**
   * True when the output was rendered at reduced detail to fit within
   * the limit. False when every element is at full detail.
   */
  readonly truncated: boolean;
}

// ---------------------------------------------------------------------------
// ComposedReport (top-level contract)
// ---------------------------------------------------------------------------

/**
 * A fully-assembled report that renders itself to markdown or HTML on demand.
 *
 * The caller specifies format and optional length limit — the report handles
 * progressive enhancement internally.
 *
 * ```typescript
 * const md = report.render("markdown", 65536);
 * if (md.truncated) {
 *   const html = report.render("html"); // full detail, no limit
 *   uploadArtifact(buildHtmlPage(html.output, title));
 * }
 * postComment(md.output);
 * ```
 */
export interface ComposedReport {
  /**
   * Render the report in the given format, fitting within the optional
   * character limit via progressive enhancement.
   *
   * When `limit` is omitted or `Infinity`, every element renders at its
   * maximum detail level and `truncated` is `false`.
   */
  render(format: OutputFormat, limit?: number): RenderResult;

  /**
   * Exact rendered size at full detail for the given format, without
   * building the string. Useful for checking whether truncation will occur.
   */
  fullSize(format: OutputFormat): number;
}
