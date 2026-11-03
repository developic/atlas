<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Atlas — agent handbook

Atlas is a voice-first assistant. `/dashboard` runs a conversation loop: browser mic → Silero VAD → `/api/orb/respond` (NDJSON turn) → Baseten `meta-models/muse-spark-open-1026` native tool loop → screen cards (`create`) + Deepgram speech (`speak`). `/start` onboards (name, age range, voice, pace, talk style). A signed-video path (`/api/orb/transcribe`, see below) lets non-speaking users type with ASL.

Stack: Next.js App Router, React 19, TypeScript `strict`, Bun runtime, Tailwind + shadcn/ui + Base UI, Dexie (IndexedDB), Oxlint. Bun is the only script runner.

## Non-negotiable workflow rules

1. **Worktree hygiene.** The tree carries large uncommitted WIP that is not yours. Never `git add`/`reset`/`checkout`/`restore` anything wholesale; never stage, revert, or discard files you did not author this session. Commit security exists entirely in the repo owner's hands.
2. **Log behavior changes.** Every change that alters behavior adds one entry to `context.md`, newest first, header `## YYYY-MM-DD HH:MM IST (HH:MM UTC) — <topic>`. State the decision and its tradeoff plainly; historical entries are never rewritten.
3. **Never expose secrets.** All API keys (`BASETEN_API_KEY`, `EXA_API_KEY`, `DEEPGRAM_API_KEY`, `OPENCODE_API_KEY`) live in `.env`, are read in `process.env` only inside server-only modules, and are never sent to the client or logged.
4. **Read before edit.** Follow surrounding naming and style; keep public contracts (`TurnEvent`, `ChatMessage`, `CardContent`, orb state enums) stable unless a change is genuinely necessary — they cross the NDJSON wire and client storage.
5. **TypeScript is strict; tests are plain `.js`.** `bun:test` has no type declarations in this repo, so test files must be `.js` without TS annotations — a `.test.ts` fails `tsc`.

## Commands

| Command | What it does |
|---|---|
| `bun run dev` / `dev:https` | Next dev server (localhost / LAN with HTTPS — mic needs it) |
| `bun run lint` | Oxlint type-aware (`tsgolint`), 6 plugin suites; config in `.oxlintrc.json` |
| `bun run typecheck` | `next typegen && tsc --noEmit` |
| `bun run test` | Offline suite: `bun test tests/` (no network, no keys) |
| `bun run eval:live <label> <dev\|heldout\|all> [id]` | Live scenario harness against the real pipeline (`scripts/eval/`) |
| `bun scripts/prompt-eval.mjs` | 12-probe live routing smoke; exits non-zero on fail |
| `bun run probe:omni` | Baseten endpoint health/diagnostic probes |
| `bun run generate:voices` | Regenerate `/public/voices` Deepgram samples |
| `bun run postinstall` | Copies Silero VAD + MediaPipe assets into `public/` |

## Architecture: one turn, three gates

```
browser (VAD/typed input)
  └─ POST /api/orb/respond ── NDJSON: transcript → tool → speak-delta → audio(pcm) → speaking → audio-done | typed error
       └─ lib/model.ts  turn loop (native tool_calls)
            ├─ Gate 1  prompt            lib/atlas-prompt.ts  (teachable: what to say)
            ├─ Gate 2  speech validation  lib/speech-integrity.ts       (formattable: tool-call syntax / Markdown withheld)
            ├─ Gate 3  TTS integrity       lib/tts-integrity.ts          (transportable: known narration labels, audio-provider edge)
            └─ Tools   tools/  websearch · webfetch · get_current_time · create · start_new_chat · open_camera · shutdown · speak
```

