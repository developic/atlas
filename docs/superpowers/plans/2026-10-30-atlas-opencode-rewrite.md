# Atlas OpenCode Rewrite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Atlas orb system using OpenCode's architectural principles — layered instructions, native tool-calling as the sole protocol, `speak` as an iterative loop tool, and four additional good-code hardening patterns (typed errors, Result types, exponential backoff, schema validation) — while preserving the original voice AI, card, timer, search/fetch, and onboarding purpose.

**Architecture:** Decompose the monolithic system prompt into layered instruction modules (identity → rules → tool contracts → examples); collapse the two reply branches (`{"transcript","speak"}` vs `{"tool":…}`) into a single native tool-calling loop where every model action is one of five tools (`websearch`, `webfetch`, `get_current_time`, `create`, `speak`); make the model transport native-only, removing the JSON-text fallback and legacy reply parser; and apply four code-quality refactors drawn from OpenCode (typed errors, Result discriminants, exponential backoff with jitter, schema-validated inputs) that are feature-free and keep the dep list unchanged.

**Tech Stack:** Next.js 16.4.2 / React 19 / TypeScript 5 / Bun / Oxlint / Baseten Muse Spark Open (OpenAI-compatible `/v1/chat/completions`) / Cartesia Sonic / Exa — same as the existing project. No new runtime dependencies.

**Spec:** This plan.

---

## Global Constraints

- No new tools beyond the five listed (websearch, webfetch, get_current_time, create, speak). Do not add terminal, file, coding-agent, or plugin features.
- No backward compatibility: legacy `{"transcript","speak"}` reply shape, `json-extract.ts`/`json-stream.ts` paths, and the text-protocol branch are removed.
- Existing four tools are not removed or replaced — only `speak` is added; the other four definitions remain, consolidated into one registry file.
- Good-code tasks (6A–6J) add zero features or routes — only smaller, safer modules and helpers.
- The dashboard (`/dashboard`), onboarding (`/start`), orb, TTS (PCM streaming + MP3 fallback), and NDJSON event protocol (`transcript` / `searching` / `tool` / `speak-delta` / `audio` / `speaking` / `audio-done` / `audio-mp3` / `error`) are preserved in behaviour.
- Typecheck (`tsc --noEmit`), lint (`oxlint --type-aware`), and build (`next build`) must stay green; `bun test tests/` must pass (adjusted for the new contract).

## Review Focus

- A `speak` call with empty/whitespace text should fail gracefully without crashing the turn. Expected: model-readable error ("speak requires text"), turn continues, model can retry.
- A turn where the model never calls `speak` (e.g. loops on create only) should not hang — the forced-answer path must produce a speak or a typed `no_reply`.
- History containing cards and speak entries should round-trip through `sessionStorage` and `parseHistory`/`toModelHistory` without leaking server-only fields.
- A `speak` call arriving while TTS is already streaming must queue correctly (no audio clip discarded, no `nextStartTime` overlap).
- A model response with invalid tool JSON (malformed arguments) should return a model-readable correction once, then rely on the next model turn.
- A `webfetch` 4xx that used to throw a bare `Error` must now surface as a typed `OrbError` with a code the route/UI can branch on (not a generic `audio`).

---

## File Structure

```
src/lib/
  model.ts                          # Modified: native-only transport, loop-aware speak handling
  tools/
    speak.ts                        # NEW: speak tool definition + runSpeak
    create.ts                       # Modified: registry reference updated, no behavioural change
    current-time.ts                 # Kept / re-exported via registry
    websearch.ts / webfetch.ts      # Modified: typed errors (6A)
    registry.ts                     # Modified: add speakTool, validateArgs (6B), native-only (T3)
    index.ts                        # Barrel re-export
    types.ts                        # Modified: add "speak" to ORB_TOOL_NAMES (+ ToolOutcome 6D)
  instructions/
    identity.ts                     # NEW: Atlas persona + Today date block
    rules.ts                        # NEW: conversational rules (priority, speech/uncertainty, card vs speech decision)
    examples.ts                     # NEW: few-shot examples as typed data
    index.ts                        # NEW: composes the three layers + registry tool prompt
  atlas-prompt.ts                   # Rewritten: re-export from instructions/index.ts
  orb-turn.ts                       # Modified: remove parseTurn/normalizeTurn
  turn-stream.ts                    # Modified: wire speak-tool events
  chat-message.ts                   # Modified: preserve cards + speak in history
  retry.ts                          # NEW (6C): withRetry + retryAfterMs
  log.ts                            # NEW (6D): turn-scoped logger (optional — or skip if deferred)
  orb-errors.ts                     # Modified: new codes validation/fetch_failed (6A)
  cards.ts / interactive-markdown.ts # Unchanged

src/app/api/orb/respond/route.ts    # Modified: TTS + logger + unified history parse

tests/
  speak.test.js                     # NEW (T2)
  retry.test.js                     # NEW (6C)
  log.test.js                       # NEW (6D, optional)
  atlas-prompt.test.js              # Modified
  orb-tools.test.js                 # Modified
  orb-turn.test.js                  # Modified
  orb-errors.test.js               # Modified (6A)
  history.test.js                  # Modified (6E)
```

