/**
 * Core renderable contract — the fundamental interface for format-agnostic
 * report content.
 *
 * Defined in `model/` (Layer 0) because it is a pure interface with zero
 * dependencies. Higher layers (`renderable/`, `elements/`) build on this
 * interface with richer semantics (multi-level detail, progressive
 * composition).
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
