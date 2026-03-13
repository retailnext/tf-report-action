/**
 * Types for the section compositor, which assembles markdown sections
 * within an output size budget.
 *
 * The compositor is budget-aware: it progressively degrades sections
 * from full → compact → omitted to fit within the output size limit.
 * Individual renderers remain budget-unaware — they produce full and
 * compact variants, and the compositor chooses which to use.
 */

/**
 * A section of the output with full and optional compact variants.
 *
 * The compositor will use `full` if budget allows, fall back to `compact`
 * under pressure, and omit the section entirely as a last resort.
 *
 * Sections with `fixed: true` are never degraded or omitted — they
 * always use their `full` content and their size is deducted from the
 * budget before processing non-fixed sections.
 */
export interface Section {
  /** Unique identifier for this section (used in truncation accounting). */
  readonly id: string;

  /** Full rendered content. */
  readonly full: string;

  /**
   * Compact rendered content (smaller than full).
   * When undefined, the section can only be included in full or omitted.
   */
  readonly compact?: string;

  /**
   * When true, this section is never degraded or omitted.
   * Fixed sections are always included at their full size.
   * Examples: title, dedup marker, summary table.
   */
  readonly fixed?: boolean;
}

/**
 * Result of composing sections within a budget.
 */
export interface CompositionResult {
  /** The assembled output string. */
  readonly output: string;

  /** Number of sections that were degraded from full to compact. */
  readonly degradedCount: number;

  /** Number of sections that were omitted entirely. */
  readonly omittedCount: number;

  /** IDs of sections that were degraded. */
  readonly degradedIds: readonly string[];

  /** IDs of sections that were omitted. */
  readonly omittedIds: readonly string[];
}