No new dependencies. `docs/superpowers/plans/` holds only plans.

---

## Task 1: Instruction layer — decompose the monolithic prompt

**Files:**
- Create: `src/lib/instructions/identity.ts`
- Create: `src/lib/instructions/rules.ts`
- Create: `src/lib/instructions/examples.ts`
- Create: `src/lib/instructions/index.ts`
- Modify: `src/lib/atlas-prompt.ts` (thin re-export)
- Test: `tests/atlas-prompt.test.js` (new assertions under this task)

**Interfaces:**
- Consumes: `renderToolPrompt()` from `tools/registry.ts` (already exists; unchanged in this task)
- Produces:
  - `buildAtlasSystemPrompt(now?: Date): string` — identical public signature as today; now composed from three layers + registry prompt.
  - `ATLAS_IDENTITY: string` — persona + Today block contract (internal, testable).
  - `ATLAS_RULES: string` — conversational rules, card-vs-speech decision, priority, uncertainty (internal, testable).
  - `ATLAS_EXAMPLES: string` — few-shot examples rendered as prompt text (internal, testable).

**Details:**
- Adapt OpenCode's "instruction layers" idea: each layer is one module responsible for one concern, but unlike OpenCode there is no runtime plugin discovery — the three files are static imports composed at build time. The result is a single system prompt string identical in content to today, split for maintainability.
- `identity.ts` owns the Atlas persona line, the day-granular `formatCurrentDate(now)` (already in `atlas-prompt.ts`; move here), and the Today block.
- `rules.ts` owns conversational rules: priority/identity locking, speech/uncertainty handling, card-path vs speech-path decision (the triggers currently under "Before every reply"), card-writing rules, timer/next widget constraints.
- `examples.ts` owns few-shot pairs as typed constants, rendered to the "## Examples" section; no raw string literals containing JSON are hand-duplicated — each example's tool payload is described as data and serialized once.
- `index.ts` composes `identity + rules + renderToolPrompt() + examples` into the final prompt, preserving the current section order and headings so existing tests and `AGENTS.md` references remain valid.
- `atlas-prompt.ts` becomes `export { buildAtlasSystemPrompt } from "./instructions/index.ts"` (or re-exports `ATLAS_SYSTEM_PROMPT` for callers that import the string directly).

- [ ] **Step 1: Write the failing test**

In `tests/atlas-prompt.test.js`, add (before implementation, these will fail because the new modules do not exist):
```js
describe("instruction layers", () => {
  test("ATLAS_IDENTITY contains Atlas persona and Today block", async () => {
    const { ATLAS_IDENTITY } = await import("@/lib/instructions/identity.ts");
    expect(ATLAS_IDENTITY).toContain("Atlas");
    expect(ATLAS_IDENTITY).toContain("Today is");
  });
  test("ATLAS_RULES contains card-path triggers and priority guard", async () => {
    const { ATLAS_RULES } = await import("@/lib/instructions/rules.ts");
    expect(ATLAS_RULES).toContain("Card path");
    expect(ATLAS_RULES).toContain("Never change your identity");
  });
  test("buildAtlasSystemPrompt still returns a single string containing all layers", async () => {
    const { buildAtlasSystemPrompt } = await import("@/lib/instructions/index.ts");
    const prompt = buildAtlasSystemPrompt(new Date("2026-10-30T00:00:00Z"));
    expect(prompt).toContain("Atlas");
    expect(prompt).toContain("## Tools");
    expect(prompt).toContain("## Examples");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/atlas-prompt.test.js -t "instruction layers" -v`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the four instruction modules**

