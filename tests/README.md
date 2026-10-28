# Tests

```bash
bun test tests/
```

The suite is deterministic and offline. Tests import the TypeScript modules
directly through Bun; the omni-stream tests replace `globalThis.fetch` with
in-memory SSE responses, so no NVIDIA, Exa, or Cartesia call is made.

| File | Covers |
| --- | --- |
| `voice-activity.test.js` | VAD arm delay, thresholds, silence, min/max speech, cooldown |
| `wav.test.js` | RIFF header, PCM16 conversion, clipping, mono downmix |
| `orb-turn.test.js` | JSON normalization, caps, sentence-safe speech trim, malformed payloads |
| `exa-search.test.js` | Exa result compaction and the JSON `websearch` request shape |
| `orb-tools.test.js` | Tool registry, nested/flat JSON requests, classification with partial invalid calls, per-argument caps, per-id native calls, `runToolWithSources`, fetch fencing |
| `web-fetch.test.js` | URL validation and private-host blocking, HTML extraction, focus selection, fetch success, redirect, 404, unsupported type, oversize, timeout |
| `atlas-prompt.test.js` | Injected date, reply shapes, the news/search example, and the fetch branch |
| `sse.test.js` | SSE chunk splitting, CRLF, multi-line frames, `[DONE]`, incremental JSON fields |
| `speech.test.js` | Sentence chunker boundaries, PCM16 scheduling math, Cartesia request shape and failures |
| `history.test.js` | `parseHistory`/`toModelHistory` validation, tool-trace validation, and character-budget trimming that keeps user/assistant pairs |
| `tool-trace.test.js` | Tool-trace guards, detail caps, middle-shortened URLs, and running/done labels |
| `source-links.test.js` | Source extraction, title fallback, URL matching (fragments, `www`, tracking params) |
| `orb-chrome.test.js` | `orbStateFor` precedence and `mainLabelFor` copy for every mic status |
| `orb-reveal.test.js` | When held audio, MP3, or an error reveals the reply text |
| `orb-search.test.js` | Searching constellation ranks, scan band sweep/falloff, staggered reveal, dot/alpha gains |
| `turn-stream.test.js` | `TurnEvent` boundary validation, tool detail/query dispatch, NDJSON event dispatch, typed errors, truncated streams |
| `omni-stream.test.js` | Streamed model output, truncation/reasoning retries, in-stream busy errors, tool orchestration (correction, round cap, repair with evidence, native ids, duplicate searches, turn deadline, search→fetch, partial failures, cross-round dedupe, tool cancellation) |

## Probe

`scripts/omni-probe.mjs` is a diagnostic, not a test. Run it only when the
NVIDIA endpoint changes or native tools need re-checking:

```bash
bun run probe:omni
```

It needs `NVIDIA_API_KEY` in `.env`, prints seven result blocks (baseline,
streaming, native tools, `json_object`, thinking-off, WAV input, `json_schema`),
and exits non-zero only when the baseline request fails. Set
`OMNI_NATIVE_TOOLS=1` only after the tool block shows real `tool_calls`; the JSON
tool protocol is the default because the free worker was returning 503 during
the first probe. `json_schema` output is evidence for replacing `json_object`,
not a flag that exists yet.

## Fixtures

There are no fixture files: each test builds the small payload it needs inline.
`omni-stream.test.js` contains the SSE response helpers (`sseResponse`,
`contentEvent`, `finishEvent`, `finalTurn`) used for the model transport tests.
