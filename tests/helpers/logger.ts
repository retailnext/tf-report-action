/**
 * Silent logger that discards all messages.
 *
 * Use in tests to prevent annotation leakage into CI output.
 */
import type { Logger } from "../../src/logger/index.js";

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

/** Captured log output for assertion in tests. */
export interface CapturedMessages {
  warnings: string[];
  errors: string[];
  infos: string[];
}

/**
 * Capturing logger that records all messages for assertion.
 *
 * Use in tests that need to verify specific log output.
 */
export function capturingLogger(): {
  logger: Logger;
  messages: CapturedMessages;
} {
  const messages: CapturedMessages = {
    warnings: [] as string[],
    errors: [] as string[],
    infos: [] as string[],
  };
  const logger: Logger = {
    warning: (m) => messages.warnings.push(m),
    error: (m) => messages.errors.push(m),
    info: (m) => messages.infos.push(m),
  };
  return { logger, messages };
}
