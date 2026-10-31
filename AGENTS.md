<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project Workflow

- Update `context.md` after every behavior change with header `## YYYY-MM-DD HH:MM IST (HH:MM UTC) — <topic>`.

### Linting

- Run `bun run lint` to lint with Oxlint (`bunx oxlint --type-aware --react-plugin --jsx-a11y-plugin --nextjs-plugin --import-plugin`).
- Oxlint type-aware mode is powered by `tsgolint` and covers 59 of 61 typescript-eslint rules. Type-aware linting requires TypeScript 7.0+; the project currently uses TypeScript 5.x, so type-aware rules run where supported and fall back to syntax-only checks otherwise.
- `oxlint` (v1.90.0) and `oxlint-tsgolint` (v7.0.2005) are installed as dev dependencies.
- See `.oxlintrc.json` for rule configuration.

## Project Structure

```text
tests/
├── README.md
├── atlas-prompt.test.js
├── create.test.js
├── exa-search.test.js
├── history.test.js
├── interactive-markdown.test.js
├── layout-context.test.js
├── omni-stream.test.js
├── orb-chrome.test.js
├── orb-reveal.test.js
├── orb-search.test.js
├── orb-tools.test.js
├── orb-turn.test.js
├── source-links.test.js
├── speech.test.js
├── sse.test.js
├── timer.test.js
├── tool-trace.test.js
├── turn-debug.test.js
├── turn-stream.test.js
├── voice-activity.test.js
├── wav.test.js
└── web-fetch.test.js
src/
├── app/
│   ├── (site)/
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── api/
│   │   ├── orb/
│   │   │   └── respond/
│   │   │       └── route.ts
│   │   └── voice-preview/
│   │       └── route.ts
│   ├── dashboard/
│   │   └── page.tsx
│   ├── fonts/
│   │   └── DepartureMono-LICENSE.txt
│   ├── start/
│   │   └── page.tsx
│   ├── test/
│   │   ├── orb-client.tsx
│   │   └── page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── not-found.tsx
├── components/
│   ├── dashboard/
│   │   ├── card-interactions.tsx
│   │   ├── dashboard-flow.tsx
│   │   ├── interactive-markdown.tsx
│   │   ├── orb-chrome.ts
│   │   ├── orb-command-menu.tsx
│   │   ├── orb-reveal.ts
│   │   ├── orb-stage.tsx
│   │   ├── prompt-dock.tsx
│   │   ├── timer-card.tsx
│   │   ├── turn-debug-panel.tsx
│   │   ├── use-orb-turn.ts
│   │   ├── use-pcm-player.ts
│   │   ├── use-voice-activity.ts
│   │   ├── use-voice-level.ts
│   │   ├── voice-activity.ts
│   │   └── voice-meter.tsx
│   ├── layout/
│   │   ├── adaptive-card.tsx
│   │   ├── adaptive-container.tsx
│   │   ├── ambient-backdrop.tsx
│   │   ├── get-started-link.tsx
│   │   ├── header.tsx
│   │   └── mobile-nav.tsx
│   ├── sections/
│   │   ├── hands/
│   │   │   ├── arm.ts
│   │   │   ├── hand.ts
│   │   │   ├── hand-body.tsx
│   │   │   ├── hands-art.tsx
│   │   │   ├── timeline.ts
│   │   │   └── use-hands-scene.ts
│   │   └── character-section.tsx
│   ├── start/
│   │   ├── start-data.ts
│   │   ├── start-flow.tsx
│   │   ├── start-steps.tsx
│   │   ├── step-ui.tsx
│   │   └── use-voice-preview.ts
│   └── ui/
│       ├── button.tsx
│       ├── input-group.tsx
│       ├── input.tsx
│       ├── markdown.tsx
│       ├── not-found-scene.tsx
│       ├── textarea.tsx
│       └── theme-toggle.tsx
├── registry/
│   ├── lib/
│   │   ├── orb-color.ts
│   │   ├── orb-pill.module.css
│   │   ├── orb-pill.tsx
│   │   ├── orb-search.ts
│   │   ├── orb-state.ts
│   │   ├── orb-status.tsx
│   │   ├── status/
│   │   │   ├── connecting.ts
│   │   │   ├── disabled.ts
│   │   │   ├── error.ts
│   │   │   ├── idle.ts
│   │   │   ├── index.ts
│   │   │   ├── listening.ts
│   │   │   ├── progressing.ts
│   │   │   ├── searching.ts
│   │   │   ├── speaking.ts
│   │   │   └── thinking.ts
│   │   ├── use-audio-bands.ts
│   │   ├── use-audio-level.ts
│   │   ├── use-in-view.ts
│   │   ├── use-orb-animator.ts
│   │   ├── use-orb-cues.ts
│   │   ├── use-orb-level.ts
│   │   ├── use-reduced-motion.ts
│   │   ├── use-waveform.ts
│   │   └── use-webgl-support.ts
│   └── orbe/
│       └── particles-orb/
│           └── particles-orb.tsx
├── lib/
│   ├── instructions/
│   │   ├── identity.ts
│   │   ├── examples.ts
│   │   ├── rules.ts
│   │   └── index.ts
│   ├── atlas-prompt.ts                — thin re-export of buildAtlasSystemPrompt
│   ├── cards.ts
│   ├── cartesia.ts
│   ├── cartesia-server.ts
│   ├── chat-message.ts
│   ├── interactive-markdown.ts
│   ├── json-extract.ts
│   ├── json-stream.ts
│   ├── layout/
│   │   ├── layout-context.ts
│   │   ├── use-element-measure.ts
│   │   └── use-layout-context.tsx
│   ├── model.ts
│   ├── onboarding.ts
│   ├── orb-errors.ts
│   ├── orb-turn.ts
│   ├── pcm.ts
│   ├── sentence-chunker.ts
│   ├── source-links.ts
│   ├── sse.ts
│   ├── theme.ts
│   ├── timer.ts
│   ├── tool-trace.ts
│   ├── tools/
│   │   ├── create.ts
│   │   ├── current-time.ts
│   │   ├── index.ts
│   │   ├── registry.ts
│   │   ├── speak.ts                  — iterative TTS tool
│   │   ├── types.ts
│   │   ├── webfetch.ts
│   │   └── websearch.ts
│   ├── turn-debug.ts
│   ├── turn-stream.ts
│   ├── utils.ts
│   ├── view-transition.ts
│   └── wav.ts
└── types/
    └── .gitkeep
```
`public/` holds static assets:
- **`public/assets/icons/`** — icon assets such as `favicon.ico`.
- **`public/assets/font/`** — self-hosted font files such as `DepartureMono-Regular.woff2`.
- **`public/voices/`** — Eighteen pre-recorded Cartesia Sonic MP3 samples (Skylar, Jacqueline, Gemma, Daniel, Parker, Archie × slow/steady/brisk) used by the `/start` voice and pace previews. The final personalized sample is generated at request time by `api/voice-preview`.

