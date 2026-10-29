# Project Context

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