- **Gate ordering is a contract, not a preference.** Prompt shapes behavior; per-utterance speech validation blocks formatting that TTS reads literally; the TTS boundary is transport-only at `deepgram-server.ts` (both `synthesizeSpeech` and `synthesizeSpeechStream`). A regression class must be stopped at the earliest point where it is detectable — that's why narration leaks such as "The user hears:" are also caught at the audio-provider edge even though the prompt forbids them. The TTS gate is *narrow*: documented leak labels only, start-of-text anchored, mid-sentence prose untouched. Adding a label requires a documented observed leak, never speculation.
- **Tool routing lives in code.** `tools/registry.ts` validates native calls against schemas, dedupes identical calls per turn, caps rounds, and converts every failure into *model-readable text*, not an exception. The turn loop never trusts prose about what ran: only actual tool calls and results (`ModelResult`) determine what happened.
- **Access modes are one table.** `access-modes.ts` decides the tool allow-list and the delivery capabilities (speech, cards, sign, microphone, chatbox, obstacle guard). The prompt, provider tool blob, registry permission check, and dashboard all read that table. `null` is accessibility off for API clients/evals; the dashboard starts in autism and has no off control.
- **Camera is two channels, one status.** `frame` authorizes a client-captured MP4 and feeds its description into the next turn; the blind guard samples rolling MP4 clips through `/api/orb/guard`. `cameraOn` rides every turn (rendered as a `## Camera` block and passed to `ToolContext`); only `open_camera` activates the camera, and only after the user agrees. The shared transport lives in `muse-video.ts` (MP4 only, probed live).
- **Streaming is typed.** `/api/orb/respond` emits only `TurnEvent` members (`turn-stream.ts`); client `use-orb-turn.ts` dispatches on that union. Adding a frame type means adding it to the union + both ends in the same change.
- **Signed-video path** (`/api/orb/transcribe` + `/api/sign-test`): clips go to OpenCode's Go Responses endpoint with a **strict `json_schema` structured-output contract** (`{transcription, readable}`, enforced by the gateway — probed live, Nov 2026). The route applies deterministic caps only: `readable` must be true, transcription non-empty, ≤ `MAX_SIGN_UTTERANCE_WORDS`. A non-conforming payload is refused with a retry — never parsed by wording heuristics. The transcription enters the normal turn as if typed.
- **History** (`chat-message.ts`): text-only pairs; `trimHistory` passes byte-identical while under the 100k-token budget (cache-prefix stability) and re-cuts to a 60% target on overflow; newest pair always kept, oversized single pair clipped. The client sends card Markdown in place of `content` — the prompt says history formatting is not something to imitate.

## Codebase map

Verified against the tree. One line per module; only load-bearing files.

