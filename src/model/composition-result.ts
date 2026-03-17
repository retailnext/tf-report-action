/**
 * Result of composing sections within a budget.
 *
 * Produced by the compositor, consumed by the pipeline to decide
 * whether a truncation notice should be appended.
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
