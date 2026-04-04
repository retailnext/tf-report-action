/**
 * Logger interface and production implementation.
 *
 * Logging is a first-class, standalone concern. The `Logger` interface is
 * a pure contract for emitting GitHub Actions annotations and messages.
 * `actionsLogger()` is the production implementation that writes `::warning::`,
 * `::error::`, and informational output to the process streams.
 *
 * This is the **only** module in the project permitted to write directly to
 * `process.stdout` and `process.stderr`. All other code must accept an
 * injected `Logger` instead.
 */

/**
 * Logger contract for emitting GitHub Actions annotations and messages.
 *
 * All code that needs to produce user-visible output should accept a
 * `Logger` rather than writing to `process.stderr`/`console` directly.
 * This keeps tests silent and prevents annotation leakage.
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
 * `::warning::` and `::error::` are written to stderr (GitHub Actions interprets
 * them as workflow commands). Informational messages go to stdout.
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