```text
src/app/                App Router
  (site)/                 public site chrome: layout (Header) + hero page with the hand scene
  dashboard/              the orb conversation page (client-heavy)
  start/                  onboarding wizard route (UI in components/start)
  not-found.tsx           headerless 404 (eye scene)
  api/orb/respond/route.ts      one voice/text turn, NDJSON stream (see Architecture)
  api/orb/transcribe/route.ts   signed video → transcript (structured contract, mute/deaf only)
  api/orb/frame/route.ts        `frame` tool: short MP4 clip → structured camera description
  api/orb/guard/route.ts        blind obstacle warnings: clip or frame → spoken hazard verdict
  api/sign-test/route.ts        test-only: whole clips vs the video model directly
  api/voice-preview/route.ts    /start personalized voice preview (Deepgram MP3)
  globals.css             tokens (sand/ink/sage), shadcn surface, dark mode
  layout.tsx              root: fonts, theme bootstrap script (no header — 404 stays full-bleed)

src/lib/
  model.ts                turn loop: native tool calls, caps, repair rounds, segment gating
  instructions/           prompt parts, one module per rule (header, objective, loop, boundaries, decision, tool-policy, cards, speech, conversation, examples, final-check, profile, identity)
  atlas-prompt.ts         the live composer: imports the parts in order, adds date + profile prefix — owns no rule text
  tools/                  one module per tool + types.ts + registry.ts (schema validation, dedupe, dispatch, renderToolPrompt)
  speech-integrity.ts     Gate 2: tool-call-as-text + Markdown checks, model-readable repair reasons (fabrication checks were deliberately removed — do not re-add)
  tts-integrity.ts        Gate 3: narration-label strip at the provider edge (evidence-backed labels only)
  deepgram.ts / deepgram-server.ts   voice catalog/types | server TTS: MP3 preview + per-sentence linear16 PCM, WAV-header strip
  chat-message.ts         ChatMessage contract + parse/toModel/trimHistory (hysteresis)
  cards.ts                CardContent caps: ≤6 cards, content/type caps
  interactive-markdown.ts widget parser: block-level <timer|checkbox|counter|rating|progress> with attribute caps (timer 1_000–1_800_000 ms; label 80; send 500; show 40); unknown tags render escaped, never HTML
  turn-stream.ts          TurnEvent union + fetchTurnStream reader (busy retries, TurnStreamError codes)
  orb-errors.ts           typed error codes (busy/timeout/invalid_json/no_reply/audio/tts/config) + one user-message map
  json-extract.ts / json-stream.ts   balanced JSON scanner | incremental stream reader (transcript/speak fields)
  sentence-chunker.ts     streaming splitter (~40 char min, 260 cap)
  source-links.ts         citation extraction + Exa hit matching (URL normalization)
  tool-trace.ts / turn-debug.ts      tool rows for the reply | AI-wire panel types (client-safe)
  timer.ts / retry.ts     pure countdown FSM | pure retry helper (Retry-After + jitter)
  sign-video.ts           signed video → Muse Spark via the shared `muse-video` transport, strict structured-output contract
  muse-video.ts           one owner of the OpenCode Go video request shape (URL, model, auth, timeout, output, MP4 cap)
  vision-guard.ts         blind obstacle verdict: frame/clip prompt + strict hazard/urgency/message contract
  frame-video.ts          `frame` tool clip describer: strict {description, clear} contract
  access-modes.ts         four access modes (autism/mute/deaf/blind) + tool, speech, cards, sign, mic, chatbox, guard capabilities
  moods.ts                autism mood contract: scoring, trend analysis, snapshot/report render, directives
  reminders.ts            reminder contract: relative-time resolution, validation, recurrence, snapshot, directives, announce channel
  reminder-scheduler.ts   client poller: due detection, notification + beep now, voice held until the orb is idle
  tools/reminder.ts       reminder tool: list/find/create/update/delete/complete/snooze against the turn snapshot
  tools/mood.ts           autism-only mood tool: log/trend/history/report against the turn snapshot
  tools/frame.ts          camera frame tool: authorizes a client capture; camera-off fails with a permission instruction
  db/reminders.ts         reminder rows on IndexedDB (v2 store) + channel override pref, degrade-not-throw
  db/moods.ts             private mood log rows on IndexedDB (v3 store), degrade-not-throw
  camera-clip.ts          browser-only MP4 recorder shared by the frame tool and the obstacle guard
```

Full file listing: run `ls`. `tests/README.md` documents the offline suite; `scripts/eval/README.md` documents the live harness and gate policy.

```text
src/components/
  dashboard/              orb stage + state helpers (orb-stage, orb-chrome, orb-reveal),
                          mic session (use-voice-level), Silero VAD (use-silero-vad),
                          turn lifecycle (use-orb-turn), PCM player (use-pcm-player),
                          thread sidebar (thread-sidebar, db-backed threads),
                          reference panel (sidebar-panel), widget cards
                          (timer/checkbox/counter/rating/progress-card, parsed via
                          interactive-markdown.tsx), chatbox with attachments
                          (attach-file, chatbox.tsx), AI-wire panel (turn-debug-panel),
                          Ctrl+K command menu, access mode bar (access-bar),
                          camera gestures (use-camera-gestures), frame capture
                          (use-frame-capture), blind obstacle guard (use-vision-guard)
  layout/                 header (wheelchair + blind SVGs live in components/characters.tsx),
                          responsive shims (adaptive-card/container)
  sections/               marketing scenes: hands/ (scroll-driven CTA press scene), hands-section, team-section
  start/                  onboarding wizard + voice/pace previews (use-voice-preview)
  ui/                     shadcn primitives, Markdown renderer, theme toggle, 404 eye scene

src/registry/            the orb canvas package: particles-orb + per-state modules (idle/listening/thinking/searching/speaking/progressing/error/disabled) — colors bind to CSS tokens via MutationObserver

src/lib/db/              Dexie: threads/messages/prefs tables; prefs degrade-not-throw; browser-only
src/lib/threads.ts       pure thread helpers (persistence lives in db/)
src/lib/media-stills.ts   browser-only JPEG stills sampler → mediaFrames for a turn
src/lib/media-frames.ts   data-URL frame parsing (server side of the same contract)
```