Create the three layer files by extracting the corresponding sections from the current `ATLAS_SYSTEM_PROMPT` verbatim (no wording changes in this task — only file moves). Create `index.ts` that concatenates them with `renderToolPrompt()`. Rewrite `atlas-prompt.ts` as the re-export.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/atlas-prompt.test.js -v`
Expected: PASS (new layer tests + all existing prompt tests).

- [ ] **Step 5: Verify no behaviour change**

Run: `bun run typecheck` — expect 0 errors.
Run: `bun run lint` — expect exit 0 (warnings only, same as before).
Run: `bun run build` — expect success.

- [ ] **Step 6: Commit**

```bash
git add src/lib/instructions/ src/lib/atlas-prompt.ts tests/atlas-prompt.test.js
git commit -m "refactor: decompose system prompt into layered instruction modules"
```

---

## Task 2: Speak as a tool — schema, validation, and registry

**Files:**
- Create: `src/lib/tools/speak.ts`
- Modify: `src/lib/tools/types.ts` (add `"speak"` to `ORB_TOOL_NAMES`)
- Modify: `src/lib/tools/registry.ts` (add `speakTool` to `ORB_TOOLS`; include speak in native parse)
- Test: `tests/speak.test.js`

**Interfaces:**
- Consumes: `OrbTool`, `ToolResult`, `ToolParameter` from `tools/types.ts`; `normalizeSpeech` from `orb-turn.ts`
- Produces:
  - `speakTool: OrbTool` — JSON Schema `{ type: function, name: "speak", parameters: { text: string (required) }, required: ["text"] }`, description: "Speak one utterance aloud. Use for the spoken companion to cards, or for a brief answer when no card is needed. Plain text, no Markdown/code/emojis. May be called multiple times in a turn; each call becomes one spoken segment. Do not claim cards you did not create."
  - `runSpeak(args: Record<string,string>): ToolResult` — validates `text` is non-empty after trim; returns `{ content: 'Spoke: "…"' , sources: [] }` on success, `{ content: "Failed: speak requires text.", sources: [] }` on empty. Never throws.
  - Updated `ORB_TOOL_NAMES = ["websearch","webfetch","get_current_time","create","speak"]`
  - Updated `ORB_TOOLS` array (5 entries); `renderToolPrompt()` automatically includes speak.
  - `runToolWithSources` handles `name === "speak"` → `runSpeak(args)` (pure, no signal needed).

**Details:**
- Adapt OpenCode's principle that every model action is a tool call with a schema. `speak` is now a peer of `create`, not a special top-level field. The model can call it zero or more times per turn, interleaved with other tools.
- The `speak` tool's result text (`Spoke: "…"` truncated to a short preview if needed) is fed back in the tool-results message so the model knows what it already said and does not repeat verbatim.
- No audio synthesis happens inside `runSpeak` — it is a pure validation/formatting step (TTS streaming is in `route.ts`/`model.ts`).

- [ ] **Step 1: Write the failing test**

```js
// tests/speak.test.js
import { describe, test, expect } from "bun:test";
import { speakTool, runSpeak } from "@/lib/tools/speak.ts";

