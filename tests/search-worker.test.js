/**
 * Cloudflare search Worker contract (CI, offline).
 *
 * What must happen: the Worker validates queries and limits, calls Exa with the
 * server-side secret, normalizes the response to the `{ results }` shape Atlas
 * already reads, and maps upstream rate limits, errors, timeouts, and aborts to
 * safe HTTP responses. The key must never appear in a response body.
 */
import { describe, expect, test } from "bun:test";
import { handleRequest } from "../worker/src/index.ts";
import { searchExa } from "../worker/src/exa.ts";

const ENV = { EXA_API_KEY: "test-key" };

function request(body) {
  return new Request("https://worker.test/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function fakeFetch(calls, handler = () => jsonResponse({ results: [] })) {
  return async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(url, init);
  };
}

describe("search Worker — request validation", () => {
  test("refuses to call Exa without a configured key", async () => {
    const calls = [];
    const response = await handleRequest(
      request({ query: "bun" }),
      {},
      fakeFetch(calls),
    );

    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("config");
    expect(calls).toHaveLength(0);
  });

  test("rejects invalid JSON and empty queries", async () => {
    const invalid = await handleRequest(
      new Request("https://worker.test/search", {
        method: "POST",
        body: "{",
      }),
      ENV,
      fakeFetch([]),
    );
    const empty = await handleRequest(
      request({ query: "   " }),
      ENV,
      fakeFetch([]),
    );

    expect(invalid.status).toBe(400);
    expect(empty.status).toBe(400);
    expect((await empty.json()).error.code).toBe("bad_request");
  });

  test("rejects a limit outside 1–20 or not an integer", async () => {
    for (const limit of [0, 21, 1.5, "abc", true]) {
      const response = await handleRequest(
        request({ query: "bun", limit }),
        ENV,
        fakeFetch([]),
      );

      expect(response.status).toBe(400);
    }
  });

  test("rejects a body over 16 KB before parsing", async () => {
    const body = JSON.stringify({
      query: "bun",
      padding: "a".repeat(20_000),
    });
    const response = await handleRequest(
      new Request("https://worker.test/search", { method: "POST", body }),
      ENV,
      fakeFetch([]),
    );

    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe("payload_too_large");
  });

  test("returns 404 and 405 for the wrong path or method", async () => {
    const missing = await handleRequest(
      new Request("https://worker.test/nope"),
      ENV,
    );
    const wrongMethod = await handleRequest(
      new Request("https://worker.test/search", { method: "DELETE" }),
      ENV,
    );

    expect(missing.status).toBe(404);
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("allow")).toBe("GET, POST, OPTIONS");
  });

  test("answers the health check", async () => {
    const response = await handleRequest(
      new Request("https://worker.test/health"),
      ENV,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});

describe("search Worker — Exa request", () => {
  test("sends the query, default limit, and highlights to Exa", async () => {
    const calls = [];
    const response = await handleRequest(
      request({ query: "latest Bun" }),
      ENV,
      fakeFetch(calls),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ results: [] });
    expect(calls).toHaveLength(1);

    const { url, init } = calls[0];

    expect(url).toBe("https://api.exa.ai/search");
    expect(init.method).toBe("POST");
    expect(init.headers["x-api-key"]).toBe("test-key");
    expect(JSON.parse(init.body)).toEqual({
      query: "latest Bun",
      type: "auto",
      numResults: 8,
      contents: { highlights: true },
    });
  });

  test("passes a custom limit from JSON and the query string", async () => {
    const postCalls = [];
    await handleRequest(
      request({ query: "bun", limit: 3 }),
      ENV,
      fakeFetch(postCalls),
    );

    const getCalls = [];
    const get = await handleRequest(
      new Request("https://worker.test/search?q=bun&limit=2"),
      ENV,
      fakeFetch(getCalls),
    );

    expect(get.status).toBe(200);
    expect(JSON.parse(postCalls[0].init.body).numResults).toBe(3);
    expect(JSON.parse(getCalls[0].init.body).query).toBe("bun");
    expect(JSON.parse(getCalls[0].init.body).numResults).toBe(2);
  });

  test("caps the query at 400 characters", async () => {
    const calls = [];
    await handleRequest(
      request({ query: "a".repeat(500) }),
      ENV,
      fakeFetch(calls),
    );

    expect(JSON.parse(calls[0].init.body).query).toHaveLength(400);
  });
});

describe("search Worker — result normalization", () => {
  test("keeps usable hits and drops unusable ones", async () => {
    const payload = {
      results: [
        {
          title: " A ",
          url: "https://a.test",
          publishedDate: "2026-01-01",
          highlights: [" hi ", "", 42],
        },
        { title: "no url" },
        { url: "https://b.test", highlights: null },
        { url: "javascript:alert(1)" },
        null,
      ],
    };
    const response = await handleRequest(
      request({ query: "x", limit: 5 }),
      ENV,
      fakeFetch([], () => jsonResponse(payload)),
    );

    expect(await response.json()).toEqual({
      results: [
        {
          title: "A",
          url: "https://a.test",
          publishedDate: "2026-01-01",
          highlights: ["hi"],
        },
        { url: "https://b.test", highlights: [] },
      ],
    });
  });

  test("caps the result list at the requested limit", async () => {
    const results = Array.from({ length: 10 }, (_, index) => ({
      url: `https://${index}.test`,
      highlights: [],
    }));
    const response = await handleRequest(
      request({ query: "x", limit: 3 }),
      ENV,
      fakeFetch([], () => jsonResponse({ results })),
    );

    expect((await response.json()).results.map((hit) => hit.url)).toEqual([
      "https://0.test",
      "https://1.test",
      "https://2.test",
    ]);
  });
});

describe("search Worker — upstream failures", () => {
  test("passes through a rate limit and its Retry-After", async () => {
    const response = await handleRequest(
      request({ query: "x" }),
      ENV,
      fakeFetch([], () =>
        jsonResponse({ error: "rate limited" }, 429, { "retry-after": "30" }),
      ),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("30");
    expect((await response.json()).error.code).toBe("rate_limited");
  });

  test("maps upstream auth, server, and network failures to 502", async () => {
    const auth = await handleRequest(
      request({ query: "x" }),
      ENV,
      fakeFetch([], () => jsonResponse({}, 401)),
    );
    const server = await handleRequest(
      request({ query: "x" }),
      ENV,
      fakeFetch([], () => jsonResponse({}, 500)),
    );
    const network = await handleRequest(
      request({ query: "x" }),
      ENV,
      async () => {
        throw new Error("boom");
      },
    );

    expect(auth.status).toBe(502);
    expect((await auth.json()).error.code).toBe("upstream_auth");
    expect(server.status).toBe(502);
    expect((await server.json()).error.code).toBe("upstream_error");
    expect(network.status).toBe(502);
    expect((await network.json()).error.code).toBe("network");
  });

  test("never includes the Exa key in an error response", async () => {
    const response = await handleRequest(
      request({ query: "x" }),
      ENV,
      fakeFetch([], () => jsonResponse({ detail: "upstream" }, 500)),
    );
    const text = await response.text();

    expect(text).not.toContain("test-key");
  });
});

describe("search Worker — cancellation", () => {
  test("times out an Exa request", async () => {
    const hanging = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });

    await expect(
      searchExa(
        { query: "x", limit: 8 },
        ENV,
        { fetcher: hanging, timeoutMs: 5 },
      ),
    ).rejects.toMatchObject({ status: 504, code: "timeout" });
  });

  test("stops before calling Exa when the caller already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      searchExa(
        { query: "x", limit: 8 },
        ENV,
        {
          fetcher: async () => jsonResponse({ results: [] }),
          signal: controller.signal,
        },
      ),
    ).rejects.toMatchObject({ status: 499, code: "aborted" });
  });
});