## Coding rules

1. **Structured over prose — the core principle.** Application decisions use typed state, explicit contracts, and actual execution results. Never decide meaning, intent, or validity of assistant text by matching phrases: no hardcoded phrase lists, no "does the message contain X" keyword checks, no regex that interprets natural language. Deterministic structure is fine (JSON scanners, tag parsers, URL/host validation, schema checks, typed unions). Where meaning must be judged, use the model with a structured-output contract (see the signed-video path), or fix the prompt.
2. **Errors are typed, reachable, and user-safe.** Every failure surfaces one of the `OrbError` codes with its mapped user message; server logs redact user content; expected busy retries are not logged as faults. Tool modules *return* `ToolOutcome` errors (model-readable) instead of throwing — a failed tool is evidence for the next round, never a crashed turn.
3. **Server-only modules**: `model.ts`, `deepgram-server.ts`, `sign-video.ts`, `muse-video.ts`, `vision-guard.ts`, `frame-video.ts`, `tools/*` runners, anything touching API keys. Server-render-safe modules (`lib/db/*`, `json-*`) must not touch `window`/`indexedDB` at import time.
4. **Streaming discipline.** The NDJSON frames are a typed union — client and server compile against the same `TurnEvent` union and guard boundaries (`isTurnEvent` on both ends). Audio is base64 PCM16 at 24 kHz; schedule with `max(currentTime, nextStartTime)`.
5. **Contracts over duplicates.** One system of record per concept (voice catalog in `deepgram.ts`, card caps in `cards.ts`, widget caps in `interactive-markdown.ts`, theme tokens in `globals.css` + `lib/theme.ts`). Shared checks live in one module and are imported (e.g. `looksLikeToolCall` is exported from `speech-integrity.ts` and reused, not re-implemented, in `model.ts`).
6. **Degradation.** Persistence helpers return success/failure flags instead of throwing; user-facing errors come from the single user-message map; a tool failure can never kill a turn.
7. **Validation policy.** All caps live as named constants (never inline magic numbers); validators return `ok | { ok: false, reason }` in model-readable language; unknown data is rejected, not coerced (e.g. the parser never "repairs" truncated JSON).
8. **No secret stringing of endpoints.** One module owns a provider's request shape (Baseten, Deepgram, Exa, OpenCode-Go); all fetches take `AbortSignal` and client disconnects must cancel downstream work.

## Naming rules

**Names are short, clean, understandable, simple. If a name needs a paragraph to explain, rename it.**