`scripts/` also holds `generate-cartesia-voices.mjs` and the P0 diagnostic
`omni-probe.mjs` (`bun run probe:omni`).

### What each part is for

- **`src/app/`** — The Next.js App Router tree. Folders map to URL segments, `page.tsx` renders a route, and `layout.tsx` wraps routes with shared UI.
  - **`(site)/`** — Route group for everything that renders the site chrome. The parentheses keep the segment out of the URL.
    - **`layout.tsx`** — Renders the sticky `Header` around pages in the group.
    - **`page.tsx`** — The `/` route: the responsive hero plus the full-bleed `CharacterSection` below it. The hero keeps a viewport-height minimum so the hands scene stays below the fold.
  - **`api/orb/respond/`** — Server-only POST route for one orb turn. Accepts a recorded WAV (multipart `audio`, legacy WebM/MP4/Ogg still accepted) or a JSON `transcript`, plus a character-trimmed text-only `history` and optional onboarding `voice`/`pace`. The dashboard sends the clip straight to Baseten's `meta-models/muse-spark-open-1026` model, which transcribes it and writes `{transcript, speak}` in one streaming call; the JSON tool protocol can add `websearch`, `webfetch`, `get_current_time`, or `create` rounds before the answer. Every visible block is a Markdown card produced by `create`; there is no `conversation` field. Cartesia streams sentence-sized PCM16 chunks while the model is still writing, with whole-reply MP3 as the fallback when the PCM path produces nothing. Streams NDJSON events named after the action that produced them: `transcript`, `searching`/`tool`, `speak-delta`, `audio` (`pcm`, `sampleRate`, `seq`), `speaking` (the full text, sent before TTS finishes), `audio-done` on the PCM path or `audio-mp3` on the fallback, or a typed `error` with `code` and `message`. There is no upfront `thinking` frame: the dashboard already starts a turn in that state, and every later status follows something the model actually did, such as a web search. The final `speaking` frame can carry a `debug` field with raw provider rounds; the route attaches it only when the request sends `debug` and `NODE_ENV !== "production"` or `ATLAS_DEBUG_TURNS=1`. Keeps `BASETEN_API_KEY`/`EXA_API_KEY`/`CARTESIA_API_KEY` server-side, validates voice and pace against the Cartesia catalogs, trims history to ~6000 characters without splitting user/assistant pairs, leaves spoken-reply length to the prompt's guidance (the transport no longer truncates `speak`), maps a 429/503/529 to a retryable `busy` code (including an SSE error frame), passes `request.signal` and a sanitized `session` into the model turn so a disconnected client stops the search and TTS work and a conversation carries a best-effort affinity key for Baseten's prompt cache, and emits one structured `orb-turn` log line without user content (`stage: "aborted"` instead of an error frame when the client is gone). The client retries a busy turn twice (1.5 s apart), and expected busy failures are not logged as server faults.
  - **`api/voice-preview/`** — Server-only POST route that generates the personalized final preview (name + selected voice + pace) with Cartesia through the shared `lib/cartesia-server.ts`. Validates the six voice IDs and three pace speeds, uses `CARTESIA_API_KEY` or the public demo token, and returns MP3 bytes.
  - **`dashboard/`** — The headerless `/dashboard` route. A centered particle orb with one voice button; deliberately no header, greeting, lede, or navigation link.
  - **`start/`** — The headerless `/start` route. The page supplies the centered sand/sage backdrop and metadata; the wizard UI lives in `components/start/`.
  - **`favicon.ico`** — Moved to `public/assets/icons/favicon.ico` and referenced manually in the root layout via `<link rel="icon" href="/assets/icons/favicon.ico" />`.
  - **`globals.css`** — Tailwind entry point, shadcn/ui styles, and the light/dark theme tokens (sand, ink, sage, surfaces, borders).
  - **`layout.tsx`** — Root layout. Loads Atkinson Hyperlegible, Baloo 2, and Departure Mono, defines page metadata, and applies the pre-hydration theme script. Deliberately renders no header so the 404 page stays full-bleed.
  - **`not-found.tsx`** — Global 404. Headerless, uses the eye scene and a return-home link, and inherits the theme from the root layout.