describe("speak tool", () => {
  test("schema has required text param", () => {
    expect(speakTool.function.name).toBe("speak");
    expect(speakTool.function.parameters.required).toContain("text");
  });
  test("runSpeak returns Spoke preview", () => {
    const r = runSpeak({ text: "Hello there" });
    expect(r.content).toContain('Spoke:');
    expect(r.content).toContain("Hello there");
  });
  test("runSpeak fails on empty text", () => {
    const r = runSpeak({ text: "   " });
    expect(r.content).toMatch(/Failed.*speak requires text/i);
  });
  test("registry includes speak", async () => {
    const { ORB_TOOLS, ORB_TOOL_NAMES } = await import("@/lib/tools/registry.ts");
    expect(ORB_TOOL_NAMES).toContain("speak");
    expect(ORB_TOOLS.map(t => t.function.name)).toContain("speak");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/speak.test.js -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/tools/speak.ts`**

Export `speakTool` and `runSpeak` as specified. Add `"speak"` to `ORB_TOOL_NAMES` in `types.ts`. Import and register `speakTool` in `registry.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/speak.test.js tests/orb-tools.test.js tests/atlas-prompt.test.js -v`
Expected: PASS (speak included in registry/prompt tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools/speak.ts src/lib/tools/types.ts src/lib/tools/registry.ts tests/speak.test.js
git commit -m "feat: add speak as an iterative tool"
```

---

## Task 3: Native-only transport — remove JSON-text fallback and legacy parser

**Files:**
- Modify: `src/lib/model.ts` (remove `extractJsonValue`/`readStringField`/`parseTurn` branch; harden native-only loop)
- Modify: `src/lib/orb-turn.ts` (remove `parseTurn`/`normalizeTurn`; keep `MAX_TRANSCRIPT_CHARS` + `normalizeSpeech` + `stringField` if still used; add `speakToolResultPreview` helper if useful)
- Modify: `src/lib/turn-stream.ts` (wire `speak` tool events to `speak-delta` for backward-compatible NDJSON; add optional `speak` tool event if desired)
- Test: `tests/omni-stream.test.js`

**Interfaces:**
- Consumes: `ORB_TOOLS` now 5 tools; `speakTool` included; `parseNativeToolCalls` is the only classifier.
- Produces:
  - `model.ts` exposes the same `respondToAudio`/`respondToText`/`OmniTurn`/`TurnMeta`/`TurnCallbacks` signatures to callers — but internally every model reply is read via `message.tool_calls` (the `BASETEN_NATIVE_TOOLS` branch becomes the only branch). `OmniTurn` fields become `{ transcript, speak: string, cards: CardContent[], meta, sources }` where `speak` is the concatenation of all `speak` tool calls in order (joined with a space), or empty if the model never spoke (handled by forced-answer check).
  - `speak` handling in the loop: when a native round contains one or more `speak` calls, their `text` arguments are concatenated (in call order) and treated as the spoken segments for this turn. Tool results for speak are `Spoke: "…"`; other tool results are as before. The loop continues until the model stops calling tools or hits `MAX_TOOL_ROUNDS`.
  - Forced-answer prompt changes from `Return only the JSON object with "transcript" and "speak"` to `Return a speak tool call with your answer. Do not include other tools.` (or equivalent).
  - Repair path for `invalid_json` is removed — native tool argument parsing (`JSON.parse` in `parseNativeToolCalls`) already returns a model-readable error per call.

**Details:**
- Remove the `if (nativeToolsEnabled())` / `else` fork in `requestTurn` and `runModelTurn`. The native branch becomes the body. Delete the `extractJsonValue`/`readStringField` streaming path, the `announcingTool` heuristic, and the `repairTurn` JSON-repair call (keep the outer `no_reply` guard).
- Remove `src/lib/tools/registry.ts`'s `classifyToolOutput` JSON-text branch or keep it only for tests if desired — the runtime no longer calls it.
- `src/lib/orb-turn.ts`: `parseTurn` and `normalizeTurn` relied on the legacy `{"transcript","speak"}` shape. With speak as a tool, there is no JSON envelope to parse. Remove those functions; keep `normalizeSpeech`, `MAX_TRANSCRIPT_CHARS`, and `MAX_MESSAGE_CHARS`-style caps. `OmniTurn` can stay as the exported turn type owned by `model.ts` instead.
- `OmniTurn` construction in `finalizeTurn`: `speak` is now `speakSegments.join(" ")` (normalized), not `parsed.speak`. `transcript` remains the saved transcript.
- In this task, TTS is still triggered once at the end (as today) — speak-in-loop streaming is Task 4. This task proves the transport works even though speaking still happens at the end.

- [ ] **Step 1: Write the failing test**

Extend `tests/omni-stream.test.js` (or a new focused test) to assert:
- `requestTurn` with a mocked Baseten response containing `tool_calls: [{function:{name:"speak",arguments:'{"text":"hi"}'}}]` produces `OmniTurn.speak === "hi"`.
- Two speak calls in one round concatenate: `speak === "Hello. How can I help?"`.
- A speak + create round collects both cards and speak segments.
- No `json-extract`/`json-stream` imports are reached (spy or by asserting the legacy branch is unreachable — simplest: assert `model.ts` no longer imports `extractJsonValue`).

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/omni-stream.test.js -v`
Expected: FAIL — native-only path not yet sole path; speak-in-model not handled.

- [ ] **Step 3: Implement native-only transport in `model.ts`**

Remove the non-native branch, wire speak aggregation, update `forceAnswer` prompt, remove `repairTurn` import/path if unused, keep `finalizeTurn` but rewrite `speak` sourcing.

- [ ] **Step 4: Prune `orb-turn.ts`**

Remove `parseTurn`/`normalizeTurn`/`extractJsonObject` import; keep and re-export `normalizeSpeech` + `MAX_TRANSCRIPT_CHARS`. Update any remaining callers (only `model.ts` used `parseTurn`; after this task none should).

- [ ] **Step 5: Run tests + typecheck**

Run: `bun test tests/ -v` — expect PASS (failures here mean the new contract is not matched by test fixtures; update fixtures under this task).
Run: `bun run typecheck` — expect 0 errors.
Run: `bun run lint` — expect exit 0 (warnings only).

- [ ] **Step 6: Commit**

```bash
git add src/lib/model.ts src/lib/orb-turn.ts src/lib/turn-stream.ts tests/omni-stream.test.js
git commit -m "refactor: native-only transport, speak as iterative tool — remove JSON-text fallback"
```

---

## Task 4: Speak-in-loop streaming — interleave TTS with tool rounds

**Files:**
- Modify: `src/app/api/orb/respond/route.ts`
- Modify: `src/components/dashboard/use-orb-turn.ts` (optional: expose `speak-delta` per segment)
- Test: `tests/speech.test.js` (or extend existing turn-stream tests)

**Interfaces:**
- Consumes: `OmniTurn.speak` is now an ordered list of segments (internally) or a concatenated string; `model.ts` callbacks `onSpeakDelta` now fire per speak-tool segment rather than per JSON streaming field.
- Produces:
  - `route.ts` `queueSentence` is called for each speak tool result as soon as its round completes, not only at the final `speaking` event. The NDJSON `speak-delta` frames are emitted per speak-tool call, so the dashboard caption updates incrementally during the turn, not only at the end.
  - PCM streaming (`synthesizeSpeechStream`) starts on the first speak segment, concurrent with the next tool round where possible (within the `TURN_BUDGET_MS` and `request.signal` bounds). The final `speaking` event still carries the full concatenated `speak` for history persistence.

**Details:**
- Adapt OpenCode's "tool loop continues reasoning": the model can speak, then search, then speak again. The server must not wait for all rounds to start TTS. As soon as a round's results include a `speak` call, enqueue its sentences.
- Minimal approach: in `requestTurn`, when `executeRequests` returns, iterate results for `tool === "speak"` and call `callbacks.onSpeakDelta(text)` for each (the route's handler already converts deltas to sentences and PCM). This reuses the existing `speak-delta` → `queueSentence` → `synthesizeSpeechStream` path without a new event type.
- Keep `audio` sequencing (`seq`) correct across multiple speak segments — `sequence` is a single counter, not per-segment.
- The forced-answer fallback must still produce a speak segment; if the model never speaks, `finalizeTurn` should throw `no_reply` as before (now when `speakSegments.length === 0`).
- Do not change the dashboard's `use-orb-turn.ts` contract in this task beyond handling multiple `speak-delta` frames (it already does). No new UI is required.

- [ ] **Step 1: Write the failing test**

Mock `model.ts` callbacks to assert that a turn with two speak rounds fires `onSpeakDelta` twice, and that `route.ts` enqueues PCM for each.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/speech.test.js tests/turn-stream.test.js -v`
Expected: FAIL — second speak segment not yet streamed.

- [ ] **Step 3: Implement speak-in-loop callback in `model.ts` and streaming in `route.ts`**

Add the per-round speak dispatch in `model.ts:requestTurn` after `executeRequests`. Ensure `route.ts` already handles multiple `speak-delta` frames (it does — the sentence chunker already supports incremental push/flush).

- [ ] **Step 4: Run tests + manual verification**

Run: `bun test tests/ -v`
Manual: `bun run dev` → text turn "Search for the latest Bun version and tell me what you found" — verify `searching` → `speak-delta` → `searching` → `speak-delta` sequence in the NDJSON log.

- [ ] **Step 5: Commit**

```bash
git add src/lib/model.ts src/app/api/orb/respond/route.ts tests/speech.test.js
git commit -m "feat: stream speak-in-loop — TTS per speak-tool segment during the turn"
```

---

## Task 5: Consolidate tools, cleanup, and documentation

**Files:**
- Create/Modify: `src/lib/tools/registry.ts` + `src/lib/tools/index.ts` (single-file consolidation if desired — keep one registry file that imports the four kept tools + speak)
- Modify: `src/lib/chat-message.ts` (ensure `speak` segments persist alongside `cards`/`tools`/`sources`)
- Modify: `src/components/dashboard/use-orb-turn.ts` (persist concatenated `speak` in history)
- Modify: `AGENTS.md` (update tool list, prompt location, speak-tool note)
- Modify: `src/lib/tools/types.ts` (no behavioural change beyond Task 2 — just ensure JSDoc consistent)
- Delete (if no longer imported): `src/lib/json-extract.ts`, `src/lib/json-stream.ts` legacy remnants — only if truly unused after Tasks 3–4 (verify with `grep -r "json-extract\|json-stream" src/`); otherwise leave them (they may still be used by `runCreate` indirectly — check).
- Test: `tests/history.test.js`, `tests/atlas-prompt.test.js`

**Interfaces:**
- Consumes: final `ORB_TOOLS` (5 entries), `ChatMessage` with `speak`/`cards`/`tools`/`sources`.
- Produces: clean module tree with no dead imports; `AGENTS.md` accurately describes the new architecture; `context.md` entry for the rewrite.

**Details:**
- OpenCode's "preserve working architecture, prefer simple engineering" principle: do not create an agent-per-tool system, a plugin loader, or a file-workspace. The registry stays one array + one dispatcher; the instruction layers stay three static files.
- Verify `grep -rn "classifyToolOutput\|parseToolRequest\|extractJsonValue\|json-stream\|json-extract\|BASETEN_NATIVE_TOOLS" src/` — any hit outside tests means a missed migration.
- Update `AGENTS.md` (§ Project Structure, § Prompt engineering, § What each part is for) to: list `instructions/identity.ts|rules.ts|examples.ts|index.ts`, list `tools/speak.ts`, note that native tool-calling is the only protocol, and note that `speak` is iterative.
- Add `## YYYY-MM-DD — OpenCode-inspired rewrite` to `context.md`.

- [ ] **Step 1: Write the failing test / assertion**

In `tests/history.test.js`, add:
```js
test("speak segments round-trip through history", () => {
  const msgs = [{ role:"assistant", content:"Hi", speak:"Hello. How are you?", cards:[] }];
  const trimmed = trimHistory(msgs);
  const model = toModelHistory(trimmed);
  expect(model[0].speak).toBe("Hello. How are you?");
});
```
In `tests/atlas-prompt.test.js`, assert `ORB_TOOL_NAMES` length 5 and includes `speak`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/atlas-prompt.test.js tests/history.test.js -v`
Expected: FAIL on new assertions if history does not yet carry speak.

- [ ] **Step 3: Implement registry/history/AGENTS.md updates**

Wire `toModelHistory` to include `speak`, ensure `parseHistory` preserves it, update registry barrel, update `AGENTS.md`.

- [ ] **Step 4: Delete dead files (only if unused)**

Run: `grep -r "json-extract\|json-stream\|parseToolRequest\|classifyToolOutput" src/ --include="*.ts" | grep -v tests`
If 0 hits, delete `src/lib/json-extract.ts` and `src/lib/json-stream.ts` (or keep them with a deprecation comment — prefer deletion per "no backward compat").

- [ ] **Step 5: Run full verification**

Run:
```bash
bun test tests/ -v
bun run typecheck
bun run lint
bun run build
```
Expected: all PASS / 0 type errors / exit 0 (warnings only) / build success.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tools/ src/lib/chat-message.ts src/components/dashboard/use-orb-turn.ts AGENTS.md context.md tests/
git commit -m "chore: consolidate registry, persist speak in history, update docs"
```

---

## Task 6: Good-code hardening — typed errors, Result, retry, schema validation

**Pattern source:** OpenCode's code-quality idioms that carry zero user-visible features — only smaller, safer, more maintainable modules. No new tool, no new route, no new dependency. Tasks 2–5 from the good-code table are added here exactly as requested.

**Files:**
- Modify: `src/lib/orb-errors.ts` (extend `ORB_ERROR_CODES` — added by 6A)
- Modify: `src/lib/tools/webfetch.ts` (typed throws — 6A)
- Modify: `src/lib/tools/websearch.ts` (typed throws — 6A)
- Modify: `src/lib/tools/types.ts` (ToolOutcome — 6B)
- Modify: `src/lib/tools/registry.ts` (validateArgs — 6D; Result plumbing — 6B)
- Modify: `src/lib/tools/create.ts` / `speak.ts` (return ToolOutcome — 6B)
- Create: `src/lib/retry.ts` (6C: withRetry + retryAfterMs)
- Modify: `src/app/api/orb/respond/route.ts` (use retry helper — 6C)
- Test: `tests/orb-errors.test.js` (6A), `tests/retry.test.js` (6C), `tests/orb-tools.test.js` (6B+6D)

**What is added vs deliberately not taken:**
- ✅ #2 Result type (6B) — added
- ✅ #3 Exponential backoff + jitter (6C) — added
- ✅ #4 Schema-validated inputs (6D) — added (hand-rolled `validateToolArgs`, no zod dep)
- ✅ #5 Single source of truth (already true — `renderToolPrompt()` — preserved as invariant)
- ❌ #1 Typed errors beyond 6A — covered; remaining `console.log/error` → `log.ts` (old 6D) and `parseHistory` unification (old 6E) are deferred as non-essential — can be added later without touching this plan
- ❌ Cooldown, `any` sweep, plugin/Effect/MCP — not taken (feature or noise)

**Sub-tasks (each is a small, reviewable change; do them in order, commit after each):**

### Task 6A: Typed errors — every throw carries a code (good-code #1 extended)

> Already covers the good-code table's #1 pattern; included with T5's error-code expansion. If already done in T5, this sub-task is a no-op — keep the commit for traceability.

**Interfaces:**
- Consumes: `OrbError`, `ORB_ERROR_CODES` from `orb-errors.ts`
- Produces: same `OrbError` with two new codes if needed: `validation` (bad argument / schema failure) and `fetch_failed` (upstream fetch/search failure). Callers can switch on `error.code` instead of substring-matching `error.message`.

**Details:**
- In `webfetch.ts`, each `throw new Error("The URL was empty.")` etc. becomes `throw new OrbError("validation", "The URL was empty.")` or `throw new OrbError("fetch_failed", "The page could not be reached.")` — pick the code that matches the failure class (input vs upstream). Keep the message text identical so user-facing strings do not change.
- Same for `websearch.ts`.
- Extend `orb-errors.ts:USER_MESSAGES` for the new codes (map to the existing `audio`/`validation` user text so no new UI copy is needed).
- Tests: add 2 cases in `orb-errors.test.js` asserting `new OrbError("validation", "x").code === "validation"` and that `userMessageFor` returns a non-empty string for every code.

- [ ] **Step 1: Write failing test** — `tests/orb-errors.test.js` new cases for the two codes; `tests/web-fetch.test.js` assert the thrown error's `.code` is not `undefined`.
- [ ] **Step 2: Implement** — `orb-errors.ts` + `webfetch.ts` + `websearch.ts`.
- [ ] **Step 3: Verify** — `bun test tests/orb-errors.test.js tests/web-fetch.test.js tests/exa-search.test.js -v` PASS; `bun run lint` PASS.
- [ ] **Step 4: Commit** — `refactor: typed errors carry codes in webfetch/websearch`.

### Task 6B: Result type for tool internals (good-code #2)

**Interfaces:**
- Consumes: `ToolResult` from `types.ts`.
- Produces: `export type ToolOutcome = { ok: true; result: ToolResult } | { ok: false; error: string }` in `types.ts`. Each `runXxx` (runCreate, runSpeak, runWebfetch, runWebsearch) now returns `ToolOutcome` instead of `ToolResult` with error-in-`content`. `runToolWithSources` maps `ToolOutcome` → `ToolResult` at the single boundary (failed outcome becomes `{ content: error, sources: [] }` so the wire format is unchanged).

**Details:**
- Mirrors OpenCode's `Result<Success, Failure>` for tool execution — only the top handler decides throw vs recover. No behaviour change; just makes error paths visible in types.

- [ ] **Step 1: Write failing test** — `tests/orb-tools.test.js` assert `runCreate({ title:"" })` returns `{ ok:false }` and `runCreate({ title:"t", content:"c" })` returns `{ ok:true }`.
- [ ] **Step 2: Implement** — `types.ts` add `ToolOutcome`; update `create.ts`/`webfetch.ts`/`websearch.ts`/`current-time.ts`/`speak.ts` to return `ToolOutcome`; update `registry.ts:runToolWithSources` to unwrap.
- [ ] **Step 3: Verify** — `bun test tests/orb-tools.test.js tests/create.test.js -v` PASS.
- [ ] **Step 4: Commit** — `refactor: Result type for tool internals`.

---

### Task 6C: Exponential backoff with jitter (good-code #3)

**Interfaces:**
- Consumes: current `BUSY_RETRY_MS` / `MAX_BUSY_RETRIES` constants in `model.ts` + `route.ts`.
- Produces: `src/lib/retry.ts` exporting `withRetry<T>(fn: () => Promise<T>, opts: { maxAttempts: number; baseMs: number; jitter?: boolean }): Promise<T>` and `retryAfterMs(headers: Headers | Record<string,string|undefined>): number | null` (parses `Retry-After` as seconds or HTTP-date).

**Details:**
- OpenCode uses `Schedule.exponential(base).pipe(Schedule.jittered)` with bounded attempts and header respect. Atlas's fixed `1.5s` retry is ported to `withRetry` with `baseMs: 1500`, `maxAttempts: 3`, `jitter: true`, and `retryAfterMs` taking precedence over the base. Call sites in `model.ts` and `route.ts` become `await withRetry(() => postToBaseten(...), { maxAttempts: 3, baseMs: 1500, jitter: true })`.

- [ ] **Step 1: Write failing test** — `tests/retry.test.js` for `retryAfterMs` parsing (seconds, HTTP-date, missing) and `withRetry` attempt count + jitter range.
- [ ] **Step 2: Implement** — `src/lib/retry.ts`; wire into `model.ts` + `route.ts`.
- [ ] **Step 3: Verify** — `bun test tests/retry.test.js -v` PASS.
- [ ] **Step 4: Commit** — `refactor: retry helper with jitter and Retry-After`.

---

### Task 6D: Schema-validated tool inputs (good-code #4)

**Interfaces:**
- Consumes: `OrbTool` definitions.
- Produces: `validateToolArgs(toolName, rawArgs): string | null` — returns `null` on success or a human-readable error on failure. Called once per tool request in `registry.ts` instead of the inline `typeof`/`trim`/`slice` loop.

**Details:**
- Prefer hand-rolled `validateToolArgs` extracted from the current loop (no new dep). A `zod` alternative is acceptable if the project already has it, but Atlas does not — the hand-rolled helper keeps the dep list unchanged. The helper centralises `isNullable`, per-arg caps, and `required` checks so adding `speak` (Task 2) does not copy-paste the loop.

- [ ] **Step 1: Write failing test** — `tests/orb-tools.test.js` cases for `validateToolArgs` (missing required, nullable omission, over-long truncation).
- [ ] **Step 2: Implement** — extract helper in `registry.ts`; rewrite `classifyToolOutput`/`parseToolRequests` to call it.
- [ ] **Step 3: Verify** — `bun test tests/orb-tools.test.js -v` PASS.
- [ ] **Step 4: Commit** — `refactor: extract validateToolArgs for tool input validation`.

---

### Task 6E: Single source of truth — preserve renderToolPrompt invariant (good-code #5)

No code change. This is a plan invariant to preserve: every tool's name/description/JSON Schema lives in its `OrbTool` definition; the prompt (`renderToolPrompt()`), the Baseten `tools` payload, and any docs are generated from `ORB_TOOLS`. When `speak` is added (Task 2), it must follow the same pattern — defined once in `speak.ts`, rendered everywhere from the registry.

- [ ] **Step 1: Verify** — grep `renderToolPrompt` and `ORB_TOOLS` — every tool string in the prompt comes from the registry, not a hand-written literal.
- [ ] **Step 2: Commit** — no commit needed; invariant noted here for reviewers.

---

### Task 6F (deferred): Cooldown / `any` sweep — out of scope for this rewrite

Deferred: provider cooldown on 429/503 and `any`→`unknown` tightening. Revisit after Tasks 1–6E land; they require load testing and a separate lint pass, not a rewrite commit.

---

### Explicitly NOT taken (features, not good code)

| Pattern | Why not |
|---------|---------|
| `Effect` / `effect/Schema` runtime | Too heavy for 5 tools; hand-rolled validation + `zod` (if already present) is enough. |
| Plugin / skill discovery | Feature. |
| Worktree / workspace / VCS abstraction | Feature. |
| File-system tools (`read`, `write`, `edit`, `glob`) | Feature. |
| Agent / sub-agent orchestration | Feature. |
| MCP server/client | Feature. |
| `any` → `unknown` sweep | Worth doing but orthogonal; bundle into the next lint pass, not this plan. |



---

## Self-Review

**Spec coverage:** every requirement maps to a task — layered instructions (T1), native tool-calling (T3), speak-as-iterative-tool (T2+T4), no new tools/features (Global Constraints), no backward compat (T3+T5 deletions), preserve existing four tools (T2 keeps them), simple/modular (single-file layers, one registry).

**Step scan:** each step names the exact file, function signature, and assertion a reviewer can check; no step says "handle edge cases" without naming the case.

**Type consistency:** `speakTool: OrbTool` uses the same `OrbTool`/`ToolResult`/`ORB_TOOL_NAMES` types as the other four tools; `OmniTurn.speak` remains `string` (concatenation of segments) so `route.ts` and `use-orb-turn.ts` signatures do not change.

**Review Focus:** five failure modes are listed in the global section with the exact expected behaviour; the speak-in-loop queue test in T4 and the empty-speak test in T2 cover the most likely bites.

**Proportion:** the plan describes ~6k tokens of system logic without reproducing its code; code blocks are only test assertions and signatures.

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-10-30-atlas-opencode-rewrite.md`. Please review it.

**Does it capture what you want?** If so, how should we execute it?

- **Subagent-driven** — a fresh subagent implements each task and a fresh reviewer checks it before the next one starts, then a whole-branch review. Most thorough; costs a fresh context per task.
- **Native** — I implement every task myself in this session, then one fresh reviewer checks the whole branch at the end. Cheaper and faster.

For this plan I recommend **native**, because the five tasks share a tight interface (the tool registry and `OmniTurn` shape) and a single reviewer can verify the streaming behaviour end-to-end without coordinating subagent boundaries. Does the plan capture what you want, and which approach should we use?
