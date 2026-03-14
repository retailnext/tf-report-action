/**
 * A structured representation of a step issue (failure, parse error, etc.)
 * ready for rendering.
 *
 * Built by the builder from raw step data; rendered by the renderer into
 * markdown. This decouples data gathering (I/O, classification) from
 * presentation (markdown formatting).
 */
export interface StepIssue {
  /** Step identifier (e.g. "init", "validate", "show-plan"). */
  readonly id: string;

  /** Human-readable heading for the issue (e.g. "`init` failed"). */
  readonly heading: string;

  /**
   * Whether the underlying step actually failed (outcome === "failure").
   * Used to determine title severity: only issues with `isFailed: true`
   * trigger the ❌ icon in the title. Parse warnings for successful steps
   * use ⚠️ instead.
   */
  readonly isFailed: boolean;

  /** Diagnostic message (e.g. "Plan output could not be parsed: ..."). */
  readonly diagnostic?: string;

  /** Step stdout content, if available. */
  readonly stdout?: string;
  /** Whether stdout was truncated. */
  readonly stdoutTruncated?: boolean;
  /** Error message if stdout could not be read. */
  readonly stdoutError?: string;

  /** Step stderr content, if available. */
  readonly stderr?: string;
  /** Whether stderr was truncated. */
  readonly stderrTruncated?: boolean;
  /** Error message if stderr could not be read. */
  readonly stderrError?: string;
}
