# Atlas

AI that adapts to you — not the other way around. Atlas is a voice-first companion built around people with disabilities: it talks, listens, signs, captions, and watches out for you depending on what you need.

[![Atlas demo video](https://img.youtube.com/vi/J6siIGO4GIQ/hqdefault.jpg)](https://youtu.be/J6siIGO4GIQ)

## The problem we are solving

Most AI assistants are built around people without disabilities. Their interfaces, interactions, and underlying systems often overlook the needs of people with different disabilities, making them inaccessible or practically useless for many of them.

Atlas is specifically built around people with disabilities, following one philosophy:

> Technology should adapt to people, not the other way around.

- **For blind people:** Most assistants rely heavily on visual interfaces. Atlas becomes their eyes — it describes what its camera sees, warns about obstacles in the walking path, and speaks everything instead of showing it.
- **For deaf people:** Atlas becomes their ears. It listens to the room, transcribes what matters, and answers on screen instead of through sound.
- **For people with speech disabilities:** Atlas gives them another way to communicate — they type or fingerspell to the camera in sign language, and Atlas speaks and acts on their behalf.
- **For autistic people:** One of the biggest challenges is understanding your own moods and what triggers them. Atlas logs moods, learns from personal experiences, and builds a connected mood memory — a second brain that reveals patterns over time.

The mood system is also designed with emotional comfort in mind. Not every memory is something a person wants to revisit. Some experiences are difficult to remember, so Atlas never forces negative moods or memories into the interface. Users stay in control of what they revisit and when.

## What the product does

Atlas is one conversation loop that adapts to the person using it. You pick who you are at `/start`, and the same companion — same prompt structure, same tool loop, same voice — changes what it can do:

- **It talks and listens.** Browser mic → speech detection → replies spoken with the voice built into your browser (smooth and calm, at the pace you chose). Everything spoken is also captioned, and Atlas keeps a full conversation thread you can reopen.
- **It answers through tools, not vibes.** On every turn the model can search the web, read a specific page, check the actual time in any timezone, and act: create reminders, start a new chat, open the camera, or shut itself up. Search results are cited as links inside the answer that uses them.
- **It shows procedure cards.** How-tos, plans, comparisons, and anything you will act on arrive as on-screen cards (up to six, markdown everywhere) — with inline widgets: countdown timers you can fire, checkboxes, counters, ratings, and progress bars.
- **It listens in sign.** Non-speaking (mute) and deaf users can hold the camera and fingerspell or sign; the clip is transcribed by the video model under a strict structured contract and enters the conversation exactly as if the words had been typed.
- **It watches out for blind users.** In blind mode the camera becomes a live obstacle channel: a short clip is checked continuously and spoken warnings ("Chair directly ahead, about two steps away") fire when the walking path contains something real.
- **It remembers moods.** In autism mode you can log how today felt (1–5 plus a note); Atlas answers trends from the log, never from memory — and can produce a doctor-ready summary report.
- **It reminds you like a person would.** Say "remind me to take my meds tomorrow at 9" — Atlas resolves relative times in your timezone, sets recurrences, and when it's time: a browser notification, a beep, and — in blind mode — your reminder spoken when the assistant goes idle.
- **It reads what you share.** Drop an image into the chat and it visually enters the turn; share a text/markdown/CSV file and its contents become part of the message; with the camera open, ask "what am I looking at" and the frame is described in words.

### One table decides everything

Accessibility is four modes — **autism**, **mute**, **deaf**, **blind**. The same decision table (`src/lib/access-modes.ts`) drives the prompt, the tools the model may call, and what the interface offers, so a mode can never be "allowed" in one layer and denied in another:

| Mode | Voice in | Voice out | Cards | Signs | Camera guard | Mood log |
| --- | --- | --- | --- | --- | --- | --- |
| Autism | ✓ | ✓ | ✓ | — | — | ✓ |
| Mute | — (type or sign) | ✓ (optional) | ✓ | ✓ | — | — |
| Deaf | ✓ | — | ✓ | ✓ | — | — |
| Blind | ✓ | ✓ | — (voice instead) | — | ✓ | — |

## Try it in three minutes

If you are opening the live page (or running it locally), this is the happy path the demo video shows:

1. Open `/start` — enter your name, age range, and pick a speaking pace. The wizard speaks a short preview so you hear the voice at your pace.
2. Opening the dashboard starts you in **autism mode** with a clearly-labeled **sample mood log** (fourteen entries, every note prefixed `[Sample]`) so mood trends work immediately — say *"how have my moods been lately?"* and ask *"what should I bring up at my doctor?"* for the report. On your first visit, a one-time guided tour spotlights the mode bar, orb, camera, chat field, threads, and Ctrl+K controls; skip it anytime or replay it later from Ctrl+K.
3. Try the tools: *"what's the latest in assistive tech news?"* (web search + cited card), *"time my pasta for nine minutes"* (timer widget), *"remind me to call my sister tomorrow at 6"*.
4. Say *"bye"* or *"shut up"* to end the visit; *"start a new chat"* opens a fresh thread.
5. Switch modes from the mode bar: try **blind** mode — the typed chat box disappears, everything is spoken, and if the camera is on you'll hear obstacle warnings as they appear.
6. Debugging transparency: in development builds, the floating button in the top-right opens the AI-wire panel — every NDJSON frame, each tool call, and the raw model rounds of the running turn.

Demo data note: the sample moods exist because a mood log needs two weeks before trends make sense — **Clear sample moods (demo)** removes exactly those `sample-mood-*` entries (Ctrl+K) and never touches a real log. No secrets are in the repo — the model key comes from your own `.env`. Search uses the built-in hosted endpoint and can be overridden with `SEARCH_API_URL`.

## Setup, step by step

**Prerequisites:** [Bun](https://bun.sh) (the only supported runtime) and two API keys.

**Step 1 — Install the app.** (If you don't have Bun yet: `curl -fsSL https://bun.sh/install | bash`.)

```bash
bun install
```

Checkpoint: the `postinstall` hook prints `VAD assets copied to public/vad` — the Silero VAD assets are now served locally by the app.

**Step 2 — Configure the environment.** Copy the template and fill in the values — `.env.example` documents each one:

```bash
cp .env.example .env
```

| Variable | Where to get it | What it powers | Without it |
| --- | --- | --- | --- |
| `MODEL_API_KEY` | [Meta Model API](https://dev.meta.ai) dashboard | every AI turn (chat, audio, video) | the app answers only with its error copy — nothing functions without this one |
| `SEARCH_API_URL` | Optional override | the websearch/webfetch tools | search uses the built-in hosted endpoint |

All keys stay server-side — read in `process.env` only inside server-only modules and never sent to the client or logged. There is no speech-synthesis key at all: the voice is your browser's.

**Step 3 — Start the VAD server** (terminal 1). The mic pipeline needs the Silero WebSocket server alongside Next:

```bash
bun run vad-server   # defaults: host 0.0.0.0, port 8081, GET /healthz
```

Checkpoint: `curl http://localhost:8081/healthz` answers `{"status":"ok", ...}`. Leave it running — the dashboard's mic session talks to it on every turn.

Env: `VAD_PORT`, `VAD_HOST`, `VAD_MODEL_PATH`, `VAD_MAX_CONNECTIONS`, plus `VAD_TLS_KEY`/`VAD_TLS_CERT` for `wss` (required on HTTPS pages). For plain-HTTP deploys (docker/LAN), bake in `NEXT_PUBLIC_VAD_URL=ws://<host>:8081` at build time.

**Step 4 — Start the app** (terminal 2):

```bash
bun run dev          # local dev server
bun run dev:https     # LAN + HTTPS (browsers only grant the mic on HTTPS or localhost)
```

Checkpoint: open [http://localhost:3000](http://localhost:3000) — onboarding lives at `/start`, the voice companion at `/dashboard`. If the mic is denied, serve over HTTPS (`bun run dev:https`) — browsers only grant it on HTTPS or localhost.

**Step 5 — Say hello.** Follow the [three-minute tour](#try-it-in-three-minutes): past `/start`, the dashboard starts in autism mode with a sample mood log, so every feature works from the first turn.

**Alternative — Docker** (a self-contained production run; replaces steps 3–4):

```bash
docker build -t atlas .
docker run -p 8080:8080 -p 8081:8081 \
  -e MODEL_API_KEY \
  atlas
```

Next serves on 8080, the VAD server on 8081.

## How a turn works

One turn is a small, honest agent loop — the model never claims an action it did not take:

```text
browser (VAD / typed input / signed clip)
  └─ POST /api/orb/respond ── NDJSON stream:
       transcript → tool → speak-delta → speaking → audio-done || typed error
       └─ Meta Model API (muse-spark-1.3, audio turns on 1.2)
            ├─ prompt           lib/atlas-prompt.ts
            ├─ speech gate      lib/speech-integrity.ts     (no markdown, no invented actions)
            ├─ voice gate       lib/browser-voice.ts        (calm browser speech)
            └─ tools/           websearch · webfetch · get_current_time · create ·
                                start_new_chat · open_camera · shutdown · reminder ·
                                mood · speak · frame
```

Everything user-visible arrives through a typed event stream; tool calls are validated against schemas server-side, deduped, and answered one-for-one; a failed tool becomes readable evidence for the next turn instead of a crash. The full module map and the non-negotiable engineering rules live in [AGENTS.md](AGENTS.md); the chronological decision log (what changed, why, with what tradeoff) lives in [context.md](context.md).

## Where the intelligence runs

- **Meta Model API** (`api.meta.ai/v1` via the OpenAI SDK) — every AI surface, with the model pinned per surface (see [which Meta models](#the-meta-models-we-use) below); its Responses endpoint transcribes and describes video for the signing and camera paths.
- **Web search** — live results behind the `websearch`/`webfetch` tools, through the built-in hosted search endpoint; set `SEARCH_API_URL` only to override it.
- **Silero VAD** — local speech detection, browser (onnxruntime-web) next to the mic and server (onnxruntime-node) behind the WebSocket.
- **Your browser** — speech synthesis (no cloud voice), push notifications and beep for reminders, MediaRecorder for clips, IndexedDB for threads/messages/preferences. Nothing about your conversations, moods, or camera view is stored on this app's servers; Atlas's own persistence lives in your browser.

### The Meta models we use

All AI calls go to Meta Model API, but no single model does everything — each surface pins the model the docs prescribe:

| Surface | Model | Endpoint | Why this one |
| --- | --- | --- | --- |
| Every conversation turn — prompt, history, images, the native tool loop | `muse-spark-1.3` | `/v1/chat/completions` | the current text + image understanding model |
| Turns that carry your audio | `muse-spark-1.2` | `/v1/chat/completions` | audio understanding is documented as degraded on 1.3 |
| Video — signing transcription, camera-frame description, blind obstacle guard | `muse-spark-1.3` | `/v1/responses` | the Responses endpoint reads MP4 clips under a strict structured-output contract |

Models are pinned in code (`META_TEXT_MODEL` in `src/lib/model.ts`, `MUSE_VIDEO_MODEL` in `src/lib/muse-video.ts`), so an upgrade is a one-line change. The video channels deliberately use Standard mode rather than the `muse-spark-1.3-contributor` variant: clips that watch your surroundings or capture your signing should not participate in contributor training.

## Scripts

| Command | What it does |
|---|---|
| `bun run dev` | Start the dev server |
| `bun run dev:https` | Dev server on LAN with HTTPS (mic needs it) |
| `bun run build` / `bun run start` | Production build / serve it |
| `bun run test` | Offline suite: `bun test tests/` (no network, no keys) |
| `bun run typecheck` | `next typegen && tsc --noEmit` |
| `bun run lint` | Oxlint, type-aware |
| `bun run vad-server` | Silero VAD WebSocket server |
| `bun run probe:model` | Meta Model API endpoint probes (real billed calls) |
| `bun run eval:live <label> <dev\|heldout\|all> [id]` | Live scenario harness |
| `bun run postinstall` | Copy Silero VAD + MediaPipe assets into `public/` |

TypeScript is strict; test files are plain `.js` (`bun:test` has no type declarations in this repo). `tests/README.md` documents what every test file covers.

## Repository guide

| Path | What lives there |
|---|---|
| `src/app/` | Routes: `/start` (onboarding), `/dashboard` (the orb), `/` (landing), API routes under `/api/orb/*` |
| `src/components/dashboard/` | Orb stage, mic session, turn lifecycle, cards, chatbox, thread sidebar, AI-wire panel |
| `src/components/start/` | Onboarding wizard |
| `src/lib/` | The engine: turn loop, tool registry, prompt parts, modes, cards, reminders, moods, provider clients |
| `src/registry/` | The orb canvas (particles, per-state modules) |
| `tests/` | The offline test suite (19 files, no network and no keys required) |
| `scripts/` | VAD server, asset copying, live evaluation harnesses |
| `AGENTS.md` | Architecture handbook: module map, contracts, naming and validation rules |
| `context.md` | The append-only decision log (newest first) |
