# Tests

`bun test tests/` runs the offline suite (no network, no keys). CI (`.github/workflows/ci.yml`) runs
lint, typecheck, and this suite; model-dependent checks are live scripts instead.

## Files

| File | Covers |
|---|---|
| `prompt-regression.test.js` | Composed system prompt invariants: section presence and order, date/profile injection, size bound, the repaired rules (consent, create-split, runtime-honest speech claims, history semantics, loop end-of-turn paths), absence of the known-defective legacy lines, tool registration, and the `speak` tool description wording |
| `history-hysteresis.test.js` | `trimHistory`: byte-identical passthrough while under budget, cut-back to the 60% hysteresis target on overflow, no re-trim inside the headroom (cache-prefix stability), pair integrity, oversized-pair clipping, odd-tail tolerance |
| `meta-turn.test.js` | Meta Model API turn loop (fetch-mocked, offline): every request targets `api.meta.ai/v1/chat/completions` with `muse-spark-1.3` (`muse-spark-1.2` when the turn carries audio), `max_completion_tokens`/`reasoning_effort`/`prompt_cache_key` ride, the nested tool blob travels, assistant `tool_calls` replay pairs with its tool result, and 429/500/503 retry as `busy`, 504 reports `timeout`, 401/402/403 refuse as `config` |
| `reminders.test.js` | Reminder contract + scheduler: relative-time resolution against the caller clock (past times refused readably, lenient-`Date.parse` shapes rejected), input validation reasons, recurrence roll-forward without burst-firing, snapshot strictness, blind-voice vs beep channel, notify-now/speak-when-idle tick, and the model-facing tool (create directive, duplicate refusal, id resolution) |
| `access-modes.test.js` | Access modes: exactly four (autism, mute, deaf, blind — no `standard`), per-mode tool allow-lists (deaf has no `speak`, blind has no `create`, mood is autism-only), sign capability only in mute/deaf, cards off in blind, audio turns off in deaf, voice policy (deaf off, mute optional, others on), prompt assembly with no cross-mode leakage, and registry-level refusal of a tool outside the mode's list |
| `moods.test.js` | Autism mood tracker: score/note validation (1-5, capped note), snapshot strictness (unknown shapes dropped), deterministic trend analysis (declining/steady/empty), doctor-ready report contents, and the `mood` tool's log directive, snapshot-only trend answers, and readable refusals |
| `vision-guard.test.js` | Blind-mode obstacle warnings: frame data-URL bounds (JPEG/PNG only), MP4-only clip validation, strict verdict shape (hazard/urgency/message), silent no-hazard, unusable hazard-without-instruction refused, and deterministic message caps |
| `frame.test.js` | Camera `frame` tool: registered in the tool set, camera-off fails with the permission instruction, missing status treated as off, camera-on authorizes the video capture and forbids describing it before the description arrives |
| `frame-video.test.js` | Camera clip describer: MP4-only bounded clip validation, strict `{description, clear}` shape, trimmed/capped descriptions, empty descriptions refused |
| `meta-video.test.js` | Responses transport (fetch-mocked, offline): `askMuseVideo` targets `api.meta.ai/v1/responses` with `muse-spark-1.3`, carries the `text.format` schema and `store: false`, sends no OpenCode session header, returns the raw output text plus usage, and refuses empty text, failed statuses, and a missing `MODEL_API_KEY` |
| `vad-audio.test.js` | Server VAD wire format: 48 k→16 k resampling, int16 clamping, seq-prefixed window round-trip, strict boundary-event parsing, reset control shape |
| `vad-session.test.js` | Server VAD decision state: silence never fires, onset seq, between-threshold hold, non-finite skip, lone-window misfire, sustained-run end seqs, exact minimum-voiced boundary, pause survival inside redemption, reset drops partials, pad cannot inflate short runs |
| `card-overflow.test.js` | `describeCardOverflow`: empty on zero/negative drops, singular/plural naming, six-card cap named in the note |
| `sample-moods.test.js` | Demo mood data: fourteen labeled entries pass store validation with unique sample ids and `[Sample]` notes, the deterministic log rebuilds identically, clearing removes only sample ids, and the analyst + mood tool read a recovering trend from them |

## Live checks (not CI)

| Command | What it does |
|---|---|
| `bun scripts/prompt-eval.mjs` | 12-probe routing smoke against the real model with expected tool sets; exits non-zero on failure |
| `bun run eval:live <label> <dev\|heldout\|all> [id]` | Scenario harness in `scripts/eval/` — full transcripts with per-round wire evidence, JSON per scenario |
| `bun run probe:model` | Meta Model API endpoint health probes (streaming, native tools, response formats, audio/image parts, Responses schema; real billed calls) |

See `scripts/eval/README.md` for the gate policy after prompt or tool changes (offline suite → routing smoke → dev-set diff → held-out at release).
