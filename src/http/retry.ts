/**
 * Exponential-backoff retry wrapper.
 *
 * Retries a function up to `maxAttempts` times with jittered exponential
 * backoff. The caller supplies an `isRetryable` predicate that determines
 * whether a given error should trigger a retry — the retry module itself
 * has no HTTP or domain knowledge.
 */

/** Options controlling retry behavior. */
export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default 5. */
  readonly maxAttempts?: number;
  /** Base delay in milliseconds before the first retry. Default 3000. */
  readonly baseIntervalMs?: number;
  /** Multiplier applied to the delay after each attempt. Default 1.5. */
  readonly multiplier?: number;
  /**
   * Sleep implementation — injectable for testing.
   * Defaults to a real `setTimeout`-based sleep.
   */
  readonly sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_INTERVAL_MS = 3000;
const DEFAULT_MULTIPLIER = 1.5;

/**
 * Retry `fn` with jittered exponential backoff.
 *
 * On each failed attempt where `isRetryable(error)` returns `true`, the
 * wrapper sleeps for a random duration in `[minDelay, maxDelay)` before
 * the next attempt:
 *
 * ```
 * minDelay = baseInterval × (multiplier ^ attempt)
 * maxDelay = minDelay × multiplier
 * delay    = random integer in [minDelay, maxDelay)
 * ```
 *
 * Non-retryable errors and the final attempt's error propagate immediately.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  isRetryable: (error: unknown) => boolean,
  options?: RetryOptions,
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseIntervalMs = options?.baseIntervalMs ?? DEFAULT_BASE_INTERVAL_MS;
  const multiplier = options?.multiplier ?? DEFAULT_MULTIPLIER;
  const sleep = options?.sleep ?? realSleep;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;

      const isLastAttempt = attempt === maxAttempts - 1;
      if (isLastAttempt || !isRetryable(error)) {
        throw error;
      }

      const minDelay = baseIntervalMs * multiplier ** attempt;
      const maxDelay = minDelay * multiplier;
      const delay = Math.floor(
        minDelay + Math.random() * (maxDelay - minDelay),
      );
      await sleep(delay);
    }
  }

  // Unreachable — the loop always throws on the last attempt.
  // istanbul ignore next
  throw lastError;
}

/** Real sleep backed by `setTimeout`. */
function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
