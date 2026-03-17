/**
 * A section of output with full and optional compact variants.
 *
 * The compositor uses `full` if budget allows, falls back to `compact`
 * under pressure, and omits the section entirely as a last resort.
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
