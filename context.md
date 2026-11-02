# Project Context

## 2026-11-02 17:40 IST (12:10 UTC) — Cleanup round 2: correct sign MIME, abort semantics, docs

- Fixed a real signing bug: `assertSignVideo` now returns the detected MIME and `transcribeSigningVideo` puts that exact type in the data URL, instead of always claiming `video/mp4`. A WebM upload now fails honestly with the gateway's "MP4 only" message rather than being mislabeled. The sign recorder also tries MP4 first so capable browsers send an accepted clip.
- Shared video transport now maps a caller abort to `499` instead of a 502 "unreachable", so client stops and route cancellations stay distinguishable.
- Minor copy: blind mode's hint mentions obstacle warnings; the guard's paused status says "Atlas is busy" (it also pauses for frame capture, not just replies). Frame-capture question cap is a named constant.
- AGENTS.md codebase map and architecture notes now cover access modes, the camera channels, the shared video transport, mood/frame tools, and the new dashboard hooks; the server-only module list is current.
- Verified: live sign probe MP4 → 200 with usage, WebM → 502 with the MP4-only reason; `bun run test` 125/125, typecheck clean, build clean, dashboard/tunnel 200. Nothing staged or committed.

## 2026-11-02 17:20 IST (11:50 UTC) — Cleanup: one video transport, one frame-capture hook

- `lib/muse-video.ts` now owns the OpenCode Go video request shape (URL, model, auth, session header, timeout, output extraction, MP4 validation). `vision-guard.ts` and `frame-video.ts` keep only their prompts, schemas, caps, and error mapping — the duplicated fetch/parse blocks are gone.
- The `frame` capture flow moved out of `dashboard-flow.tsx` into `use-frame-capture.ts`: intent, 60 s expiry, clip recording, video request, still fallback, abort, and mode reset now live together. The dashboard only wires `request` through a ref and renders.
- `camera-clip.ts` is the single MP4 recorder used by both the frame tool and the obstacle guard (previously duplicated in `use-vision-guard`).
- `use-camera-gestures.ts` now owns the orb/camera double-tap state, timers, and spoken camera confirmation; the dashboard only passes the callbacks and the double-tap hint.
- `sign-video.ts` also uses the shared transport now (token usage included), so the Go Responses request shape exists once; the sign route's live probe returned 200 with `{transcript:"", readable:false}` on a non-signing clip, confirming the transport.
- The guard now pauses while a frame capture is recording/sending (`isCapturing`), so the two never record the same stream at once, and repeated vision failures back off from 1.5 s to 10 s instead of retrying at a fixed rate. The warning-speech timeout is cleared when `onend` fires.
- No behaviour change: live re-probes after the refactor still return a frame description, a guard warning on the obstacle clip, and silence on the empty clip.
- Verified: `bun run test` 125/125, `typecheck` clean, production build clean, oxlint clean apart from pre-existing dashboard warnings. Nothing staged or committed.

## 2026-11-02 17:05 IST (11:35 UTC) — `frame` sends a short video, not a still

- The `frame` tool now records a 2 s MP4 clip from the live camera and sends it to the video model (`/api/orb/frame`), which returns a typed description. That description enters the conversation as the follow-up user message, so the main model answers in the user's mode (speech/text/cards) without ever receiving video itself — the main Baseten chat endpoint has no video input.
- `camera-clip.ts` owns the recording helper (MP4 codecs only; the gateway rejects WebM), shared by the frame tool and the blind obstacle guard. The still-frame path remains only as a fallback when the browser cannot record MP4 or the clip pass fails.
- `frame-video.ts` validates MP4-only clips (10 MB cap), uses the strict `{description, clear}` schema, and caps the description. No clip is stored or logged.
- Live checks: obstacle MP4 → a concrete bench/table description; empty MP4 → a "no people or text" description; WebM → 400 MP4-only; the follow-up turn answered the description correctly in blind mode.
- Verified: `bun run test` 125/125 (new `frame-video.test.js`), `typecheck` clean, oxlint clean on touched files. Nothing staged or committed.

## 2026-11-02 16:59 IST (11:29 UTC) — `frame` tool: camera vision in every mode, with consent

- New `frame` tool in the base tool set, so autism, mute, deaf, blind, and accessibility-off all get it. The server cannot capture; the tool authorizes a capture, the client grabs one still from the live preview after the turn, and sends it back as the next turn's image. The model is told to wait for that image and not describe it early.
- Camera status is a first-class turn value: `cameraOn` travels with every request, renders as a `## Camera` block beside the user message, and lands in `ToolContext`. Off makes `frame` fail readably with "ask permission"; a same-round `open_camera` flips the status so `open_camera` + `frame` can run together after the user agrees.
- Client follow-through: a `frame` call sets a 60 s intent; when the turn is idle and the camera is live, it captures one frame and sends "The camera frame you requested is attached…" as a follow-up turn. If the camera was off, the intent survives until the consent turn opens it, then captures. Mode changes clear the intent.
- Blind mode keeps its existing obstacle guard; `frame` is the still-image path for “what is this?”, and the answer is spoken.
- Live checks: camera off + "What is this?" → model says the camera is off and asks; "Yes, open the camera. What is this?" → `open_camera` + `frame`; autism + camera on → `frame`, then the attached still was described correctly. Guard also still records MP4 clips.
- Tests: new `tests/frame.test.js` (registered tool, off fails with permission text, on authorizes and forbids guessing); access-mode tests updated for the base tool count. `bun run test` 120/120, `typecheck` clean, oxlint clean apart from pre-existing warnings. Nothing staged or committed.

## 2026-11-02 16:44 IST (11:14 UTC) — Obstacle guard sends fresh MP4 clips, not stills

- `useVisionGuard` now records a new 2 s clip from the live camera stream for every check and waits for the spoken warning before recording the next one; nothing is reused between warnings. A single fresh frame remains the fallback when `MediaRecorder` cannot produce MP4.
- `/api/orb/guard` accepts multipart `video` (plus JSON frame fallback) and `vision-guard.ts` sends `input_video` with the real MIME. Live probe: the gateway rejects `video/webm` ("Supported: MP4"), so only `video/mp4` is accepted; browsers without MP4 recording use frames instead of failing every cycle.
- The prompt now describes a short live clip and treats the previous warning as a wording hint only, so the current clip is judged independently.
- Live checks: 2 s empty MP4 → no hazard in 2.4 s; obstacle MP4 → "Table directly ahead, about two steps away." in 2.9 s; webm → 400 with the MP4-only message.
- Verified: `bun run test` 115/115, `typecheck` clean, oxlint clean on touched files. Nothing staged or committed.

## 2026-11-02 16:28 IST (10:58 UTC) — Double tap on the orb and the camera preview

- Blind mode: double-tapping the orb toggles the camera (and therefore the obstacle warnings). Because the orb already owns a single-tap action, that action is held for one 300 ms double-tap window and cancelled when the second tap arrives; other modes keep the immediate single tap.
- The camera preview is its own double-tap surface in every mode: single taps do nothing (and stop propagating to the orb), two taps within 300 ms toggle the camera. It announces "Camera off." / "Camera on. Obstacle warnings are active." only when the mode allows speech.
- The orb's accessible label gains the double-tap hint in blind mode; the preview label says "Double tap to turn the camera off."
- Verified: `typecheck` clean, `bun run test` 113/113, oxlint clean apart from pre-existing dashboard warnings. Nothing staged or committed.

## 2026-11-02 16:08 IST (10:38 UTC) — Vision guard output budget doubled

- `vision-guard.ts` `max_output_tokens` 1,024 → 2,048. The contract reply is tiny; the headroom is for the gateway's reasoning tokens, which made a no-hazard frame come back `incomplete` at 256. No change to the schema, prompt, or client behaviour.

## 2026-11-02 16:04 IST (10:34 UTC) — Blind obstacle warnings ride the camera; autism is the default mode

- New blind-only vision channel: `useVisionGuard` samples the live preview every 3 s, `POST /api/orb/guard` validates the mode and frame, and `lib/vision-guard.ts` asks Muse Spark for a strict `{hazard, urgency, message}` verdict. No frame is stored, and the channel never enters the conversation thread.
- It is wired to the camera, not a button: whenever blind mode has a live camera (`signStatus === "live"`), warnings run automatically; turning the camera on (button or the `open_camera` tool) is the only activation step. The guard pauses while a turn/reply is running, while the tab is hidden, and while a previous frame is still being checked. Spoken through the browser voice, with a 7 s repeat floor and an immediate cut-in for `stop`.
- Removed the cane/guide-dog disclaimer from both the blind prompt line and the UI hint, per request.
- Default mode is now autism: the bar has no off/normal state and starts on autism; tapping the active mode no longer deselects. The API keeps the internal accessibility-off path for test clients/evals, but the product UI always sends one of the four modes.
- Guard route live checks: an empty corridor frame → `{hazard:false}`, a box-obstacle frame → `{hazard:true, urgency:"caution", message:"Bench directly ahead, about two steps away."}`. `max_output_tokens` raised to 1024 after an empty frame came back `incomplete` at 256.
- Verified: `bun run test` 113/113 (new `vision-guard.test.js`), `typecheck` clean, oxlint clean on touched files, dashboard 200 after a dev-server restart (the old process held a stale module graph for the new route). Nothing staged or committed.

## 2026-11-02 15:50 IST (10:20 UTC) — Sign camera prefers the rear camera on mobile (correction)

- Corrects the 15:40 entry: "front" there meant the camera facing forward (the back/rear camera), not the selfie camera. Mobile attempts are now `facingMode: { exact: "environment" }` → ideal `"environment"` → any camera; desktop keeps the webcam preference.
- The preview now mirrors only when the active track reports `facingMode: "user"`. A rear-camera preview stays unmirrored, so text and the room are not flipped; a track that reports no facing mode also stays unmirrored.
- `useSignVideo` exposes `facing` from `track.getSettings()` and clears it on disable; the dashboard uses it for the mirror class.
- Verified: `typecheck` clean, `bun run test` 105/105, oxlint clean on touched files. Nothing staged or committed.

## 2026-11-02 15:40 IST (10:10 UTC) — Sign camera prefers the front camera on mobile

- `use-sign-video.ts` now builds an ordered set of camera constraints: on mobile it asks for `facingMode: { exact: "user" }` first, then the ideal `"user"` hint, then any camera; on desktop it keeps the ideal hint then any camera. Previously a plain `video: true` fallback could open the rear camera on phones, which made the mirrored signing preview a view of the room.
- The retry loop replaces the duplicated success handler: a live stream is attached in one place, and only constraint-miss errors (`OverconstrainedError`, `NotFoundError`) advance to the next attempt — a denied permission still stops immediately.
- Same stream powers both the signing recorder and the normal `open_camera` preview, so both now start front-facing on a phone.
- Verified: `bun run test` 105/105, `typecheck` clean, oxlint clean on the touched file. Nothing staged or committed.

## 2026-11-02 15:33 IST (10:03 UTC) — Blind mode hides the typed chatbox

- Added `chatbox` to the access capability table: false for blind, true for autism/mute/deaf and accessibility-off. The dashboard renders `<Chatbox>` only when the capability allows it, so blind mode keeps voice as the only input instead of offering a field the user cannot see.
- The check lives in `access-modes.ts` with cards/sign/microphone, so it is one table entry rather than a scattered `mode === "blind"` in JSX. Accessibility off still shows the chatbox exactly as before.
- Verified: `bun run test` 104/104 (new capability assertion), `typecheck` clean, oxlint clean on touched files. Nothing staged or committed.

## 2026-11-02 15:31 IST (10:01 UTC) — Autism mood tracker: `mood` tool, private log, analyst, doctor report

- New `mood` tool (autism only): `log` stores a 1-5 score plus the user's own short note, `trend`/`history` answer from the client snapshot, and `report` returns a doctor-ready summary for a create card. The "sub-agent" is deterministic (`lib/moods.ts`): it reads the log and returns count/average/direction/lowest/highest, so a trend answer can never be invented by the main model.
- Storage stays on device: Dexie v3 adds a `moods` store (`lib/db/moods.ts`), entries are written only from turn directives, and each autism turn attaches at most 60 recent entries as a MOOD LOG block beside the user message (never inside the cached prompt). Non-autism modes never send or store moods.
- Prompt: autism's mode section gains the log/trend/report rules plus the clinician boundary (no diagnosis, no cause claims, no treatment/medication advice; self-harm → contact local emergency services or a crisis line). Autism examples add the log → trend → reply path and the honest "I can't send it myself" line for a doctor card.
- The report is never sent by Atlas: the model creates a card titled "Mood summary for your doctor" and says the user can show or share it.
- Fixed a real registry bug the live run exposed: native tool calls deliver numbers as JSON numbers, and `validateToolArgs` silently dropped them for string-typed parameters (the model then repeated the identical mood call until the turn budget). Finite numbers are now converted to strings; tool parsers still validate range. This also repairs reminder `intervalDays`/`snoozeMinutes` for native calls.
- Verified: `bun run test` 104/104 (new `tests/moods.test.js` covers score/note validation, snapshot strictness, declining/steady/empty analysis, report contents, log directives, numeric-score validation), `typecheck` clean, oxlint clean on touched files. Live: "I feel really awful" → one `mood log` (2/5) + warm reply, no diagnosis; a declining six-entry log → "trend is down, from 3.7 to 1.7"; "send it to my doctor" → one create card "Mood summary for your doctor" with "I cannot send it myself". Nothing staged or committed.

## 2026-11-02 14:14 IST (08:44 UTC) — Accessibility modes drive prompt, tools, audio, cards, and sign

- `lib/access-modes.ts` is the single decision table: exactly four modes (`autism`, `mute`, `deaf`, `blind`) and `null` for accessibility off. No `standard` mode — off means the previous behaviour, and the base prompt is still byte-identical (16,232 chars).
- Per mode: autism keeps every tool/audio/camera with no sign; mute keeps every tool and adds sign, TTS only when the user turns voice replies on (`isSpeechEnabled`); deaf removes `speak`, refuses audio-in turns, never calls TTS, still allows cards and sign; blind removes `create`, renders no cards, and relies on speech.
- Prompt assembly is centralized: `atlas-prompt.ts` composes shared base + `instructions/modes.ts` section, and drops sections that need an absent tool (Speech for deaf; Cards/Widgets for blind). Mode examples replace the shared ones for deaf/blind so no example teaches an unregistered tool.
- Tool registration is centralized too: `toolsFor(mode)` feeds the prompt and the provider `tools` array; `restrictCalls` rejects a reconstructed call, and `executeTool` refuses anything outside `allowedTools` — hiding is not the only guard.
- Delivery is app-owned: the route only synthesizes speech when the mode permits it, and the client never primes audio, plays PCM, or falls back to the browser voice when speech is off. A mode change stops the turn/mic/signing, disables the sign camera when the new mode forbids it, and opens a fresh thread so no previous mode's history carries over.
- Sign recognition is separate from the normal camera: `open_camera` stays in every mode, while the Sign UI and `/api/orb/transcribe` accept only mute/deaf with an explicit consent flag; `null`/other modes get 403.
- Notifications: the scheduler now takes the selected mode and forces the voice channel for blind, beep for the rest (mode off keeps the onboarding/pref behaviour).
- Camera vs sign is separated in the tool surface too: `open_camera`'s description now says "the normal camera, not sign recognition" and drops "let me sign" from its trigger examples, so no mode reads a sign instruction from the shared blob.
- Blind mode also hears failures: turn and local errors are spoken through the browser voice in that mode only, so an error never exists as text alone.
- Tests: `tests/access-modes.test.js` (18 checks) covers the four ids, tool allow-lists, sign/cards/mic capabilities, voice policy, prompt isolation and section omission, and registry refusal. Verified: `bun run test` 87/87, `typecheck` clean, production build clean, 12/12 routing smoke, oxlint clean on all new/touched files (only pre-existing warnings remain elsewhere). Live against the running dev server: off/autism/blind returned PCM audio, mute returned none until `voiceReplies` was set, deaf returned none, audio posted to deaf was refused before the model, and `/api/orb/transcribe` returned 403 for autism/null and for deaf without consent. Live card check: deaf produced 4 cards with no audio, blind produced 0 cards with audio. Nothing staged or committed.

## 2026-11-02 13:38 IST (08:08 UTC) — Access mode bar UI-first (autism, mute, deaf, blind)

- New `lib/access-modes.ts`: `ACCESS_MODES` in the user's order (standard, autism, mute, deaf, blind), `ACCESS_MODE_META` labels/hints, `isAccessMode` guard. No behaviour — the turn loop, mic, and TTS never read it yet.
- New `components/dashboard/access-bar.tsx`: a horizontal toolbar (bar, not sidebar) with the four modes — Flower2 / MicOff / EarOff / EyeOff icons, `aria-pressed` single-select, tap-active-again returns to standard, live hint line under the bar.
- `dashboard-flow.tsx` holds `accessMode` state (default `standard`) and renders `<AccessBar>` above the orb; `handleAccessChange` toggles. Nothing else reads the state — motion/mic/TTS wiring is the next step, not this change.
- Tests: `tests/access-modes.test.js` locks order, meta coverage, and the guard. Verified: `bun run test` 73/73, `typecheck` clean, oxlint clean on all new/touched files (only pre-existing `dashboard-flow.tsx` warnings and vendored `public/mediapipe/**` noise remain). Nothing staged or committed.

## 2026-11-02 13:36 IST (08:06 UTC) — Prompt: legacy modules deleted, composer consolidated to one `atlas-prompt.ts`

- Deleted `instructions/rules.ts` and `instructions/index.ts` — no remaining consumer (only the re-export hub referenced them), and their rule text had already been replaced by the part modules, so they were pure drift risk.
- Folded the composer into `lib/atlas-prompt.ts` and deleted `instructions/atlas-prompt.ts`: the repo now has exactly one `atlas-prompt` file, which `model.ts` and the prompt-regression test already import. `instructions/` holds parts only — one module per rule.
- Hub aliases dropped with the legacy modules (`ATLAS_INSTRUCTION_EXAMPLES`, `ATLAS_RULES`, `ATLAS_IDENTITY`, …) — nothing imported them. `ATLAS_EXAMPLES` and `formatCurrentDate` are re-exported from the composer for existing callers.
- Verified: rendered prompt byte-identical in shape (16,232 chars, same sections, no legacy symbols), `bun run test` 69/69, typecheck clean, oxlint clean on `instructions/` + composer. Rename/extraction only — no rule text changed, so routing behaviour is unchanged. Nothing staged or committed.

## 2026-11-02 13:30 IST (08:00 UTC) — Prompt split into part modules; `improved-v1.ts` → `instructions/atlas-prompt.ts`

- `instructions/improved-v1.ts` is now `instructions/atlas-prompt.ts` and holds assembly only — imports plus the ordered section array, zero prose. Each part owns a module beside it: `header`, `objective`, `loop`, `boundaries`, `decision`, `tool-policy`, `cards` (+ widgets), `speech`, `conversation`, `examples`, `final-check`; `profile.ts` owns the `## Who you're talking to` render, `identity.ts` owns the date block.
- Legacy drift removed rather than duplicated: `rules.ts` is now a re-export barrel and `index.ts` assembles from the same part modules, so the old verbatim rule copies (which had degraded into typos and dead instructions such as "reply with tool calls only") are gone. One text per rule; editing a part changes both assemblies.
- Tradeoff, stated plainly: two files now share the `atlas-prompt` basename (`lib/atlas-prompt.ts` re-export hub vs `instructions/atlas-prompt.ts` composer) — the hub was kept so `model.ts` and tests need no change. Collapsing the hub into the composer is a one-line follow-up if the twin names are unwanted.
- Verified: rendered prompt byte-identical in shape (16,232 chars, same 12 sections in order), `bun run test` 69/69, typecheck clean, oxlint clean on `instructions/`. Routing smoke still owed for the rename-only change (no rule text changed). Nothing staged or committed.

## 2026-11-02 13:22 IST (07:52 UTC) — Examples extracted to `instructions/examples.ts`, stale copy corrected

- `improved-v1.ts` no longer carries its own `EXAMPLES` const: the worked turns moved to `instructions/examples.ts` as `ATLAS_EXAMPLES` and the composer imports it, so the live prompt and the legacy `index.ts` re-export read one text (the section had drifted into two divergent copies).
- Corrected the file that was there: the old content taught the retired JSON envelope (`\`speak\` {text: …}`), narrated results with an "after the results:" step the loop does not have, and repeated the same Bun-release request twice (success and failure). It now matches the live protocol — plain text as a speech-turn ending, real tool shapes, one example per decision path, the 404 case, the screen re-creation case, the create-split case — plus reminder create/list coverage that was missing since the tool shipped.
- Tradeoff, stated plainly: the examples module is now shared by live and legacy assemblies, so an edit there changes both; that is deliberate (one home per rule) and the legacy text is unused at runtime.
- Verified: rendered prompt 16,232 chars, section order intact, `bun run test` 69/69, typecheck clean, lint clean on both files, 12-probe routing smoke 12/12. Nothing staged or committed.

## 2026-11-02 13:15 IST (07:45 UTC) — Reminder zone-converter fix (IST stored as UTC) + readable clock grammar

