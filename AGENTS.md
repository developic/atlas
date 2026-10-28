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
├── exa-search.test.js
├── history.test.js
├── omni-stream.test.js
├── orb-chrome.test.js
├── orb-reveal.test.js
├── orb-tools.test.js
├── orb-turn.test.js
├── source-links.test.js
├── speech.test.js
├── sse.test.js
├── tool-trace.test.js
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
│   ├── globals.css
│   ├── layout.tsx
│   └── not-found.tsx
├── components/
│   ├── dashboard/
│   │   ├── conversation-panel.tsx
│   │   ├── dashboard-flow.tsx
│   │   ├── orb-chrome.ts
│   │   ├── orb-command-menu.tsx
│   │   ├── orb-reveal.ts
│   │   ├── orb-stage.tsx
│   │   ├── use-orb-turn.ts
│   │   ├── use-pcm-player.ts
│   │   ├── use-voice-activity.ts
│   │   ├── use-voice-level.ts
│   │   ├── voice-activity.ts
│   │   ├── voice-meter.tsx
│   │   └── prompt-dock.tsx
│   ├── layout/
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
│       ├── collapsible.tsx
│       ├── hover-card.tsx
│       ├── inline-citation.tsx
│       ├── input-group.tsx
│       ├── input.tsx
│       ├── message-scroller.tsx
│       ├── not-found-scene.tsx
│       ├── sources.tsx
│       ├── textarea.tsx
│       ├── theme-toggle.tsx
│       └── trace.tsx
├── registry/
│   ├── lib/
│   │   ├── orb-color.ts
│   │   ├── orb-pill.module.css
│   │   ├── orb-pill.tsx
│   │   ├── orb-state.ts
│   │   ├── orb-status.tsx
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
│   ├── atlas-prompt.ts
│   ├── cartesia.ts
│   ├── cartesia-server.ts
│   ├── chat-message.ts
│   ├── exa.ts
│   ├── json-extract.ts
│   ├── json-stream.ts
│   ├── nvidia-omni.ts
│   ├── onboarding.ts
│   ├── orb-errors.ts
│   ├── orb-tools.ts
│   ├── orb-turn.ts
│   ├── pcm.ts
│   ├── sentence-chunker.ts
│   ├── source-links.ts
│   ├── sse.ts
│   ├── theme.ts
│   ├── tool-trace.ts
│   ├── turn-stream.ts
│   ├── utils.ts
│   ├── view-transition.ts
│   ├── wav.ts
│   └── web-fetch.ts
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
  - **`api/orb/respond/`** — Server-only POST route for one orb turn. Accepts a recorded WAV (multipart `audio`, legacy WebM/MP4/Ogg still accepted) or a JSON `transcript`, plus a character-trimmed text-only `history` and optional onboarding `voice`/`pace`. The dashboard sends the clip straight to the free `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` model, which transcribes it and writes `{transcript, speak, conversation}` in one streaming call; the JSON tool protocol can add `websearch`, `webfetch`, or `get_current_time` rounds before the answer. Cartesia streams sentence-sized PCM16 chunks while the model is still writing, with whole-reply MP3 as the fallback when the PCM path produces nothing. Streams NDJSON events named after the action that produced them: `transcript`, `searching`/`tool`, `speak-delta`, `audio` (`pcm`, `sampleRate`, `seq`), `speaking` (the full text, sent before TTS finishes), `audio-done` on the PCM path or `audio-mp3` on the fallback, or a typed `error` with `code` and `message`. There is no upfront `thinking` frame: the dashboard already starts a turn in that state, and every later status follows something the model actually did, such as a web search. Keeps `NVIDIA_API_KEY`/`EXA_API_KEY`/`CARTESIA_API_KEY` server-side, validates voice and pace against the Cartesia catalogs, trims history to ~6000 characters without splitting user/assistant pairs, caps spoken replies at 600 characters, maps a 202/503/`ResourceExhausted` free worker to a retryable `busy` code (including an SSE error frame), passes `request.signal` into the omni turn so a disconnected client stops the search and TTS work, and emits one structured `orb-turn` log line without user content (`stage: "aborted"` instead of an error frame when the client is gone). The client retries a busy turn twice (1.5 s apart), and expected busy failures are not logged as server faults.
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
    - **`dashboard-flow.tsx`** — The dashboard stage and microphone session: the registry `ParticlesOrb` (ink→sage dots from the theme tokens, sized up to 520 px and fitted to both viewport width and height) wrapped in `OrbHalo`, one **Start conversation** / **End conversation** button, the conversation toggle, and the test-only status picker. The first tap opens the mic and primes the `AudioContext`; while VAD is armed the dashboard keeps a warm `MediaRecorder` running (a 4 s pre-roll is discarded if no speech starts), so the first syllable is captured instead of being lost to recorder startup. `useVoiceActivity` stops the clip after silence; the clip is decoded and re-encoded as 16 kHz mono WAV before upload (the original blob is kept if decoding fails), then handed to `useOrbTurn` with no second click. Clips with less than 200 ms of voiced audio are discarded, so coughs and clicks do not become empty turns. VAD is disabled while Atlas thinks or speaks and re-arms with a 900 ms delay after playback drains; the warm recorder starts only after that delay so it does not capture Atlas's speaker tail (Phase 1 is half-duplex). Earlier turns are kept as text in `sessionStorage` (up to 40 messages, 6000 chars each) and sent through `trimHistory` as `history`, so Atlas can resolve “that”/“it” without re-sending audio; the clip is dropped as soon as the turn ends. The caption shows `Listening…`, the current reply, or a friendly error, and picking a preview state cancels the conversation while `Auto` returns the orb to the session state with the mic off. When `Progressing` is previewed, a 0–100% slider drives the orb's `progress` prop. The page carries a visually hidden `<h1>` because the orb is the only content.
    - **`use-orb-turn.ts`** — The turn lifecycle for voice and typed turns alike. It builds the request, posts through `fetchTurnStream`, and dispatches every NDJSON event; streamed transcripts fill the panel immediately, and the first PCM chunks are held until the full `speaking` text arrives so the caption, conversation message, and first scheduled audio land in the same tick. Each tool event is recorded as a `ToolTrace` (search query or fetched URL): `aiTool` drives the live pending row, while up to six traces are saved on the finished assistant message for the transcript. Later chunks enqueue as they arrive, with MP3 playback as the fallback. A busy free omni worker is retried twice before the caption shows a retry message, a stalled turn is bounded by a 100 s timeout, and a turn that fails after `speaking` still reveals the text it already received. It appends the finished turn to history, owns `usePcmPlayer` (so `onDrained` re-arms VAD after the last chunk), and exposes `aiState`, `aiReply`, `aiError`, `aiAudio`, `aiTool`, `respond`, `sendText`, `stopTurn`, `primePlayback`, `onAudioEnded`, `onAudioFailed`, `dismissError`, and `failTurn`.
    - **`orb-reveal.ts`** — Pure reveal decision (`shouldRevealTurn`) shared by the hook and its tests: audio triggers wait for the full text, while MP3 and error triggers reveal an already-received reply.
    - **`orb-chrome.ts`** — Pure `orbStateFor` (preview wins over the session; then turn status, then mic status) and `mainLabelFor` (the primary button copy for every mic status), so the stage cannot show an impossible pair such as a denied mic with a listening orb.
    - **`use-pcm-player.ts`** — Web Audio player for streamed Cartesia PCM16. Decodes base64 to Int16, converts to Float32, schedules each chunk at `max(currentTime, nextStartTime)` for gapless sentence playback, and exposes `prime`, `enqueue`, `markDone`, and `stop`. `onDrained` fires after the last scheduled source ends following `audio-done`, which is how the dashboard re-arms VAD.
    - **`orb-command-menu.tsx`** — Test-only Ctrl+K (⌘K) command menu (no on-screen button; opens with `Control+K` / `Meta+K`). Lists start/end conversation, show/hide transcript, and every orb state preview, searchable from the keyboard.
    - **`conversation-panel.tsx`** — Side panel showing the conversation history as a transcript with geometric avatars, timestamps, markdown rendering for Atlas's `conversation` field, a cited-sources list, and a text composer that sends a typed turn through `useOrbTurn`. Markdown links render through `InlineCitation`, so hovering or focusing a source shows its hostname, label, and path; `Sources` collapses the turn's links under a count. While the turn is working, a hidden pending row with a running `Trace` (`Thinking…`, `Searching the web…`, or `Fetching <url>…`) sits at the end of the content; it stays mounted across turns because Message Scroller 0.3.1 re-anchors to the oldest unhandled turn when the item count drops, so the reply appends instead of jumping the transcript. A finished assistant turn renders its saved tool traces as collapsed stack-trace rows under the reply: the trigger shows the shortened URL (host and path tail) or search query, and the expansion holds the full URL as an external link. `AnchorNewTurn` scrolls the newly sent question to the top, `useHydrated` keeps the server HTML and the sessionStorage-backed first client render identical, and focus returns to the trigger when the panel closes. Opens automatically after the first turn lands; a manual close stays closed until reopened via Ctrl+K. Persists open state during the session.
  - **`layout/`** — Page shell/chrome components.
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
    - **`collapsible.tsx`** — Base UI collapsible wrapper used by `TraceCollapsible`, with the animated panel height the sources list relies on.
    - **`message-scroller.tsx`** — shadcn/ui (0.3.1) message scroller used as the transcript viewport: provider, auto-scroll, per-item `messageId` anchors, and the jump-to-end button.
    - **`hover-card.tsx`** — Base UI PreviewCard wrapper for hover/focus popups. Shared portal, positioner, paper surface, and open/close transition used by inline citations.
    - **`inline-citation.tsx`** — Renders a markdown link as a normal external anchor plus a hover/focus source card with the hostname, link label, and path. Only absolute HTTP(S) URLs become citations; other links fall back to a plain anchor.
    - **`input-group.tsx`** — Wrapper that groups an input or textarea with leading/trailing adornments.
    - **`input.tsx`** — Base UI text input with variant styling.
    - **`textarea.tsx`** — Base UI multi-line textarea with variant styling.
    - **`not-found-scene.tsx`** — Client component for the 404 eyes. Pupils follow the pointer with spring physics, and the sockets blink on a randomized interval; both respect `prefers-reduced-motion`.
    - **`sources.tsx`** — The used-sources list under an assistant reply: a "Used N sources" trace trigger that expands into external links labeled by title (hostname fallback), so the transcript stays scannable until asked.
    - **`trace.tsx`** — Trace primitives for inline tool/status rows: `Trace`, `TraceLine` (running shimmer, error and pending states, static under reduced motion), `TraceIcon`, `TraceTitle`, `TraceDescription`, and the collapsible trigger/content pair.
    - **`theme-toggle.tsx`** — Client-side light/dark toggle backed by `lib/theme.ts`. Follows the system theme by default, persists explicit choices in `localStorage`, and syncs across tabs.
