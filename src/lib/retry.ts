/** Lightweight retry with jitter + Retry-After support (good-code #3). */

const RETRY_MAX_DELAY_MS = 30_000;

function lookupRetryAfter(headers: Record<string, string | undefined>, name: string): string | undefined {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name) return headers[key];
  }

  return undefined;
}

export function retryAfterMs(headers: Headers | Record<string, string | undefined>): number | null {
  const raw =
    headers instanceof Headers ? headers.get("retry-after") : lookupRetryAfter(headers, "retry-after");

  if (!raw) return null;

  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);

  const date = Date.parse(raw);
  if (!Number.isNaN(date)) {
    const delta = date - Date.now();
    return delta > 0 ? delta : 0;
  }

  return null;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts: number; baseMs: number; jitter?: boolean },
): Promise<T> {
  if (!Number.isInteger(opts.maxAttempts) || opts.maxAttempts < 1) {
    throw new Error("maxAttempts must be an integer >= 1");
  }

  let lastError: unknown;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === opts.maxAttempts - 1) break;
      const jitter = opts.jitter ? (Math.random() * 0.4 + 0.8) : 1;
      const delay = Math.min(RETRY_MAX_DELAY_MS, Math.round(opts.baseMs * Math.pow(2, attempt) * jitter));
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
