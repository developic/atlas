import { describe, expect, test } from "bun:test";
import { retryAfterMs, withRetry } from "../src/lib/retry.ts";

describe("retryAfterMs", () => {
  test("parses seconds", () => {
    expect(retryAfterMs({ "retry-after": "120" })).toBe(120_000);
    expect(retryAfterMs(new Headers({ "retry-after": "5" }))).toBe(5_000);
  });
  test("parses HTTP-date", () => {
    const future = new Date(Date.now() + 10_000).toUTCString();
    const ms = retryAfterMs({ "retry-after": future });
    expect(ms).not.toBeNull();
    expect(ms).toBeGreaterThan(5_000);
    expect(ms).toBeLessThan(15_000);
  });
  test("returns null when missing", () => {
    expect(retryAfterMs({})).toBeNull();
    expect(retryAfterMs(new Headers())).toBeNull();
  });
});

describe("withRetry", () => {
  test("retries and eventually succeeds", async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("fail");
        return "ok";
      },
      { maxAttempts: 3, baseMs: 1 },
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });
  test("throws last error after maxAttempts", async () => {
    await expect(
      withRetry(async () => { throw new Error("always"); }, { maxAttempts: 2, baseMs: 1 }),
    ).rejects.toThrow("always");
  });
  test("jitter stays within range (sanity)", async () => {
    // Two attempts, jittered: delay should be baseMs * jitter factor (0.8–1.2) for first retry
    const start = Date.now();
    await withRetry(
      (() => {
        let n = 0;
        return async () => {
          n += 1;
          if (n < 2) throw new Error("x");
          return "ok";
        };
      })(),
      { maxAttempts: 2, baseMs: 10, jitter: true },
    );
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThan(4);
    expect(elapsed).toBeLessThan(80);
  });
});