- **`src/registry/`** — Drop-in orb package. `orbe/particles-orb/particles-orb.tsx` is the canvas sphere: 960 golden-angle dots, z-sorted depth, per-state motion tables, and a single rAF animator that pauses offscreen, follows `prefers-reduced-motion`, and optionally reads a live `levelRef`. `searching` adds the Sinua `globe` scan (a horizontal band sweeps the sphere, growing and brightening the dots it crosses while the rest dim back); `progressing` adds the Sinua `eclipse` terminator, a day/night line fixed in view space whose position comes from the `progress` prop (0–1); `error` is a slow, smooth rose heartbeat rather than a shake. Dots take their colors from `--orb-color-from` / `--orb-color-to` (ink→sage by default, falling back to props), so the root theme tokens recolor the orb and a `MutationObserver` redraws when `.dark` or the variables change. Dot shading adapts to the palette (alpha compositing for dark dots on light, additive + glow for light dots on dark), with damped pointer parallax and a slow wobble for depth. `lib/` holds its contracts and hooks: `orb-state.ts` (states, mixing, energy, CSS vars), `orb-color.ts`, `use-orb-animator.ts`, `use-orb-level.ts`, `use-audio-level.ts` / `use-audio-bands.ts` / `use-waveform.ts` (shared analyser), `use-in-view.ts`, `use-reduced-motion.ts`, `use-webgl-support.ts`, `use-orb-cues.ts`, `orb-status.tsx`, and the `orb-pill.tsx` status pill.
- **`src/lib/`** — Shared, non-UI helpers.
  - **`atlas-prompt.ts`** — The orb's system prompt. `buildAtlasSystemPrompt(now)` puts the real UTC date and current month first so October 2026 is treated as the present, then the prompt. It defines two reply shapes: a `websearch` or `webfetch` request for news, latest/current facts, and a specific URL (with a concrete trigger-word list and a final three-branch check), and the normal `{"transcript","speak","conversation"}` answer. It covers the speak/conversation split, history use, the no-invented-actions rule, and the fallbacks for empty or unintelligible audio. Each rule has one home (reply format, generated tools, conversation, uncertainty, consistent examples, final check): the trigger list, tool protocol, and anti-announcement rule are not restated across sections. The tool section is generated from `orb-tools.ts`, so prompt and runner cannot drift. Keep output-shape reminders out of the user message: an explicit “return only the transcript and reply” overrides the system prompt's search decision.
  - **`cartesia.ts`** — Shared Cartesia contract: model/version constants, the six voice IDs, the three pace speeds, MP3 output format, raw PCM16 streaming format (24 kHz), voice/pace type guards, and the personalized preview transcript.
  - **`cartesia-server.ts`** — Server-only Cartesia helpers: `getCartesiaToken` (API key or the public demo token, cached for five minutes so per-sentence streaming TTS does not refetch it) and both `synthesizeSpeech` (whole-reply MP3) and `synthesizeSpeechStream` (`/tts/sse` raw PCM16 for sentence chunks). Shared by `api/voice-preview` and `api/orb/respond`.
  - **`chat-message.ts`** — Shared text-only `ChatMessage` type (optional `speak`, `sources`, `tools`, `id`, `timestamp`) and `isChatMessage` guard used by the dashboard's `sessionStorage` reader and the orb route. `parseHistory` validates the request's history array (dropping unknown roles, unknown tool traces, and capping each message at `MAX_MESSAGE_CHARS`), `toModelHistory` flattens it into the model's user/assistant pairs, and `trimHistory` keeps the newest turns under a ~6000-character budget without separating a user message from its assistant reply, truncating a single oversized pair rather than dropping it.
  - **`exa.ts`** — Server-only Exa web search: `POST https://api.exa.ai/search` with `query`, `type: "auto"`, and `contents: { highlights: true }`, an honest `atlas/0.1.0` User-Agent, a 15 s timeout composed with the turn's abort signal via `AbortSignal.any`, and `formatResults` to keep at most eight usable hits with trimmed highlights.
  - **`json-extract.ts`** — Balanced-object/array scanner that respects strings and escapes. It extracts the first parseable JSON value from fenced output, prose, or CoT while never “repairing” truncated JSON.
  - **`json-stream.ts`** — Incremental reader for top-level string fields in streamed JSON. It surfaces `transcript` once its closing quote arrives and `speak` as deltas, handles escapes and unicode split across chunks, and ignores field names inside other strings.
  - **`nvidia-omni.ts`** — Server-only NVIDIA path used by the dashboard. `respondToAudio` sends the WAV clip as an inline `audio_url` data URI to `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`; `respondToText` does the same for a typed transcript. The user message carries only the transcript (or “Transcribe and answer this recording.”), never a restatement of the JSON shape, because an explicit “return only the transcript and reply” suppresses tool calls. `requestTurn` runs the loop: classify the reply (`classifyToolOutput`), correct a broken tool request once (counted against the cap), run each round's tools together through `Promise.all` and return them as one `formatToolResults` message, force an answer at the three-round cap (cap checked *before* the model call: exactly 3 tool rounds + 1 forced call), and repair invalid JSON with the turn's own `messages` so tool results survive. One turn-wide `Map` caches tool promises, so a repeated call in a later round is not executed twice, and each tool receives the turn signal. A mixed reply’s invalid calls are reported alongside the valid results instead of being dropped. `forceAnswer` is terminal: it drops `tools` and any further `tool_calls` throw `no_reply` with no repair request. One 90 s `AbortSignal.timeout` bounds the turn via `composeTurnSignal`, composed with the 60 s per-request timeout via `AbortSignal.any`; a client disconnect aborts the turn, and an abort during the SSE body read maps to `OrbError("timeout")`. Streams SSE with thinking off and `response_format: json_object`, never emits `speak` once a `tool` field has appeared, and deduplicates `onTool` announcements per round. Native calls (`OMNI_NATIVE_TOOLS=1` only) are answered one-for-one by `tool_call_id` (echoed exactly, invalid calls included), and that round is sent without `response_format`. It retries truncation at 2000 tokens and reasoning-only output once and validates/caps the turn through one `finalizeTurn` return. A 202, 503/429, `ResourceExhausted` frame, and an expired deadline map to typed errors.
  - **`onboarding.ts`** — The `/start` answer contract: validates name, age range, voice, pace, and the two talk-style picks against their catalogs, then writes them to one storage key. `loadOnboarding()` reads and re-validates the saved answers for later surfaces such as `/dashboard`.
  - **`orb-errors.ts`** — Typed `OrbError` codes (`busy`, `timeout`, `invalid_json`, `no_reply`, `audio`, `tts`, `config`) and the single user-message map shared by the route and client retry logic. `search` is deliberately absent: a failed search is text for the model, not a failed turn.
  - **`orb-tools.ts`** — One registry for `websearch`, `webfetch`, and `get_current_time`: strict-compatible tool definitions, `classifyToolOutput` (no tool intent / broken request / valid requests plus per-call errors), `parseNativeToolCalls` returning one `NativeCall` per id, per-argument caps (query 400, URL 2,048, focus 200, timezone 64), the generated prompt section, the shared `CITATION_INSTRUCTION`, and `runToolWithSources`. A request is `{"tool","arguments","transcript"}`; the older flat shape is still accepted so a search can never be mistaken for an answer. Search results are budgeted before serialization via `budgetSearchHits` (~3 000 char JSON budget), so the closing `UNTRUSTED_SEARCH_RESULTS>>>` fence always survives; the fence marker is neutralized inside hit text. A fetched page is capped by `web-fetch.ts`, fenced as `UNTRUSTED_WEB_PAGE`, and labelled with a shortened URL so the 4 000-char tool-result cap cannot cut the closing marker. The runner never throws: a failure is model-readable text, and a search or fetch returns its content (fenced as untrusted data) plus titled `SourceLink`s for the panel.
  - **`orb-turn.ts`** — Pure turn normalization: string-field validation, speak/conversation fallbacks, transcript/speak/conversation caps (4000/600/6000), and sentence-safe `trimForSpeech`.
  - **`pcm.ts`** — Shared PCM helpers: base64 to Int16 (little-endian), Int16 to Float32, and the `max(currentTime, nextStartTime)` scheduling rule used by the player and its tests.
  - **`sentence-chunker.ts`** — Streaming sentence splitter for TTS. Emits chunks at `.!?`/newline boundaries with a ~40-character minimum and 260-character hard cap, and flushes the remainder.
  - **`source-links.ts`** — Source extraction for an assistant reply: markdown links, GFM autolinks, and bare URLs (code samples, images, and relative links ignored), deduped by URL. A title that is just a URL is dropped so the UI can fall back to the hostname. `selectReplySources` matches those citations to the Exa hits behind a turn through `matchKey`, which ignores `www`, fragments, trailing slashes, and tracking parameters while keeping real query differences.
  - **`sse.ts`** — Shared SSE parser for NVIDIA and Cartesia: chunk splitting, CRLF, multi-line `data:` frames, comments, `[DONE]`, and a final frame without a trailing blank line.
  - **`theme.ts`** — The single source of the theme contract: storage key, `Theme` type, resolution and apply helpers, the store subscription, and the pre-hydration bootstrap script.
  - **`tool-trace.ts`** — The transcript's tool row: `ToolTrace` (`tool` + optional readable `detail`), a guard for stored session messages, a 512-character detail cap, `shortenMiddle` for long URLs, and one running/done label map shared by the pending row and the finished reply. It lives outside `orb-tools.ts` so the client does not import the server-only fetch/search code.
  - **`turn-stream.ts`** — One `TurnEvent` discriminated union for every NDJSON frame (`transcript`, `searching` with an optional query, `tool` with an optional detail, `speak-delta`, `audio`, `speaking`, `audio-done`/`audio-mp3`, `error`), with `isTurnEvent` as the boundary check on both the route's `send` and the client reader. `fetchTurnStream` posts a turn and dispatches each event, `TurnStreamError` carries the server's typed code, and a stream that ends before the final `speaking` event is rejected.
  - **`utils.ts`** — Exports `cn` from the `cn` package for merging conditional class names.
  - **`view-transition.ts`** — Shared `ViewTransition` props for the route transitions used by the headerless flows.
  - **`wav.ts`** — Client WAV helpers: `encodeWav` writes a mono PCM16 RIFF file, and `clipToWav` decodes a browser recording and re-encodes it at 16 kHz mono for the omni model.
  - **`web-fetch.ts`** — Server-only `webfetch` implementation. Validates http(s) URLs, rejects credentials, non-standard ports, localhost, `.local`/`.internal`, and private/link-local IP literals, follows at most three redirects with each hop re-validated, and composes a 15 s timeout with the turn signal. Caps the body at 512 KB, accepts HTML/plain text/Markdown/JSON, extracts readable text and the title, and keeps at most 3,000 characters, optionally ranked by a `focus` string. Never executes JavaScript or returns raw HTML.
