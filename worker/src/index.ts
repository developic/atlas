/**
 * Atlas search Worker.
 *
 * `POST /search` and `GET /search` accept a query from the Atlas backend and
 * return the same `{ results: [...] }` contract the app already reads from
 * Exa. The Exa key lives only in the Worker secret `EXA_API_KEY`.
 */
import {
  SearchError,
  searchExa,
  type SearchEnv,
  type SearchInput,
} from "./exa";

export type Env = SearchEnv;

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;
const MAX_QUERY_CHARS = 400;
const MAX_BODY_BYTES = 16_384;

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function errorResponse(error: SearchError): Response {
  const headers: Record<string, string> = {};

  if (error.retryAfter) headers["retry-after"] = error.retryAfter;

  return json(
    { error: { code: error.code, message: error.message } },
    error.status,
    headers,
  );
}

function parseQuery(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const query = value.trim().slice(0, MAX_QUERY_CHARS);

  return query.length > 0 ? query : null;
}

function parseLimit(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_LIMIT;
  }

  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
    return null;
  }

  return parsed;
}

async function readSearchInput(request: Request): Promise<SearchInput> {
  if (request.method === "GET") {
    const url = new URL(request.url);
    const query = parseQuery(
      url.searchParams.get("query") || url.searchParams.get("q"),
    );
    const limit = parseLimit(
      url.searchParams.get("limit") || url.searchParams.get("numResults"),
    );

    if (!query) {
      throw new SearchError(
        400,
        "bad_request",
        "A non-empty query is required.",
      );
    }

    if (limit === null) {
      throw new SearchError(
        400,
        "bad_request",
        `limit must be an integer from 1 to ${MAX_LIMIT}.`,
      );
    }

    return { query, limit };
  }

  const length = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    throw new SearchError(
      413,
      "payload_too_large",
      "The request body is too large.",
    );
  }

  let text: string;

  try {
    text = await request.text();
  } catch {
    throw new SearchError(499, "aborted", "The request body could not be read.");
  }

  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new SearchError(
      413,
      "payload_too_large",
      "The request body is too large.",
    );
  }

  let body: unknown;

  try {
    body = JSON.parse(text);
  } catch {
    throw new SearchError(
      400,
      "bad_request",
      "The request body must be valid JSON.",
    );
  }

  if (typeof body !== "object" || body === null) {
    throw new SearchError(
      400,
      "bad_request",
      "The request body must be a JSON object.",
    );
  }

  const record = body as Record<string, unknown>;
  const query = parseQuery(record.query);
  const limit = parseLimit(record.limit ?? record.numResults);

  if (!query) {
    throw new SearchError(400, "bad_request", "A non-empty query is required.");
  }

  if (limit === null) {
    throw new SearchError(
      400,
      "bad_request",
      `limit must be an integer from 1 to ${MAX_LIMIT}.`,
    );
  }

  return { query, limit };
}

/** Exported for offline tests; the Worker entry calls this with global fetch. */
export async function handleRequest(
  request: Request,
  env: Env,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/health") {
    return json({ status: "ok" });
  }

  if (url.pathname !== "/search") {
    return json(
      { error: { code: "not_found", message: "Not found." } },
      404,
    );
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { allow: "GET, POST, OPTIONS" },
    });
  }

  if (request.method !== "GET" && request.method !== "POST") {
    return json(
      { error: { code: "method_not_allowed", message: "Use GET or POST." } },
      405,
      { allow: "GET, POST, OPTIONS" },
    );
  }

  try {
    const input = await readSearchInput(request);
    const results = await searchExa(input, env, {
      fetcher,
      signal: request.signal,
    });

    return json({ results });
  } catch (error) {
    if (error instanceof SearchError) return errorResponse(error);

    console.error(
      "Search worker failed",
      error instanceof Error ? error.message : "unknown",
    );

    return json(
      { error: { code: "internal", message: "Search failed." } },
      500,
    );
  }
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
};

export default worker;
