/**
 * DI-friendly abstraction over `process.env`.
 *
 * Modules that need environment variables accept an `Env` parameter
 * instead of reading `process.env` directly, making them testable
 * without modifying the actual process environment.
 */
export type Env = Record<string, string | undefined>;