- **`src/types/`** — Shared TypeScript types and interfaces. `.gitkeep` keeps the empty directory tracked until real types are added.
- **`tests/`** — Bun tests for pure logic and transport fixtures. `bun test tests/` runs the whole suite; `tests/README.md` lists each file. Coverage includes the VAD state machine (`voice-activity.test.js`), WAV encoding, turn parsing/caps, Exa compaction, the tool registry, native/JSON calls, and web-fetch validation/extraction (`orb-tools.test.js`, `web-fetch.test.js`), the injected-date/search-gate/fetch-branch prompt (`atlas-prompt.test.js`), SSE and incremental JSON, sentence/PCM scheduling, history parsing/trimming (`history.test.js`), tool-trace guards, detail caps, and URL shortening (`tool-trace.test.js`), source extraction and URL matching (`source-links.test.js`), the orb state/label helpers (`orb-chrome.test.js`), the reveal decision (`orb-reveal.test.js`), the NDJSON union and reader including tool detail/query dispatch, Cartesia request shape (`speech.test.js`), turn normalization (`orb-turn.test.js`), and streamed omni retries/busy frames/tool rounds including search→fetch, cross-round dedupe, and partial failures (`omni-stream.test.js`, with a mocked `fetch`). No test touches the network.
- **`scripts/generate-cartesia-voices.mjs`** — Regenerates those 18 samples with Cartesia Sonic, using `generation_config.speed` (0.7/1/1.3) for the pace variants. Uses `CARTESIA_API_KEY` when set; otherwise requests Cartesia's rate-limited public demo token. Run with `bun run generate:voices`; Bun loads `.env` automatically.
- **`scripts/omni-probe.mjs`** — P0 diagnostic for the free NVIDIA endpoint: baseline, streaming, native tools with the same strict schema the app sends, `response_format: json_object`, thinking-off, generated WAV input, and probe 7 for `response_format: json_schema`, which must pass before JSON mode is replaced. Run with `bun run probe:omni`; it exits non-zero only when the baseline fails. Native tools stay behind `OMNI_NATIVE_TOOLS=1` until the probe shows `tool_calls`.

The `@/*` alias resolves to `src/*`, so imports look like `@/components/ui/button` and `@/lib/utils`.

## Project Guidelines

- Write reusable and maintainable components
- Avoid unnecessary dependencies and duplicated code
- Never expose secrets or private environment variables to the browser
- Follow the installed package versions and official documentation
- Use Tailwind CSS and shadcn/ui for the interface

