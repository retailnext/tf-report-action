/**
 * Result of attempting to read a step's stdout/stderr file.
 *
 * Used by steps/io and consumed by builder/ when constructing
 * StepIssue and Tier models.
 */
export interface StepFileRead {
  /** The file content, if successfully read. */
  readonly content?: string;
  /** Whether the content was truncated. */
  readonly truncated?: boolean;
  /** Error message if the read failed. */
  readonly error?: string;
  /** True when the step had no file path configured. */
  readonly noFile?: boolean;
}