- **`src/components/`** — Reusable React components, grouped by purpose.
  - **`dashboard/`** — The `/dashboard` voice orb.
    - **`use-voice-level.ts`** — Microphone session hook: `idle | starting | waiting | live | denied | error | disconnected | unsupported` status, a smoothed RMS level in `levelRef` for the orb, and the raw RMS in `activityRef` for voice-activity detection. Includes a 10 s watchdog for a prompt that never resolves, cancel tokens that stop late streams, and `MediaRecorder` recording into a `clipBlob`. Exposes `startRecording` (idempotent, so the dashboard's warm recorder can be confirmed), `stopRecording`, `discardRecording`, and `clearClip`; the stream stays open between turns so VAD can re-arm. Requests a mono 48 kHz stream as a hint, records at 128 kbps, and discards the 20 s safety/tab-hide clip rather than sending it. A disconnected input track ends the session with a distinct reconnect prompt instead of claiming the mic never opened. The `AudioContext` is created and resumed inside the tap before `getUserMedia`, and the mount flag is reset on every mount so React StrictMode's dev remount cannot discard the stream.
    - **`voice-activity.ts`** — Pure voice-activity state machine shared by the hook and its unit tests: 0.015/0.010 start/end RMS thresholds, voiced-duration accumulation, 1 s silence, 200 ms minimum speech (enforced by the dashboard when it receives `voicedMs`), 15 s maximum utterance, arm delay, and 500 ms cooldown. The arm/cooldown early return keeps `lastUpdateAt` current, so ignored time is not credited as voiced. It emits only `start` and `end` transitions and owns no timers.
    - **`use-voice-activity.ts`** — Client `requestAnimationFrame` hook that reads `activityRef` and advances the pure state machine. On `start` it calls `onSpeechStart` (the dashboard confirms its warm recorder); on `end` it passes `voicedMs` to `onSpeechEnd` (the dashboard sends a real utterance or discards a blip). An optional `armDelayMs` lets the dashboard use 300 ms initially and 900 ms after a reply. Callbacks live in a ref, and the loop exists only while the dashboard says VAD is active, so Atlas's own speech cannot trigger a turn.
    - **`voice-meter.tsx`** — Four level-driven bars inside the live microphone button.
    - **`orb-stage.tsx`** — The dashboard stage. `OrbBackdrop` is the full-bleed vignette (`--stage-glow` → `--sand` → `--stage-edge`) plus a grain layer; `OrbHalo` rides on the orb itself with a state-tinted sage halo, two hairline composition rings, and a ground shadow. While the mic is live, one rAF reads the shared level ref and writes the halo's opacity/scale inline, so the page breathes with the voice without a React re-render; reduced motion keeps it still.
    - **`dashboard-flow.tsx`** — The dashboard stage and microphone session: the registry `ParticlesOrb` (ink→sage dots from the theme tokens, sized up to 520 px and fitted to both viewport width and height) wrapped in `OrbHalo`, one **Start conversation** / **End conversation** button, the test-only status picker, and the latest assistant turn's `create` cards. Cards are compact and collapsed by default; opening one closes the previous card, and a `show` target opens and scrolls to its target. Timer `send` starts a new turn exactly once; while another turn is busy it becomes a Continue button instead of cancelling that turn. On wide screens cards sit in two side columns around the orb; on narrow screens they stack below it in a bounded scroller, and the orb shrinks while cards are visible. The first tap opens the mic and primes the `AudioContext`; while VAD is armed the dashboard keeps a warm `MediaRecorder` running (a 4 s pre-roll is discarded if no speech starts), so the first syllable is captured instead of being lost to recorder startup. `useVoiceActivity` stops the clip after silence; the clip is decoded and re-encoded as 16 kHz mono WAV before upload (the original blob is kept if decoding fails), then handed to `useOrbTurn` with no second click. Clips with less than 200 ms of voiced audio are discarded, so coughs and clicks do not become empty turns. VAD is disabled while Atlas thinks or speaks and re-arms with a 900 ms delay after playback drains; the warm recorder starts only after that delay so it does not capture Atlas's speaker tail (Phase 1 is half-duplex). Earlier turns are kept as text in `sessionStorage` (up to 40 messages, 6000 chars each) and sent through `trimHistory` as `history`, so Atlas can resolve “that”/“it” without re-sending audio; the clip is dropped as soon as the turn ends. The caption shows `Listening…`, the current reply, or a friendly error, and picking a preview state cancels the conversation while `Auto` returns the orb to the session state with the mic off. When `Progressing` is previewed, a 0–100% slider drives the orb's `progress` prop. The page carries a visually hidden `<h1>` because the orb is the only content. The floating `TurnDebugPanel` (bug icon, `Ctrl/Cmd+Shift+D`, or the Ctrl+K `AI wire (JSON)` entry) opens a non-modal window over the last turn without pausing the mic or cards; Escape closes it.
    - **`use-orb-turn.ts`** — The turn lifecycle for voice and typed turns alike. It builds the request, posts through `fetchTurnStream`, and dispatches every NDJSON event; streamed transcripts fill the panel immediately, and the first PCM chunks are held until the full `speaking` text arrives so the caption, cards, and first scheduled audio land in the same tick. Each tool event is recorded as a `ToolTrace` (search query or fetched URL): `aiTool` drives the live pending row, while up to six traces are saved on the finished assistant message for the transcript. The final `speaking` event carries the turn's `cards`; only those cards are persisted on the assistant message and rendered by the dashboard. Later chunks enqueue as they arrive, with MP3 playback as the fallback. A busy model worker is retried twice before the caption shows a retry message, a stalled turn is bounded by a 100 s timeout, and a turn that fails after `speaking` still reveals the text it already received. It appends the finished turn to history, stamps each request with a `sessionStorage`-backed affinity id that Baseten may use to route one conversation to the same replica, so a stable prompt prefix can hit that replica's cache (best effort, not a guaranteed hit), owns `usePcmPlayer` (so `onDrained` re-arms VAD after the last chunk), and exposes `aiState`, `aiReply`, `aiError`, `aiAudio`, `aiTool`, `respond`, `sendText`, `stopTurn`, `primePlayback`, `onAudioEnded`, `onAudioFailed`, `dismissError`, `failTurn`, `wire`, and `clearWire`. It also records the last turn's NDJSON wire from the `onEvent` tap — audio aggregated by frame count, bytes, and sample rate, bounded by `MAX_WIRE_FRAMES` — and marks it `running | done | error | stopped` for the debug panel; the capture is never written to history or `sessionStorage`.
    - **`orb-reveal.ts`** — Pure reveal decision (`shouldRevealTurn`) shared by the hook and its tests: audio triggers wait for the full text, while MP3 and error triggers reveal an already-received reply.
    - **`orb-chrome.ts`** — Pure `orbStateFor` (preview wins over the session; then turn status, then mic status) and `mainLabelFor` (the primary button copy for every mic status), so the stage cannot show an impossible pair such as a denied mic with a listening orb.
    - **`use-pcm-player.ts`** — Web Audio player for streamed Cartesia PCM16. Decodes base64 to Int16, converts to Float32, schedules each chunk at `max(currentTime, nextStartTime)` for gapless sentence playback, and exposes `prime`, `enqueue`, `markDone`, and `stop`. `onDrained` fires after the last scheduled source ends following `audio-done`, which is how the dashboard re-arms VAD.
    - **`orb-command-menu.tsx`** — Test-only Ctrl+K (⌘K) command menu (no on-screen button; opens with `Control+K` / `Meta+K`). Lists start/end conversation, the AI wire toggle, and every orb state preview, searchable from the keyboard.
    - **`card-interactions.tsx`** — The small action context cards may use: the one open card id, `showCard`, `send`, and a `busy` flag. Cards cannot fetch or author new prompts; a timer only opens a card or sends the fixed text the model wrote.
    - **`interactive-markdown.tsx`** — Renders card Markdown through `Markdown` and replaces parsed timer blocks with `TimerCard`. Known malformed tags render an inline error naming the problem; unknown tags stay escaped text, so model output never becomes raw HTML.
    - **`timer-card.tsx`** — One explicitly started countdown. It ticks while running, pauses/resumes/resets, and on completion opens the `show` card and sends the `send` prompt once. If a turn is already busy it shows Continue instead of cancelling that turn.
    - **`turn-debug-panel.tsx`** — The floating AI wire panel, fixed top-right and deliberately non-modal. `Events` lists every NDJSON frame with a timestamp and one-line summary; `Model` renders each raw provider round (content, collapsible reasoning, tool calls with parsed arguments, usage counters, and the untouched response JSON); `Turn` shows the normalized final `speaking` event. The header can copy the active tab as JSON, clear the capture, or close; a one-line test prompt sends through `sendText`. PCM is summarized by frame count, approximate bytes, and sample rate rather than rendered as base64. It keeps the last turn only and persists nothing.
  - **`layout/`** — Page shell/chrome components.
    - **`adaptive-card.tsx`** — Compact collapsible `create` card: an optional `step-N` badge, a truncated title, a one-line plain-text preview while collapsed, and a bounded scroll panel when open. The whole header is the toggle, wired with `aria-expanded`/`aria-controls`; content is rendered by `InteractiveMarkdown`.
    - **`adaptive-container.tsx`** — Client wrapper that provides `LayoutContext` (breakpoints, available space, input modality) to the dashboard and mounts the hidden header/dock measurement slots.
    - **`ambient-backdrop.tsx`** — Shared decorative sand/sage gradient used behind centered routes such as `/start`.
    - **`get-started-link.tsx`** — Client Get Started CTA shared by the header and drawer. Links to `/start` and exposes `data-cta-button`, so both a real click and the hands scene's synthetic press open the start flow.
    - **`header.tsx`** — Sticky site header with the Atlas wordmark, Home link, theme toggle, and Get Started CTA. The CTA frame exposes `data-cta-frame` for the hands scene.
    - **`mobile-nav.tsx`** — Base UI drawer navigation below `md`, with focus trapping, scroll lock, Escape/outside/swipe dismissal, and safe-area padding.
  - **`sections/`** — Full-width page scenes.
    - **`hands/`** — The scroll-driven hand scene and its geometry.
      - **`arm.ts`** — Arm thickness, bowed quadratic control/path helpers, skin colors, and the grab-grip constants.
      - **`hand.ts`** — Hand-local geometry shared by both hands: palm, finger, and thumb specs; the palm path generator; the grab and click arm paths; and the click-hand pose/shift.
      - **`hand-body.tsx`** — Renders one hand: the arm+palm union, four two-segment fingers, and a two-segment thumb. Accepts optional finger refs so the grab hand can articulate while the click hand stays static.
      - **`hands-art.tsx`** — The overlay SVG. Composes the grab hand (open, then curling) and the click hand (index extended) from `HandBody`.
      - **`timeline.ts`** — The phase-2 click/press and exit timeline for the CTA frame and click hand.
      - **`use-hands-scene.ts`** — Client GSAP ScrollTrigger scene. The grab hand slides in open, grips the seam, pulls the page to the hero, then the click hand presses the header CTA. The grab arm is rigid with the hand, and reduced motion leaves the scene inert.
    - **`character-section.tsx`** — Thin wrapper for the hands scene: the section, its invisible stage/seam, the fixed overlay, and `HandsArt`.
  - **`start/`** — The `/start` onboarding wizard.
    - **`start-flow.tsx`** — Client six-step wizard: name, age range, voice, pace, a six-message “pick two” talk style, and a reflect-back summary. Voice cards play pre-recorded Cartesia Sonic samples from `public/voices/` for Skylar, Jacqueline, Gemma, Daniel, Parker, and Archie; pace cards play matching samples generated with Cartesia's `generation_config.speed` at 0.7×/1×/1.3×; a third talk-style pick replaces the oldest. The final “Hear me say hi” button requests a personalized sample that says the entered name, with a static fallback if Cartesia fails. The review rows expose `Change` for name, age, voice, and pace. Keeps step state on one route, moves focus to the step heading, and links back home.
    - **`use-voice-preview.ts`** — Fixed six-voice Cartesia catalog with gender, US/UK accent, and an `HTMLAudioElement` playback hook. Resolves `{voice}-{pace}.mp3` files for the voice and pace cards, and plays the personalized API response as a blob for the final preview. Exposes `play`, `playBlob`, `stop`, `speakingId`, and `supported`.
  - **`ui/`** — shadcn/ui primitives and small UI controls.
    - **`button.tsx`** — Base UI button with class-variance-authority variants and sizes; supports rendering as a link via `render`.
    - **`input-group.tsx`** — Wrapper that groups an input or textarea with leading/trailing adornments.
    - **`input.tsx`** — Base UI text input with variant styling.
    - **`markdown.tsx`** — Shared `react-markdown` + `remark-gfm` renderer for card content: compact headings, lists, tables, fenced code, and external links styled for the paper surface.
    - **`textarea.tsx`** — Base UI multi-line textarea with variant styling.
    - **`not-found-scene.tsx`** — Client component for the 404 eyes. Pupils follow the pointer with spring physics, and the sockets blink on a randomized interval; both respect `prefers-reduced-motion`.
    - **`theme-toggle.tsx`** — Client-side light/dark toggle backed by `lib/theme.ts`. Follows the system theme by default, persists explicit choices in `localStorage`, and syncs across tabs.
- **`src/registry/`** — Drop-in orb package. `orbe/particles-orb/particles-orb.tsx` is the canvas sphere: 960 golden-angle dots, z-sorted depth, per-state motion tables, and a single rAF animator that pauses offscreen, follows `prefers-reduced-motion`, and optionally reads a live `levelRef`. `searching` adds the Sinua `globe` scan (a horizontal band sweeps the sphere, growing and brightening the dots it crosses while the rest dim back); `progressing` adds the Sinua `eclipse` terminator, a day/night line fixed in view space whose position comes from the `progress` prop (0–1); `error` is a slow, smooth rose heartbeat rather than a shake. Dots take their colors from `--orb-color-from` / `--orb-color-to` (ink→sage by default, falling back to props), so the root theme tokens recolor the orb and a `MutationObserver` redraws when `.dark` or the variables change. Dot shading adapts to the palette (alpha compositing for dark dots on light, additive + glow for light dots on dark), with damped pointer parallax and a slow wobble for depth. `lib/` holds its contracts and hooks: `orb-state.ts` (states, mixing, energy, CSS vars), `orb-color.ts`, `status/` (per-state modules `idle.ts`, `connecting.ts`, `listening.ts`, `thinking.ts`, `searching.ts`, `speaking.ts`, `progressing.ts`, `error.ts`, `disabled.ts`, plus `index.ts` with `orbStatusParams`), `status/searching.ts` (the `searching` scan band and constellation: seeded rank table, staggered reveal, band falloff, and dot/tone gains), `use-orb-animator.ts`, `use-orb-level.ts`, `use-audio-level.ts` / `use-audio-bands.ts` / `use-waveform.ts` (shared analyser), `use-in-view.ts`, `use-reduced-motion.ts`, `use-webgl-support.ts`, `use-orb-cues.ts`, `orb-status.tsx`, and the `orb-pill.tsx` status pill.
- **`src/lib/`** — Shared, non-UI helpers.
  - **`atlas-prompt.ts`** — Thin re-export of `buildAtlasSystemPrompt` from `instructions/`. The prompt is composed in `instructions/identity.ts` (persona + Today + path decision), `instructions/rules.ts` (priority, cards, timers/next, conversation, uncertainty, final check), `instructions/examples.ts` (speech-only, teaching, ten-step, timer/next, comparison, search/fetch examples), and `instructions/index.ts` (`renderToolPrompt()` + concatenation). `buildAtlasSystemPrompt(now)` puts the UTC date first (day-granular for cache prefix). Native `speak` is now a tool, not a JSON envelope field; `create` remains the only screen surface. Keep output-shape reminders out of the user message.
  - **`cards.ts`** — The card contract: `CardContent` (`id`, `title`, `content` Markdown), `MAX_CARDS` (6), title/content caps, `isCardContent`, and `joinCardMarkdown` for history and source extraction.
  - **`cartesia.ts`** — Shared Cartesia contract: model/version constants, the six voice IDs, the three pace speeds, MP3 output format, raw PCM16 streaming format (24 kHz), voice/pace type guards, and the personalized preview transcript.
  - **`cartesia-server.ts`** — Server-only Cartesia helpers: `getCartesiaToken` (API key or the public demo token, cached for five minutes so per-sentence streaming TTS does not refetch it) and both `synthesizeSpeech` (whole-reply MP3) and `synthesizeSpeechStream` (`/tts/sse` raw PCM16 for sentence chunks). Shared by `api/voice-preview` and `api/orb/respond`.
  - **`chat-message.ts`** — Shared text-only `ChatMessage` type (optional `speak`, `sources`, `tools`, `cards`, `id`, `timestamp`) and `isChatMessage` guard used by the dashboard's `sessionStorage` reader and the orb route. `parseHistory` validates the request's history array (dropping unknown roles, unknown tool traces, malformed cards, and capping each message at `MAX_MESSAGE_CHARS`), `toModelHistory` flattens it into the model's user/assistant pairs and falls back to joined card Markdown when `content` is empty, and `trimHistory` keeps the newest turns under a ~6000-character budget without separating a user message from its assistant reply, truncating a single oversized pair rather than dropping it. That budget bounds context but also caps cache-prefix reuse: once the oldest pair is dropped, the history is no longer a prefix of the previous turn's messages, so cached tokens fall back toward the system prompt alone.
  - **`interactive-markdown.ts`** — Safe widget parser for card Markdown. It splits block-level `<timer … />` tags from Markdown; validates timer (1000–1,800,000 ms), `label` (≤80), `send` (≤500), and `show` (slug); rejects unknown attributes; leaves unknown tags as text; returns a reason for known malformed tags; and exposes `plainTextFromMarkdown` for collapsed-card previews.
  - **`json-extract.ts`** — Balanced-object/array scanner that respects strings and escapes. It extracts the first parseable JSON value from fenced output, prose, or CoT while never “repairing” truncated JSON.
  - **`json-stream.ts`** — Incremental reader for top-level string fields in streamed JSON. It surfaces `transcript` once its closing quote arrives and `speak` as deltas, handles escapes and unicode split across chunks, and ignores field names inside other strings.
  - **`model.ts`** — Server-only Baseten path, native tool-calling only. `speak` is now a tool (`{tool:"speak",arguments:{text:"…"}}`) whose segments concatenate into the final `speak`; every model action is a native `tool_calls` entry. `requestTurn` collects `speak` segments and `create` cards across rounds, caches duplicate calls in one `Map`, caps at 3 tool rounds + 1 forced `speak` call, and builds `OmniTurn` from the collected segments (no JSON `parseTurn` path). `forceAnswer` asks for a `speak` tool call and sends only the `speak` tool with a forced `tool_choice`, because a final answer may need to carry `evidence`; length retries use the same speak-only request. A client `session` is stripped to printable ASCII and sent as `x-session-affinity`; the usage frame's `cached_tokens`/`audio_tokens`/`reasoning_tokens` are folded into `TurnMeta`. When `TurnContext.debug` is set it records each parsed provider payload with its round index, turn-relative time, duration, and whether tools were enabled; `finalize` attaches those rounds to `OmniTurn.debug`. A 401/403 maps to `config`, 402 (billing) to `config`, 429/503/529 to `busy`, and other failures to `audio`.
  - **`onboarding.ts`** — The `/start` answer contract: validates name, age range, voice, pace, and the two talk-style picks against their catalogs, then writes them to one storage key. `loadOnboarding()` reads and re-validates the saved answers for later surfaces such as `/dashboard`.
  - **`orb-errors.ts`** — Typed `OrbError` codes (`busy`, `timeout`, `invalid_json`, `no_reply`, `audio`, `tts`, `config`) and the single user-message map shared by the route and client retry logic. `search` is deliberately absent: a failed search is text for the model, not a failed turn.
  - **`orb-turn.ts`** — Minimal speech helper: `normalizeSpeech` (whitespace) + `MAX_TRANSCRIPT_CHARS` (4,000). The JSON `parseTurn`/`normalizeTurn` path was removed when `speak` became a native tool.
  - **`pcm.ts`** — Shared PCM helpers: base64 to Int16 (little-endian), Int16 to Float32, and the `max(currentTime, nextStartTime)` scheduling rule used by the player and its tests.
  - **`sentence-chunker.ts`** — Streaming sentence splitter for TTS. Emits chunks at `.!?`/newline boundaries with a ~40-character minimum and 260-character hard cap, and flushes the remainder.
  - **`source-links.ts`** — Source extraction for an assistant reply: markdown links, GFM autolinks, and bare URLs (code samples, images, and relative links ignored), deduped by URL. A title that is just a URL is dropped so the UI can fall back to the hostname. `selectReplySources` matches those citations to the Exa hits behind a turn through `matchKey`, which ignores `www`, fragments, trailing slashes, and tracking parameters while keeping real query differences.
  - **`sse.ts`** — Shared SSE parser for Baseten and Cartesia: chunk splitting, CRLF, multi-line `data:` frames, comments, `[DONE]`, and a final frame without a trailing blank line.
  - **`theme.ts`** — The single source of the theme contract: storage key, `Theme` type, resolution and apply helpers, the store subscription, and the pre-hydration bootstrap script.
  - **`timer.ts`** — Pure countdown state machine: `createTimer`, `startTimer`, `pauseTimer`, `tickTimer`, `resetTimer`, and `formatDuration`. Deadlines use timestamps rather than accumulated intervals, and a finished timer stays `done` so auto-send can fire once.
  - **`tool-trace.ts`** — The transcript's tool row: `ToolTrace` (`tool` + optional readable `detail`), a guard for stored session messages, a 512-character detail cap, `shortenMiddle` for long URLs, and one running/done label map shared by the pending row and the finished reply. It lives outside `tools/` so the client does not import the server-only fetch/search code.
  - **`turn-debug.ts`** — Client-safe contracts and display helpers for the AI wire panel: `TurnDebug`/`TurnDebugRound`/`TurnWire`, the `isTurnDebug` guard, per-event summaries, base64-length PCM/MP3 placeholders, `withoutTurnDebug`, `formatWireBytes`, and the copyable `wireJson` export (bounded by `MAX_WIRE_FRAMES`).
  - **`turn-stream.ts`** — One `TurnEvent` discriminated union for every NDJSON frame (`transcript`, `searching` with an optional query, `tool` with an optional detail, `speak-delta`, `audio`, `speaking` with `cards`/`sources`/optional `debug`, `audio-done`/`audio-mp3`, `error`), with `isTurnEvent` as the boundary check on both the route's `send` and the client reader. `fetchTurnStream` posts a turn and dispatches each event, `TurnStreamError` carries the server's typed code, and a stream that ends before the final `speaking` event is rejected. A malformed `debug` field is stripped without losing the reply, and an `onEvent` tap sees every valid frame before dispatch, including an `error` frame before it throws.
  - **`utils.ts`** — Exports `cn` from the `cn` package for merging conditional class names.
  - **`view-transition.ts`** — Shared `ViewTransition` props for the route transitions used by the headerless flows.
  - **`wav.ts`** — Client WAV helpers: `encodeWav` writes a mono PCM16 RIFF file, and `clipToWav` decodes a browser recording and re-encodes it at 16 kHz mono for the model.
  - **`tools/`** — One module per orb tool plus the shared contracts and registry. `websearch.ts` holds the server-only Exa search, its `websearchTool` definition, `WEBSEARCH_ARG_LIMITS`, `budgetSearchHits` (~3 000 char JSON budget), `formatSearchResults`, and `runWebsearch`. `webfetch.ts` holds the public-page fetcher, `webfetchTool`, `WEBFETCH_ARG_LIMITS`, `formatFetchedPage`, and `runWebfetch`; it validates http(s) URLs, rejects credentials, non-standard ports, localhost, `.local`/`.internal`, and private/link-local IP literals, follows at most three redirects with each hop re-validated, caps the body at 512 KB, accepts HTML/plain text/Markdown/JSON, and keeps at most 3,000 characters, optionally ranked by `focus`. `current-time.ts` holds `currentTimeTool`, `CURRENT_TIME_ARG_LIMITS`, and `runCurrentTime`. `types.ts` holds `ORB_TOOL_NAMES`, `CITATION_INSTRUCTION`, and the shared `OrbTool`/`ToolRequest`/`ToolResult`/`NativeCall`/`ToolParse` types. `registry.ts` assembles `ORB_TOOLS`, classifies and parses JSON/native calls (`classifyToolOutput`, `parseToolRequests`, `parseNativeToolCalls`), renders the generated prompt (`renderToolPrompt`), and dispatches `runToolWithSources`. `index.ts` is the barrel. A request is `{"tool","arguments","transcript"}`; the older flat shape is still accepted so a search can never be mistaken for an answer. Search results are fenced as `UNTRUSTED_SEARCH_RESULTS` with the fence marker neutralized inside hit text; a fetched page is fenced as `UNTRUSTED_WEB_PAGE` and labelled with a shortened URL so the 4 000-char tool-result cap cannot cut the closing marker. The runner never throws: a failure is model-readable text, and a search or fetch returns its content plus titled `SourceLink`s for the panel.
- **`src/types/`** — Shared TypeScript types and interfaces. `.gitkeep` keeps the empty directory tracked until real types are added.
- **`tests/`** — Bun tests for pure logic and transport fixtures. `bun test tests/` runs the whole suite; `tests/README.md` lists each file. Coverage includes the VAD state machine (`voice-activity.test.js`), WAV encoding, turn parsing/caps, Exa compaction, the tool registry, native/JSON calls, and web-fetch validation/extraction (`orb-tools.test.js`, `web-fetch.test.js`), the injected-date/search-gate/fetch-branch prompt (`atlas-prompt.test.js`), SSE and incremental JSON, sentence/PCM scheduling, history parsing/trimming (`history.test.js`), tool-trace guards, detail caps, and URL shortening (`tool-trace.test.js`), source extraction and URL matching (`source-links.test.js`), the orb state/label helpers (`orb-chrome.test.js`), the reveal decision (`orb-reveal.test.js`), the NDJSON union and reader including tool detail/query dispatch, optional debug passthrough and the `onEvent` tap (`turn-stream.test.js`), the AI wire guards and copy helpers (`turn-debug.test.js`), Cartesia request shape (`speech.test.js`), turn normalization (`orb-turn.test.js`), and streamed model retries/busy frames/tool rounds including search→fetch, cross-round dedupe, partial failures, and opt-in raw provider capture (`omni-stream.test.js`, with a mocked `fetch`). No test touches the network.
- **`scripts/generate-cartesia-voices.mjs`** — Regenerates those 18 samples with Cartesia Sonic, using `generation_config.speed` (0.7/1/1.3) for the pace variants. Uses `CARTESIA_API_KEY` when set; otherwise requests Cartesia's rate-limited public demo token. Run with `bun run generate:voices`; Bun loads `.env` automatically.
- **`scripts/omni-probe.mjs`** — P0 diagnostic for the Baseten Muse Spark Open endpoint: baseline, streaming, native tools with the same strict schema the app sends, `response_format: json_object`, reasoning-effort-high, generated WAV input, and probe 7 for `response_format: json_schema`, which must pass before JSON mode is replaced. Run with `bun run probe:omni`; it exits non-zero only when the baseline fails. Native tools stay behind `BASETEN_NATIVE_TOOLS=1` until the probe shows `tool_calls`.

The `@/*` alias resolves to `src/*`, so imports look like `@/components/ui/button` and `@/lib/utils`.

## Project Guidelines

- Write reusable and maintainable components
- Avoid unnecessary dependencies and duplicated code
- Never expose secrets or private environment variables to the browser
- Follow the installed package versions and official documentation
- Use Tailwind CSS and shadcn/ui for the interface

## Prompt engineering

The orb prompt (`src/lib/atlas-prompt.ts`) follows these practices, adapted from OpenAI's prompt-engineering and agent guides, Anthropic's prompting best practices and tool-writing guidance, and *The Prompt Report* (arXiv:2406.06608):

- **Instructions have a hierarchy.** The system prompt outranks the user's message, earlier turns, tool results, and fetched pages. Put persona, output shape, and safety rules in the system prompt; never rely on a user message to enforce them. Treat page and search text as evidence, not instructions.
- **Give one clear objective per section.** State the role and job first, then keep one section each for reply format, tools, cards, conversation, and uncertainty. Short declarative sentences beat stacked adjectives.
- **Use structure as a boundary.** Markdown headings and XML-style tags (`<instructions>`, `<example>`) make sections and untrusted data separable. Keep the exact output shape in both the prompt and the tool schema; do not describe it only in prose.
- **Prefer positive, testable rules.** Say what to do ("one card per step"), not only what to avoid. Every rule needs a boundary and a reason the model can apply. Remove two rules that say the same thing in different words.
- **Put critical constraints first and last.** The date and persona open the prompt; the final check repeats the decisions that most often fail: URL → fetch, freshness → search, readable detail → create, and no invented screen content.
- **Show diverse examples.** Three to five realistic pairs cover the common cases and the boundaries: speech only, one card, batched cards, search, and fetch. Keep the exact JSON formatting consistent between examples. Examples usually teach format and judgment better than another paragraph of rules.
- **Design tools as part of the prompt.** Each tool description states what it is for, when to use it, when not to, and what each argument means. One tool has one job. Return actionable errors ("content exceeds 4,000 characters") so the model can repair the call instead of guessing.
- **Let the agent loop do the work.** The model may plan, call tools, read results, and call again. Cap rounds, run independent calls together, cache duplicate calls, and tell the model exactly what ran and what was rejected. Never let it claim a result it did not receive.
- **Validate structured output outside the prompt.** Request JSON, parse it defensively, and repair or retry once with the turn's real context. `response_format: json_object` is advisory on this model, so the parser and schema remain the guarantee.
- **Evaluate before tuning.** Define success criteria (correct tool choice, valid JSON, a card only when useful, valid timer and next attributes, no invented claims), keep representative cases, and inspect failures before changing the prompt. Change one variable at a time and rerun the suite. Offline fixtures keep tests deterministic.
- **Protect the cache prefix.** Baseten caches a token prefix. Keep the static prompt first, make the date day-granular, and put live values behind tools. History trimming drops the oldest pair and therefore part of the cached prefix; that is a deliberate context/cost trade-off, not a bug.
- **Keep the prompt and runtime in sync.** Tool instructions are generated from `tools/registry.ts`; tests pin the reply shapes, search/fetch paths, card rules, and the absence of removed fields. A rule that is not in the tested prompt is not a rule.

Atlas-specific contract:

- `create` is the only screen surface; `speak` is the spoken companion.
- Create cards for teach, show-how, walk-through, and guide requests; procedures, lists of three or more, comparisons, code, sources, and anything the user may keep or act on. Answer in speech for greetings, single facts, clarifications, and apologies.
- Cards are collapsed by default, so titles carry the reason to open them.
- A timer is a block-level tag at column 0 outside code fences; only `timer`, `label`, `send`, and `show` are allowed. It is the only inline widget — unknown tags render as escaped text.
- Never claim steps or cards are on screen without a `create` call in that turn.
- Reply length is left to the model. The prompt sets no word, sentence, or clarification-count target, and the transport does not truncate `speak`; only technical limits enforced in code (card content, timer bounds, widget attributes) appear as numbers.

Reference reading:

- OpenAI, [Prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering)
- Anthropic, [Prompt engineering overview](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview) and [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
- Schulhoff et al., [The Prompt Report](https://arxiv.org/abs/2406.06608)
- OpenAI, [A practical guide to building agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/)
- Anthropic, [Writing effective tools for agents](https://www.anthropic.com/research/writing-tools-for-agents)

