# Tests

```bash
bun test tests/
```

The suite is deterministic and offline. Tests import the TypeScript modules
directly through Bun; the omni-stream tests replace `globalThis.fetch` with
in-memory SSE responses, so no Baseten, Exa, or Cartesia call is made.

| File | Covers |
| --- | --- |
| `voice-activity.test.js` | VAD arm delay, thresholds, silence, min/max speech, cooldown |
| `wav.test.js` | RIFF header, PCM16 conversion, clipping, mono downmix |
| `orb-turn.test.js` | JSON normalization, required `speak`, transcript cap, ignored legacy `conversation`, whitespace normalization for speech, malformed payloads |
| `create.test.js` | Markdown-only `create` cards, tables/code, empty title/content rejection, invalid timer bodies, content cap, invalid ids |
| `interactive-markdown.test.js` | Block-level timer parsing, attribute validation, unknown tags left as text, malformed widgets, plain-text previews |
| `timer.test.js` | Countdown state machine: start, tick, pause, resume, finish once, reset, duration formatting |
| `exa-search.test.js` | Exa result compaction and the JSON `websearch` request shape |
| `orb-tools.test.js` | Tool registry, nested/flat JSON requests, classification with partial invalid calls, per-argument caps, per-id native calls, `runToolWithSources`, fetch fencing |
| `web-fetch.test.js` | URL validation and private-host blocking, HTML extraction, focus selection, fetch success, redirect, 404, unsupported type, oversize, timeout |
| `atlas-prompt.test.js` | Injected date, UTC-day prompt stability and midnight rollover, no live clock in the prefix, reply shapes, create-only screen rules, timer syntax, the news/search example, and the fetch branch |
| `sse.test.js` | SSE chunk splitting, CRLF, multi-line frames, `[DONE]`, incremental JSON fields |
| `speech.test.js` | Sentence chunker boundaries, PCM16 scheduling math, Cartesia request shape and failures |
| `history.test.js` | `parseHistory`/`toModelHistory` validation, card and tool-trace validation, card-Markdown history fallback, and character-budget trimming that keeps user/assistant pairs |
| `layout-context.test.js` | Breakpoint mapping and available-space math |
| `tool-trace.test.js` | Tool-trace guards, detail caps, middle-shortened URLs, and running/done labels |
| `source-links.test.js` | Source extraction, title fallback, URL matching (fragments, `www`, tracking params) |
| `orb-chrome.test.js` | `orbStateFor` precedence and `mainLabelFor` copy for every mic status |
| `orb-reveal.test.js` | When held audio, MP3, or an error reveals the reply text |
| `orb-search.test.js` | Searching constellation ranks, scan band sweep/falloff, staggered reveal, dot/alpha gains |
| `turn-debug.test.js` | AI wire contracts and display helpers: `isTurnDebug` guards, event summaries, PCM/MP3 placeholder rendering, `withoutTurnDebug`, copyable `wireJson`, and byte formatting |
| `turn-stream.test.js` | `TurnEvent` boundary validation, tool detail/query dispatch, NDJSON event dispatch, optional debug passthrough and malformed-debug stripping, the every-frame `onEvent` tap (including an error frame before it throws), typed errors, truncated streams |
| `nvidia-sign.test.js` | Signing-video helper: mp4/webm/mov validation, size caps, provider switch (NVIDIA chat vs opencode responses with session header), transcript + usage mapping, missing-key and upstream-failure paths |
| `sign-transcribe.test.js` | `POST /api/orb/transcribe`: clip in, transcript out, empty/oversize rejection without a model call |
| `execution-ledger.test.js` | Execution ledger (exec ids, dedup reuse, first-completion-wins, delivery, `hasActionAttempts`, describe/stamp) and the speech claim gate: tool-JSON rejection, rule A (real, delivered, settled citations), rule B (citations required after actions), rule C (failed executions never back success), rule D (no actions → no claims), plain-text rule (Markdown withheld), and action-claim pattern scope |
| `execution-integrity.test.js` | The eight vulnerability regressions end to end: failed create + success claim, failed search + fabrication, plain-text claim without tools, length-retry with unsupported claim, forced answers (supported and unsupported, including the speak-only forced request), tool-call JSON as text (never executed), deduped failed search (never re-run), TTS receiving only approved deltas; plus markdown-speak → create repair, stamped results, empty-but-citable searches, ordinary conversation, and distinct repeated actions |
| `omni-stream.test.js` | Streamed model output, request shape (reasoning depth, usage frames, session affinity), session sanitization (control/non-ASCII characters), cached/audio/reasoning token reporting and missing/partial usage defaults, status mapping (429/503/529 busy, 402/401 config), truncation retries with a forced-speak request, in-stream busy errors, tool orchestration (correction, round cap, repair with evidence, native ids, duplicate searches, turn deadline, search→fetch, partial failures, cross-round dedupe, tool cancellation), create-card collection with unique ids, evidence-cited speak after tool rounds (same-round speak+create repair), a speak-only forced final answer after create, sources selected from card Markdown, and opt-in raw provider capture per model call (retries included, no secrets) |

## Probe

`scripts/omni-probe.mjs` is a diagnostic, not a test. Run it only when the
Baseten endpoint changes or native tools need re-checking:

```bash
bun run probe:omni
```

It needs `BASETEN_API_KEY` in `.env`, prints seven result blocks (baseline,
streaming, native tools, `json_object`, reasoning-effort-high, WAV input, `json_schema`),
and exits non-zero only when the baseline request fails. Set
`BASETEN_NATIVE_TOOLS=1` only after the tool block shows real `tool_calls`; the JSON
tool protocol is the default.

## Fixtures

There are no fixture files: each test builds the small payload it needs inline.
`omni-stream.test.js` contains the SSE response helpers (`sseResponse`,
`contentEvent`, `finishEvent`, `finalTurn`) used for the model transport tests.
