# Atlas search Worker

A Cloudflare Worker that proxies web search to [Exa](https://exa.ai) for the
Atlas backend. The Worker owns the Exa key; the browser never sees it.

The response is the same `{ results: [...] }` contract Atlas already reads from
Exa (`src/lib/tools/websearch.ts`), so wiring the backend to the Worker does not
change how results are parsed or displayed.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/search` | Search with a JSON body |
| `GET` | `/search?query=...&limit=...` | Search with query parameters (`q` and `numResults` also work) |
| `GET` | `/health` | Liveness check |

### Request

```json
{
  "query": "latest Bun version",
  "limit": 8
}
```

- `query` is required, trimmed, and capped at 400 characters.
- `limit` is optional, an integer from `1` to `20`, default `8`. It is passed to
  Exa as `numResults`.
- Extra JSON fields are ignored, so the Exa-shaped body Atlas already sends
  (`type`, `contents`) still works.

### Success

```json
{
  "results": [
    {
      "title": "Bun 1.4",
      "url": "https://bun.sh/blog/bun-v1.4",
      "publishedDate": "2026-10-30",
      "highlights": ["Bun 1.4 adds ..."]
    }
  ]
}
```

`title`, `publishedDate`, and `highlights` are included only when Exa returns
them. Results without a usable `http(s)` URL are dropped, highlights are
trimmed to 600 characters, and the list is capped at `limit`.

### Errors

```json
{
  "error": {
    "code": "rate_limited",
    "message": "Search is rate limited. Try again shortly."
  }
}
```

| Status | Code | Meaning |
|---|---|---|
| `400` | `bad_request` | Missing query, invalid JSON, or an invalid `limit` |
| `413` | `payload_too_large` | Request body over 16 KB |
| `429` | `rate_limited` | Exa rate-limited the request; `Retry-After` is passed through |
| `499` | `aborted` | The caller disconnected before the search finished |
| `500` | `config` | `EXA_API_KEY` is not configured |
| `502` | `network`, `upstream_auth`, `upstream_error` | Exa was unreachable, rejected the key, or returned an error |
| `504` | `timeout` | Exa did not answer within 15 seconds |

Upstream response bodies and the API key are never included in an error.

## Setup

From this directory:

```bash
cd worker

# Store the Exa key as a Worker secret (never in wrangler.toml or source).
npx wrangler secret put EXA_API_KEY

# Local development: copy the template and fill in the key.
cp .dev.vars.example .dev.vars
npx wrangler dev
```

`npx wrangler dev` prints a local URL (usually `http://localhost:8787`). Test it:

```bash
curl -X POST http://localhost:8787/search \
  -H 'content-type: application/json' \
  -d '{"query":"latest Bun version","limit":5}'
```

Deploy:

```bash
npx wrangler deploy
```

Wrangler prints the deployed `*.workers.dev` URL. `preview_urls = false` is set in `wrangler.toml` so only the production URL is exposed; remove that line if you want per-version preview URLs. Add a custom route or disable `workers_dev` in `wrangler.toml` if you want a private endpoint.

## Secret handling

- The only key the Worker needs is `EXA_API_KEY`, read from `env.EXA_API_KEY`.
- `wrangler secret put` stores it in Cloudflare; it is not written to the repo.
- `.dev.vars` is gitignored. `.dev.vars.example` contains an empty placeholder
  only.
- Never add the real key to `wrangler.toml`, source, tests, or a committed
  `.dev.vars`.
- The Worker is a server-to-server endpoint. If you expose it publicly, put
  Cloudflare Access, a WAF rule, or another auth layer in front of it.

## Tests

The offline suite exercises the Worker through `tests/search-worker.test.js`:

```bash
bun test tests/search-worker.test.js
```

It covers request validation, the Exa request shape, result limits, result
normalization, timeout/abort handling, rate-limit and upstream error mapping,
and confirms the key never appears in a response.
