/**
 * Exa search client for the Cloudflare Worker.
 *
 * The Worker owns the Exa key: it arrives as the `EXA_API_KEY` secret and is
 * only ever used in the upstream request header. Results are normalized to the
 * same `{ results: [...] }` shape Atlas already consumes, so the backend does
 * not need a second parser.
 */

export type SearchHit = {
  /** Exa does not always return a title; the UI falls back to the hostname. */
  title?: string;
  url: string;
  publishedDate?: string;
  highlights: string[];
};

export type SearchInput = {
  query: string;
  limit: number;
  type?: "auto" | "neural" | "keyword";
};

export type SearchEnv = {
  EXA_API_KEY?: string;
};

export type SearchOptions = {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  /** Test hook; production uses the module default. */
  timeoutMs?: number;
};

const EXA_URL = "https://api.exa.ai/search";
const EXA_TIMEOUT_MS = 15_000;
const HIGHLIGHT_CHARS = 600;
const USER_AGENT = "atlas-search-worker/0.1.0";

/** A failure that the HTTP layer can map to a status, code, and message. */
export class SearchError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfter?: string;

  constructor(
    status: number,
    code: string,
    message: string,
    retryAfter?: string,
  ) {
    super(message);
    this.name = "SearchError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const url = value.trim();

  if (!url) return null;

  try {
    const parsed = new URL(url);

    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? url
      : null;
  } catch {
    return null;
  }
}

/** Keep only usable hits, trim highlights, and cap at the requested limit. */
export function normalizeResults(payload: unknown, limit: number): SearchHit[] {
  if (!isRecord(payload) || !Array.isArray(payload.results)) return [];

  const hits: SearchHit[] = [];

  for (const item of payload.results) {
    if (!isRecord(item)) continue;

    const url = safeUrl(item.url);
    if (!url) continue;

    const title =
      typeof item.title === "string" ? item.title.trim() : "";
    const publishedDate =
      typeof item.publishedDate === "string"
        ? item.publishedDate.trim()
        : "";
    const highlights = Array.isArray(item.highlights)
      ? item.highlights
          .filter((highlight): highlight is string => typeof highlight === "string")
          .map((highlight) => highlight.trim().slice(0, HIGHLIGHT_CHARS))
          .filter(Boolean)
      : [];

    hits.push({
      ...(title ? { title } : {}),
      url,
      ...(publishedDate ? { publishedDate } : {}),
      highlights,
    });

    if (hits.length >= limit) break;
  }

  return hits;
}

export async function searchExa(
  input: SearchInput,
  env: SearchEnv,
  options: SearchOptions = {},
): Promise<SearchHit[]> {
  const key = env.EXA_API_KEY?.trim();

  if (!key) {
    throw new SearchError(500, "config", "Search is not configured.");
  }

  const signal = options.signal;

  if (signal?.aborted) {
    throw new SearchError(499, "aborted", "Search was cancelled.");
  }

  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? EXA_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    let response: Response;

    try {
      response = await fetcher(EXA_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "User-Agent": USER_AGENT,
        },
        body: JSON.stringify({
          query: input.query,
          type: input.type ?? "auto",
          numResults: input.limit,
          contents: { highlights: true },
        }),
        signal: controller.signal,
      });
    } catch {
      if (timedOut) {
        throw new SearchError(504, "timeout", "Search timed out. Try again.");
      }

      if (signal?.aborted) {
        throw new SearchError(499, "aborted", "Search was cancelled.");
      }

      throw new SearchError(502, "network", "Search provider is unreachable.");
    }

    if (!response.ok) {
      const retryAfter = response.headers.get("retry-after") ?? undefined;

      if (response.status === 429) {
        throw new SearchError(
          429,
          "rate_limited",
          "Search is rate limited. Try again shortly.",
          retryAfter,
        );
      }

      if (response.status === 401 || response.status === 403) {
        throw new SearchError(
          502,
          "upstream_auth",
          "Search provider authentication failed.",
        );
      }

      if (response.status === 400 || response.status === 422) {
        throw new SearchError(
          400,
          "bad_request",
          "The search query was rejected.",
        );
      }

      throw new SearchError(
        502,
        "upstream_error",
        "Search provider returned an error.",
      );
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      if (timedOut) {
        throw new SearchError(504, "timeout", "Search timed out. Try again.");
      }

      if (signal?.aborted) {
        throw new SearchError(499, "aborted", "Search was cancelled.");
      }

      throw new SearchError(
        502,
        "upstream_error",
        "Search provider returned an invalid response.",
      );
    }

    return normalizeResults(payload, input.limit);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
