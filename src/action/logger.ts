/**
 * Dependency-injectable logger for GitHub Actions workflow annotations.
 *
 * Production code emits `::warning::`, `::error::`, and informational messages
 * via `actionsLogger()`. Tests inject `nullLogger()` or a capturing
 * implementation so that annotations never leak into the test runner output
 * (which GitHub Actions would interpret as real workflow commands).
 */

/**
 * Logger interface for emitting GitHub Actions annotations and messages.
 *
 * All action-layer code that needs to produce user-visible output should
 * accept a `Logger` rather than writing to `process.stderr`/`console`
 * directly. This keeps tests silent and prevents annotation leakage.
 */
export interface Logger {
  /** Emit a `::warning::` annotation (non-fatal diagnostic). */
  warning(message: string): void;
  /** Emit a `::error::` annotation (fatal diagnostic). */
  error(message: string): void;
  /** Emit informational output (not a workflow command). */
  info(message: string): void;
}

/**
 * Production logger that writes GitHub Actions workflow commands to stderr/stdout.
 *
 * This is the **only** code in the project that writes `::warning::` and
 * `::error::` prefixed strings to process streams. All other modules must
 * use the injected `Logger` interface.
 */
export function actionsLogger(): Logger {
  return {
    warning(message: string): void {
      process.stderr.write(`::warning::${message}\n`);
    },
    error(message: string): void {
      process.stderr.write(`::error::${message}\n`);
    },
    info(message: string): void {
      process.stdout.write(`${message}\n`);
    },
  };
}

/**
 * Silent logger that discards all messages.
 *
 * Use in tests to prevent annotation leakage into CI output.
 */
export function nullLogger(): Logger {
  return {
    warning(): void {
      /* intentionally empty */
    },
    error(): void {
      /* intentionally empty */
    },
    info(): void {
      /* intentionally empty */
    },
  };
}