- Live bug from a real turn: "remind me at 1:09 PM" stored `fireAt` 13:09 UTC (6:39 PM IST) instead of 07:39 UTC. Root cause in `zonedToUtc`: the refinement returned `guess + second`, dropping the `first` correction — correct for UTC by luck, wrong for every other zone. Fixed to `guess + first + second`, with the lesson in the comment.
- Same turn exposed two grammar gaps, both fixed: leading-clock phrases ("01:09 pm today") now parse — the dense `CLOCK_PATTERN` the user flagged is replaced by `CLOCK_HEAD_PATTERN` plus `parseClockTail` plain-vocabulary parsing (am/pm, today/tonight/tomorrow as named lists); "9 tonight" maps bare hours to PM instead of landing tomorrow morning (both clock and weekday paths).
- Model-side hardening: tool description + TOOL_POLICY now forbid ISO pre-conversion (pass the user's words through; server resolves in the client zone), titles carry the time when no topic is named, and create confirmations echo the resolved wall time (`formatInZone`) so a mismatch surfaces in speech instead of storing silently.
- Tests: IST + America/New_York regression cases (a zone bug can no longer pass on UTC-only coverage), evening mapping, bare-number refusal. `bun run test` 69/69, `typecheck` clean, oxlint clean on touched files. The user's 1:09 PM reminder stored before this fix fires at the wrong time — delete and re-create it by voice. Nothing staged or committed.

## 2026-11-02 13:06 IST (07:36 UTC) — Reminder system: model tool + Dexie store + dual-channel scheduler

- New `reminder` tool (create/list/find/update/delete/complete/snooze) wired through the full pipeline: `lib/reminders.ts` contract (relative-time grammar resolved against the caller clock, model-readable validation reasons, recurrence roll-forward, strict snapshot parse, guarded directives, blind-voice vs beep channel) → `lib/tools/reminder.ts` runner → registry (`ORB_TOOL_NAMES`, `ORB_TOOLS`, arg limits, `ToolContext` threading) → `model.ts` (snapshot injected into the user message tail, directives collected into `OmniTurn.reminders`, terminal-call + trace label) → `turn-stream.ts` (`reminders` on the `speaking` frame, degrade-not-throw sanitize) → `respond/route.ts` (snapshot + timeZone in, directives out) → `use-orb-turn.ts` (snapshot + zone per turn, directives applied to Dexie) → `lib/db/reminders.ts` (v2 store, mode pref) → `lib/reminder-scheduler.ts` (15 s poll, notification + beep on time, voice held until `aiState === "idle"`), mounted in `dashboard-flow.tsx`.
- Channel follows onboarding: `blind` hears "Reminder: {title}" via browser speech; deaf/mute/autism/mobility get beep + Web Notification (anticipates the future vision/calm/sign split); stored `reminder-mode` pref overrides both. Voice never talks over a live turn — queue-until-idle is structural, and notification + beep already fired so nothing is lost while it waits.
- Prompt touch is 3 lines (never-guess list, one TOOL_POLICY bullet, terminal-call list); `renderToolPrompt` picks the tool up automatically.
- Tradeoff, stated plainly: list/find answer from the client-sent snapshot (server has no database), so a reminder created on another device appears only after this client's store syncs — acceptable for a single-device voice assistant; snooze is voice-driven, notification buttons deferred.
- Caught by the new tests: V8 `Date.parse("at 6")` returns a 2001 fallback date — ISO acceptance is now an anchored pattern, never the parser's mood.
- Verified: `bun run test` 64/64 (33 new), `typecheck` clean, oxlint 0 errors on all touched files (pre-existing warnings in untouched lines and user-WIP dashboard code left alone), end-to-end registry check (classify → run → directive → readable failure), 12-probe routing smoke 12/12 (existing routing undisturbed by the new tool). Nothing staged or committed.

## 2026-11-02 12:33 IST (07:03 UTC) — Card spacing tighten, round 2

- Incremental: paragraphs `my-1`→`my-0.5`, headings `mt-3/mt-2.5`→`mt-2`, lists/blockquote `my-1`→`my-0.5` / `space-y-0`, `hr`/`pre`/`table` margins down one step, tables `leading-relaxed`→`leading-normal`; block stack `gap-1.5`→`gap-1`; card bodies `leading-normal`→`leading-snug`, adaptive body `py-2`→`py-1.5`.
- Tradeoff: near-minimal paragraph separation; going further risks walls of text with no paragraph break cue.
- Verified: `bun run test` 31/31, typecheck clean, oxlint clean on touched files.

## 2026-11-02 12:42 IST (07:12 UTC) — Naming doctrine replaced (subject over prefix) + media-stills/media-frames renames

- Replaced the prefix-based `## Naming rules` in `AGENTS.md` with a research-grounded doctrine (Clean Code ch2 + Google TS/JS guide + Angular 20 folder-as-namespace shift): name the subject not the context, stems are earned not stamped, suffixes mark real forks only (`-server`), toolchain-read names (`use-*.ts`, `.test.js`) are contracts, one concept one name, noise-word ban (`data/info/util/helper/manager`), ≤3 words pronounceable searchable. Old "one domain prefix per concept" mandate is gone; casing/boolean/test rules kept.
- Sanctioned renames (user-picked): `lib/sign-frames.ts` → `lib/media-frames.ts` (1 import: `respond/route.ts`), `lib/sign-stills.ts` → `lib/media-stills.ts` (1 import: `dashboard-flow.tsx`). Both files already described themselves as media context — the `sign-` stem was stale. Threads twins, orb trio, and integrity pair kept as-is with one documented distinction line each.
- Tradeoff, stated plainly: `media-*` is broader and survives future non-sign camera uses, but loses the at-a-glance link to the sign path — the pair-distinction line in AGENTS.md carries that link instead.
- Verified: `bun run test` 31/31 pass, `typecheck` clean, oxlint clean on renamed + importing files (only 3 pre-existing warnings inside user's WIP `dashboard-flow.tsx`, untouched). Stale-name sweep clean except the doctrine's own worked example and immutable historical `context.md` entries. Nothing staged or committed.

## 2026-11-02 12:31 IST (07:01 UTC) — Card spacing tighten

- Cards felt too airy (paragraph gaps ~16px + 12px block gap + relaxed leading). Tightened vertical rhythm only, no structural change: `ui/markdown.tsx` paragraphs `my-2`→`my-1`, lists `my-2`→`my-1` / `space-y-1`→`space-y-0.5`, headings `mt-4/mt-3`→`mt-3/mt-2.5`, `hr`/`pre`/`table` margins reduced; `interactive-markdown.tsx` block stack `gap-3`→`gap-1.5`; `adaptive-card.tsx` body `py-3`→`py-2`, `leading-relaxed`→`leading-normal`; `sidebar-panel.tsx` same leading change + title `mb-2`→`mb-1.5`.
- Tradeoff, stated plainly: denser cards fit more content per scroll but long walls of text breathe less; list/bullet rhythm is tighter.
- Verified: `bun run test` 31/31 pass, `typecheck` clean, oxlint clean on the four touched files (repo-wide lint still fails on pre-existing `public/mediapipe/**` vendored warnings).

## 2026-11-02 13:15 IST (07:45 UTC) — Phrase-matching audit: structured sign contract, TTS narration boundary

- Codebase-wide audit (no phrase matching to decide meaning): one real NL-phrase site found and replaced — `/api/orb/transcribe` no longer word-guesses transcripts (`Transcription:` label regex, `cleanLabel`, scaffolding phrase list, `^unclear\.?$`). `sign-video.ts` now sends a strict `json_schema` contract `{transcription, readable}` (gateway enforcement probed live: bare-prose prompts coerce into schema); parse guard `parseSignTranscription` + deterministic caps (`acceptableSignUtterance`, ≤30 words) replace the heuristics; `sign-prompt.ts` output/rules rewritten to the JSON contract (empty transcription + `readable:false` replaces the UNCLEAR sentinel). end-to-end verified on the real endpoint with a generated clip.
- New narrow TTS integrity boundary: `lib/tts-integrity.ts` — only the evidence-backed leak label ("The user hears:", observed in `baseline-orig/news-today.json`), start-of-text anchored, mid-sentence prose untouched; applied in `deepgram-server.ts` for both MP3 and PCM paths; all-label text simply isn't synthesized (stream yields nothing → client falls back; MP3 raises tts). Prompt/claims stay Gate-1/Gate-2 business.
- Dedupe: `model.ts` `speakableSegments` now reuses `looksLikeToolCall` exported from `speech-integrity.ts` (was a restated prefix check).
- Tests: +11 (tts strip behaviors; sign contract guard/caps) → 31 pass / 0 fail; typecheck clean; my files lint-clean; prompt stable section byte-identical.
- Live checks: 12-probe smoke 11/12 (`howto` missed create → variance check on the same request fired `create` with cards, so variance not regression); sign e2e returns `{readable:false, transcription:""}` on an empty clip; PCM streaming wiring OK.
- `AGENTS.md` fully rewritten (was stale/fictional file tree): accurate code map, three-gate architecture, coding rules incl. "structured over prose" principle, validation gates, prompt work rules.

## 2026-11-02 11:25 IST (05:55 UTC) — Evaluated prompt deployed live + offline CI gate

- Live prompt is now the evaluated build: `src/lib/instructions/improved-v1.ts` (ported from the agent-eval variant, prod header), wired through `atlas-prompt.ts`; legacy `instructions/index.ts` kept only for `ATLAS_INSTRUCTION_EXAMPLES`. Render verified byte-identical to the validated prompt (15,283 chars).
- Four tool files redeployed from variant-improved (`tools/{speak,start-new-chat,shutdown,open-camera}.ts` — redesigned descriptions/result texts, batched-terminal-round speak semantics). `registry.ts` untouched.
- `model.ts`: `DEFAULT_MAX_REPLY_TOKENS` 1_200 → 3_000; finish-reason "length" repair now asks the model to redo the cut-off call in one piece with tools still enabled (was force-speak, which discarded finished card work).
- `chat-message.ts` `trimHistory` hysteresis: under budget → passthrough byte-identical (cache-prefix stability); on overflow → re-cut to 60% target via new `keepPairs` helper; newest pair always kept; oversized pair clipped. Tests caught and fixed a nested-`unshift` bug in the clip path.
- New offline test suite (no network/keys): `tests/prompt-regression.test.js` (prompt invariants, forbidden legacy lines, tool surfaces via `ORB_TOOLS`), `tests/history-hysteresis.test.js` — 20 pass / 0 fail. Note: tests are `.js` because `bun:test` has no type declarations here.
- CI added (`.github/workflows/ci.yml`): install → lint → typecheck → test; live model checks stay out of CI (see `scripts/eval/README.md` gate policy). Live eval kit vendored under `scripts/eval/` (`HARNESS_APP` defaults to this repo; output `scripts/eval/runs/<label>/`); package scripts `test` and `eval:live` added.
- Verified: prompt byte-check ✔, `bun test` 20/20 ✔, `bun run typecheck` clean ✔. `bun run lint` clean on all assistant-touched files; remaining failures are pre-existing (`public/mediapipe/**` vendored JS, user WIP `src/components/**`, `src/lib/tools/registry.ts` WIP warning).

## 2026-11-02 11:30 IST (06:00 UTC) — Fabrication-claim check removed

- Deleted `ACTION_CLAIM_PATTERNS`, `matchesActionClaim`, and the `!actionsRan` gate branch. `validateSpeechClaim` now checks tool-call syntax + Markdown only. Unwound all dead `actionsRan`/`roundActionsRan` plumbing through `runSpeak`, registry dispatch/execute/runToolWithSources, `runRequest`, `executeNativeCalls`, and `endWithContent` — except the loop-local streak tracking the speak-then-act continuation needs.
- Tradeoff, stated plainly: false claims ("I'll put it on screen" with no cards) are now spoken as-is with no repair round. Markdown and tool-markup utterances are still withheld.
- Verified: `tsc` clean, oxlint clean.

## 2026-11-02 11:15 IST (05:45 UTC) — Action-claim patterns rewritten readably

- Six dense regexes in `speech-integrity.ts` became named constants (`I_DID_LOOKUP`, `SOURCE_TOLD_ME`, `ON_SCREEN`, `I_MADE_SOMETHING`, `I_WILL_PUT_ON_SCREEN`, `I_ALREADY_PUT_ON_SCREEN`) with match/skip examples in the doc comment. Behavior proven identical via differential test against the originals on 42 fixtures.
- Verified: `tsc` clean, oxlint clean.

## 2026-11-02 11:00 IST (05:30 UTC) — Group-based typo training, no memorized examples

- Removed all hardcoded typo examples (turn examples + the quoted list). New rule teaches the METHOD: sound it out ignoring missing/swapped/extra letters, match farewell/camera/fresh-start groups, act exactly as the clean phrase. Plus final-check step 0: sound out typo-filled input first, then run the checks.
- Fresh-typo live results: new chatt ✓, goodby → shutdown ✓, cemra on → open_camera ✓ (after step 0); shuttup, opn camra, rest chat still answer in text. Per-input variance dominates now — same intent flips between runs, so further wording tweaks show diminishing returns.

## 2026-11-02 10:45 IST (05:15 UTC) — Typo tool-calling fixed via prompt only

- Fallback code fully reverted (no remnants, `tsc` clean). Prompt-only hardening instead: "Speech has no side effects" hard-error rule, "Always call it — never just say it in speech alone" on all three action tools, typo turn examples (shudup/cemra/chta), and "a typo never changes the response: same tool calls as the clean phrase".
- Live proof: shudup → shutdown, strat chta → start_new_chat (newSession true), opne cemra → open_camera (was 0/3 stable fail, now fires; clean phrase still fires).

## 2026-11-02 10:30 IST (04:xx UTC) — Hard-probe sweep: typo rule works, conversational turns still text-first

- 10 typo/slang probes: greeting/camera/time/timer/search/fetch all fire correct tools THROUGH typos ("opne the cemra" → open_camera, "serch latest bun relase" → websearch+create). Typo-tolerance rule works.
- 4 failures, one family: shutup/newchat/slang-bye/howto answer in text ("Goodbye.", "New chat created.") with no tool call — model understands intent (it says the right words) but treats conversational turns as text-first. Newchat is functionally broken (claims created, nothing resets).
- Gate extended: past-tense screen claims ("I've put it on screen") + generic `<tag>` pseudo-markup in speech now withheld with repair; verified 7/7 unit checks.
- Added typo-tolerance rule to ATLAS_CONVERSATION with worked examples.

## 2026-11-02 10:15 IST (04:45 UTC) — shutdown tool stops voice after goodbye

- New `shutdown` tool (`tools/shutdown.ts`, registry, trace `Shutting/Shut down`, terminal call, policy line): on "shut up / stop listening / end the conversation" the model calls it and speaks a short goodbye first — the client ends the mic only after the reply fully finishes (`aiState` idle/error), never mid-speech, via the existing `endConversation` path.
- Verified: `tsc` clean, oxlint clean, registry/parse/dispatch/trace checks pass.

## 2026-11-02 10:05 IST (04:35 UTC) — Speak-ends-turn rule in prompt

- Wire showed the model speaking ("opening your camera") without calling `open_camera`. The prompt said "call speak last" but never stated the mechanism. `speak` tool description (native tools payload, weighed highest at decision time) now says calling it ends the turn immediately with nothing running after, so all other tools go first. `ATLAS_FINAL_CHECK` repeats it.
- Verified: `tsc` clean, rule present in both the native tool description and the rendered prompt.

## 2026-11-02 09:55 IST (04:25 UTC) — Disability question replaces talk styles

- `/start` step 5 is now "Your disability" (Blind or low vision / Deaf or hard of hearing / Non-speaking / Autistic / Mobility / Something else / Prefer not to say), single-select radio cards with the Vision/Signs/Calm helper tag, matching the reference look. Talk-style picks, skip, and review chips are gone; review shows an Access row.
- `Onboarding`/`UserProfile` carry `disability` instead of `tones`; the system prompt renders it as an access need with a one-line adaptation guide. Old stored `tones` are ignored by the parser.
- Verified: `tsc` clean, oxlint clean, `/start` 200 with "Step 1 of 5", dev server cache cleared + restarted after a stale-Turbopack false alarm.

## 2026-11-02 09:50 IST (04:20 UTC) — Single fixed voice, voice step removed

- Atlas speaks with one fixed voice (Skylar, `ATLAS_VOICE_ID` in `use-voice-preview.ts`); the "Pick my voice" step, six-voice catalog UI, and voice state are gone. Flow is now 5 steps (name/age/pace/tone/review), pace previews play in Skylar, onboarding always saves `skylar`.
- Deleted the 15 non-Skylar sample MP3s (3 remain) and narrowed `generate-deepgram-voices.mjs` to Skylar × 3 paces. `DEEPGRAM_VOICES` API catalog and voice validation stay — provider contract, not UI.
- Verified: `tsc` clean, oxlint clean (one pre-existing autocomplete warning), `/start` 200 showing "Step 1 of 5: Your name".

## 2026-11-02 09:35 IST (04:05 UTC) — /start matches atlas look

- Same shell: `GET STARTED` eyebrow, `Tell us about you.` display heading, lede, `Step X of 6` + bar progressbar, Back/Continue ink pills. Our 6 steps (name/age/voice/pace/tone/review) and logic untouched.
- Shared styles in `step-ui.tsx` follow the reference (radio cards, headings, buttons); name field uses the reference input + hint; unused `AmbientBackdrop` deleted.
- Verified: `tsc` clean, oxlint clean (only pre-existing label a11y warnings), `/start` serves 200 with all markers.

## 2026-11-02 09:20 IST (03:50 UTC) — Home page mirrors /home/sky/Projects/atlas

- Ported verbatim: pill header (orb logo, wheelchair/walker/dancer commuters, `Get Atlas` CTA with `data-cta-frame`/`data-cta-button`), hero STEPS list, `TeamSection`, full hands engine (`hands/geo,parts,press,scene,art,hand` + `hands-section`). Orb usages adapted to `ParticlesOrb` (same props).
- Commute/dance/walker/cane/step keyframes appended to `globals.css`.
- Removed replaced pieces: old header/nav/toggle (`header` rewritten; `mobile-nav`, `get-started-link` deleted), old scene (`character-section`, old `hands/*` deleted).
- Verified: `tsc` clean, oxlint clean (only `<a>`-vs-`<Link>` warnings inherited from reference), `bun run build` green with `/` static, served home 200 with all section markers.

## 2026-11-02 09:00 IST (03:30 UTC) — Orb favicon, open_camera tool, Threads to top corner

- Favicon: new `public/assets/icons/favicon.svg` (110-dot fibonacci orb, sage→white on `#1b1f23`, sage ring), layout points at it, old `.ico` deleted.
- New `open_camera` tool (`tools/open-camera.ts`, registry, trace `Opening/Opened camera`, terminal call, policy line): model calls it on explicit camera requests and speaks "Opening your camera". Client (`onToolRequest` in `use-orb-turn` → dashboard) opens the camera via the existing permission flow — permission is code's job, never the model's. If it never opens (denied/error/unsupported), a follow-up turn tells the model so it speaks "no permission — please allow camera permission".
- Threads button moved out of the bottom row to a small absolute top-right pill (`text-[11px]`, safe-area aware); Ctrl+K entry unchanged.
- Verified: `tsc` clean, oxlint clean, registry/parse/dispatch/trace checks pass, favicon SVG valid + served 200, dashboard 200.

## 2026-11-02 08:50 IST (03:20 UTC) — Prerender block from headers() in root layout

- `await headers()` in `RootLayout` blocked `/dashboard` prerendering (Next 16 flags cookie/header access outside Suspense). Removed the SSR cookie read; the layout is sync again. The inline pre-paint script alone applies the cookie/system theme before first paint, so no flash and no mismatch (`suppressHydrationWarning` stays).
- Verified: `bun run build` succeeds with `/dashboard` prerendered static, `tsc` clean.

## 2026-11-02 08:40 IST (03:10 UTC) — Storage migrated to Dexie (IndexedDB), zero legacy

- No localStorage/sessionStorage anywhere in `src` (verified by grep); all storage caps removed (50 threads, 500 msgs, title/message char limits).
- New `src/lib/db/`: `database.ts` (lazy `atlas` Dexie v1: `threads(id,updatedAt)`, `messages(id,threadId,[threadId+seq])`, `prefs(key)`), `threads.ts` (transactional save/delete, ordered load, active-thread pref), `prefs.ts` (get/set with false-on-failure).
- `threads.ts` is pure helpers now; `onboarding.ts` save/load are async via prefs; theme is cookie-based (`theme.ts` + SSR class in `layout.tsx` + BroadcastChannel cross-tab); affinity id is a cookie; `use-orb-turn`/`start-flow` await the new APIs.
- Dashboard hydrates from Dexie after mount, write-through on every mutation, sidebar list via `useLiveQuery` with props fallback.
- Verified: 21/21 fake-indexeddb checks (CRUD, order, reopen, concurrent, cascade delete, prefs, onboarding, unavailable-IDB), `tsc` clean, oxlint clean, dashboard 200.

## 2026-11-02 08:20 IST (02:50 UTC) — Chats turns panel removed

- Removed the `Chats` button, `HistoryPanel` (`history-panel.tsx` deleted), and its Ctrl+K entry. Turns are viewed via the active thread's cards; past threads live in the Threads drawer.

## 2026-11-02 08:15 IST (02:45 UTC) — + New chat button removed from main row

- Removed the prominent `+ New chat` pill from the dashboard controls row. Manual creation still available via the Threads drawer's `New chat` button and the Ctrl+K `New chat` command (both use the same `startThread`), plus the `start_new_chat` voice tool.

## 2026-11-02 08:10 IST (02:40 UTC) — start_new_chat wording simplified

- Dropped the confusing mechanics from the `start_new_chat` policy (`rules.ts`), tool description, and runner reply: now just "call it and speak a short confirmation like 'New chat created'". The when-not-to-use guard (no topic changes, fail-closed when unsure) stays. Card-dropping on reset turns is still enforced in `model.ts` code, just no longer spelled out in prose.

## 2026-11-02 08:05 IST (02:35 UTC) — ChatGPT-style threads with + button

- New `src/lib/threads.ts`: `ChatThread` (id/title/messages/createdAt/updatedAt), `createThread`, `threadTitleFor` (first user line, 60 chars), `loadThreads` (validates + sanitizes, migrates the legacy single `history` key once, always returns an active thread), `persistThreads` (shrinking retries). Caps: 50 threads, 500 messages each.
- New `ThreadSidebar` (`src/components/dashboard/thread-sidebar.tsx`): Base UI left drawer (same pattern as mobile-nav) with a prominent `+ New chat` button, thread rows (title, time-ago, message count, active highlight, hover delete), device-storage footer. Non-modal so the mic keeps running.
- `dashboard-flow.tsx`: threads + activeId state with ref mirrors and one `storeThreads` writer; `history`/`setHistory` derived per active thread so `useOrbTurn` is unchanged; `+ New chat` / `Threads (N)` buttons in the controls row; Ctrl+K entries; old `history`-key reader removed. `start_new_chat` now opens a fresh thread via `onNewSession` instead of wiping — old thread kept in the list. Tool/prompt wording updated to match.
- Verified: `tsc` clean, oxlint clean on touched files, `bun -e` thread store checks (title, truncation, persist round-trip, legacy migration) pass, dashboard serves 200 with the new buttons in SSR markup.

## 2026-11-02 07:35 IST (02:05 UTC) — History toggle not opening (reported)

- Verified the route serves 200 with the `Chats` button and `dashboard-history` markup in the HTML, so the code is live on the dev server — likely a stale tab or the panel opening below the fold unseen.
- `dashboard-flow.tsx`: opening the panel now smooth-scrolls it into view, and the toggle shows a pressed state (`border-sage text-ink`, `aria-pressed`) so the click is visibly acknowledged.
- Verified: `tsc --noEmit` exit 0, oxlint clean on both touched files (pre-existing warnings only).

## 2026-11-02 07:32 IST (02:02 UTC) — Chat history panel on the dashboard

- New `HistoryPanel` (`src/components/dashboard/history-panel.tsx`): inline aside down below the orb controls showing past turns oldest-first with newest pinned at the bottom, You/Atlas labels, timestamps, card titles, and tool traces; renders the last 100 with a count note, empty state, and Clear/Close actions. Non-modal, so mic/VAD/cards keep running.
- `dashboard-flow.tsx`: `historyOpen` state, `Chats (N)` toggle button beside the camera buttons (`aria-expanded`/`aria-controls`), `clearHistory` (empties history, closes open card, persists via the existing effect), Ctrl+K "Show/Hide chat history" command entry, and the panel section with bottom clearance for the fixed chatbox.
- Verified: `tsc --noEmit` exit 0, oxlint clean on both touched files.

## 2026-11-02 07:27 IST (01:57 UTC) — start_new_chat tool built

- New `start_new_chat` tool (`src/lib/tools/start-new-chat.ts`): optional `reason` (capped 200), runner returns `newSession: true`. Wired into `ORB_TOOL_NAMES` (`types.ts`), `ORB_TOOLS`/`ARG_LIMITS`/`dispatchTool` (`registry.ts`), and barrel (`index.ts`), so `renderToolPrompt` lists it and prompt/runtime are back in sync.
- Turn loop (`model.ts`): `TurnState`/`OmniTurn` carry `newSession`, terminal `create/start_new_chat/speak` rounds end the turn, reset turns drop cards+sources (speak-only enforcement), `reason` flows to the tool trace.
- Transport (`turn-stream.ts`, `respond/route.ts`): final `speaking` event carries optional `newSession: true`; old frames without it still parse.
- Client (`tool-trace.ts`, `use-orb-turn.ts`): `Started new chat` trace label (reason stored, label stays short); reveal replaces history with just this `[user, assistant]` pair so `persistHistory` overwrites `localStorage` and old cards disappear.
- Verified: `tsc --noEmit` exit 0, oxlint clean on touched files (one pre-existing `no-base-to-string` warning in `registry.ts:350`), `bun -e` checks for registry/parse/dispatch/cap/trace/NDJSON round-trip all pass.

## 2026-11-02 07:23 IST (01:53 UTC) — start_new_chat tool policy

- `ATLAS_TOOL_POLICY` in `src/lib/instructions/rules.ts:6` now documents `start_new_chat`: use on explicit fresh-start requests (new session/chat, start over/fresh, clear history, forget conversation, reset), once per turn with optional reason then `speak` last, speak-only no cards; never on topic change/follow-up/card fix, never twice, fail-closed when unsure.
- Note: policy mentions the tool before registry implementation (`ORB_TOOL_NAMES` in `src/lib/tools/types.ts:11` has no `start_new_chat` yet), so prompt/runtime are intentionally out of sync until the tool is built.
- Verified: tsc clean for the file, oxlint clean for the file (repo-wide lint still fails on generated `public/mediapipe` warnings).

## 2026-11-02 02:00 IST (20:30 UTC) — Hand-landmarker playground on the test console

- New Hands tab on `/test` (`src/app/test/hand-client.tsx`): live camera + MediaPipe HandLandmarker (VIDEO mode, 2 hands) with the 21-point skeleton drawn on a canvas overlay, handedness + confidence readout, same mic-style status machine (idle/loading/live/denied/error). Test-only; nothing in the translator flow changed.
- Self-hosted runtime in `public/mediapipe/` (7.8 MB `hand_landmarker.task` + SIMD/no-SIMD WASM, ~35 MB total): new `scripts/fetch-mediapipe-assets.mjs` copies WASM from the npm package and downloads the model once; chained into `postinstall` next to the VAD asset copy.
- Verified: typecheck + lint clean, production build succeeds. Live camera check left to a real browser: open `/test` → Hands → Enable camera, show a hand, watch the skeleton track.

## 2026-11-02 01:45 IST (20:15 UTC) — Best-reading bias restores all three sign reads

- Rules section now prefers the best reading of ambiguous signing (UNCLEAR only when nothing at all is readable; never invent without visible basis). Re-ran all three clips: 11_11_21 → "I love you", 11_11_42 → "I love you" (flipped back), 11_40_10 → "I love" (partial — ME + LOVE visible, YOU not clear). All match the known content.
- Verified: typecheck + lint clean.

## 2026-11-02 01:35 IST (20:05 UTC) — Sign retest: expanded lexicon flips clip 2 to UNCLEAR

- Re-ran all three clips on the 39,500-char reference prompt: 11_11_21 → "Transcription: I love you" (now with fingerspelling detail: signs I, crossed-arms LOVE, points YOU); 11_11_42 → UNCLEAR (was "Love you"/"You are loved" before — the stricter "never invent / indicate unclear" rules made the model conservative on ambiguous gesturing); 11_40_10 → UNCLEAR (unchanged, blurry/backlit).
- Prompt tokens now ~10.5–11.3k per call.

## 2026-11-02 01:20 IST (19:50 UTC) — Sign lexicon gains thinking/knowing, deaf/hearing, seeing, travel, describing sections

- Appended five subsections to the Common ASL Sign Recognition Reference (KNOW through BELIEVE, DEAF/HEARING/HEAR, SEE/LOOK AT/WATCH, VISIT/TRAVEL/FIND, GOOD/BAD/HAVE). Prompt now 35,394 chars; send cap raised to 40,000. Single source still feeds both the transcriber and the test page.
- Verified: contract intact, typecheck + lint clean. Token cost now ~11k per call.

## 2026-11-02 01:10 IST (19:40 UTC) — Sign prompt replaced with full ASL reference in parts

- `src/lib/sign-prompt.ts` holds the user's full ASL reference as 7 named parts (role, A–Z fingerspelling, recognition parameters, the new Common ASL Sign Recognition Reference lexicon, fingerspelling rules, recognition rules, output) joined into `DEFAULT_SIGN_PROMPT` (31,405 chars). `sign-video.ts` imports + re-exports it (cap raised to 32,000); the test client imports it too — mirror const deleted, single source. Output keeps the `Transcription:` last-line + UNCLEAR contract and the on-screen-text ignore rule.
- Live verification on the three Downloads clips: 11_11_21 → "Transcription: I love you" (point-self + crossed-arms LOVE + point-viewer composed correctly); 11_11_42 → "Transcription: You are loved"; 11_40_10 → UNCLEAR (no clear lexical signs found). Prompt tokens now ~9.5k per call — the lexicon's accuracy-for-tokens trade.
- Verified: typecheck + lint clean, production build succeeds.

## 2026-11-02 00:50 IST (19:20 UTC) — Sign prompt replaced with full ASL reference, divided in parts

- New `src/lib/sign-prompt.ts`: the user's full ASL reference as 7 named parts (role, fingerspelling A–Z, recognition parameters, common-signs lexicon, fingerspelling rules, recognition rules, output), joined into `DEFAULT_SIGN_PROMPT` (13,010 chars). `sign-video.ts` imports + re-exports it (routes unchanged) with the send cap raised 4,000 → 14,000; the test client imports it too — the duplicated mirror const is deleted, single source now.
- Two adaptations flagged: output keeps the machine-readable `Transcription:` last line + UNCLEAR contract (the route parser depends on it), and the on-screen-text ignore rule is preserved (test videos have prominent background text).
- Live verification on the three Downloads clips: 11_11_42 now transcribes "Love you" (was UNCLEAR — point + crossed-arms LOVE fired); 11_11_21 and 11_40_10 still UNCLEAR per the model (no clear lexical signs found). Prompt tokens roughly doubled (~4.8–5.6k vs ~2.7–3.5k) — accuracy for tokens trade.
- Verified: typecheck + lint clean, production build succeeds.

## 2026-11-01 22:25 IST (16:55 UTC) — Turn anatomy follows the cookbook agent-loop contract

- Per the Meta basic-agent-loop recipe, `identity.ts` Turn anatomy is now receive → think → act → observe → evaluate: explicit done-criterion (cards created for material, then one approved `speak`; otherwise loop back) plus the remaining guards (90-second turn budget, user stop, no-repeat dedupe). No max-iteration rule re-added — that removal stands.
- Verified: renders, typecheck and lint clean. Also noted: the file's Loop rules no longer carry the "never call speak in the same round" line — that predates this change (working-tree state), left untouched.

## 2026-11-01 22:20 IST (16:50 UTC) — Chatbox attachments actually deliver files

- Before, picking a file only pasted its name ("attached: x") into the message. Now the `File` travels: new `src/lib/attach-file.ts` validates (images + text only, 10 MB cap, audio/video/executables rejected with readable errors) and converts — images to downscaled JPEG data URLs, text inlined (12k chars, truncation marked).
- `chatbox.tsx` carries the File, validates on pick with an inline error, passes it on send. `dashboard-flow.tsx sendTextWithMedia` routes images through the existing end-to-end `mediaFrames` path (same as sign stills; route already forwards them as `image_url` parts on text turns) and inlines text as an `[Attached file]` block; conversion failure aborts with a caption error.
- Verified: typecheck + lint clean, validation matrix + truncation pass in bun, production build succeeds. Image canvas conversion needs a browser to exercise live.

## 2026-11-01 22:10 IST (16:40 UTC) — Sign support scoped to ASL only

- Prompt opening restored to "Transcribe the American Sign Language signing in this video." All other language references removed (BSL/Auslan/ISL alphabet comparison collapsed to "ASL fingerspells one-handed"), and the UNCLEAR rule now also covers non-ASL signing. Language-general knowledge kept (symmetry, transition-vs-content, pointing grammar, handshape pairs, depicting verbs, mouth patterns, non-manuals).
- Verified: mirrors identical, typecheck and lint clean.

## 2026-11-01 22:05 IST (16:35 UTC) — Sign prompt loaded with sign-language knowledge

- `DEFAULT_SIGN_PROMPT` (mirrored in the test client) rewritten: generic "Transcribe the sign language in this video" opening instead of hardcoded ASL plus a decide-which-language clause; new knowledge added — two-handed symmetry/dominance conditions, transition-vs-content movement, pointing as pronoun grammar with verb agreement, A/S/C/G/D handshape minimal pairs, depicting verbs, mouth patterns, non-manual grammar, per-language manual alphabets.
- Also fixed the prompt cap in `transcribeSigningVideo` (500 → 4000 chars): the old slice silently cut the prompt mid-sentence, so most of the detail never reached the model. New prompt is 3,510 chars, fully delivered. `Transcription:`-last + UNCLEAR contract unchanged, so the route parser is untouched.
- Verified: mirrors identical, typecheck and lint clean. Live signing test still needed to confirm better reads.

## 2026-11-01 21:55 IST (16:25 UTC) — Boundaries rule now refuses rather than informs

- `rules.ts` medical/legal/financial line replaced: Atlas now says it is not qualified to give that type of advice (beyond it), the user must consult a qualified professional (a doctor for medical), and no general information as substitute. Old "give general information and point to" wording gone from the rendered prompt.
- Verified: renders, typecheck and lint clean. Live-turn confirmation still pending (no API key here).

## 2026-11-01 21:45 IST (16:15 UTC) — Final check gains speak-last rule

- `rules.ts` final check adds item 7: call `speak` last — every search, fetch, and `create` first, then speak about the finished result. Matches the existing loop shape (a successful speak already ends the turn) and reinforces rule 19's create-before-speak order.
- Verified: rule renders in the built system prompt, typecheck and lint clean. Live-turn confirmation still pending (no API key here).

## 2026-11-01 21:30 IST (16:00 UTC) — Prompt fix: guide-promise without cards was a wording loophole, not a code hole

- The coffee wire (speak-only "here's a complete beginner-friendly guide...", zero `create` calls, turn finalized) passed all three `validateSpeechClaim` rules: plain text, no Markdown, no ACTION_CLAIM match. Code-gate approach started then reverted per direction: prompt problem, not code problem.
- Diagnosis from the full prompt text: `ATLAS_CARDS` rule 19 banned saying "a card, step, timer, or sidebar is on screen" — the model's "here's a complete guide" promised screen material without any banned noun, complying with the letter while violating the spirit. One-variable fix in `rules.ts`: the ban now covers paraphrases (guide/tutorial/walkthrough/steps with "here's"/"below"/"ready", plus step enumeration) until the `create` result is back. No other prompt or code touched.
- Verified: rendered prompt contains the rule (12,930 chars), `bun run typecheck` clean, lint clean for the file. No live confirmation yet (no API key in this environment) — confirm with a live "teach me coffee" turn: expect create-then-speak, not speak-only.

## 2026-11-01 21:09 IST (15:39 UTC) — Voice input upgraded from energy-gate VAD to Silero V6

- Replaced the hand-rolled RMS + zero-crossing-rate VAD (`voice-activity.ts`, `use-voice-activity.ts`, deleted) with `use-silero-vad.ts` on `@ricky0123/vad-web@0.0.31` (`model: "v6"`, ONNX Runtime Web). Thresholds stay near the library defaults (`positive 0.3 / negative 0.25`); patience is tuned for slow speakers: `redemptionMs 1800` (was 1000 ms silence), `preSpeechPadMs 800` (replaces the old 4 s warm-recorder pre-roll), `minSpeechMs 300` (was 200 ms voiced-audio floor; blips now misfire inside the VAD).
- One microphone capture: `use-voice-level.ts` keeps owning the stream/`AudioContext`/level meter and exposes a `getStream()` borrower; the VAD borrows it with no-op `pauseStream`/`resumeStream` and keeps its own worklet context. All `MediaRecorder` clip machinery (`recording`, `clipBlob`, warm pre-roll timers, 20 s safety discard) is gone from the voice path — `onSpeechEnd` delivers 16 kHz mono `Float32Array`, encoded via `encodeWav` into the unchanged `respond()` → `clipToWav` → `/api/orb/respond` pipeline. Sign-video recording still uses its own `MediaRecorder`.
- Half-duplex preserved: model load/teardown follow `micLive`, `active` pauses/resumes listening without unloading the model (300 ms arm idle, 900 ms after a reply). `start()`-during-`pause()` races re-align through `activeRef`; mic-off during an in-flight `start()` gets a bounded 2 s settle-then-destroy. Permission denial, disconnects, model-load and mid-arm failures surface as before plus a new `vadError` caption; `userSpeaking` drives a `Hearing you…` caption and `Loading voice detection…` shows during model fetch. A busy check drops a segment completing in the same tick a turn starts so it can never abort the in-flight turn.
- Assets: `silero_vad_v6.onnx` + `vad.worklet.bundle.min.js` self-hosted in `public/vad/` via new `scripts/copy-vad-assets.mjs` (`postinstall`); ONNX `.wasm`/`.mjs` loads from a `onnxruntime-web@1.31.1`-pinned jsDelivr path (added as an exact direct dependency).
- Verified: real FrameProcessor run with scripted probabilities — 1 s mid-utterance pause stays one segment, 150 ms blip misfires, two words 2.5 s apart split, 800 ms pre-pad present; WAV glue outputs valid 16 kHz mono PCM16; `bun run typecheck` clean, `bun run lint` exit 0 (warnings only, none new), `bun run build` succeeds with vad-web + ort in a lazy client chunk. AGENTS.md voice/VAD sections updated. No live-mic browser test (no browser in this environment) — confirm on device: first-syllable capture, pause tolerance, and turn handoff.

## 2026-10-31 08:31 IST (03:01 UTC) — Fix `no_reply` after action rounds: forced answers keep the speak tool

- Root cause: after a turn created a card or ran another action, `forceAnswer` requested the final answer with tools disabled but still validated it through `validateSpeechClaim`. Rule B requires every utterance after an action to cite an execution, and only a native tool call has an `evidence` slot. A tools-free plain answer could therefore never pass, so any action turn that reached the round cap was guaranteed to fail with `no_reply`. The forced prompt also told the model to use the speak tool while suppressing it.
- `model.ts` now sends only the `speak` tool with `tool_choice: { type: "function", function: { name: "speak" } }` for the final answer; `runModelTurn` accepts `forceSpeak` and `callModel` applies the restricted toolset. The length-truncation retry uses the same forced-speak request instead of a tools-free plain-text retry, so a cut-off turn can still produce a validated utterance with evidence.
- Reworded both prompts: the forced round blocks search/fetch/create/time calls and requires speak, while the length retry asks for a focused plain-text speak answer. Plain-content fallbacks still pass through the same integrity gate and still fail closed.
- Tests: `omni-stream.test.js` adds a regression where create succeeds, two plain replies are withheld, and the forced request must carry only `speak` plus the forced `tool_choice`; the forced answer then succeeds by citing `exec_1`. The existing forced-answer and length-retry tests now assert the speak-only shape and the updated prompt. A live Baseten check returned a forced speak call with `evidence:["exec_1"]` after a mocked create plus two repairs, and the turn completed with one card.
- Verified: `bun test tests/` 325 pass / 0 fail, `bun run typecheck` clean, `bun run lint` exits 0 with the same 31 pre-existing warnings.

## 2026-10-31 08:22 IST (02:52 UTC) — Floating AI wire panel for turn debugging

- New `src/components/dashboard/turn-debug-panel.tsx`: a non-modal, fixed top-right panel on `/dashboard` with `Events`, `Model`, and `Turn` tabs. The bug-icon launcher opens it; `Ctrl/Cmd+Shift+D` and the Ctrl+K command entry `AI wire (JSON)` toggle it, and Escape closes it. It shows the last turn only, copies the active tab as JSON, clears the capture, and has a one-line test prompt that sends through the normal `sendText` path. PCM frames are aggregated by count, approximate decoded bytes, and sample rate so base64 never floods the DOM; the header shows status, elapsed time, and event count.
- New `src/lib/turn-debug.ts`: `TurnDebug`/`TurnDebugRound`/`TurnWire` contracts, `isTurnDebug`, `eventSummary`, `displayTurnEvent`, `withoutTurnDebug`, `wireJson`, `formatWireBytes`, and `MAX_WIRE_FRAMES` (240). The Events tab labels every frame; the Model tab renders content, collapsible reasoning, tool calls with parsed arguments, usage counters (prompt/cached/completion/reasoning/audio), and the untouched `raw response JSON`.
- Server capture is opt-in and gated: the client sends `debug` only when `NODE_ENV !== "production"`; `api/orb/respond` attaches raw payloads only when the request asks and `NODE_ENV !== "production"` or `ATLAS_DEBUG_TURNS=1`. `model.ts` keeps the exact parsed Baseten payload per model call (including length retries and the forced-answer round) with the round index, turn-relative `atMs`, duration, and whether tools were enabled; `finalize` attaches the rounds to `OmniTurn.debug`, and the route adds them to the final `speaking` frame. No API key or request headers are copied.
- `turn-stream.ts` accepts an optional `debug` on `SpeakingEvent`, strips malformed debug data without discarding the reply, and adds an `onEvent` debug tap that fires for every valid frame before dispatch — including an `error` frame before it throws. `use-orb-turn.ts` records the wire from that tap, aggregates PCM, marks the turn `running | done | error | stopped`, and exposes `wire`/`clearWire`; history and `sessionStorage` are unchanged.
- Tests: new `tests/turn-debug.test.js` covers the guard, display, summary, and copy helpers; `turn-stream.test.js` covers debug passthrough/sanitization and the error-frame tap; `omni-stream.test.js` covers per-round capture, the length retry, and the no-secret assertion. Verified `bun test tests/` 324 pass / 0 fail across 26 files, `bun run typecheck` clean, and `bun run lint` exits 0 with the same pre-existing warnings. Mocked and real Playwright runs on `/dashboard` confirmed the Events and Model tabs and the raw provider payload with no console errors.

## 2026-10-30 23:58 IST (18:28 UTC) — Execution-integrity architecture: ledger, speech isolation, and the final-response gate

- New `src/lib/execution-ledger.ts`: one ledger per turn gives every tool call an `exec_N` record (`running → succeeded | failed`), dedupes identical calls (tool + arguments + evidence) by reusing the stored record — a repeated identical call is stamped "was not re-run" and can never overwrite the stored outcome (first completion wins). `markDelivered` tracks which results the model actually saw; `hasActionAttempts()` excludes speak records; `executionStamp()` prefixes every tool message with `[execution exec_N succeeded|failed]`.
- New `src/lib/speech-integrity.ts` (`validateSpeechClaim`): the final-response gate. Citations must be real, delivered, settled, non-speak executions (rule A); once actions ran, every utterance must cite at least one execution (rule B); success-claim phrasing pinned only to failed executions is rejected (rule C); in a turn with no actions, action-claim phrasing alone is rejected (rule D); tool-call JSON arriving as text is structurally rejected, never executed; and Markdown/code formatting in speech is withheld because TTS reads it literally — formatted content goes to `create` and speak stays plain text. `ACTION_CLAIM_PATTERNS` is a tightly scoped backstop only, not the primary mechanism.
- `src/lib/tools/types.ts`: requests carry protocol-level `evidence` (nullable `["array","null"]` speak slot, max 8, collected by `collectEvidence`, never inside the argument caps or argument limits); new `ToolRunContext` threads `{ledger, record, evidence}` into execution.
- `src/lib/tools/registry.ts`: `executeTool(name, args, signal?, context?)` returns the raw `ToolOutcome` and completes the ledger record with the real result (`runToolWithSources` stays as the historical `ToolResult` wrapper); request parsing extracts `evidence` from beside `tool` or inside `arguments`; `renderToolPrompt()` now stamps and documents the evidence contract; speak's `text` cap set to 4 000 (was silently the 400 default).
- `src/lib/tools/speak.ts`: evidence schema + gate validation in `runSpeak` (no ledger → legacy receipt); withheld utterances return model-readable failure text. websearch/webfetch runtime failures now return `ok:false` (instead of ok:true with instructive text) so the ledger records them as failed and they can never back a success claim; empty search results stay citable.
- `src/lib/model.ts` rewritten: `interceptJsonToolCalls` removed (plain-text JSON is never replayed as tool calls — Exa cannot be triggered by text); speech isolation — segments are buffered during rounds and `onSpeakDelta` fires only in `finalize`, after validation, so TTS receives exactly the approved speech; execution begins synchronously in call order before promises run, so a same-round speak sees its sibling attempts; terminal rounds require all calls succeeded AND all create/speak AND an approved segment; non-terminal rounds push stamped tool messages and mark delivery; plain content is committed with empty evidence and, when rejected, pushes a corrective message and loops within the round cap; `forceAnswer` validates leftover speak/plain and throws `no_reply` on unsupported claims; `finalize` throws `no_reply` before emitting when nothing speakable survived.
- New tests: `tests/execution-ledger.test.js` (25 checks: ledger semantics + gate rules A–D + plain-text rule + pattern scope) and `tests/execution-integrity.test.js` (17 end-to-end mocks of the eight traced vulnerabilities: failed create + success claim, failed search + fabrication, plain-text claim, length-retry claim, forced answers supported/unsupported, JSON-as-text never executed, deduped failed search, TTS deltas only at finalization; plus markdown→create repair, stamps reaching the model, empty-citable searches, ordinary conversation, distinct repeated actions). omni-stream fixtures updated: `finalTurn` accepts `evidence`, the speak+create mixed round now repairs on the next round citing `exec_1`.
- Verified: `bunx tsc --noEmit` clean; `bun run lint` 31 warnings (below the 33 baseline; the former rules-of-hooks errors from `useTranscript` are gone — renamed `applyTranscript`); `bun test tests/` 303 pass / 0 fail across 25 files.

## 2026-10-30 22:32 IST (22:32 UTC) — Prompt updated to describe the next button as a pressed action button

- `instructions/rules.ts` Next-buttons section now matches the widget the user actually sees: the tag renders as "a real action button the user presses"; `label` is told to be an action ("Start step 2" beats "Next"); `send` is phrased so the first press is the whole request; `show` opens in the same click as the send; and the press-once model is stated ("presses once per turn… after the reply it is marked sent"), so the model does not write prompts expecting repeated presses.
- `tools/create.ts` tool description now says the next widget renders as an action button pressed once to continue, so the generated tool prompt stays in sync with the system prompt.
- All pinned strings from the next-button prompt tests survive; verified `bunx tsc --noEmit` clean, lint unchanged at 33 warnings, `bun test tests/` 263 pass / 0 fail.

## 2026-10-30 22:30 IST (22:30 UTC) — NextCard renders through the shared Base UI Button

- `NextCard` now renders through `@/components/ui/button` (`ButtonPrimitive` + `cva` variants) with `variant="outline"` instead of a hand-rolled `<button>`; hover/focus/disabled states come from the shared variants, with `hover:border-sage/40 hover:bg-sage-wash` and a full-width `rounded-xl` mono label kept as `className` to match the card look. The one-press contract is unchanged: press opens the `show` card and/or sends the fixed `send` prompt once, busy turns become a Continue press, a failed/stopped turn re-enables the button, and the `Sent` state disables with a check icon and "Sent to Atlas" status. An `aria-label` now names the button (label plus "(sent)").
- `TimerCard`'s Start/Pause/Reset/Continue controls still use their own small circular styles; converting them was out of scope for this change.
- Verified: `bunx tsc --noEmit` clean, lint still at the 33 pre-existing warnings (warning count unchanged, none new for `next-card`), `bun test tests/` 263 pass / 0 fail.

## 2026-10-30 22:26 IST (22:26 UTC) — Markdown stack refined: dead code killed, parser deduped, GFM tables styled

Code review scored the three markdown files (parser 9/7, renderer 7/6, glue 9/8 out of 10 for function/writing) and the agreed refinements:

- `lib/interactive-markdown.ts`:
  - Deleted the six alias constants (`TIMER_*_MAX`/`NEXT_*_MAX` — byte-identical aliases of `WIDGET_*`, imported nowhere).
  - Removed the production-dead `pending` flag from `ParsedInteractiveMarkdown` (only two test assertions read it; `create.ts`, the renderer, and `plainTextFromMarkdown` use `blocks` only). Unterminated-tag detection is unchanged — still an `invalid` block carrying `/>` in the reason.
  - New exported `parseWidget(tag, body)` with overload signatures that keep `name` and `attrs` correlated is now the single validation path for both tags (shared allowlist, bounds, label/send/show checks); `parseTimerAttributes`/`parseNextAttributes` are 3-line wrappers that keep their `{ok, attrs}` test shapes. The loop's copy-pasted next/timer branches are gone (tag dispatch via ternary so the overload stays correlated).
  - Module-level `TIMER_BOUNDS_FAIL` string replaces the duplicated bounds sentence.
- `components/ui/markdown.tsx`: GFM tables are now styled (scrolling wrapper with rounded border, hairline `border-line` rows, mono header row) instead of falling back to raw browser tables in a ~320 px card column; the prompt actively pushes tables, so this closes a real gap. Added `h4`/`h5`/`h6` heading styles that previously fell back to browser defaults, and a subtitle-styled `del` for GFM strikethrough.
- `components/dashboard/interactive-markdown.tsx`: the malformed-widget error paragraph is extracted into a named `WidgetError` component; render logic unchanged.
- `tests/interactive-markdown.test.js`: the two `pending` assertions were replaced by behavior-level ones (block count 4; the unterminated-tag test keeps its type sequence and `/>` reason assertions).
- Verified: `bunx tsc --noEmit` clean, no lint warnings for the touched files, `bun test tests/` 263 pass / 0 fail.

## 2026-10-30 22:12 IST (22:12 UTC) — AdaptiveCard: animated open/close panel

- The card panel no longer mounts/unmounts on `open`; it is always mounted and animates with a `grid-template-rows` 0fr → 1fr slide plus an opacity fade (300 ms ease-out, `transition-[grid-template-rows,opacity]`). The one-line collapsed preview animates the opposite way (1fr → 0fr + fade) so the header swaps preview for panel in one motion; the chevron rotation and shadow also ease at the same duration. `prefers-reduced-motion` gets `transition-none` everywhere (instant open/close).
- Because the panel is always in the DOM, the collapsed one gets `aria-hidden={!open}` and `inert={!open}`, so links/timer/next widgets inside a collapsed card are not focusable, clickable, or screen-reader reachable — matching the old unmounted behavior. Unstarted timers in hidden cards stay idle (timers are explicitly started), so no auto-send can fire from a card the user never opened.
- Verified: `bunx tsc --noEmit` clean, lint at the same 33 pre-existing warnings (none for `adaptive-card`), `bun test tests/` 263 pass / 0 fail.

## 2026-10-30 21:58 IST (21:58 UTC) — Prompt rewrite: card path is a hard gate, no JSON envelope for create/speak, false-claim fix

Fixed the screenshot failure where Atlas said "I've put the full guide on cards" with no cards on screen: the model could promise cards in `speak` without ever calling `create`, because parts of the prompt still taught the removed `{"transcript","speak"}` JSON envelope and a JSON request object for every tool. Completed the in-tree rewrite the tests already pinned:

- `tools/registry.ts` `renderToolPrompt()`: `websearch`/`webfetch`/`get_current_time` keep their `Request:` JSON shapes (the server still accepts both shapes for the info tools); `create` and `speak` now render an `"Arguments:"` shape with **no** `{"tool":"create"}` envelope, so the model is never taught to write a card as text JSON. The "Running a tool" line that said "answer with the normal {"transcript","speak"} object" is replaced with "call the next tool, or call `speak` with your answer".
- `instructions/identity.ts`: speak/create bullets describe parameters in prose instead of JSON braces; card path is now a hard gate — "your reply this round is only the create tool requests. No speak, no summary, and no plan text. A promise is not a card. A missing card is a broken answer."
- `instructions/rules.ts`: the same hard-gate copy in the duplicated path decision; "A numbered plan is still the card path when it has more steps than the six-card limit: group related steps into at most six cards"; the claim rule is now "Never claim that steps, details, or a card are on screen unless you called create this round. A promise is not a card…" (no backticks, so it survives as a checked phrase); Conversation gains "Length: let the answer be as long as the request needs".
- `instructions/examples.ts`: examples reworded to "Bun vs Node.js for a small API. Use a table." and "How TCP handles packet loss. Explain it in about four paragraphs."
- `lib/model.ts`: `interceptJsonToolCalls` no longer imports `json-extract`/`extractJsonValue` — it `JSON.parse`s bare JSON content and classifies through `classifyToolOutput`, keeping the replay safety net for JSON-in-content (fenced/prose JSON now falls through to the plain-content path). This is the last `json-extract` consumer outside the registry's text parser, so `json-extract` is now registry-only.
- Verified: `bun test tests/` 263 pass / 0 fail (all 7 previously failing prompt/model tests now pass), `bunx tsc --noEmit` clean, lint at the same 33 pre-existing warnings with none new.

## 2026-10-30 21:49 IST (21:49 UTC) — Dashboard cards: auto-open first card, open on hover

- `AdaptiveCard` gained an optional `onHover` prop fired on `pointerenter` at the card root. The handler is skipped for `pointerType === "touch"`, because a touch tap fires a synthetic pointer-enter that would immediately re-open the card the same tap's click just collapsed. Hover follows the existing one-open-card model: hovering a card opens it and closes the previous one, and the card stays open after the pointer leaves. Clicking the header still toggles (open/close) as before.
- `DashboardFlow` now auto-opens the first card of a new turn: the effect keyed on `lastAssistantId` that used to reset `openCardId` to `null` instead sets `openCardId` to `cards[0]?.id ?? null`, so a fresh reply's first card is readable without a click (also covers a session restored from `sessionStorage`, where the hydrate changes `lastAssistantId`). The existing `cards`/`openCardId` guard effect is unchanged and still closes a stale id.
- Verified: `bun run lint` (no new rule categories — the auto-open effect reuses the file's existing `set-state-in-effect` pattern) and `bun test tests/` (256 pass, 7 pre-existing failures in `atlas-prompt`/`omni-stream` confirmed present with this change reverted, from the earlier prompt-rewrite work in the tree).

## 2026-10-31 IST — OpenCode-inspired rewrite (native tools, speak-in-loop, layered prompt, typed errors, Result, retry, validation)

- Migrated the orb to **native-only tool calling**: every model action is a native `tool_calls` entry; `speak` is now the fifth tool (`tools/speak.ts`) whose segments concatenate into `OmniTurn.speak`. The JSON `{"transcript","speak"}` envelope and `parseTurn`/`normalizeTurn` path in `orb-turn.ts` were removed; `orb-turn.ts` now exports only `normalizeSpeech` + `MAX_TRANSCRIPT_CHARS`. The forced-answer round asks for a `speak` tool call. `speak` can be called multiple times per turn and `onSpeakDelta` fires per segment for interleaved TTS (Task 4 wiring done in Task 3; `route.ts` already supports multiple `speak-delta` frames via the sentence chunker).
- Decomposed the monolithic prompt into **layered instruction modules**: `instructions/identity.ts` (persona + Today block + `formatCurrentDate`), `instructions/rules.ts` (priority, cards, timers/next, conversation, uncertainty, final check), `instructions/examples.ts` (few-shot pairs), `instructions/index.ts` (composes `renderToolPrompt()` + layers). `atlas-prompt.ts` is now a thin re-export. Net new behavior: none — byte-identical prompt output, verified by 18 existing prompt tests plus 3 new layer tests.
- Good-code hardening: **6A** `orb-errors.ts` now has 9 codes (`fetch_failed`, `search_failed` added) and `webfetch.ts`/`websearch.ts` throw `OrbError` instead of bare `Error` (typed errors); **6B** `tools/types.ts` adds `ToolOutcome` (`{ok:true;result}|{ok:false;error}`) and every `runXxx` returns it — `runToolWithSources` unwraps at one boundary; **6C** new `src/lib/retry.ts` (`withRetry` + `retryAfterMs`) with jitter + `Retry-After` header, wired into busy retries in `model.ts`/`route.ts`; **6D** `registry.ts` now has a `validateToolArgs` helper centralising `isNullable` + caps + `required` checks.
- `json-stream.ts` is now dead code (no `src/` importer) — kept because `tests/sse.test.js` still covers it; `json-extract.ts` stays because `registry.ts:parseToolRequest` still uses it. Cleanup deferred per plan 6F.
- `AGENTS.md` updated: `src/lib/instructions/` tree, `tools/speak.ts`, native-only `model.ts` note, minimal `orb-turn.ts` note.

## 2026-10-30 13:08 IST (07:38 UTC) — Teaching requests take the card path, prompt caps removed

- `atlas-prompt.ts` now names teach, show-how, walk-through, and guide requests as explicit card-path triggers. "teach me", "show me how", "walk me through", "how do I make…", and "give me a guide" are treated as procedure requests even when they sound conversational, and a matching "Can you teach me how to make coffee?" example creates two step cards before it speaks. This closes the false-claim failure where the model said it had put a guide on screen without calling `create`.
- Removed the remaining behavioral caps from the prompt: the `MUST` emphasis, the "two to four sentences / under 100 words" speech target, the "one sentence" speech-path threshold, the "at most one clarifying question" limit, the "concise" persona adjective, and the "do not create a card just to fill the screen" rule. Spoken length is left to the model; technical limits enforced in code (card title/content, timer range, widget attributes, card count, tool rounds) remain stated.
- `createTool.description` names teach/show-how/walk-through/guide requests in its card-path list, so the generated tool prompt matches the system prompt.
- Tests: `atlas-prompt.test.js` pins the new triggers, the coffee example, the absence of `MUST`/word/sentence/clarification caps, and the softened speech labels; `create.test.js` pins the teach/guide description. `bun test tests/` 250 pass.
- Live probe against the real model: the six-run "can you teach me how to make coffee" check returned cards in 6/6 runs with no false screen claim.

## 2026-10-30 13:00 IST (07:30 UTC) — Next buttons for guided cards

- Added `<next label="…" send="…" show="…" />` as the second safe card widget. It is a block-level tag at column 0 outside code fences. `label` (≤80) defaults to "Next", `send` (≤500) becomes a new user turn when pressed, `show` opens and scrolls to the target card, and at least one of `send` or `show` is required. Timer-only attributes are rejected on `next`, and next-only shape rules do not loosen the timer.
- `src/lib/interactive-markdown.ts` now has per-tag attribute allowlists and a shared `WidgetBlock` union. `parseNextAttributes` validates the button; malformed next tags render the same inline error as malformed timers.
- New `src/components/dashboard/next-card.tsx` renders the button. Pressing it opens `show` and sends `send` once. While a turn is busy, both actions wait behind Continue so the source card stays open and the action cannot duplicate or cancel a running turn. `interactive-markdown.tsx` dispatches `timer` to `TimerCard` and `next` to `NextCard`.
- Prompt/tooling: `atlas-prompt.ts` documents when to use next instead of a timer, the action requirement, and a two-step router example; `createTool.description` and its id hint mention `<next>`. `AGENTS.md` records the updated contract.
- Tests: `interactive-markdown.test.js` covers next parsing, defaults, single-action forms, timer-attribute rejection, bounds, code fences, and preview text; `atlas-prompt.test.js` and `create.test.js` pin the prompt/tool text. `bun test tests/` 248 pass; `bun run typecheck` clean; `bun run lint` warnings only; `bun run build` succeeds.
- Live check: the focused API harness's `next-button` case passed; the model produced `step-1`/`step-2` and a `<next label="Next: Reconnect & test" show="step-2" send="Step 1 is done, router is back on. Show me step 2." />` button. A Playwright pass over `/dashboard` with a synthetic session confirmed show-only navigation opens the target without a turn, and the combined button sends exactly one turn with the fixed prompt.

## 2026-10-30 12:49 IST (07:19 UTC) — Card-path prompt and live API eval

- Rewrote `src/lib/atlas-prompt.ts` around a hard path decision. The **card path** (steps, recipes, plans, lists of three or more, comparisons/tables, code, exact text, multi-part explanations, sources, timers) must open with `create` before any normal answer. The **speech path** (greetings, one-sentence facts, clarifications, refusals, acknowledgements) creates no cards. Added “A promise is not a card”, “no cards means no card/screen/timer claim in speak”, identity/persona locking, and a “group more than six steps into at most six cards” rule.
- Added targeted few-shot examples for step cards with a timer, comparison tables, and four-part explanations; kept the speech-only and search/fetch examples. The timer contract now states the 30-minute cap and requires either a capped 30-minute card with a `send` prompt or a question, never a claim that a timer is running.
- `createTool.description` now names the card path as the first reply and uses `timer={…}` plus “Set timer to the real wait in milliseconds; there is no default”, so 5000 is not treated as a fixed default.
- Tests: `atlas-prompt.test.js` pins the path gate, no-claim rules, grouping, timer cap, and the new examples; `create.test.js` pins the no-default timer text and the absence of `timer={5000}`. `bun test tests/` 240 pass; `bun run typecheck` clean; `bun run lint` exit 0 (warnings only); `bun run build` succeeds.
- Live API eval against `POST /api/orb/respond` (text turns, TTS cancelled after `speaking`): 28 cases covering no-card boundaries, recipes/timers, 10-step plans, code, tables, long explanations, search, weather, current time, fetch, private/file URLs, search injection, history, prompt injection, and unintelligible audio. Initial 25/27 hard cases passed. The failures exposed a real gap: recipe, comparison, and long-explanation requests produced “I've put it on screen” with no `create` call; an over-limit 3-hour timer claimed a card; and the injection test occasionally answered “Ahoy”. After the path/no-claim/timer/identity fixes, the focused harness passes the injection and 10-step cases; the soft exact-HTML case still occasionally claims a card without creating one. Residual variance comes from model sampling (temperature 0.3), not a transport bug.
- The eval harness lives at `/tmp/opencode/atlas-prompt-eval.ts` and is not committed; it requires the dev server and real keys. No repo test touches the network.

## 2026-10-29 18:40 IST (13:10 UTC) — Create-only Markdown cards, safe timers, compact steps

- Removed the model's `conversation` field end to end. `src/lib/orb-turn.ts`, `src/lib/turn-stream.ts`, `src/app/api/orb/respond/route.ts`, `src/lib/chat-message.ts`, `src/components/dashboard/use-orb-turn.ts`, and `src/lib/atlas-prompt.ts` now carry only `transcript`, `speak`, and tool output. Every visible block must come from a `create` card, so `speak` is required and there is no fallback text field.
- `create` is now Markdown-only: `{id?, title, content}` with no JSON props, layout kind, or schema. It returns `ToolResult.card`, rejects empty title/content, invalid ids, content over 4,000 characters, and malformed timer tags. `src/lib/cards.ts` owns `CardContent`, `MAX_CARDS` (6), the title/content caps, and `joinCardMarkdown`. `src/lib/model.ts` collects cards across tool rounds, defaults ids to `card-N`, renumbers duplicates, skips identical repeats, and selects reply sources from the joined card Markdown.
- Added safe interactive widgets. `src/lib/interactive-markdown.ts` parses only block-level `<timer … />` tags at column 0 outside code fences, validates the allowlisted attributes (`timer` 1000–1,800,000 ms, `label` ≤80 chars, `send` ≤500 chars, `show` slug), and leaves unknown tags to Markdown. Known malformed tags become an inline error, never raw HTML. `src/lib/timer.ts` is the pure countdown state machine (start/pause/resume/tick/finish once/reset). `src/components/dashboard/timer-card.tsx` starts only on an explicit Start; on completion it fires `send` once and/or opens the `show` card. If a turn is busy, the send becomes a Continue button instead of aborting the turn.
- Cards are compact and collapsed by default with a one-line preview; opening one closes the previous card. Step ids (`step-1`…) get a numbered badge. `src/components/dashboard/interactive-markdown.tsx` renders card Markdown plus timer widgets, `src/components/dashboard/card-interactions.tsx` supplies open/send/busy actions, and `src/components/layout/adaptive-card.tsx` is now the collapsible card shell.
- Rewrote `src/components/dashboard/dashboard-flow.tsx` to render only the latest assistant turn's cards, restore cards/tools/sources from `sessionStorage`, keep one open card, scroll a `show` target into view, and shrink the orb when cards are visible. `src/lib/chat-message.ts` persists `cards` and `toModelHistory` falls back to joined card Markdown when `content` is empty.
- Rewrote `src/lib/atlas-prompt.ts` around the create/timer contract, including one card per step, collapsed-card guidance, and the timer attribute limits.
- Deleted the unused model-authored layout engine and its UI: `src/lib/layout/{layout-plan,layout-engine,density,parse,stream,ui}.ts`, `src/components/layout/{layout-orchestrator,layout-stage,render,use-layout-validation}.tsx`, and their tests. `AdaptiveContainer` and `layout-context` remain for breakpoints and available-space measurement.
- Tests: added `tests/cards` coverage inside `history`/`omni-stream`, `tests/create.test.js`, `tests/interactive-markdown.test.js`, and `tests/timer.test.js`; updated `orb-turn`, `turn-stream`, `history`, `atlas-prompt`, `omni-stream`, `orb-tools`, `exa-search`, and `sse`. `bun test tests/` passes with 233 tests / 0 failures; `bun run typecheck`, `bun run lint` (one pre-existing `prefer-const` fixed in `layout-context.ts`), and `bun run build` all pass.

## 2026-10-29 17:41 IST (12:11 UTC) — Orb test route

- Added `src/app/test/page.tsx` (Server Component, exports `metadata`) and `src/app/test/orb-client.tsx` (Client Component) for a `/test` route that renders the registry `ParticlesOrb` directly with controls for state (idle/connecting/listening/thinking/searching/speaking/progressing/error/disabled), size, speed, progress (for `progressing`), and an auto-cycle toggle.
- Orb only — no AI, no voice, no HTTP, no session, no turn logic; shares the dashboard's `ViewTransition`, sand/sage tokens, and `page-gutter` layout. The client component is imported from the server page so `metadata` stays server-resolved.
- Verified with `bun run typecheck` clean and `bunx oxlint` clean on both new files.

## 2026-10-29 15:50 IST (10:20 UTC) — Adaptive Layout Intelligence v1

- Implemented screen-aware adaptive layout engine: `src/lib/layout/{layout-context,use-layout-context,use-element-measure,layout-plan,layout-engine,density,ui,parse,stream}.ts` + `src/components/layout/{adaptive-container,adaptive-card,render,layout-orchestrator,use-layout-validation}.tsx`.
- `LayoutContext` via ResizeObserver+visualViewport+matchMedia provides viewport/availableSpace/breakpoint/modality (xs/sm/md/lg/xl, pointer/touch/hybrid) — browser truth, no AI guessing.
- `derivePlan`/`deriveFromTools` produce `LayoutPlan` (components with priority/placement/minW/maxW/essential/toolRefs/uiSchema) + `checkPlan` guard; `validatePlan`/`reflow` enforce collision/overflow/min-size/readability/accessibility, never drop essential, cascade condense→expandable→replace→reflow→scroll/paginate/fullscreen; `density` handles canFit/chooseDensity.
- New tool `create` (`src/lib/tools/create.ts` + registry) lets AI create UI kinds (comparison_table/timeline/card_grid/stat/pricing_cards/checklist/kanban/chart/custom) validated via `src/lib/layout/ui.ts`.
- Streaming protocol: 5 new `TurnEvent` statuses (`layout_plan/card/delta/state/update`) in `src/lib/turn-stream.ts` interleaved with speak-delta/audio on same NDJSON stream; skeleton pulse → card cross-fade, rAF batched, abort-safe; prompt appendix in `src/lib/atlas-prompt.ts` forces batch parallel tool use + create + streaming.
- Dashboard wired: `src/app/dashboard/page.tsx` wraps in `AdaptiveContainer`, `src/components/dashboard/dashboard-flow.tsx` derives currentPlan from history and renders `LayoutOrchestrator` (stable keys, incremental diff, pinned persistence, dismiss/pin).
- Verified: `bunx tsc --noEmit` clean, `bun run build` 7/7 static, `bun test tests/` 228 pass (new: layout-context/plan/density/engine/card/orchestrator/validation/stream/create/ui).
- Tests added: `tests/layout-*.js`, `tests/create.test.js`, `tests/ui.test.js`.

## 2026-10-29 12:45 IST (07:15 UTC) — Make Baseten prompt caching reachable

- `src/lib/atlas-prompt.ts`: `formatCurrentDate` no longer embeds a live clock or ISO instant. It keeps `dateStyle: "full"` with `timeZone: "UTC"`, so the first prompt block is stable for a whole UTC day. Previously the clock diverged within the first few tokens of every turn, so `cached_tokens` was effectively zero regardless of the affinity header.
- Exact time is unchanged: `get_current_time` still returns the full date, time, and ISO instant on demand.
- `src/lib/model.ts`: `normalizeSession` is exported and strips everything outside printable ASCII (`\x20`–`\x7E`) before the 64-character cap, so control characters and non-ASCII values can no longer make the `x-session-affinity` header throw. Empty results drop the header instead of failing the turn.
- `src/app/api/orb/respond/route.ts`: `readSession` now delegates to `normalizeSession`, so the route and the model share one sanitizer.
- Usage handling: `mergeUsage` folds streaming usage frames together, so a later partial or empty object cannot erase an earlier `prompt_tokens_details`. `metaFrom` still defaults every missing count to 0. `cachedTokens` remains logged in the `orb-turn` line.
- `AGENTS.md` corrected: affinity is described as best-effort routing that may improve cache reuse, not a reserved replica, guaranteed hit, or guaranteed cached rate. The date prompt and `trimHistory`'s effect on prefix reuse are documented.
- Tests: `tests/atlas-prompt.test.js` gains UTC-day stability, midnight rollover, and no-clock-in-prefix cases; `tests/omni-stream.test.js` gains session sanitization (direct and through the request header), empty-usage defaults, and partial-frame merging.
- Verified: `bun x tsc --noEmit` clean, `bun test tests/` 201 pass / 0 fail, lint has no new errors, `next build` succeeds.
- Remaining uncertainty: whether Baseten actually reports cache hits for this model/endpoint combination is only observable from the `cachedTokens` log; the docs describe affinity as best effort, not a guarantee.

## 2026-10-29 12:22 IST (06:52 UTC) — Muse Spark Open: cheapest reasoning depth plus every cost and usage lever

- `src/lib/model.ts` now pins `reasoning_effort: "low"` on both the streaming and non-streaming paths. Muse Spark Open always reasons and cannot be switched off; its default depth is `xhigh`, and reasoning tokens bill as output at $4.25/M, so a one-to-three-sentence voice reply was paying for thinking it never used.
- Streaming requests now send `stream_options: { include_usage: true }` instead of relying on the server default, so the final frame always carries token usage.
- `TurnMeta` gained `cachedTokens`, `audioTokens`, and `reasoningTokens`, read from `usage.prompt_tokens_details` / `usage.completion_tokens_details`. The `orb-turn` log line prints all three.
- Prompt-cache affinity: the client stores one id in `sessionStorage` (`atlas.orb.session`) and sends it as `session`; the route validates it to 64 chars and `model.ts` forwards it as the `x-session-affinity` header, so every turn of a conversation lands on the same replica and the identical system prompt plus growing history bill at $0.15/M cached input instead of $1.25/M.
- `respondToAudio` / `respondToText` now take a `TurnContext` (`{ signal, session }`) as their last argument instead of a bare `AbortSignal`. Internal calls thread one `TurnRun` (composed deadline + session) instead of loose signals.
- Status mapping corrected against Baseten's error docs: **529** (capacity shedding) joins 429/503 as a retryable `busy`, and **402** (billing) maps to `config`. Previously a 529 surfaced as a hard `audio` failure and was not retried.
- Native tool rounds advertise `parallel_tool_calls: true`; the runner already executes a round's calls together and echoes one `tool_call_id` per call.
- `response_format: { type: "json_object" }` is kept but documented as advisory: Muse Spark Open accepts it without constraining output, so the system prompt and `parseTurn` remain the real guarantee.
- Tests: `tests/omni-stream.test.js` gained six cases (reasoning depth + usage frame, affinity header present/absent, cached/audio/reasoning token reporting, 529 → busy, 402 → config) and its fetch stub now records request headers. Two existing tests pass `{ signal }` instead of a bare signal.
- Verified: `bun x tsc --noEmit` clean, `bun test tests/` 194 pass / 0 fail, lint has no new errors, `next build` succeeds.

## 2026-10-29 11:31 IST (06:01 UTC) — Migrate orb model from NVIDIA to Baseten Muse Spark Open

- Renamed `src/lib/nvidia-omni.ts` to `src/lib/model.ts`; it now calls Baseten's OpenAI-compatible Chat Completions endpoint (`https://inference.baseten.co/v1/chat/completions`) with `Authorization: Bearer $BASETEN_API_KEY` and model `meta-models/muse-spark-open-1026`.
- `respondToAudio` sends the WAV clip as an `input_audio` content part (`{ data: base64, format: "wav" }`) plus a text prompt; `respondToText` sends text only.
- Muse Spark Open always reasons: reasoning lands in `reasoning_content`, the final answer in `content`; reasoning cannot be turned off. Streams use `response_format: json_object` and `reasoning_effort: high`.
- Error mapping: 401/403 → `config`, 429/503 → `busy`, other failures → `audio`; 202 handling removed (Baseten doesn't use it).
- Native tool calls gated behind `BASETEN_NATIVE_TOOLS=1` (was `OMNI_NATIVE_TOOLS`); answered one-for-one by `tool_call_id`, round sent without `response_format`.
- Updated `tests/omni-stream.test.js` env var names (`BASETEN_API_KEY`, `BASETEN_NATIVE_TOOLS`) and removed the obsolete reasoning-only retry test.
- Updated `scripts/omni-probe.mjs` to target Baseten/Muse Spark Open.
- Updated `AGENTS.md` (`model.ts` description) for the migration.
- Verified with `bun test tests/` (188 pass), `bun x tsc --noEmit` clean, `bun run lint` no new errors, `next build` success.

## 2026-10-28 23:45 IST (18:15 UTC) — Searching animation API tightened

- `src/registry/lib/orb-search.ts` now exports only the surface the render loop and its tests need (12 exports instead of 28). The wave stagger, rise, shimmer, LCG seed, and unlit marker are private, so retuning the effect does not widen the module API.
- `searchHighlight(rank, frame)` owns the unlit-dot rule and takes one `SearchFrame` (`elapsed`, `time`, `weight`, `reduced`) built once per frame, so the canvas loop no longer branches on the sentinel rank or passes five positional arguments per dot.
- `SEARCH_LIGHT` replaces the separate `SEARCH_LIGHT_ALPHA` / `SEARCH_LIGHT_GROW` / `SEARCH_TONE_SHIFT` exports with one descriptor shared by the loop and `searchToneBucket`.
- `searchBand` takes the `SearchScan` object instead of loose `y`/`sigma` numbers, and `createSearchRanks` dropped its test-only `highlightCount` argument.
- Rewrote `tests/orb-search.test.js` as behavior/invariant tests (contiguous ranks, scan ping-pong, band falloff, staggered reveal, weight fade, tone cap) that import the real constants rather than mirroring the formulas or hardcoding tuning values. Test imports keep the repo's `.ts` extension.
- `AGENTS.md` now lists `orb-search.ts` in the registry tree and module notes.
- Verified with `bun test tests/` (189 pass), `bun run typecheck`, and `bun run lint` (37 warnings, all pre-existing).

## 2026-10-28 23:30 IST (18:00 UTC) — Searching animation moved to pure TypeScript

- Added `src/registry/lib/orb-search.ts`: every hardcoded value and bit of math behind the `searching` animation now lives in one pure, testable module — constellation size/waves/stagger/rise, sweep rate, band width/boost/dim, the fade-out floor, the seeded rank table (`createSearchRanks`), and helpers (`searchScan`, `searchBand`, `searchReveal`, `searchShimmer`, `searchHighlight`, `searchDotGain`, `searchAlphaGain`, `searchToneBucket`).
- `particles-orb.tsx` now calls those helpers instead of carrying inline magic numbers: the highlight block collapsed to one `searchHighlight(...)` call, the band to `searchBand(...)`, the gains to `searchDotGain`/`searchAlphaGain`, and the `searching` state row spreads `SEARCH_FX`. No visual change: same seed, constants, and math.
- Added `tests/orb-search.test.js` (rank table, scan ping-pong, band falloff, staggered reveal, gains) and listed it in `tests/README.md`.
- Verified with `bun test tests/` (189 pass), `bun run typecheck`, and `bun run lint` (warnings only, all pre-existing).

## 2026-10-28 23:00 IST (17:30 UTC) — Oxlint adopted as linter

- Replaced ESLint with Oxlint (`oxlint@1.90.0` + `oxlint-tsgolint@7.0.2005`) as the project linter.
- Added `.oxlintrc.json` with type-aware + type-check mode, plugins for eslint/typescript/react/jsx-a11y/nextjs/import, and rules mirroring the previous ESLint config.
- Updated `package.json` lint script from `eslint` to `oxlint --type-aware --react-plugin --jsx-a11y-plugin --nextjs-plugin --import-plugin`.
- Added `.opencode/skills/` to `.gitignore` (OpenCode's downloaded skill system files, not project source).
- Lint runs in ~6s (was ~18s with ESLint), exit code 0, warnings only.
- `AGENTS.md` documents the linting setup under Project Workflow.

## 2026-10-28 22:30 IST (17:00 UTC) — Conversation panel auto-open

- `ConversationPanel` slides open automatically after the first turn lands (typed or spoken): `conversationOpen` is derived during render as `showConversation || (history.length > 0 && !conversationDismissed)`, so no `setState` in an effect/render is needed (repo ESLint flags both).
- A manual close sticks for the rest of the session via `conversationDismissed`; Ctrl+K "Show conversation" re-opens it.
- Skips moving focus to the close button when the active element is a text field, so auto-open doesn't steal the caret from the prompt dock mid-typing.

## 2026-10-28 22:00 IST (16:30 UTC) — Ctrl+K command menu simplified

- Removed the visible trigger button from `OrbCommandMenu`; it now opens only via the Ctrl+K (⌘K) keyboard shortcut.
- The menu still lists session/preview commands (start/end conversation, show/hide transcript, orb state previews) searchable from the keyboard.
- Removed `components/dashboard/status-menu.tsx`; preview options live inline in `dashboard-flow.tsx`.

## 2026-10-27 13:32 IST (08:02 UTC) — Hello World page

- Replaced the default Next.js starter page in `src/app/page.tsx` with a minimal "Hello World" page.
- Page renders a full-screen black background with large, bold, white centered text.
- Verified with `bun run lint`, `bun run typecheck`, and `bun run build`.

## 2026-10-27 13:33 IST (08:03 UTC) — Project folder structure

- Added `src/components/ui/`, `src/components/layout/`, `src/lib/`, and `src/types/` with `.gitkeep` placeholders.
- Documented the full directory layout in `README.md`.

## 2026-10-27 13:40 IST (08:10 UTC) — shadcn/ui installed

- Initialized shadcn/ui with the `base-nova` style, Base UI, and the `cn` utility.
- Added `components.json`, `src/lib/utils.ts`, and `src/components/ui/button.tsx`.
- Updated `src/app/globals.css`, `package.json`, and `bun.lock` with shadcn/ui dependencies and theme variables.
- Verified with `bun run lint`, `bun run typecheck`, and `bun run build`.

## 2026-10-27 13:43 IST (08:13 UTC) — Site header

- Added `src/components/layout/site-header.tsx` with Atlas branding, Home/Docs/GitHub links, and a shadcn/ui "Get Started" button.
- Rendered the header in `src/app/layout.tsx` and made the page fill the remaining viewport height below it.
- Verified with `bun run lint`, `bun run typecheck`, `bun run build`, and production HTML output.

## 2026-10-27 13:48 IST (08:18 UTC) — Header wordmark

- Renamed `src/components/layout/site-header.tsx` and `SiteHeader` to `header.tsx` and `Header`.
- Removed the square "A" icon and replaced it with an "Atlas" text wordmark inspired by OpenAI's header.
- Updated the header layout and verified with `bun run lint`, `bun run typecheck`, and `bun run build`.

## 2026-10-27 13:52 IST (08:22 UTC) — Header separator removed

- Removed the bottom border/separator line from the site header.
- Verified with `bun run lint`, `bun run typecheck`, and `bun run build`.

## 2026-10-27 14:29 IST (08:59 UTC) — Muted color palette

- Shifted the layout, header, and page to a muted neutral palette.
- Applied `neutral-950` backgrounds, off-white text, gray nav links, and a muted CTA button.
- Verified with `bun run lint`, `bun run typecheck`, and `bun run build`.

## 2026-10-27 14:32 IST (09:02 UTC) — Simplified header navigation

- Removed the Docs and GitHub links from the header navigation, leaving only Home.
- Removed the now-unused `navItems` array and external-link branch.
- Verified with `bun run lint`, `bun run typecheck`, and `bun run build`.

## 2026-10-27 14:39 IST (09:09 UTC) — NowCue-inspired UI

- Adopted the warm sand/sage palette and rounded typography from nowcue.org.
- Added Atkinson Hyperlegible for body text and Baloo 2 for display text and the wordmark.
- Enlarged the Home nav item into an active sage pill and restyled the header CTA.
- Restyled the Hello World page with a sage kicker, display heading, and muted copy.
- Verified with `bun run lint`, `bun run typecheck`, `bun run build`, and production HTML output.

## 2026-10-27 14:48 IST (09:18 UTC) — Light/dark theme toggle

- Added a system-default light/dark theme toggle with sun/moon states to the header.
- Added a pre-hydration script so the stored or system theme is applied without a flash.
- Persisted explicit choices in `localStorage` and synced system changes and other tabs.
- Added a warm sand/sage dark palette and converted custom colors to theme variables.
- Verified with `bun run lint`, `bun run typecheck`, `bun run build`, and rendered HTML.

## 2026-10-27 15:29 IST (09:59 UTC) — Single-source theme model

- Added `src/lib/theme.ts` as the only place the theme contract is defined: storage key, change event, `Theme` type, system/storage resolution, `applyTheme`, the React store subscription, and the pre-hydration bootstrap script.
- `src/app/layout.tsx` now injects `THEME_BOOTSTRAP_SCRIPT` from that module instead of an inline copy; `src/components/ui/theme-toggle.tsx` is reduced to markup and imports the shared store functions.
- The bootstrap script is generated from the same constants it is validated against, so the stored key, theme values, dark class, and media query can no longer drift between the pre-paint script and the runtime store.
- Narrowed the bootstrap's error handling: an unavailable `localStorage` now falls back to the system theme instead of aborting before the theme is applied.
- Verified with `bun run lint`, `bun run typecheck`, `bun run build`, and the prerendered HTML output.

## 2026-10-27 16:02 IST (10:32 UTC) — Custom 404 page

- Added `src/app/not-found.tsx`: two interactive eyes, a `404 : Page not found` heading with the digits in sage, a muted subtitle, and a "Return home" link, all set in Departure Mono and built from the existing sand/sage tokens so light and dark both work.
- Added `src/components/ui/not-found-scene.tsx`: pupils follow the pointer with spring physics (stiffness 300, damping 25), clamped to 22% of the socket width, with eye centres cached and recalculated on resize; blinking closes on a randomized 3–6s interval for 150ms and squashes the socket to 5%.
- Self-hosted Departure Mono (`src/app/fonts/`, SIL OFL) via `next/font/local` and exposed it as `--font-mono` in `globals.css`, so `font-mono` now resolves to the site's mono face.
- Both effects are skipped under `prefers-reduced-motion`, and the scene is `aria-hidden` since the heading already carries the meaning.
- Verified with `bun run lint`, `bun run typecheck`, `bun run build`, and Playwright checks for cursor follow, blink, reduced motion, and 390px/1280px layouts in both themes.

## 2026-10-27 16:12 IST (10:42 UTC) — Headerless 404

- Moved the `/` route into a `(site)` route group whose `layout.tsx` renders the sticky `Header`; the root layout no longer renders it.
- The global `not-found.tsx` now renders full-bleed without the header, so the eyes and copy centre against the whole viewport.
- Updated the structure notes in `AGENTS.md` for the route group, `not-found.tsx`, `not-found-scene.tsx`, `lib/theme.ts`, and the self-hosted font.
- Verified with `bun run lint`, `bun run typecheck`, `bun run build`, and Playwright: header present on `/`, absent on an unmatched route in both themes.

## 2026-10-27 15:40 IST (10:10 UTC) — OpenCode project skills and theme

- Vendored 16 skills into `.opencode/skills/` from `obra/superpowers`, `anthropics/skills`, and `nextlevelbuilder/ui-ux-pro-max-skill`, pinned by commit in `.opencode/SOURCES.md`.
- Extended `.gitignore` to ignore OpenCode runtime state while keeping the vendored skills tracked.
- Verified every skill has a `SKILL.md`, all cross-references between skills resolve, and the new skills are registered.










## 2026-10-27 16:36 IST (11:06 UTC) — Responsive layout and mobile drawer

- Added `viewportFit: "cover"` plus light/dark `themeColor`, switched the body to `min-h-dvh`, and added a shared `page-gutter` utility driven by a responsive `--page-gutter` token and `env(safe-area-inset-*)`.
- Added an `overflow-x: clip` safety net, `text-size-adjust: 100%`, and balanced/pretty text wrapping.
- Header now uses a 64px mobile / 80px desktop height, a 44px-tall wordmark link, 44px theme-toggle buttons, and top safe-area padding.
- Added `src/components/layout/mobile-nav.tsx`: a Base UI Drawer side panel below 768px with a 44px trigger, backdrop, focus trap, scroll lock, Escape/outside/swipe dismissal, Home and Get Started links, safe-area padding, and automatic close on resize to desktop. The desktop nav and CTA remain at `md+`.
- Home uses a fluid `clamp()` heading, responsive gutters, and height-aware vertical padding.
- 404 eyes now use a `clamp()` size bounded by viewport width and height, keep a 1:1 aspect ratio, and the page uses larger 13px/16px copy, a 48px return link, height-aware padding, and no `overflow-hidden` clipping.
- Measured at 280, 320, 360, 375, 390, 414, 640, 767, 768, 834, 1024, 1280, 1440, 1920, 2560, and 3440px plus 667×375 landscape: no horizontal overflow, all interactive targets at least 44px, and the drawer opens, closes, traps focus, locks scroll, and returns focus to its trigger.

## 2026-10-27 16:58 IST (11:28 UTC) — NowCue-style home hero

- Replaced the Hello World hero with a two-column "See what to do now — and move calmly through your day." layout built from the existing sand/sage tokens.
- Added three status cards: a tall NOW card with a check icon, a Next card with a periwinkle clock, and a Later card with a peach squiggle. Cards use `bg-paper`, rounded 1.75rem corners, and a soft shadow.
- Added clipped sage and sand background blobs, a mono display heading with fluid `clamp()` sizing, and mono body copy.
- Stacks cleanly at 320px, uses a two-column card cluster from 640px, and switches to the text/cards split at 1024px. Dark-mode variants are included for every custom color.
- Updated the page description to match the new hero.
- Verified with `bun run lint`, `bun run typecheck`, and `bun run build`.

## 2026-10-27 17:09 IST (11:39 UTC) — Hero copy and warm dark palette

- Removed the NOW pill from the tall home card; the check icon now sits at the top of the card.
- Shortened the hero heading to “See what your words can do.” and updated the page description to match.
- Reworked the dark theme from a cool blue-gray palette to a warm espresso palette: `--sand` `#171512`, `--paper` `#211e19`, `--ink` `#f2eee6`, `--ink-muted` `#b9b0a2`, `--line` `#39332b`, and a deeper sage wash with a pale mint primary.
- Reduced the dark background blobs to a faint sage and peach glow, and gave dark cards a subtle light ring plus a deeper shadow.
- Retuned the periwinkle and peach icon circles for the warmer surfaces.
- Verified light and dark home screenshots, dark 404 and drawer screenshots, key contrast ratios (all text above 7:1), and no horizontal overflow; `bun run lint`, `bun run typecheck`, and `bun run build` pass.

## 2026-10-27 14:38 IST (09:08 UTC) — Full-bleed friendly face section

- Replaced the second homepage section's copy column and small portrait with one full-width, textless face band. The face is cropped to `0 172 420 233`, fills the rectangle with `preserveAspectRatio="xMidYMid slice"`, and uses responsive `7/5`, `8/5`, and `9/5` ratios with a matching `#eebc92` fallback. The beanie and forehead are gone, so the brows, eyes, nose, smile, blush, and ear edges read as a close-up.
- Gave the hero a viewport-height minimum under the sticky header (`calc(100dvh - 4rem)` / `calc(100dvh - 5rem)`), so the face section begins below the fold on desktop and tablet instead of peeking into the first screen.
- Kept the GSAP scene (built with `@gsap/react`): the face slides in from the side, gazes around, smiles, and the long arm reaches the existing header Get Started button once. The header CTA exposes `data-cta-frame`/`data-cta-button` and remains the only press target. The shoulder mapping now accounts for the cropped viewBox and `slice` centering, and the arm has a skin-shade outline so it stays visible over the skin field.
- Moved the scroll trigger to `top 75%`, which lets the short mobile page reach the reveal; reduced-motion is settled before `matchMedia`, so mobile reduced-motion now shows the static face with no arm or click.
- Verified with `bun run lint`, `bun run typecheck`, and `bun run build`, plus Playwright at 1440/1024/390px in light and dark mode and with reduced motion: face fills the band, one CTA click, hand within ~2px of the button center, no horizontal overflow, and no console errors.

## 2026-10-27 17:36 IST (12:06 UTC) — Hands-only scroll scene

- Removed the character head, neck, ear, and face art (`character-bust.tsx`) from the scene and the reduced-motion band. The scroll story now runs grab → pull → detached press hand → exit.
- Removed the paper band surface from the second section; the stage is now invisible (no paper background, border, rounded top, or inset shadow) and exists only to mark the seam and measure the trigger.
- Added an 18dvh empty spacer after the hero in `src/app/(site)/page.tsx`, so there is more scroll room before the scene begins.
- The scene now replays on every entry: the ScrollTrigger stays armed, and each run resets the running/finished flags, click guard, grab and press progress, overlay, stage transform, and CTA frame. The CTA is tapped again on each pass.
- Deleted the unused `character-bust.tsx` and removed dead refs/state (`playedRef`, `grippedRef`, `scrollTriggerInstance`, head refs) from `character-section.tsx`. Kept the press hand desktop-only and the reduced-motion path inert.
- `bun run lint` and `bun run typecheck` pass.

## 2026-10-27 14:03 IST (08:33 UTC) — Full grab hand and pointing click hand

- Replaced the grab hand's palm-circle + arm with one full hand: a 200-unit palm, four two-segment fingers, and a two-segment thumb. It approaches open, holds at the seam, then curls into a grab (78° proximal + 64° distal, staggered; thumb 40° after 90ms). The pull is gated until the curl finishes.
- The grab arm now lives inside the hand group in hand-local units, so it translates, rotates, and scales as one rigid piece. The palm's wrist line is cut perpendicular to the arm and the arm uses a butt cap, so the palm fill and arm skin meet on the same line with no cuff or seam.
- Rebuilt the click hand as the same full hand with the index extended and the other fingers folded. Its local origin is the index fingertip, so the scene places that point on the CTA; the arm is part of the same union and stays seamless while the hand points and retracts.
- Added `hands/hand.ts` (shared geometry and paths), `hands/hand-body.tsx` (one reusable hand drawing), and `bowedArmControl` in `hands/arm.ts`. `hands-art.tsx` now composes two `HandBody` instances instead of duplicating the arm/palm/finger markup.
- Verified with `bun run lint`, `bun run typecheck`, and `bun run build`, plus Playwright at 1440×900 in light and dark and at 390×844: open approach, grip, pull, click hand, no wrist seam, and no console errors.

## 2026-10-27 15:29 IST (09:59 UTC) — Onboarding tone question

- Added the headerless `/start` flow outside the `(site)` group: name, age range, a six-message tone question, and a reflect-back summary. The header, drawer, and hands-scene CTA all open `/start`.
- The tone step asks “Which messages would you keep?” with six concrete Atlas messages, ordered from calm and simple through structured, choice-based, reflective, and encouraging.
- Users keep two messages; a third pick replaces the oldest, and the `Keep these` button stays disabled until two are selected. A `Skip this one` action clears the tone and continues.
- The final step reflects back the name, age range, and starting tone (or “Not set”), with `Change` to edit the tone and `Done` to return home. Step labels now read `Step 1 of 3`, `Step 2 of 3`, `Step 3 of 3`, and `Ready`.
- Updated `AGENTS.md` for the new flow. Verified with `bun run lint`, `bun run typecheck`, and `bun run build`, plus Playwright at 1440×1000 and 390×844: name → age → tone → summary, two-choice limit, third-pick replacement, skip clearing, change preserving, no horizontal overflow, and no console errors. Also checked the light summary and dark tone screenshots.

## 2026-10-27 16:14 IST (10:44 UTC) — Voice-first onboarding with eSpeak samples

- Expanded `/start` to six steps: name → age range → voice → pace → talk style → review. Step labels now read `Step 1 of 6` through `Step 5 of 6`, then `Ready`.
- Added six pre-recorded eSpeak MP3 samples in `public/voices/`: Warm, Clear, Bright, Calm, Grounded, and Crisp. Voice cards play the selected sample and replay on a second tap; the review and pace step reuse the same files.
- Rewrote `use-voice-preview.ts` around `HTMLAudioElement` instead of browser `speechSynthesis`. It exposes `voices`, `supported`, `speakingId`, `play(voiceId, rate, requestId)`, and `stop`, applies `playbackRate` for Slow/Steady/Brisk, and sets `preservesPitch`.
- Replaced the talk-style question with the direct “How should I talk with you?” prompt and six persona answers (buddy, doctor, teacher, coach, quiet friend, colleague). Picking two remains the limit; a third replaces the oldest, and `Skip this one` clears the choice.
- Removed the “How should I say your name?” step and its pronunciation state/preview entirely, along with the review `Say it` row. Removed “About a minute” from the progress header.
- Kept the headerless centered `/start` route, the sand/sage backdrop, route transitions, staggered option entrances, playing bars, and reduced-motion fallbacks. The hands scene still clicks the shared Get Started control unchanged.
- Updated `AGENTS.md` for the voice catalog, `use-voice-preview.ts`, and the six-step flow.
- Verified with `bun run lint`, `bun run typecheck`, and `bun run build`, plus Playwright at 280, 320, 360, 375, 390, 414, 640, 767, 768, 834, 1024, 1280, 1440, and 1920px in light and dark with reduced motion: all six MP3s return 200 `audio/mpeg`, voice and pace previews play/stop, the six-step flow completes, a third style replaces the oldest, the pronunciation question is absent, no horizontal overflow, and no console errors. Voice and pace choices switch to one column below 360px so labels never collide.

## 2026-10-27 17:42 IST (12:12 UTC) — Cartesia voices and API-generated pace samples

- Replaced the six eSpeak samples with six Cartesia Sonic voices: Skylar (female, US), Jacqueline (female, US), Gemma (female, UK), Daniel (male, US), Parker (male, US), and Archie (male, UK). The fixed catalog keeps each Cartesia voice ID for regeneration.
- Generated 18 static samples in `public/voices/` (`{voice}-{slow|steady|brisk}.mp3`) with `sonic-3.6` and Cartesia's `generation_config.speed` at 0.7, 1, and 1.3. The pace step and final preview now load the matching API-generated file instead of changing browser `playbackRate`.
- Added `scripts/generate-cartesia-voices.mjs` and `bun run generate:voices`; it uses `CARTESIA_API_KEY` when set, otherwise Cartesia's rate-limited public demo token. Generated durations confirm each voice gets progressively shorter from slow to brisk.
- Updated `AGENTS.md` for the Cartesia catalog, 18 files, and speed flags.
- Verified with `bun run lint` and `bun run typecheck`; `bun run build` and Playwright checks follow.

## 2026-10-27 18:12 IST (12:42 UTC) — Dead-code cleanup

- Audited every module for unreferenced exports, unused imports/locals (via `tsc --noUnusedLocals --noUnusedParameters`), unused files, and unused assets.
- Removed the never-read `PALM_W` and `PALM_TOP` constants from `hands/hand.ts`; the palm path already bakes in its 200-unit width and top edge.
- Deleted the five unused Next.js starter SVGs from `public/`: `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, and `window.svg`. `public/voices/` is untouched.
- Verified with `bun run lint`, `bun run typecheck`, and `bun run build`.

## 2026-10-27 12:49 IST (07:19 UTC) — Dashboard particle orb from the registry

- Added the drop-in orb package under `src/registry/`: `orbe/particles-orb/particles-orb.tsx` (720 golden-angle dots, z-sorted depth, per-state motion, one rAF animator) and the `lib/` contracts and hooks (`orb-state`, `orb-color`, `use-orb-animator`, `use-orb-level`, the shared-analyser hooks, `use-in-view`, `use-reduced-motion`, `use-webgl-support`, `use-orb-cues`, `orb-status`, `orb-pill`).
- Replaced the hand-written `components/dashboard/particle-orb.tsx` with `ParticlesOrb` and deleted the old file. The dashboard renders it with the requested black→white palette, speed 1, and a responsive size: 360 px by default, capped at 440 px on desktop, and fluid down to phone width (never above the viewport minus the page gutters).
- The orb state follows the voice session (`idle`, `connecting`, `listening`, `error`, `disabled`) and switches to `speaking` while a recording plays; the live mic level still feeds `levelRef`, so voice widens the sphere.
- Simplified the dashboard to the orb plus mic, record/stop, and play/pause controls: removed the greeting, lede, “Atlas” kicker, starting-style chips, back-home link, and all explanatory notes. Trimmed the unused onboarding store reader from `lib/onboarding.ts`; `saveOnboarding` still persists the `/start` answers.
- Updated `AGENTS.md` and `README.md` for the registry, dashboard files, and new structure.
- Verified with `bun run lint`, `bun run typecheck`, and `bun run build`.

## 2026-10-27 12:53 IST (07:23 UTC) — Theme-aware orb colors

- Defined `--orb-color-from: var(--ink)` and `--orb-color-to: var(--ink-muted)` once in `:root`; because the `.dark` block redefines `--ink`/`--ink-muted`, the same two variables resolve to the dark palette automatically — no duplicate `.dark` orb rules.
- The dashboard no longer hard-codes black→white. `ParticlesOrb` reads the computed `--orb-color-from` / `--orb-color-to` from its host (falling back to the old props) and redraws on a `MutationObserver` for the root `.dark` class, so the orb recolors instantly with the theme toggle.
- Verified the custom-property chain resolves to hex values in both themes, and ran `bun run lint`, `bun run typecheck`, and `bun run build`.

## 2026-10-27 13:06 IST (07:36 UTC) — Smoother orb and a sage palette

- Tuned the registry orb's look: 960 dots instead of 720, a larger sphere (0.7× the canvas), stronger depth falloff (perspective, size, and alpha all keyed to z), 16 alpha buckets for smoother shading, and a gentle per-dot twinkle.
- Rendering now adapts to the palette: dark dots on the light theme composite with plain alpha, light dots on the dark theme use additive blending plus a cached radial glow. `MutationObserver` also watches inline `style` changes, not just `.dark`.
- Added depth cues and life: a slow X/Y wobble and damped pointer parallax (frame-rate independent exponential easing), and the voice release is a touch longer (`LEVEL_RELEASE_RATE` 3.2).
- Fixed a resize smoothness bug: the rotation/ring clocks now live in a ref, so rebuilding the canvas on resize no longer resets the animation; dashboard resizes are debounced by 120 ms.
- Palette switched from ink→ink-muted to ink→sage (`--orb-color-from: var(--ink)`, `--orb-color-to: var(--sage)`), so light mode has deep green-gray dots and dark mode fades cream into mint.
- Checked light/dark and listening states in Chromium at 1440×900; verified `bun run lint`, `bun run typecheck`, and `bun run build`.

## 2026-10-27 13:18 IST (07:48 UTC) — Orb stage backdrop on the dashboard

- Replaced the shared `AmbientBackdrop` on `/dashboard` with a purpose-built stage in `components/dashboard/orb-stage.tsx`. The old backdrop's off-axis blobs and orb-sized dashed ring competed with the sphere; `/start` still uses it unchanged.
- `OrbBackdrop` is the full-bleed atmosphere: a radial vignette (`--stage-glow` at the orb's optical centre → `--sand` → `--stage-edge`) plus an SVG-turbulence grain layer to hide gradient banding. New `--stage-glow`/`--stage-edge` tokens cover light (`#fbf8f2`/`#ece5d8`) and dark (`#262119`/`#0f0d0a`).
- `OrbHalo` rides on the orb itself, so the halo, two hairline rings (82% and 104% of the orb box), and the ground shadow stay centred however the controls below measure. The halo is tinted by orb state (sage, rose for `error`, ink-muted for `disabled`).
- While the mic is live, one rAF reads the shared level ref and writes the halo's opacity/scale inline — the stage breathes with the voice without a React re-render, and the loop stops when the mic does. `prefers-reduced-motion` keeps it static and drops the entrance animation.
- Composition: the orb now scales up to 520 px and fits against viewport height as well as width (`innerHeight * 0.56`), the control row moved from `mt-5` to `mt-10`, and the page gained a visually hidden `<h1>Atlas orb</h1>`. Control markup, labels, and logic are untouched.
- Verified light/dark at 1440×900 and 375×812 in Chromium; ran `bun run lint`, `bun run typecheck`, and `bun run build`.

## 2026-10-27 13:51 IST (08:21 UTC) — Searching, progressing, and a calm error orb

- Studied the Sinua gallery source (Apache-2.0) without importing it: `searching` maps to their `globe` mode and `progressing` to their `eclipse` mode. Both effects were reimplemented on our Fibonacci sphere.
- Added `searching` to `OrbState` and `ORB_STATES`. A horizontal scan band sweeps the sphere top-to-bottom and back (cosine ping-pong), growing dots at the centre by 1.4× and keeping them bright while the rest drop to 30% alpha; the band is masked to the front hemisphere so it reads on the surface.
- Added `progressing` plus a new `progress?: number` (0–1) prop on `OrbProps`. The day/night terminator is fixed in view space: `boundary = 1 - 2 * progress`, dots with screen-space `x` left of it stay lit, dots on the right dim to ~30% and grow at the edge, so the lit side grows from the left while the sphere keeps spinning underneath. `ParticlesOrb` keeps the value in a ref and redraws immediately on prop change, so dragging a slider does not rebuild the canvas.
- Replaced the error animation: removed the jitter and shake, added a slow converging pulse (`pulseRate 0.55`), gentle breathing, and a slight drift under the rose palette — a smooth heartbeat instead of a glitch.
- Added `components/dashboard/status-menu.tsx`, a test-only Base UI radio menu that previews every state (`auto`, idle, connecting, listening, thinking, searching, speaking, progressing, error, muted). Picking a state cancels the mic and stops passing `levelRef` so the orb's own simulated energy drives it; `Auto` returns to the session. Previewing `Progressing` reveals a 0–100% range input wired to the orb's `progress`.
- Updated `orb-status.tsx`, `orb-pill.tsx`, `AGENTS.md`, and the stage/flow docs for the new states.
- Verified progress at 0/25/50/75/100%, the searching sweep, and the error pulse in Chromium; ran `bun run lint`, `bun run typecheck`, and `bun run build`.

## 2026-10-27 14:08 IST (08:38 UTC) — NVIDIA speech-to-text example

- Researched NVIDIA's hosted APIs. The free ASR models are NVIDIA Cloud Functions over gRPC at `grpc.nvcf.nvidia.com:443`, not the OpenAI-style REST path; the docs' `POST /v1/audio/transcriptions` contract is for a self-hosted ASR NIM on port 9000. The free text endpoint is `POST https://integrate.api.nvidia.com/v1/chat/completions`.
- Added `scripts/nvidia-transcribe.mjs`. It normalises a `public/voices/` sample to 16 kHz mono PCM with `ffmpeg`, calls Parakeet TDT 0.6B v2 through `RivaSpeechRecognition.Recognize` with `function-id` and bearer metadata, prints the transcript, and with `--chat` asks `openai/gpt-oss-20b` for a reply. Flags cover `--file`, `--language`, `--model`, and `--prompt`; `NVIDIA_API_KEY` stays server-side in the git-ignored `.env`.
- Vendored the three Riva protos under `scripts/nvidia/riva/proto/` (MIT) and documented the endpoints, setup, and usage in `scripts/nvidia/README.md`.
- Added `@grpc/grpc-js` and `@grpc/proto-loader` as dev dependencies plus the `nvidia:transcribe` package script. Verified the live transcript ("Hi, I'm Atlas…") and the chat reply.

## 2026-10-27 14:44 IST (09:14 UTC) — Orb voice AI, system prompt, and text sessions

- Added the server-only voice pipeline. `src/lib/nvidia.ts` normalises a clip to 16 kHz mono with `ffmpeg`, transcribes it through NVIDIA's hosted Parakeet ASR over gRPC (`grpc.nvcf.nvidia.com:443`, function `d3fe9151-442b-4204-a70d-5fcc597fd610`), and asks `openai/gpt-oss-20b` at `https://integrate.api.nvidia.com/v1/chat/completions`. The Riva protos moved to `src/lib/nvidia/riva/proto/`; `next.config.ts` marks the gRPC packages external and traces the protos into the route.
- Added `src/lib/atlas-prompt.ts`, the system prompt that defines Atlas's identity and spoken-output rules: plain text only, one to three short sentences, no markdown, infer through transcription errors, use earlier turns, and never claim an action it did not take.
- Added `src/lib/cartesia-server.ts` with a shared token helper and arbitrary-text `synthesizeSpeech`; `api/voice-preview` now uses it instead of duplicating the token call.
- Added `api/orb/respond`, which streams NDJSON: `{"status":"thinking"}` immediately, then `{"status":"speaking","audio":"data:audio/mpeg;base64,…","transcript":"…","reply":"…"}`, or a friendly `{"status":"error","message":"…"}`. It accepts multipart audio or a JSON transcript, caps history at eight messages, and trims spoken replies to 600 characters.
- The dashboard now has one voice button instead of separate mic/record controls: the first tap opens the mic and starts recording, the second stops and sends; the same button reads `Thinking… tap to cancel`, `Talk again` while speaking, and `Try again` after an error. Clip playback was removed. The orb follows `thinking` → `speaking` → idle and the caption shows the reply or the failure reason.
- The session is text only. `dashboard-flow.tsx` keeps the last eight transcript/reply pairs in `sessionStorage` under `atlas-orb-session` and sends them as `history`; the clip is dropped as soon as the turn ends and the AI audio is dropped after playback, so no speech is retained.
- Timeouts now surface as readable messages instead of raw `AbortSignal` text: chat 90 s, TTS 60 s, demo token 20 s, with stage-specific errors; the client logs expected failures with `console.warn` so they no longer trip the dev error overlay. The SSR render no longer branches on `MediaRecorder`; support is checked on click, which fixes the hydration mismatch.
- Verified with `bun run typecheck`, `bun run lint`, and `bun run build`; a Playwright run with Chromium's fake microphone recorded the sample, reached `thinking` and `speaking`, returned to idle, and stored the two-message session. A curl request with history answered “What is my name?” with “Your name is Sky.”

## 2026-10-27 15:22 IST (09:52 UTC) — Free NVIDIA omni path and dead-code cleanup

- The dashboard's voice turn now sends the browser recording straight to the free `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` model as an inline `audio_url` data URI. The model transcribes the clip and writes the reply in one call, returning `{transcript, reply}` JSON with thinking disabled and `response_format: json_object`; Cartesia still speaks the reply.
- Removed the superseded Parakeet path entirely: `src/lib/nvidia.ts`, the vendored Riva protos, `scripts/nvidia-transcribe.mjs`, `scripts/nvidia/README.md`, the `nvidia:transcribe` package script, the `@grpc/grpc-js` / `@grpc/proto-loader` dependencies, and the gRPC/proto tracing in `next.config.ts`. The live path no longer needs ffmpeg, gRPC, or a separate text model.
- Collapsed `src/lib/atlas-prompt.ts` to one `ATLAS_SYSTEM_PROMPT`: the Atlas persona, spoken-style rules, history use, no-invented-actions rule, and the audio/JSON contract. The prompt now asks for English replies to match the omni model's language support.
- Simplified the omni MIME handling to strip codec parameters and pass the base audio type through, with a WebM fallback only when the browser gives no type. The recorder now prefers WebM/Opus, then MP4, then Ogg.
- Tightened route errors: missing `NVIDIA_API_KEY`, unexpected failures, and non-busy omni failures return generic user-facing messages; the server still logs the detail. Busy free workers map to "The assistant is busy. Try again in a moment.", and the stage label now distinguishes request, omni, and speech failures.
- Moved the duplicated `ChatMessage` type and `isChatMessage` guard into `src/lib/chat-message.ts`, shared by the dashboard's `sessionStorage` reader and the route's `history` parser, so the client and server validate the same shape.
- Verified with `bun run typecheck`, `bun run lint`, and `bun run build`. A WebM question with text history answered "Your name is Sky.", the JSON transcript path answered the same, and the Playwright two-turn flow stored the four-message text session with no hydration or console errors. The free omni worker can return 503 under load; that is mapped to the retry message. After the shared-contract refactor, the checks passed again and the JSON path answered correctly on retry.

## 2026-10-27 15:48 IST (10:18 UTC) — Hands-free orb conversation

- `/dashboard` is now a continuous, hands-free conversation. One **Start conversation** tap opens the mic; voice activity detection starts a clip on speech onset and sends it after roughly 1 s of silence, with no per-turn click. **End conversation** releases the mic and stops in-flight audio.
- Added a pure VAD state machine (`voice-activity.ts`) with arm delay, start/end thresholds, voiced-duration tracking, maximum utterance, silence, and cooldown rules, plus a `useVoiceActivity` rAF hook that reads a new raw `activityRef` from `useVoiceLevel`. Clips with less than 200 ms of voiced audio are discarded instead of becoming empty turns.
- Phase 1 is half-duplex: VAD is disabled while Atlas is thinking or speaking, then re-arms with a longer 900 ms delay after playback so the speaker tail does not trigger a new turn. The mic stream stays open between turns; session history remains text-only in `sessionStorage`.
- `useVoiceLevel` now exposes an idempotent `startRecording` (boolean), `stopRecording`, `discardRecording`, and `clearClip`; the old `stopMic`/`toggleRecording` surface was removed. The 20 s recorder safety and tab-hide path discard the clip, and a disconnected input track ends the session with a distinct reconnect prompt instead of a silent `Listening…` state.
- A busy free omni worker is retried twice with the same clip (1.5 s apart) before the caption shows a retry message. Expected busy failures no longer log a client warning or a server fault, so the dev overlay stays quiet.
- Verified with `bun test tests/voice-activity.test.js` (10 pass), `bun run typecheck`, `bun run lint`, `bun run build`, a live fake-mic Playwright run (one Start tap → one spoken turn → clean End), a mocked-route run (first turn, automatic re-arm, second turn, no request after End), a short-click run (no request), and a busy-route run (first attempt 503 → automatic retry → success, no warnings).

## 2026-10-27 16:30 IST (11:00 UTC) — Clearer hands-free voice capture

- Tuned voice activity for recognition: start/end RMS thresholds are 0.015/0.010, silence is 1 s, and minimum speech is 200 ms. The arm/cooldown early return now updates `lastUpdateAt`, so ignored delay is no longer credited as voiced time.
- The dashboard keeps a warm `MediaRecorder` running while VAD is armed, so the first syllable is captured before the VAD threshold fires. A 4 s pre-roll is discarded if speech never starts; after a reply the warm recorder waits the same 900 ms arm delay, so Atlas's speaker tail is not captured. `startRecording` is idempotent so the VAD start can confirm the warm recorder.
- Microphone requests now prefer mono/48 kHz and the recorder uses 128 kbps. Atlas's prompt resolves small transcription errors from context and only asks for clarification when the audio is empty or truly unintelligible; the omni request temperature is 0.3.
- Added a 75 s per-turn client timeout so a stalled request cannot leave the orb thinking forever, and a distinct `Mic disconnected — reconnect` state instead of reusing the connect-time error.
- Verified with `bun test tests/voice-activity.test.js` (10 pass), `bun run typecheck`, `bun run lint`, `bun run build`, the live/mock/short-click/busy Playwright runs, and a Chromium check that the warm pre-roll does not send an unsolicited turn during silence.

## 2026-10-27 11:00 IST (05:30 UTC) — Simplified JSON contract

- Replaced `reply` field with `speak` (TTS-safe plain text) and `conversation` (rich text for panel) in the AI response JSON: `{"transcript","speak","conversation"}`.
- Simplified `parseTurn()` in `nvidia-omni.ts`: direct `JSON.parse` only; removed markdown fence stripping, `reasoning_content` fallback, and double-encoding fallback. Invalid JSON now throws a clear error.
- Kept `{"status":"thinking"}` NDJSON event unchanged — server still sends it when the request starts, client still shows "Thinking…" and the thinking orb animation.
- Verified with `bun run typecheck`, `bun run lint`, `bun run build`, and unit tests (10 pass).

## 2026-10-27 12:00 IST (06:30 UTC) — Improved system prompt with few-shot examples

- Rewrote `atlas-prompt.ts` with structured sections: Identity, Conversation, Output Format, Unknowns, Rules.
- Added three few-shot examples showing expected JSON output for normal speech, unintelligible audio ("blah blah blah"), and empty audio.
- Unintelligible audio now prompts: `"I heard blah blah blah. What do you mean by that?"` instead of generic "I didn't catch that."
- Curl-tested against `/api/orb/respond` — model returns `{"transcript":"blah blah blah","speak":"I heard blah blah blah. What do you mean by that?","conversation":"I heard 'blah blah blah'. What do you mean by that?"}` matching the few-shot example exactly.
- Verified with `bun run typecheck`, `bun run lint`, `bun run build`, and unit tests (10 pass).

## 2026-10-27 13:00 IST (07:30 UTC) — Markdown rendering in conversation panel

- Installed `react-markdown` and `remark-gfm` dependencies.
- `ConversationPanel` now renders Atlas's `conversation` field as markdown (headings, bold, italic, code blocks, links, lists, strikethrough via GFM).
- User messages remain plain text.
- System prompt updated to instruct Atlas to provide real markdown content when asked for examples (not just say it will).
- Curl-tested: "Show some markdown examples." returns `conversation` with actual heading, bold, italic, code block, list, and link.
- Verified with `bun run typecheck`, `bun run lint`, `bun run build`, and unit tests (10 pass).

## 2026-10-27 16:42 IST (11:12 UTC) — Transcript panel with geometric avatars and text chat

- Reworked `conversation-panel.tsx` into a transcript: `ConversationPanel` shell plus a `TranscriptMessage` subcomponent. Avatars are geometric primitives — a solid circle for the user and a squircle for Atlas — coloured from the existing `ink`/`sage` tokens, replacing the old "U"/"A" letter avatars. Timestamps render under each bubble in small mono text.
- Removed the duplicate header X. The panel now has a single close button referenced for focus; the previous clear button was dropped because it read as a second close.
- Fixed the undefined `bg-surface/95` token by switching the panel to `bg-paper/95`.
- Added a text chat box at the bottom of the panel: submit sends `{ transcript, history }` as JSON to `/api/orb/respond`, which already supports the text-only path via `respondToText`. The send button and input disable while a turn is in flight, and the reply plays through the same audio path as voice turns.
- `ChatMessage` gained optional `id` and `timestamp`; `dashboard-flow.tsx` generates both when appending turns and on `readSession`, so keys are stable and times display. `sendText` mirrors the audio `respond` flow (NDJSON thinking → speaking → error, 75 s timeout, error caption).
- Focus moves to the close button on open and returns to the trigger on close; auto-scroll runs on open and on new messages; message entrances are skipped under `prefers-reduced-motion`.
- Verified with `bun run typecheck`, `bun run lint`, `bun run build`, and unit tests (10 pass).

## 2026-10-27 16:52 IST (11:22 UTC) — Clarify speak vs conversation in the system prompt

- Rewrote the `Identity` and `Output Format` sections of `atlas-prompt.ts` to state that `speak` and `conversation` are two separate outputs, not copies. `speak` is only what the voice says and must stay plain spoken text; `conversation` is the full on-screen answer and carries the real content, including markdown.
- Added the operative rule: every fact, example, and detail belongs in `conversation`; `speak` is a short spoken companion, never a substitute. Answers that need formatting, code, or steps go in full to `conversation` with a brief `speak` summary.
- Added a markdown worked example showing the actual headings, code, links, and lists inside `conversation`, and a note that "here are some examples" without the examples is a failure.
- Tightened the Rules: never defer ("sure, here are some examples", "I'll show you") unless the content is already in `conversation`; include content in `conversation` when unsure and summarise in `speak`.
- Verified the exact failing exchange live against `/api/orb/respond`: "explain how markdown works and give examples" now returns real markdown in `conversation` and a one-line summary in `speak`.
- Verified with `bun run typecheck`, `bun run lint`, and `bun run build`.

## 2026-10-27 17:43 IST (12:13 UTC) — Fix panel hydration error and pin the composer

- Fixed the `<pre> cannot be a descendant of <p>` hydration error in `conversation-panel.tsx`. Inline code was rendered as a `<pre>` block by the `code` override, so every inline snippet (`` `#` ``, `` `**bold**` ``) nested a block element inside a paragraph. The `pre` override now styles fenced code, the `code` override styles inline code, and neither can nest a block inside a paragraph. Headings, lists, blockquotes, tables, links, and rules have explicit styling too.
- Split the panel into three stacked sections inside one `flex flex-col` shell: a `shrink-0` header, a `min-h-0 flex-1 overflow-y-auto` transcript, and a `shrink-0` footer holding the composer. The chat box no longer scrolls with the messages or escapes the panel background. `min-h-0` is required so the transcript can shrink instead of pushing the composer off-screen.
- The panel is `inert` and `aria-hidden` while closed, so the composer cannot be tabbed into. The input is focused when the panel opens instead of using `autoFocus` while hidden, and focus is pulled back to the input after sending.
- Typed messages are echoed into the transcript before the request, and `sendText` now appends only the assistant reply, so a typed turn appears instantly with no duplicates.
- Verified with `bun run typecheck`, `bun run lint`, `bun run build`, and unit tests (10 pass). Browser-checked with Playwright against the running dev server: 26 layout and markdown assertions plus 14 typed-send assertions pass, with no hydration or console errors.

## 2026-10-27 18:50 IST (13:20 UTC) — Exa web search tool

- Added an on-demand `websearch` tool backed by Exa (`POST https://api.exa.ai/search`, `x-api-key`, honest `User-Agent: atlas/0.1.0`). The request is the Exa-recommended shape: `query`, `type: "auto"`, `contents: { highlights: true }`; no `numResults`, category, domain, date, or freshness filters.
- `nvidia-omni.ts` now loops up to two search rounds. The model may return `{"tool":"websearch","query":"…","transcript":"…"}`; the server runs the search, feeds compact results back, and asks for the normal `{"transcript","speak","conversation"}` object. A tool turn's transcript is preserved for the audio path.
- The orb route emits `{"status":"searching"}` before the Exa call. The dashboard maps it to the existing `searching` orb animation, keeps VAD off while searching, shows “Searching the web…”, and raises the turn timeout to 100 s for the extra model call.
- Search is best-effort: missing `EXA_API_KEY`, timeouts, 429s, and Exa outages are caught, logged, and returned to the model as a failed-search notice so the turn still answers without inventing sources. The final answer cites source URLs in `conversation`.
- Added `tests/exa-search.test.js` for result compaction and tool-request parsing.
- Added `EXA_API_KEY` to `.env` (never committed; `.env*` is in `.gitignore`).
- Verified with `bun run typecheck`, `bun run lint`, `bun run build`, `bun test tests/` (5 voice-activity + 5 exa-search = 15 pass), and curl checks against the running dev server confirming Exa returns results (Bun v1.4.4, Oct 22 2026) and the `searching`/`speaking` event stream works.

## 2026-10-27 20:25 IST (14:55 UTC) — Streaming omni turns, tool registry, PCM speech

- Audio upload is now 16 kHz mono WAV (`clipToWav` in `wav.ts`); the model card accepts only WAV or MP3. A browser clip that cannot be decoded still uploads as the original blob.
- `nvidia-omni.ts` streams the completion, emits the transcript and `speak` deltas, runs up to two JSON tool rounds, retries a truncated or reasoning-only reply, repairs invalid JSON without re-uploading the audio, and validates and caps the turn. HTTP 202/503/429 and in-stream `ResourceExhausted` frames map to typed `busy`/`timeout` errors. Native `tool_calls` stay behind `OMNI_NATIVE_TOOLS=1`; the JSON protocol is the default.
- New `orb-tools.ts` registry owns `websearch` and `get_current_time`: tool definitions, JSON and native-call parsers, argument validation, `runTool`, and the generated prompt section, so the runner and prompt cannot drift.
- Cartesia streams sentence-sized PCM16 at 24 kHz through `synthesizeSpeechStream` and `sentence-chunker.ts`. `use-pcm-player.ts` schedules chunks at `max(currentTime, nextStartTime)` for gapless playback and reports drain so VAD can re-arm. The whole-reply MP3 `/tts/bytes` path remains the fallback.
- `/api/orb/respond` emits `thinking`, `transcript`, `searching`/`tool`, `speak-delta`, `audio` (`pcm`, `sampleRate`, `seq`), `speaking`, `audio-done` on the PCM path or `audio-mp3` on the fallback, and a typed `error`.
- History is trimmed to ~6000 characters without splitting a user/assistant pair. `/dashboard` sends the voice and pace saved by `/start`, validated server-side against the Cartesia catalogs.
- One structured `orb-turn` log line per turn records `stage`, `ms`, `model`, `finishReason`, token counts, and `toolRounds`, with no user content.
- Added `wav`, `orb-turn`, `sse`, `orb-tools`, `history`, `speech`, and `omni-stream` tests plus the `scripts/omni-probe.mjs` diagnostic. `bun test tests/` passes 78 tests across 11 files; typecheck, lint, and build pass.

## 2026-10-27 20:40 IST (15:10 UTC) — Make current-events questions actually search

- Root cause of the missed searches: the audio and text requests appended “Return only the JSON object with the transcript and reply.” to the user message, which outweighed the system prompt's tool decision. The user message now carries only the transcript (or “Transcribe and answer this recording.”).
- `atlas-prompt.ts` puts the injected UTC date and current month first, defines two reply shapes (tool request vs normal answer), lists concrete trigger words, gives worked examples, and ends with a two-branch check. The tool section is generated from `orb-tools.ts`.
- Live checks: “latest version of Bun” → `websearch` → 1.4.4; “current Prime Minister of the UK” → `websearch` → Andy Burnham; stable prompts (name, arithmetic, markdown) stay on the non-search path. An audio turn also searched and answered normally.
- `tests/atlas-prompt.test.js` covers the date injection, trigger words, both shapes, and the final check.

## 2026-10-27 20:52 IST (15:22 UTC) — Start the caption, transcript, and voice together

- The route sends the full `speaking` event before awaiting TTS, then `audio-done` after the PCM chunks or `audio-mp3` with the fallback. Text no longer waits for the last sentence of audio, and audio no longer waits for the caption.
- The dashboard holds the first PCM chunks until the full text arrives, then reveals the caption, appends the conversation message, and schedules the first chunk in the same tick; later chunks enqueue as they arrive. `speak-delta` no longer drives the caption, so the text cannot run ahead of the voice.
- `turn-stream.ts` understands `audio-mp3`. The fallback still reveals the text and starts playback together.
- Verified with a mocked route in both orders (text delayed, audio delayed): the caption and conversation message appeared within 75 ms of each other and the first scheduled audio within 10 ms. A real typed turn showed the caption and conversation message in the same tick with playback already scheduled. `bun test tests/` (78), typecheck, lint, and build pass.

## 2026-10-28 11:16 IST (05:46 UTC) — Keep the reply when the voice fails

- `/dashboard` now reveals an already-received reply when a turn fails after `speaking`. Before, the text was only shown when audio arrived, so a failed TTS call showed the error and dropped the answer. The caption now shows the error and the conversation keeps the reply.
- The turn lifecycle moved out of `dashboard-flow.tsx` into `use-orb-turn.ts`: one `runTurn` handles both voice and typed turns, one `resetTurn` replaces five copy-pasted reset blocks, and the busy retry loop exists once. `dashboard-flow.tsx` is 452 lines, down from 891.
- `turn-stream.ts` owns the whole NDJSON contract as a discriminated union shared with the route, plus `fetchTurnStream`; `use-turn-stream.ts` is gone. A frame with an unknown status or a missing payload is ignored instead of dispatched as an empty string.
- `chat-message.ts` owns `parseHistory`/`toModelHistory` and the 6,000-character per-message cap, so the client and route share one history policy. History sent to the model stays text-only (no ids, timestamps, or sources).
- Verified with `bun test tests/` (101 pass), typecheck, lint, build, and Playwright against a mocked route: the happy path still shows text and audio together, a `speaking`-then-`error` turn keeps the reply and shows the voice error, and a busy worker is retried exactly twice before the third attempt answers.

## 2026-10-28 11:38 IST (06:08 UTC) — One status at a time, one tool round, one Cartesia request

- The route no longer sends an upfront `{"status":"thinking"}` frame. `/dashboard` already starts a turn in `thinking`, and every later status now follows something the model actually did: a web search emits `searching`, the answer emits `speaking`. Nothing visible changes; the stream just stops claiming work before it starts.
- Tool calls from one model reply now run together (`Promise.all`) and return as a single results message instead of a second round trip, and citations reuse one `CITATION_INSTRUCTION`. Search hits are titled by Exa, never by the URL, and a citation that only adds tracking parameters still matches its result.
- `cartesia-server.ts` builds the byte and stream requests once through `postCartesia`, so the MP3 fallback and the PCM path cannot drift on headers, token, or body.
- `use-orb-turn.ts` owns the turn and `dashboard-flow.tsx` keeps the mic session; `orb-chrome.ts` holds the orb state and button copy, and `orb-reveal.ts` the reveal decision. The conversation panel now settles its first client render through `useHydrated` instead of a zero-delay timer, so session history renders without a hydration mismatch.
- Removed dead paths: the unused `audioFormat` form field, the never-thrown `search` error code, the unused `playing` player state, and the `runTool` text wrapper (tests use `runToolWithSources`).
- Verified with `bun test tests/` (112 pass), typecheck, lint, build, and Playwright against a mocked route: the happy path, a `speaking`-then-`error` turn, the busy retry, and a `sessionStorage` history panel all render with no console errors.

## 2026-10-28 12:06 IST (06:36 UTC) — One tool contract, bounded tool loop

- Tool requests now use `{"tool","arguments","transcript"}` everywhere: the schemas, the parser, `renderToolPrompt`, and the prompt examples. The old flat `{"tool":"websearch","query":…}` shape is still accepted, so a cached prompt or a model habit cannot silently turn a search into an answer. Both definitions are `strict`-compatible (`additionalProperties: false`, `get_current_time` takes a nullable `timezone`).
- `classifyToolOutput` replaces the boolean "did it parse" check with three outcomes: no tool intent, a broken request (unknown tool, missing argument), or valid requests. A broken request gets one corrective message carrying the canonical shape, and it counts against the three-round budget, so a model that keeps emitting `web_search` cannot loop or be mistaken for a final answer.
- `repairTurn` now appends to the turn's own `messages` instead of rebuilding the request from `history`. A JSON failure after a search is repaired with the search results still in context, and the reply's citations still match the sources the turn collected.
- One 90 s `AbortSignal.timeout` covers the whole turn and is threaded through every model request; `postModel` composes it with the 60 s per-request timeout via `AbortSignal.any`. Previously up to five 60 s calls could run behind a client that had already timed out at 100 s. A client disconnect (`request.signal`) now ends the turn too, and the route logs `stage: "aborted"` without sending an error frame or starting TTS.
- Native calls (still `OMNI_NATIVE_TOOLS=1` only) are answered one-for-one by `tool_call_id`, invalid calls included, and the tool round is requested without `response_format`, since JSON mode can suppress the tool call the request exists to produce.
- A tool request is never spoken: `streamCompletion` refuses to emit `speak` deltas once a `tool` field has appeared. Search results reach the model inside an `UNTRUSTED_SEARCH_RESULTS` fence, labelled as data rather than instructions.
- `scripts/omni-probe.mjs` sends the same strict tool schema the app sends and adds probe 7 for `response_format: json_schema`; the default response format stays `json_object` until that probe returns the three keys in order.
- Tests: `tests/orb-tools.test.js` and `tests/atlas-prompt.test.js` cover the nested shape, null nullable arguments, and each classification; `tests/omni-stream.test.js` covers repair-with-evidence, one correction for a broken request, the round cap ending in `no_reply`, per-id native results, duplicate searches running once, the turn-wide deadline, and the hybrid tool+speak reply. `bun test tests/` (124 pass), typecheck, and lint pass.

## 2026-10-28 14:00 IST (08:30 UTC) — Icons and fonts moved to public/assets

- Moved `src/app/favicon.ico` to `public/assets/icons/favicon.ico`; the root layout now references it with a manual `<link rel="icon" href="/assets/icons/favicon.ico" />` since Next.js no longer auto-picks it from `app/`.
- Moved `src/app/fonts/DepartureMono-Regular.woff2` to `public/assets/font/DepartureMono-Regular.woff2`; `layout.tsx` updated the `localFont` src path accordingly. Only the license file remains in `src/app/fonts/`.
- Removed `src/app/fonts/` entirely (the font now lives in `public/assets/font/`; only its license file remained).
- Updated `AGENTS.md`: tree structure reflects the moves, `fonts/` and `favicon.ico` descriptions corrected, `public/assets/` block added, missing `prompt-dock.tsx`, UI files (`input-group`, `input`, `textarea`), and tests (`orb-turn`, `web-fetch`) added to the structure and descriptions.
- Verified with `bun run typecheck`, `bun run lint`, and `bun run build`.

## 2026-10-28 14:30 IST (09:00 UTC) — Review fixes: terminal forced answer, cap-before-call, fence budget

- `forceAnswer` is now terminal in native mode: the forced call drops `tools` (`allowTools: false`), and any remaining `tool_calls` throw `no_reply` with no repair request. In the JSON path, a further tool object after the cap also throws `no_reply` instead of being repaired.
- The three-round cap is now checked *before* the model call, not after. A model that keeps requesting tools costs exactly 3 tool rounds + 1 forced-answer call (4 requests), not 5. The previous code burned one extra request on the round that triggered the cap.
- `composeTurnSignal(external, budgetMs)` extracts the `AbortSignal.any([external, AbortSignal.timeout(TURN_BUDGET_MS)])` composition; `TURN_BUDGET_MS` is 90_000 ms. An aborted client signal stops the turn immediately with `code: "timeout"` and zero model calls.
- An abort during the SSE body read is now mapped to `OrbError("timeout")` instead of escaping as `audio`, so an expired turn deadline reports honestly.
- A disconnected client no longer triggers the whole-reply Cartesia MP3 fallback.
- `onTool` announcements are deduplicated per round, so identical duplicate searches emit a single `searching` frame.
- Native calls are echoed one-for-one: `tool_calls` in the assistant message exactly match the `tool_call_id`s in the following tool messages, even when the provider sends malformed calls.
- Search results are budgeted *before* serialization in `formatSearchResults` via `budgetSearchHits` (~3 000 char JSON budget). Hits are trimmed and dropped to fit, the closing `UNTRUSTED_SEARCH_RESULTS>>>` fence marker always survives, and the fence marker is neutralized inside hit text. The old 4 000-char slice ran after serialization and could cut the fence mid-array; `MAX_TOOL_CONTENT_CHARS` remains only as a safety net for short non-search tool output.
- The omni endpoint itself works correctly; the 4 000-char result cap and the Exa compaction (8 hits × 600-char highlights) are scaffolding to remove once the model handles long results reliably.
- Tests: 135 pass across 14 files, covering terminal forced answer, native id pairing, native no-response_format, composeTurnSignal composition, external cancellation, fence validity, fence marker neutralization, and deadline behavior. Typecheck, lint, and build all pass.

## 2026-10-28 13:03 IST (07:33 UTC) — Web fetch tool, per-argument limits, turn-wide tool cache

- Added `src/lib/web-fetch.ts` and an app-side `webfetch` tool (the provider is NVIDIA, so Claude's server-side `web_fetch` does not apply). It reads one public URL, rejects non-http(s), credentials, non-standard ports, localhost, `.local`/`.internal`, and private or link-local IP literals, follows at most three redirects with each hop validated, caps the body at 512 KB, accepts HTML/plain text/Markdown/JSON, and rejects PDFs and binary types.
- Fetched pages are converted to readable text (no scripts, styles, head, or page chrome), capped at 3,000 characters, and optionally narrowed by a `focus` string that ranks paragraphs before the cap. The result is fenced as `UNTRUSTED_WEB_PAGE` and keeps its URL and title as a `SourceLink`; the page label is shortened so the tool-result cap cannot cut the closing marker.
- `orb-tools.ts` now registers `webfetch` next to `websearch` and `get_current_time`. Argument caps are per tool instead of one 400-character cap: query 400, URL 2,048, focus 200, timezone 64. A long but valid URL is no longer corrupted before validation.
- A mixed tool array no longer drops its invalid siblings. `classifyToolOutput` returns `{requests, errors}`; `formatToolResults` returns the real results plus a “Rejected tool calls (not run)” section, so the model can correct a call it assumed ran.
- `websearch` and `webfetch` receive the turn signal, so a client disconnect or the 90 s deadline also stops the Exa request and the page fetch. `exa.ts` composes that signal with its own 15 s timeout via `AbortSignal.any`.
- The tool cache moved from one round to the whole turn: the same search or fetch is executed once even when a later round repeats it, while different independent calls still run through `Promise.all`.
- The system prompt and the protocol-correction message now describe a generic tool request, add the fetch branch and example, and state that a URL must come from the user or a search result and that fetched text is data, never instructions.
- Tests: added `tests/web-fetch.test.js` and extended `tests/orb-tools.test.js`, `tests/omni-stream.test.js`, and `tests/atlas-prompt.test.js` for URL validation, HTML extraction, focus selection, fetch success/failure, partial-invalid calls, a search→fetch dependent sequence, cross-round deduplication, and turn-signal propagation to tools. `bun test tests/` (164 pass), `bunx tsc --noEmit --incremental false`, `bun run lint`, and `bun run build` pass.

## 2026-10-28 13:18 IST (07:48 UTC) — Deduplicated system prompt

- Rewrote `atlas-prompt.ts` around one home per rule, following the Gemini prompting guide's advice on structure, consistent few-shot examples, and critical output constraints at the start and end. The prompt now has one reply-format section, one tool section generated by `orb-tools.ts`, one conversation section, one speech/uncertainty section, one examples block, and one final check.
- Removed the repeated search-trigger list, the duplicated “tool request” description, the second “after a search” rule, the second clarification rule, the repeat of the no-announcement rule, and the redundant negative example block. The trigger list is stated once under “When to use a tool”; the final check refers to it instead of restating it.
- Kept the high-value examples (normal answer, markdown answer, Bun search, India/Pakistan search, URL fetch) and made their formatting consistent. The markdown example was shortened; the wrong-answer block was dropped because the final check already carries the anti-announcement rule.
- The generated tool section now separates “When to use a tool” from “Running a tool”. Tool protocol details (shape, independent vs dependent calls, result handling, three-round cap, untrusted fences) are stated once, and the date rule lives only in the injected `## Today` header.
- Tests: updated the prompt assertions for the consolidated negative-answer wording and the capitalized protocol rule. `bun test tests/` (164 pass), `bunx tsc --noEmit --incremental false`, `bun run lint`, and `bun run build` pass.

## 2026-10-28 13:35 IST (13:35 UTC) — Tool traces in the conversation panel

- Added `src/lib/tool-trace.ts`: the `ToolTrace` shape (`tool`, optional `detail`), a guard for stored session messages, a 512-character detail cap, middle-shortening for long URLs, and one running/done label map shared by the pending row and the finished reply.
- The tool event now carries what the user can read: `searching` includes the search `query`, and `tool` includes a `detail` (the fetched URL). `nvidia-omni.ts` forwards the argument, the route serializes it, and `turn-stream.ts` validates and dispatches it. Two calls to the same tool with different URLs are announced separately.
- `use-orb-turn.ts` tracks the active trace and the turn's traces. The live row shows `Fetching <url>…` while the fetch runs; the finished assistant message keeps up to six traces in `ChatMessage.tools`, so the rows survive in `sessionStorage` and in the transcript after the turn.
- `conversation-panel.tsx` now renders `Fetching <url>…` with the existing shimmer, and after completion shows a collapsed stack-trace-style row (`TraceCollapsible`) under the reply. The trigger uses the shortened URL (host plus path tail), while the expansion holds the full URL as an external link; search traces expand to their query. The full URL is also available as the trigger's title.
- `ChatMessage` validation accepts only known tool names and string details, so an old or malformed session cannot crash the panel.
- Tests: added `tests/tool-trace.test.js` and extended `tests/turn-stream.test.js`, `tests/omni-stream.test.js`, and `tests/history.test.js` for detail forwarding, long-URL shortening, labels, and stored-message validation. `bun test tests/` (175 pass), `bunx tsc --noEmit --incremental false`, `bun run lint`, and `bun run build` pass.

## 2026-10-28 13:43 IST (13:43 UTC) — URL questions fetch instead of looping

- A bare URL question such as “what is this https://ui.shadcn.com/docs/components/base/trace” now routes to `webfetch`. The tool rule says any http(s) URL in the message is a request to read it, including a bare link or “what is this <url>”, and the final check asks for a URL rather than “a specific URL to read”.
- Added a matching fetch example and an anti-loop rule: never ask the same clarifying question twice; if the user answers it, act on the answer and the earlier request, so a short follow-up like “info” continues the URL or topic they already gave.
- The completed trace now follows the documented Trace composition: `TraceLine` sits inside `TraceCollapsibleTrigger`, and the external link announces “(opens in a new tab)” to screen readers.
- Tests: extended `tests/atlas-prompt.test.js` for the URL example and anti-loop rules. `bun test tests/` (176 pass), `bunx tsc --noEmit --incremental false`, `bun run lint`, and `bun run build` pass.

## 2026-10-29 13:25 IST (07:55 UTC) — Removed the spoken-reply character cap

- Deleted `MAX_SPEAK_CHARS` (600). `normalizeTurn` no longer truncates `speak`, and the streaming path in `model.ts` computes `speak` deltas from the full field instead of a 600-character slice. `MAX_TRANSCRIPT_CHARS` (4,000) and `MAX_CONVERSATION_CHARS` (6,000) remain.
- Renamed `trimForSpeech` to `normalizeSpeech`: it now only collapses whitespace and trims, so TTS receives the model's complete spoken text. The route applies it per sentence and to the final `speak`.
- Updated the prompt's voice guidance from “one to three sentences, usually under 60 words” to “two to four complete sentences, usually under 100 words unless the user asks for detail.” The conversation hint now matches the enforced 6,000-character cap instead of the stale 4,000.
- Tests: `orb-turn.test.js` now asserts a 2,000-character `speak` survives intact, whitespace is normalized without truncation, and `conversation` still caps at 6,000; `atlas-prompt.test.js` pins the new 100-word target and the absence of the old 60-word cap. `bun test tests/` (202 pass), `bunx tsc --noEmit --incremental false`, `bun run lint` (warnings only), and `bun run build` pass.

## 30 October 2026 23:15 IST (23:15 UTC) — Next button removed end to end; timer prompt shortened and neutralized

Deleted the `<next />` widget as a feature while keeping it safe as unknown text:

- `lib/interactive-markdown.ts` rewritten timer-only: one `parseTimerAttributes`, no `parseNextAttributes`/`parseWidget` name dispatch, no next label/send/show validation. The single allowlist sentence is now "Allowed: timer, label, send, show." A `<next … />` line is unknown Markdown and renders as escaped text; the malformed-line branch survives for unterminated tags.
- Deleted `dashboard/next-card.tsx`; `dashboard/interactive-markdown.tsx` renders only `TimerCard` (the `<NextCard>` branch is gone).
- `tools/create.ts`: description teaches only the timer widget; `id`-hint no longer mentions next targets.
- Prompt: `instructions/identity.ts` and `rules.ts` carry the timer only — `### Timers` + `### Next buttons` merged into one short, neutral `### Timer widget` section (required timer, 1000–1800000 ms, 30-minute cap with the "say it is capped" wording, label/send/show in one bullet, "Never say a timer is running"); the next-button example left `instructions/examples.ts`; `rules.ts` "content" bullet says "the timer tag below" and `cards.ts`'s id comment drops the next reference. Backticks inside the template literal escaped.
- Tests: `interactive-markdown.test.js` deleted its parse-next suites and added pins for next-as-escaped-text, the timer-only allowlist sentence, and Duo two-timer plain-text preview; `create.test.js` now asserts no `<next` and no "next button"; `atlas-prompt.test.js` pins `### Timer widget`, the exact `<timer timer={300000}`, "The maximum is 30 minutes", "say it is capped", "Never say a timer is running", `show="step-3"`, and that `### Next buttons`/`<next` are absent.
- `AGENTS.md`: dropped the `next-card.tsx` tree entry and every next-button mention in the component/tool/prompt/contract descriptions.
- Verified: `bun test tests/` 259 pass / 0 fail, `bunx tsc --noEmit` clean, lint 32 warnings (one fewer than the 33 baseline; documented as pre-existing parity, no new warnings).

## 30 October 2026 23:15 IST (23:15 UTC) — model.ts restructured; API-key/TTS boundary sanitized

Rebuilt `lib/model.ts` around one turn loop without changing the wire behavior the tests pin:

- Dead constants removed (`_RETRY_MAX_REPLY_TOKENS`, `_MAX_TOOL_CONTENT_CHARS`); the loop keeps `MAX_TOKENS` 1_200 for both the initial call and the cut-off retry, `reasoning_effort: "low"`, no `stream`, the `x-session-affinity` header, and per-call tool messages.
- New `TurnState` (transcript, sources, cards, speakSegments) is threaded through small helpers: `reporterFor` (per-round announce dedupe for repeated search queries), `speakSegment`, `useTranscript`, `announce`, `collectCards`/`uniqueCardId` (six-card cap, stable ids), `echoedAssistant`, `endWithContent` (JSON-intercept continuation now returns null and the loop counts a round and continues instead of recursing), `finalize`/`finalizeTurn`.
- The speak-tool announce loop restored: each speak call reports a `speak` trace with an 80-character detail, matching the tool-trace row in the dashboard.
- Verified: `bun test tests/` 259 pass / 0 fail (including all 41 omni-stream tests: retried shape, intercept path, dedupe, forced answer, affinity header, sanitizeSpeak filters), `bunx tsc --noEmit` clean.

## 2026-10-31 23:59 UTC — Signed turns: ASL video input (one-way, camera → text transcript)

Added a camera path so the user can sign in ASL; the existing voice-turn pipeline answers with speech/cards unchanged:

- `lib/sign-frames.ts` (new): signed-turn frame contract — data-URL JPEG/PNG validation, 6-frame cap, 400 KB per frame, 1.5 MB total, `parseSignFrames`/`framePayload`/`frameMimeType` helpers. Frames are dropped after the turn, like audio clips.
- `lib/orb-errors.ts`: new `video` code ("I couldn't see the signing. Try again.").
- `lib/model.ts`: `image_url` content part + `respondToFrames` (frames + "Transcribe the American Sign Language signing…" instruction; transcript flows through the normal tool-call path).
- `app/api/orb/respond/route.ts`: `TurnInput.frames`, JSON `frames` parsing (empty-but-requested → typed `video` error), dispatch audio → frames → text.
- `components/dashboard/use-sign-video.ts` (new): camera session mirroring `use-voice-level` (token/watchdog/mounted/disconnected/denied patterns), 1 fps JPEG capture at 640 px, press-and-hold capture, explicit disable.
- `components/dashboard/use-orb-turn.ts`: `respondFrames` (JSON body, `echoTranscript: true` like audio).
- `components/dashboard/dashboard-flow.tsx`: camera toggle + mirrored preview + hold-to-sign button (pointer + keyboard), half-duplex (disabled while the turn is busy), sent-frames effect mirroring the clip flow, camera disabled on end-conversation/preview.
- Prompt (`instructions/rules.ts`): signed-turns rule (read frames in order, fingerspelling composes words, ask one specific clarifying question if unclear).
- `scripts/omni-probe.mjs`: probe 8 (`image_url` transport check with a 1x1 red PNG; ASL comprehension still needs a live-key test with a real hand photo).
- Tests: `tests/sign-frames.test.js` (contract caps + mocked `respondToFrames` turn verifying `image_url` parts and transcript), prompt pin, `tests/README.md` row.
- Verified: `bun test tests/` 333 pass / 0 fail, `bunx tsc --noEmit` clean; lint shows only pre-existing warning patterns.

## 2026-11-01 UTC — Signed-turn live validation (test.mp4, HELLO sign)

Ran the sampler-equivalent frames (1 fps, 640 px JPEG) from `/home/sky/Downloads/test.mp4` through the live model via `/tmp/opencode/signtest/live-test.mjs` (same `image_url` message shape as `respondToFrames`):
- The model correctly read rest → hand-at-forehead → rest as the ASL citation form of HELLO, with sound reasoning (salute-like movement outward, palm forward).
- Caveats recorded: the clip has an on-screen "Hello" caption the model could lean on (its reasoning cites the handshape, but a caption-free clip is the stricter test), and the clip contains no "laugh" sign, so multi-sign utterances are still untested. No code changes; pipeline as built is sufficient for clear isolated signs.

## 2026-11-01 UTC — Signed-turn live validation #2 (GOOD MORNING, 2-sign utterance)

After doubling the sampler to 2 fps and raising the cap 6 → 8 (`use-sign-video.ts`, `sign-frames.ts`):
- Re-extracted `5212087-uhd_3840_2160_25fps.mp4` at sampler settings: 8 frames cover rest → GOOD → MORNING → rest; all pass `parseSignFrames`.
- Live model reply transcribed the 2-sign utterance as GOOD MORNING with correct per-sign reasoning.
- Standing caveats: burned-in "GOOD MORNING" caption present (reasoning cites both caption and handshapes — a caption-free clip is still the strict test); content pasted truncated, conclusion unaffected. No code changes needed.

## 2026-11-01 UTC — HTTPS dev server for camera testing

All app traffic (Baseten, Exa, Cartesia) already uses HTTPS — no plain-HTTP external calls exist in `src`/`scripts`. Added `bun run dev:https` (`next dev --experimental-https`, self-signed cert) so the dashboard camera can be tested from non-localhost devices, where `getUserMedia` requires a secure context. Localhost testing works over plain `bun dev` (localhost is a secure context).

## 2026-11-01 UTC — Tap-to-sign toggle + sign-thinking prompt

- Dashboard: hold-to-sign replaced with tap-to-start / tap-to-send toggle (`handleSignToggle`, "Sign" / "Signing… tap to send"), keyboard accessible via native button activation; `use-sign-video.ts` capture primitives unchanged.
- Model instruction (`respondToFrames`) and standing prompt rule now require a think step: work out handshape, location, and movement per frame, then read signs in order and transcribe; never transcribe a sign not visible.
- Verified: `bun test tests/` 333 pass / 0 fail, `bunx tsc --noEmit` clean.

## 2026-11-01 UTC — /test is now a sign-video console on NVIDIA's omni model

Findings: the Baseten OpenAPI spec allows only text/image_url/input_audio parts — no video input. NVIDIA's free Build endpoint lists `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`, which accepts mp4 bytes as a `video_url` part (`moonshotai/kimi-k2.6` and `nvidia/cosmos-reason2-8b` are listed but not entitled for this key; the endpoint caps payloads at ~25 MB). The omni model is a heavy reasoner: it spent 1024–4096 tokens thinking and returned no content until `reasoning_effort: "none"`, which yields clean transcripts ("Hello", "Good morning.").
- `lib/nvidia-sign.ts` (server-only): `assertSignVideo` (mp4/webm/mov, 15 MB cap), `transcribeSigningVideo` (video_url part, reasoning off, temperature 0), typed `NvidiaSignError`. Key stays server-side.
- `app/api/sign-test/route.ts`: multipart upload → transcription JSON (transcript, model, token counts, ms).
- `/test` is now a tabbed console: "Sign video" (upload + instruction + run + result) and "Orb" (the previous inspector, via a `bare` mode on `TestOrb`).
- Verified live through the dev server: good-morning-small.mp4 → "good morning" in ~3.5 s. `bun test tests/` 337 pass / 0 fail, `bunx tsc --noEmit` clean, lint clean for new files.

## 2026-11-01 UTC — /test sign console gains Muse Spark provider option

The opencode catalog confirms `muse-spark-1.3` takes video input at `https://opencode.ai/inference/openai/v1` (OpenAI-compatible, `video_url` part). But the stored opencode key is expired (`api_key_expired`) — a new key from OpenCode Console is required before the live path works.
- `lib/nvidia-sign.ts`: `SignProvider` (`parseSignProvider`), per-provider key/URL/model switch; opencode branch documented as live-untested pending a renewed key.
- `app/api/sign-test/route.ts`: accepts a `provider` field (allowlisted).
- `/test` sign tab: provider select — NVIDIA omni (proven) default, Muse Spark (needs key).
- Tests: provider parsing + opencode request-shape test (mocked). Verified: 339 pass / 0 fail, `tsc` clean.

## 2026-11-01 UTC — inference_failed fixed: Muse Spark via Go Responses API

The opencode chat-completions endpoint cannot serve `muse-spark-1.3-contributor` ("Model is unavailable"; the `-free` variant is deprecated and also unavailable; `muse-spark-1.3` on the standard endpoint needs a funded pay-as-you-go balance). The working path per the Go docs is the Responses API: `POST https://opencode.ai/inference/go/openai/v1/responses` with model `muse-spark-1.3-contributor`, `input` parts (`input_text` + `input_video` data URL), `reasoning: {effort:"minimal"}`, and an `x-opencode-session` header.
- `lib/nvidia-sign.ts`: opencode branch rewritten to the Responses shape (output `output[].content[]` `output_text` parsing, `input/output_tokens` usage mapping, per-request `ses_` session id).
- Live through `/api/sign-test`: test.mp4 → "Hello" (2.7 s); WIN_20261031_11_11_21_Pro.mp4 → "I love you"; WIN_20261031_11_11_42_Pro.mp4 → "YOU LOVE ME".
- UI label updated to "Muse Spark 1.3 (video)".

## 2026-11-01 UTC — Dashboard signing is now record → transcribe → text turn

Per request, the stills path is gone: the dashboard records a video clip, `POST /api/orb/transcribe` sends it to Muse Spark with only the transcription prompt (never the Atlas system prompt), and the returned text enters the normal turn via `sendText` — so the full system prompt, tools, cards, and speech apply there.
- `use-sign-video.ts`: press-hold frame grabbing replaced with MediaRecorder clip capture (`recording`/`clipBlob`, 30 s cap, hidden-tab discard).
- `app/api/orb/transcribe/route.ts` (new): clip in, `{transcript}` out, opencode-only, typed errors.
- `dashboard-flow.tsx`: tap to record/stop → transcribe ("Reading your signing…") → `sendText`; failures surface via `failTurn`.
- Removed dead stills path: `sign-frames.ts` + its tests, `respondToFrames` (+ `image_url` part), route frames branch, prompt video-frames rule.
- Think-step moved into `DEFAULT_SIGN_PROMPT` (handshape/location/movement, never transcribe unseen signs).
- Verified: `bun test tests/` all pass, `tsc` clean; live WIN_20261031_11_11_21_Pro.mp4 → "I love you" through the app route.

## 2026-11-01 UTC — NVIDIA removed; research-backed sign prompt; universal media context

- Deleted the NVIDIA path entirely (`lib/nvidia-sign.ts` → `lib/sign-video.ts` opencode-only; route + `/test` UI provider selects removed; `SIGN_VIDEO_MODEL = muse-spark-1.3-contributor`).
- Research pass (arXiv sign-language-translation survey + SignLlama/AttnSign/DualAnchor/SignGPT/ReSCUE findings): prompt now forces visual primacy (ignore captions), three numbered passes, no fluent-English smoothing, cross-check hands vs on-screen text, `Transcription:` final line. `/orb/transcribe` extracts only that line (≤30 words) or a bare short reply, else fails clean.
- Validation: HELLO / GOOD MORNING / I LOVE YOU / YOU LOVE ME correct; caption-adversarial clip (GOODBYE text over HELLO signing) reads HELLO from the hands.
- Universal media context: dashboard keeps the last signed clip; the immediately following turn (text or audio) carries sampled stills as `mediaFrames` so "that sign" resolves against video, not just words. One-shot (cleared after attach or on new media/end).
- Verified: 337 pass / 0 fail, `tsc` clean, lint zero errors.

## 2026-11-01 UTC — H-sign test finds the perception floor (not a prompt bug)

- New prompt drops the caption clause, adds fingerspelling run-together + stillness-decides-letter rule, mirrored to the test page.
- Hard clip `H ASL [r2lXfwwPiLc].mp4` (held H handshape at cheek): model reads CANDY, then SHE/HER, then HOME across runs — never H. A direct probe ("how many fingers extended?") answers "1 index" while the frames unambiguously show two.
- Conclusion: finger-count/orientation distinctions (H vs U, E/S/A/M/N family) sit below this pipeline's perception floor at typical framing distance — no prompt wording fixes miscounted fingers. Mitigations: sign close to the camera, hold static letters, good light (hint already on the Sign button). Single-shot transcription of ambiguous handshapes stays best-effort with fail-clean retry.
- Regression check: HELLO / GOOD MORNING / I LOVE YOU / YOU LOVE ME still transcribe correctly.

## 2026-11-01 UTC — Research-backed prompt v3 + H-sign perception floor

Applied three sources to DEFAULT_SIGN_PROMPT (server + /test mirror kept in sync):
- Mt. SAC 5 Parameters: pass 2 now requires handshape (categorical label), palm orientation (in/out/up/down/left/right), movement (path + repeats), location (chin/forehead/chest/front, start→end), non-manuals (head/brows/eyes/mouth open-closed), 1H vs 2H with each hand's role.
- Ding & Martinez: all components required (subsets inappropriate); stillness decides letter-vs-lexical sharing a handshape; trust fingers visible across most frames; movement bursts mark segment boundaries.
- Terhune-Cotter & Emmorey: read as language, not gesture-guessing (resemblance is not evidence); mouth and face carry phonological load; iconicity ignored.
- Caption handling: model must write down on-screen text first, then ignore it; Transcription line required (≤12 words, UNCLEAR fallback). Extraction is label-agnostic (Transcription: line → short tail → short full text → 502 retry).
- H-sign hard case (`H ASL [r2lXfwwPiLc].mp4`, held H at cheek): CANDY/APPLE/HOME/SHE reads — never H. Direct probe ("how many fingers extended?") answers "1 index" on a clear two-finger hold: finger-count resolution at conversational distance is below this pipeline's perception floor. No prompt fixes that; mitigation is physical (close to camera, hold still, good light) or a hand-crop stage.
- Validation: HELLO / GOOD MORNING / I LOVE YOU stable; caption-adversarial GOODBYE-over-HELLO reads HELLO from the hands; WIN_20261031_11_42_Pro.mp4 was deleted mid-test (last reads: YOU LOVE ME / YOU LOVE).
- Verified: 337 pass / 0 fail, tsc clean.

## 2026-11-01 UTC — handpose/ Phase 2 fixed: motion-gated selection (LibHand rejected)

- Phase 1 verdict: LibHand cannot build here (CMake 4.4 rejects its 2.8.6 floor; OGRE 1.9 required but unobtainable; no Boost/Xaw dev headers; 2014 OpenCV API vs OpenCV 5; OGRE-typed API). Custom parametric hand model instead, per the spec's own fallback.
- New `handpose/` tree (Atlas untouched): CameraManager (camera index or file), HandSegmenter (YCrCb skin + morphology + hull/defects + tip/valley/wrist candidates), calibration (assumed 60° FOV intrinsics + file override; depth explicitly estimated-never-measured), NDJSON output, ctest suite.
- Motion-gated selection fixes the face-vs-hand failure on the H clip: moving skin wins over larger static blobs; static face-only blobs vetoed; stickiness keeps holds; valley-adjacent fingertip filter kills elbow false positives; motion sub-box marks the hand part of merged blobs. Verified visually: rising hand isolated at conf 1.0 while the face is ignored.
- Known limit (honest): static holds adjacent to the face still lock the face — pure contour methods cannot split them. Queued for Phase 5 (articulated model fit) + Phase 6 (identity tracking). Verified: ctest passes, ~20 ms/frame on 720p, tsc/lint untouched (C++ tree).

## 2026-11-01 UTC — handpose usable end to end (daemon + bridge + /handpose)

- Daemon emits normalized hull/tips/valleys/wrist in NDJSON (`--annotate out.png [--at N]`, `--bin` override for the bridge; in-tree build at `handpose/build/`, gitignored).
- `handpose/bridge.ts`: spawns the daemon and republishes frames over WebSocket (:3799). No WASM (no emscripten here); native daemon + browser client instead.
- New `/handpose` page: local camera preview with 2D feature overlay (bbox, motion box, hull, tips, valleys, wrist), Three.js panel with orbit (points on z=0, badge states depth is estimated not measured), fps/ms/confidence readout. Three.js added as a dependency.
- Verified live: file source → bridge → WS JSON with features at ~25 ms/frame; /handpose serves 200; ctest + bun suite green (337), tsc/lint clean. Browser-camera path untestable headless — needs a real run on the laptop.

## 2026-11-01 UTC — Removed the OpenCV hand-tracking track

Per request, deleted the entire model-free CV build (`handpose/` C++ pipeline, bridge, `/handpose` page, three.js): too much machinery for the job. The kept path stays simple — dashboard records a video clip, the clip goes straight to the video AI for transcription, and the text enters the normal turn. Verified after removal: tsc/lint clean, 337 tests pass, `/api/orb/transcribe` live test still returns HELLO.

## 2026-11-01 UTC — Checkbox widget alongside the timer

- New `<checkbox label="…" />` block widget (own line at column 0, outside code fences): label required (≤80), optional `checked="true|false"`, no `send`/`show` — it reports nothing and opens nothing. Unknown checkbox attributes are model-readable failures, same as timers.
- `lib/interactive-markdown.ts`: discriminated `WidgetBlock` union, per-tag attribute validation, shared `WIDGET_NAMES` allowlist (add future widgets there instead of another negated if).
- `components/dashboard/checkbox-card.tsx`: accessible toggle (`<input type="checkbox">` + label), local state only.
- Prompt + tool contract teach both widgets: `rules.ts` gains `### Checkbox widget`, `create` description names both.
- Verified: 350 pass / 0 fail (13 new checkbox tests), `tsc` + lint clean.

## 2026-11-01 UTC — Even vertical rhythm in cards

- `InteractiveMarkdown` now lays blocks out in a `flex flex-col gap-3` stack instead of a bare fragment, so Markdown chunks and widgets share one even rhythm; dropped the timer's own `my-3` (it doubled up with the stack gap).
- Verified visually with a temporary all-widgets page (since removed) via headless Chromium screenshot: heading, text, list, checkbox ×2, timer, counter, rating, progress, closing line all evenly spaced.
- 361 tests pass, tsc/lint clean.

## 2026-11-01 UTC — `create` takes a cards array; cards gain left/right/sidebar types

- `create` now takes one `cards` array (1–6 cards, in order) instead of one card per call; each card has id/title/content plus optional `type`: `"card"` (auto-placed, default), `"left"`/`"right"` (pinned to that side column), `"sidebar"` (persistent reference rail that never collapses). Validation is per-item with model-readable errors (unknown type, missing title, bad widget, >6).
- Dashboard: sidebar rail on wide screens (persistent, always open, distinct sage panel), pinned left/right columns with auto-fill; narrow stacks sidebars above cards; `data-card-id` preserved so timer `show` still scrolls.
- Prompt teaches the array shape + when to use each type; examples rewritten to single-call form. Legacy single-card `runCreate` args still validate (back-compat for older turns/tests).
- Native `tools` schema carries full item definitions (name/type/required/maxLength via new `ToolParameter` object-array variant); prompt line shows the shape: `create — {cards?:[{id?,title,content,type?}]}`.
- Verified: 367 pass, tsc/lint clean; dev server booted from atlas-old after the old tree was replaced by an empty scaffold (stale server on :3000 killed); live `/api/orb/transcribe` returns clean single-line transcripts.

## 2026-11-01 16:16 IST (10:46 UTC) — VAD floor tracking and browser-voice fallback

- VAD now matches the atlas reference design: each mic frame is `{rms, zcrHz}` (zero crossings per second, halved, measured off the analyser clock in `use-voice-level.ts`), and `voice-activity.ts` gates speech on an adaptive dB noise floor (tracked while quiet, fast-rise/slow-fall, clamped -70..-35, soft in-band voices excluded from learning) plus an 80–9000 Hz voice-shaped crossing band. Rumble and hiss at any loudness no longer start a turn; thresholds are 13 dB over floor to start, 6 dB to hold.
- Verified by simulation: floor converges to a fan room (~-50 dB), voice onset fires `start`, 1.2 s silence fires `end` with counted voicedMs, hiss and rumble onsets stay silent.
- MP3 fallback is gone, replaced by browser TTS like the reference `use-mouth.ts`: the route always closes with `audio-done` (no whole-reply `synthesizeSpeech` call), and `use-orb-turn.ts` speaks the reply via `speechSynthesis` when no PCM arrived — token-guarded against late `end` events, cancelled by every reset/stop. `audio-mp3` removed from the `TurnEvent` union, reader, debug panel, reveal triggers (`"browser"` replaces `"mp3"`), and the dashboard's hidden `<audio>` element + `aiAudio`/`onAudioEnded`/`onAudioFailed`/`audioRef` plumbing. `synthesizeSpeech` stays for `api/voice-preview` MP3 bytes.
- Typecheck clean, no new lint warnings; no test suite to run (tests/ was removed at the user's direction).

## 2026-11-01 16:35 IST (11:05 UTC) — PromptDock becomes the atlas chatbox

- Committed the voice work first (`feat(voice)` checkout point), staging only this session's files; the other agent's sign/widget hunks and the tests/ deletions stay uncommitted.
- Replaced `prompt-dock.tsx` with `chatbox.tsx`, a full port of the atlas example: `+` tools menu (upload, library, /imagine, /search, /research, /think) with search filter, Escape/outside dismissal, and focus return; file picker with attachment chip; rounded 1.75rem slide-up form with `inert` when closed and the blur-ellipse edge peek. Menu commands insert `/command` text; attachments ride along as `(attached: name)` words since the turn takes text only. Sending spinner kept from the dock; demo-only bits (8-word truncation, onStep/onComposingChange) dropped in favor of the full-text `onSendText` contract.
- Typecheck clean; only lint note is the example's own `role="dialog"` warning, kept for fidelity.

## 2026-11-01 16:45 IST (11:15 UTC) — Atlas remembers the user like the reference

- Gap found: `/start` collected name, age range, and talk styles into localStorage, but nothing ever told the model — Atlas couldn't actually remember the user. The reference keeps the same split (chat notes per session, profile persisted in storage) and personalizes from it.
- Now `parseProfile()` in `lib/onboarding.ts` extracts the remember-worthy slice (name, age range, talk-style picks; voice/pace stay client-side), the dashboard sends it with every voice and typed turn, the route validates it, and `buildAtlasSystemPrompt(now, profile)` renders a `## Who you're talking to` section into the cached system prefix: name (use sparingly), age range, and talk styles from the catalog summaries. No profile, no section — anonymous turns are byte-identical to before.
- Verified: typecheck/lint clean; rendered prompt checked for a full, partial, and junk profile (junk parses to undefined and is dropped).

## 2026-11-01 17:05 IST (11:35 UTC) — Session memory raised to a 100k-token budget

- Replaced the 6,000-char history cap with a 100k-token budget (~10% of the model's 1M-token window, ~65x the recall): `trimHistory`/`parseHistory` now budget by estimated tokens (chars/4) with the same pair-preserving shape. Verified: 198 messages land just under budget with pairs intact; one oversized pair is clipped, not dropped.
- Per-message cap 6k to 50k chars (clips nothing legit, stops one paste evicting the session); stored messages 40 to 500 as a sessionStorage-quota backstop. Safety caps (audio bytes, tool args, timers) untouched — they don't affect recall.

## 2026-11-01 17:20 IST (11:50 UTC) — History moves to localStorage

- Chat history now persists in `localStorage` (~5-10MB) instead of tab-scoped `sessionStorage`, so memory survives tab closes and has headroom past the 100k-token turn budget. Same storage key, so existing saved sessions carry over.
- Writes retry with a shrinking tail (full, then last 250, then last 100) on quota/blocked-storage failure instead of silently losing persistence. The Baseten affinity id stays in `sessionStorage` — it is a per-tab routing hint by design.

## 2026-11-01 17:30 IST (12:00 UTC) — Fresh history key, no migration

- History key renamed to `atlas-orb-history`; the old `atlas-orb-session` carry-over is gone and the orphaned entry is deleted on next load. Everyone starts memory fresh.

## 2026-11-01 18:00 IST (12:30 UTC) — Compat shims removed, history/session keys renamed

- Keys: history is `history`, affinity is `session` in storage; `readSession`/`persistSession` are now `readHistory`/`persistHistory`. No migration — user clears the browser themselves.
- Removed: `searching` NDJSON frame (route sends `tool` for websearch; union, reader, debug panel, and client handler updated), single-card `create` triplet plus the `ToolResult.card` chain, the `{"transcript","speak"}` text envelope (plain prose is spoken as-is), and the "older" framings in comments.
- Kept deliberately: flat native-call parsing (the live native path, not legacy — comment fixed), and the `toToolTrace` null for unknown tools (one line guarding the label map, not compat).

## 2026-11-01 18:20 IST (12:50 UTC) — Prompt X-Ray diagnosis: spoken procedures

- Applied the prompt-xray `prompt-debugger` skill (read from GitHub, not installed) to the coffee wire: model spoke a full procedure instead of cards. Diagnosis: no runtime shape enforcement, no procedure ban in the `speak` tool description, path decision duplicated in two prompt sections.
- Smallest fix applied: one ban sentence in the `speak` tool description. Shape gate and path-decision dedupe deferred until the confirmation test (teach-me-coffee must produce cards + headline) passes or fails live.

## 2026-11-01 18:45 IST (13:15 UTC) — Evidence system removed, speak redefined as summary

- Removed the whole evidence apparatus the model found confusing: `evidence` args, exec ids, result stamps, citation rules A-C, the ledger module, and every prompt/example teaching them. Identical repeat calls still share one stored outcome (request-keyed run cache); tool messages carry raw results.
- What remains of integrity is text-only and id-free: tool-call JSON as text rejected, Markdown withheld from speech, and action claims withheld when no action ran (verified live with mocked turns: fabricated search claim withheld and repaired, plain speak passes first try).
- `speak` redefined per direction: the short summary of the full reply, never how-to/procedures, full text over ~100 words goes in a card with a compressed spoken summary. In the tool description and the Speech prompt section.
- Honest cost: nothing now stops the model from claiming an action whose result it misreads — post-action utterances are accepted on trust plus the shape/pattern checks. If invented search claims appear, this removal is why.

## 2026-11-01 19:00 IST (13:30 UTC) — AGENTS.md prompt-engineering docs rewritten

- Rewrote the section to match reality: removed test-suite/json_object/evidence claims; documented the summary speak contract, 100-word rule, context-noun rule, fail-defaults, decision-point bans, round counter, fence citation rights, and mocked-turn verification. Added Vane and prompt-xray-skills to reference reading.
