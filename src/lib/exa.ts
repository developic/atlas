/**
 * Server-only Exa web search for the orb.
 *
 * Follows Exa's recommended /search request: query + auto + highlights only.
 * Never import this module from a client component: it reads EXA_API_KEY.
 */
const EXA_URL = "https://api.exa.ai/search";
const EXA_TIMEOUT_MS = 15_000;
const HIGHLIGHT_CHARS = 600;
const MAX_RESULTS = 8;
const USER_AGENT = "atlas/0.1.0";

export type SearchHit = {
  /** Exa does not always return a title; the UI falls back to the hostname. */
  title?: string;
  url: string;
  publishedDate?: string;
  highlights: string[];
};

type ExaResult = {
  title?: string | null;
  url?: string | null;
  publishedDate?: string | null;
  highlights?: string[] | null;
};

type ExaResponse = {
  results?: ExaResult[] | null;
};

function getApiKey(): string {
  const key = process.env.EXA_API_KEY?.trim();

  if (!key) {
    throw new Error("EXA_API_KEY is not configured. Add it to .env.");
  }

  return key;
}

export async function websearch(
  query: string,
  signal?: AbortSignal,
): Promise<SearchHit[]> {
  const cleaned = query.trim().slice(0, 400);

  if (!cleaned) {
    throw new Error("The assistant asked for an empty web search.");
  }

  const key = getApiKey();
  const timeout = AbortSignal.timeout(EXA_TIMEOUT_MS);
  const bounded = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response: Response;

  try {
    response = await fetch(EXA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        query: cleaned,
        type: "auto",
        contents: { highlights: true },
      }),
      signal: bounded,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw new Error("Web search took too long.");
    }

    throw error;
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");

    throw new Error(
      `Exa search failed (${response.status}): ${detail.slice(0, 160)}`,
    );
  }

  const payload = (await response.json()) as ExaResponse;

  return formatResults(payload.results ?? []);
}

/** Keep only usable hits and compact them for the model's context. */
export function formatResults(results: ExaResult[]): SearchHit[] {
  return results
    .filter(
      (item): item is ExaResult & { url: string } =>
        typeof item?.url === "string" && item.url.length > 0,
    )
    .slice(0, MAX_RESULTS)
    .map((item) => ({
      ...(typeof item.title === "string" && item.title.trim()
        ? { title: item.title.trim() }
        : {}),
      url: item.url,
      publishedDate:
        typeof item.publishedDate === "string"
          ? item.publishedDate
          : undefined,
      highlights: (item.highlights ?? [])
        .filter((highlight): highlight is string => typeof highlight === "string")
        .map((highlight) => highlight.trim().slice(0, HIGHLIGHT_CHARS))
        .filter(Boolean),
    }));
}
