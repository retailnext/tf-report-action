/**
 * Types for the GitHub Actions steps context and related configuration.
 *
 * The steps context is the JSON-serialized `${{ toJSON(steps) }}` from a
 * GitHub Actions workflow job. Each key is a step ID, and each value contains
 * the step's outcome, conclusion, and outputs.
 *
 * @see https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/accessing-contextual-information-about-workflow-runs#steps-context
 */

// ---------------------------------------------------------------------------
// Step outcome/conclusion
// ---------------------------------------------------------------------------

/**
 * Possible values for a step's `outcome` or `conclusion` field.
 *
 * - `"success"` — the step completed successfully.
 * - `"failure"` — the step failed. When `continue-on-error` is set on the
 *   step, `outcome` will be `"failure"` but `conclusion` may be `"success"`.
 * - `"cancelled"` — the workflow run was cancelled before the step completed.
 * - `"skipped"` — the step was skipped (e.g. its `if` condition was false,
 *   or a prior step failed and the step does not use `if: always()`).
 */
export type StepResult = "success" | "failure" | "cancelled" | "skipped";

/**
 * Returns true if the value is a recognized {@link StepResult}.
 * Unknown strings are not considered valid — callers should treat them
 * as failure.
 */
export function isStepResult(value: string): value is StepResult {
  return (
    value === "success" ||
    value === "failure" ||
    value === "cancelled" ||
    value === "skipped"
  );
}

// ---------------------------------------------------------------------------
// Step data
// ---------------------------------------------------------------------------

/**
 * Data for a single step in the steps context.
 *
 * Both `outcome` and `conclusion` are set by the Actions runner. The
 * distinction matters when `continue-on-error` is used: `outcome` reflects
 * the actual result, while `conclusion` reflects the result after applying
 * the `continue-on-error` setting.
 *
 * `outputs` is a string-valued record containing any outputs the step
 * produced. For exec-action steps, the convention is:
 * - `stdout_file` — absolute path to the stdout capture file
 * - `stderr_file` — absolute path to the stderr capture file
 * - `exit_code` — the process exit code as a string (e.g. `"0"`, `"1"`, `"2"`)
 */
export interface StepData {
  readonly outcome?: string;
  readonly conclusion?: string;
  readonly outputs?: Readonly<Record<string, string>>;
}

/**
 * The full steps context: a mapping from step ID to step data.
 *
 * Steps that were never reached (e.g. the job was cancelled before them)
 * may be absent from the record entirely.
 */
export type Steps = Readonly<Record<string, StepData>>;

// ---------------------------------------------------------------------------
// Environment abstraction
// ---------------------------------------------------------------------------

/**
 * Re-exported from `env/` for backward compatibility. The canonical
 * definition lives in `src/env/index.ts`.
 */
export type { Env } from "../env/index.js";

// ---------------------------------------------------------------------------
// Reader options (internal)
// ---------------------------------------------------------------------------

/** Default maximum file size for parse reads (256 MiB). */
export const DEFAULT_MAX_FILE_SIZE = 256 * 1024 * 1024;

/** Default maximum bytes to read for display-only reads (64 KiB). */
export const DEFAULT_MAX_DISPLAY_READ = 64 * 1024;

/**
 * Options for the secure file reader.
 *
 * These are internal — populated from {@link ReportOptions} by
 * `reportFromSteps()`. The reader never accesses `process.env` directly.
 */
export interface ReaderOptions {
  /** Directories under which file reads are permitted. */
  readonly allowedDirs: readonly string[];
  /** Maximum file size in bytes for parse reads. */
  readonly maxFileSize: number;
  /** Maximum bytes to read for display-only reads. */
  readonly maxDisplayRead: number;
}

// ---------------------------------------------------------------------------
// Default step IDs
// ---------------------------------------------------------------------------

/** Default step ID for `terraform init`. */
export const DEFAULT_INIT_STEP = "init";

/** Default step ID for `terraform validate`. */
export const DEFAULT_VALIDATE_STEP = "validate";

/** Default step ID for `terraform plan`. */
export const DEFAULT_PLAN_STEP = "plan";

/** Default step ID for `terraform show -json <planfile>`. */
export const DEFAULT_SHOW_PLAN_STEP = "show-plan";

/** Default step ID for `terraform apply`. */
export const DEFAULT_APPLY_STEP = "apply";

/** Default step ID for `terraform state pull` / `tofu state pull`. */
export const DEFAULT_STATE_STEP = "state";

/**
 * The set of step IDs that are recognized as terraform/opentofu workflow
 * steps. Used to determine whether the steps context represents a
 * terraform workflow (Tiers 1–3) or a general workflow (Tier 4).
 */
export const DEFAULT_KNOWN_STEP_IDS: ReadonlySet<string> = new Set([
  DEFAULT_INIT_STEP,
  DEFAULT_VALIDATE_STEP,
  DEFAULT_PLAN_STEP,
  DEFAULT_SHOW_PLAN_STEP,
  DEFAULT_APPLY_STEP,
  DEFAULT_STATE_STEP,
]);

// ---------------------------------------------------------------------------
// exec-action output keys
// ---------------------------------------------------------------------------

/** Output key for the stdout capture file path (exec-action convention). */
export const OUTPUT_STDOUT_FILE = "stdout_file";

/** Output key for the stderr capture file path (exec-action convention). */
export const OUTPUT_STDERR_FILE = "stderr_file";

/** Output key for the process exit code (exec-action convention). */
export const OUTPUT_EXIT_CODE = "exit_code";
