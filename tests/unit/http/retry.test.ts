import { describe, expect, it, vi } from "vitest";
import { withRetry } from "../../../src/http/retry.js";
import { ActionsError } from "../../../src/http/errors.js";

/** A no-op sleep that records the requested delays. */
function fakeSleep(): { sleep: (ms: number) => Promise<void>; delays: number[] } {
  const delays: number[] = [];
  return {
    delays,
    sleep: async (ms: number) => {
      delays.push(ms);
    },
  };
}

describe("withRetry", () => {
  it("returns the result on first success", async () => {
    const result = await withRetry(
      () => Promise.resolve(42),
      () => true,
    );
    expect(result).toBe(42);
  });

  it("retries on retryable errors and eventually succeeds", async () => {
    const { sleep, delays } = fakeSleep();
    let calls = 0;

    const result = await withRetry(
      () => {
        calls++;
        if (calls < 3) {
          return Promise.reject(new ActionsError("fail", 500));
        }
        return Promise.resolve("ok");
      },
      (err) => err instanceof ActionsError && err.statusCode === 500,
      { sleep, baseIntervalMs: 100, multiplier: 2 },
    );

    expect(result).toBe("ok");
    expect(calls).toBe(3);
    expect(delays).toHaveLength(2);
  });

  it("throws immediately on non-retryable errors", async () => {
    const { sleep, delays } = fakeSleep();
    let calls = 0;

    await expect(
      withRetry(
        () => {
          calls++;
          return Promise.reject(new ActionsError("forbidden", 403));
        },
        (err) => err instanceof ActionsError && err.statusCode === 500,
        { sleep },
      ),
    ).rejects.toThrow("forbidden");

    expect(calls).toBe(1);
    expect(delays).toHaveLength(0);
  });

  it("throws after exhausting all attempts", async () => {
    const { sleep, delays } = fakeSleep();
    let calls = 0;

    await expect(
      withRetry(
        () => {
          calls++;
          return Promise.reject(new ActionsError("server error", 502));
        },
        () => true,
        { sleep, maxAttempts: 3, baseIntervalMs: 100, multiplier: 1.5 },
      ),
    ).rejects.toThrow("server error");

    expect(calls).toBe(3);
    expect(delays).toHaveLength(2);
  });

  it("applies jittered exponential backoff", async () => {
    const { sleep, delays } = fakeSleep();
    // Fix Math.random to get deterministic delays
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    try {
      await withRetry(
        () => Promise.reject(new Error("fail")),
        () => true,
        {
          sleep,
          maxAttempts: 4,
          baseIntervalMs: 1000,
          multiplier: 2,
        },
      );
    } catch {
      // expected
    }

    // attempt 0: min=1000*2^0=1000, max=1000*2=2000, delay=1000+0.5*1000=1500
    // attempt 1: min=1000*2^1=2000, max=2000*2=4000, delay=2000+0.5*2000=3000
    // attempt 2: min=1000*2^2=4000, max=4000*2=8000, delay=4000+0.5*4000=6000
    expect(delays).toEqual([1500, 3000, 6000]);

    vi.restoreAllMocks();
  });

  it("defaults to 5 max attempts", async () => {
    const { sleep } = fakeSleep();
    let calls = 0;

    await expect(
      withRetry(
        () => {
          calls++;
          return Promise.reject(new Error("fail"));
        },
        () => true,
        { sleep },
      ),
    ).rejects.toThrow("fail");

    expect(calls).toBe(5);
  });
});