1. **Name the subject, not the context.** The name says what the file *is* (`sentence-chunker`, `thread-sidebar`). Never encode scope, type, or layer into the name: no `I`-prefixed interfaces, no `_`/`m_` privates, no `opt_` params — the type system already knows.
2. **Stems are earned, not stamped.** Every Deepgram file says `deepgram-` because each one is *about* Deepgram — never add a prefix to mark a domain. If a file outgrows its stem (e.g. `sign-stills.ts` serving any camera turn → `media-stills.ts`), the stem moves with it.
3. **Suffixes mark a real fork, nothing else.** `-server` exists because `deepgram.ts` ↔ `deepgram-server.ts` is a genuine split (shared catalog vs server-only TTS). No fork, no suffix.
4. **Toolchain-read names are contracts, not decoration.** `use-*.ts` (React hooks), `.test.js` (bun), kebab NDJSON event names (`speak-delta`) exist because the runtime reads them.
5. **One concept, one name.** Reuse the established word everywhere; never ship a second name for the same thing.
6. **No noise words.** `data`, `info`, `util`, `helper`, `manager` carry nothing — cut them.
7. **≤3 words, pronounceable, searchable.** Single-letter names only inside ≤10-line scopes. Grep for a name should land on the one thing it names.
8. **Casings and styles, by kind:** `PascalCase` types/components, `camelCase` functions, `SCREAMING_SNAKE_CASE` constants at module top, `kebab-case` files, short lowercase error codes matching the existing set (`busy`, `tts`, `no_reply`). Booleans read as assertions (`isLive`, `pcmSent` — never a negation the caller must invert). Test `describe` blocks read as behavior ("what must happen").
9. **Pairs to keep straight** (both live; read the distinction, don't rename reflexly):
   - `lib/threads.ts` (pure data helpers) ↔ `lib/db/threads.ts` (Dexie persistence — folder-as-namespace, no rename needed)
   - `speech-integrity.ts` (Gate 2 — utterance format checks) ↔ `tts-integrity.ts` (Gate 3 — provider-edge narration strip)
   - `media-frames.ts` (parse data-URL frames, server) ↔ `media-stills.ts` (sample JPEG stills, browser-only)
   - registry `orb-state.ts` (the `OrbState` enum) ↔ `orb-status.tsx` (status badge) ↔ dashboard `orb-chrome.ts` (state → stage UI copy)
10. **Renaming rules.** Run renames with editor-wide search; update imports + tests + this file + `tests/README.md`/`scripts/eval` references in the same change. Never rename a module inside active user WIP without explicit sanction, and log every rename in `context.md`.

## Prompt work rules

- **Where the prompt lives.** `lib/atlas-prompt.ts` composes the live system prompt from the part modules in `instructions/` (header, objective, loop, boundaries, decision, tool-policy, cards, speech, conversation, examples, final-check, profile, identity); `model.ts` imports it directly. Rule edits land in the part module that owns the rule — never in the composer, which holds no prose. The deployed prompt was validated against live pipeline runs (Nov 2026); after any prompt edit the offline invariant tests must pass, the 12-probe routing smoke must be run, and structural comparisons go against the before/after renders — never from memory.
- **Tool descriptions are prompt surfaces.** They ride the API tool blob (highest decision weight); re-render `renderToolPrompt()` and assert via `ORB_TOOLS` in tests.
- **Cache prefix discipline.** Baseten caches the token prefix: static prompt first, head-granular date, render profile, then history. Don't add live values mid-prompt; keep `trimHistory` byte-stable while under budget.
- **One rule, one home.** Same decision rule may not appear in two sections; put constraints at the decision point (tool description preferred over prose sections); fail into action in CAPS ("IF UNCERTAIN…, SEARCH"). Replaced "repair" behaviors must match what the loop actually supports (native speak tool; two end-of-turn paths; no JSON envelope).
- **Never claim to act without acting.** Speech is a *companion* to tool calls; how-to content lives in `create` cards (procedures, ≥3-item lists, comparisons, code, anything to keep or act on). Speech claims must be runtime-honest (no claims about cards unless a `create` call ran this turn).

## Validation gates (in order)

1. `bun run test` — offline suite: prompt invariants, forbidden-phrases absence, history hysteresis, TTS narration favorites, sign contract guard.
2. `bun run typecheck`, `bun run lint` — must be clean for files you touched. Pre-existing failures in `public/mediapipe/**` (vendored JS) and WIP components are not yours to silence silently; surface them instead of editing `.oxlintrc.json`.
3. `bun scripts/prompt-eval.mjs` — after any prompt/tool change. 12 live routing probes; a single probe failing is a signal, not a verdict — rerun to check variance before changing code.
4. `bun run eval:live <label> dev` — prompt-shaping changes: run per-label JSONs and diff (cards must exist where speech claims them; failed turns stay honest). Hold out (`heldout`) only at release; never tune against it.
5. `bun run probe:omni` — endpoint health when Baseten misbehaves or before protocol changes.

## Environment

- `.env`: `BASETEN_API_KEY`, `EXA_API_KEY`, `DEEPGRAM_API_KEY`, `OPENCODE_API_KEY` (all server-side; Deepgram clients never see the key).
- Dev-only flags: `ATLAS_DEBUG_TURNS=1` (attach provider debug frames in production), `HARNESS_APP`, `EVAL_OUT_DIR` (harness).
- `NODE_ENV !== production` enables the turn debug wire by default.
