/**
 * Server-only model helpers for the orb — native tool-calling only.
 *
 * One turn is a small agent loop: send the recording/typed message to Baseten
 * with the Atlas system prompt, and let the model act through native
 * `tool_calls` (websearch, webfetch, get_current_time, create, start_new_chat,
 * open_camera, shutdown, reminder, speak). Each
 * round either runs tool calls and continues the loop, or ends the turn with
 * the collected spoken segments and cards. The model never answers through a
 * text field; everything user-visible comes from a tool call.
 *
 * Execution integrity is enforced in the loop, not in the prompt:
 *
 * - Identical repeat calls share one stored outcome instead of re-running
 *   the tool, so a repeated search or fetch can never quietly become a
 *   "fresh" execution.
 * - Spoken segments are collected only after their `speak` call passed the
 *   integrity gate, and are streamed to TTS only at finalization, so the
 *   interface never voices an unvalidated claim.
 * - Tool-call JSON that arrives as plain text is structurally rejected; it is
 *   never replayed into tool calls.
 */

import { buildAtlasSystemPrompt } from "./atlas-prompt";
import { parseSignFrames } from "./media-frames";
import type { AccessMode } from "./access-modes";
import { capabilitiesFor, isToolAllowed, toolsForMode } from "./access-modes";
import type { UserProfile } from "./onboarding";
import { describeCardOverflow, joinCardMarkdown, MAX_CARDS, type CardContent } from "./cards";
import type { ChatMessage } from "./chat-message";
import { MAX_TRANSCRIPT_CHARS, normalizeSpeech } from "./orb-turn";
import { OrbError } from "./orb-errors";
import {
  renderReminderSnapshot,
  type ReminderDirective,
  type ReminderSnapshotItem,
} from "./reminders";
import {
  renderMoodSnapshot,
  type MoodDirective,
  type MoodSnapshotItem,
} from "./moods";
import {
  executeTool,
  parseNativeToolCalls,
  toolsFor,
  type NativeCall,
  type OrbTool,
  type ToolContext,
  type ToolOutcome,
  type ToolRequest,
  type ToolResult,
} from "./tools/registry";
import { selectReplySources, type SourceLink } from "./source-links";
import {
  looksLikeToolCall,
  validateSpeechClaim,
} from "./speech-integrity";
import type { TurnDebug, TurnDebugRound } from "./turn-debug";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASETEN_MODEL = "meta-models/muse-spark-open-1026";
const BASETEN_URL = "https://inference.baseten.co/v1/chat/completions";
/**
 * 1_200 truncated six-card `create` calls (finish_reason "length"). 3_000
 * stays far below the validator caps (6 × 4k chars of card content) while
 * giving structured tool calls room to complete in one piece.
 */
const DEFAULT_MAX_REPLY_TOKENS = 3_000;
const MODEL_TIMEOUT_MS = 60_000;
const REASONING_EFFORT = "low";
const MAX_SESSION_CHARS = 64;
/** Safety bound on native tool rounds; the 90 s budget remains the primary stop. */
const MAX_TOOL_ROUNDS = 12;

export const TURN_BUDGET_MS = 90_000;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type TurnMeta = {
  model: string;
  finishReason: string;
  promptTokens: number;
  cachedTokens: number;
  audioTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  toolRounds: number;
};

export type OmniTurn = {
  transcript: string;
  speak: string;
  meta: TurnMeta;
  sources: SourceLink[];
  cards: CardContent[];
  /** Set when start_new_chat ran; the client clears old history and cards. */
  newSession?: boolean;
  /** Reminder mutations the client applies to its store, in arrival order. */
  reminders?: ReminderDirective[];
  /** Mood entries written this turn; the client applies them to its log. */
  moods?: MoodDirective[];
  /** Raw provider rounds, present only for explicitly debugged turns. */
  debug?: TurnDebug;
};

export type TurnCallbacks = {
  onTool?: (tool: string, detail?: string) => void;
  onTranscript?: (text: string) => void;
  onSpeakDelta?: (delta: string) => void;
};

export type TurnContext = {
  signal?: AbortSignal;
  session?: string;
  /** Attach raw provider payloads to the turn (development/debug only). */
  debug?: boolean;
  /**
   * Who Atlas is talking to, from `/start`. Rendered into the cached system
   * prompt, so the model remembers the user across turns and sessions.
   */
  profile?: UserProfile;
  /**
   * Stills from the conversation's most recent media (e.g. a signed clip),
   * as data URLs. Attached only to the immediately following turn so
   * references like "that sign I just did" resolve against video, not just
   * the transcribed words. The caller owns clearing them after one turn.
   */
  mediaFrames?: string[];
  /**
   * Pending reminders from the client's store, attached only when non-empty.
   * Rendered into the turn as model-readable context (next to history, never
   * inside the cached system prompt), so the model lists and resolves ids
   * from application data instead of inventing them.
   */
  reminderSnapshot?: ReminderSnapshotItem[];
  /**
   * The user's recent mood entries, attached only in autism mode. Rendered
   * beside the user message (never inside the cached prompt) so trend answers
   * come from the log, not from the model's memory.
   */
  moodSnapshot?: MoodSnapshotItem[];
  /** IANA time zone for wall-clock phrases ("tomorrow at 9am"). */
  timeZone?: string;
  /** Whether the client's camera is live at the start of this turn. */
  cameraOn?: boolean;
  /**
   * Selected accessibility mode. `null`/absent keeps the existing behaviour:
   * full prompt, every tool, speech on. A mode swaps the instruction section
   * and the registered tool list, and the registry refuses anything else.
   */
  mode?: AccessMode | null;
};

// ---------------------------------------------------------------------------
// Private types
// ---------------------------------------------------------------------------

type DebugCapture = {
  /** Turn-relative reference for `atMs`. */
  startedAt: number;
  rounds: TurnDebugRound[];
};

type TurnRun = {
  signal: AbortSignal;
  session?: string;
  /** Selected access mode; drives tool permissions and card delivery. */
  mode: AccessMode | null;
  debug?: DebugCapture;
};

/** Everything a turn collects across rounds, in arrival order. */
type TurnState = {
  transcript: string;
  sources: SourceLink[];
  cards: CardContent[];
  speakSegments: string[];
  newSession: boolean;
  reminders: ReminderDirective[];
  moods: MoodDirective[];
};

/** One `tool_call_id` resolved, with the content the model sees. */
type CallOutcome = {
  call: NativeCall;
  content: string;
  ok: boolean;
  /** Request key for dedupe; null for a call that failed validation. */
  key: string | null;
  /** Result of a successful execution; null for a failed or invalid call. */
  result: ToolResult | null;
};

type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    audio_tokens?: number;
  };
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
};

type NativeToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type ContentPart =
  | { type: "text"; text: string }
  | {
      type: "input_audio";
      input_audio: { data: string; format: "wav" | "mp3" };
    }
  | {
      type: "image_url";
      image_url: { url: string };
    };

type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[];
  tool_calls?: NativeToolCall[];
  tool_call_id?: string;
};

type ModelResult = {
  content: string;
  reasoning: string;
  finishReason: string;
  usage: Usage;
  model: string;
  nativeToolCalls: NativeToolCall[];
};

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

export function composeTurnSignal(
  external?: AbortSignal,
  budgetMs: number = TURN_BUDGET_MS,
): AbortSignal {
  return external
    ? AbortSignal.any([external, AbortSignal.timeout(budgetMs)])
    : AbortSignal.timeout(budgetMs);
}

export function normalizeSession(session?: string): string | undefined {
  const value = session
    ?.replace(/[^\x20-\x7E]/g, "")
    .trim()
    .slice(0, MAX_SESSION_CHARS);
  return value ? value : undefined;
}

export async function respondToAudio(
  audio: Buffer,
  mimeType: string,
  history: ChatMessage[] = [],
  callbacks: TurnCallbacks = {},
  context: TurnContext = {},
): Promise<OmniTurn> {
  return requestTurn(
    [
      { type: "input_audio", input_audio: { data: audio.toString("base64"), format: audioFormat(mimeType) } },
    ],
    history,
    callbacks,
    context,
  );
}

export async function respondToText(
  transcript: string,
  history: ChatMessage[] = [],
  callbacks: TurnCallbacks = {},
  context: TurnContext = {},
): Promise<OmniTurn> {
  const turn = await requestTurn(
    [{ type: "text", text: transcript }],
    history,
    callbacks,
    context,
  );
  return { ...turn, transcript: turn.transcript || transcript };
}

function audioFormat(mimeType: string): "wav" | "mp3" {
  const mime = mimeType.split(";")[0]?.trim().toLowerCase();
  if (mime.includes("mp3") || mime.includes("mpeg")) return "mp3";
  return "wav";
}

// ---------------------------------------------------------------------------
// The turn loop
// ---------------------------------------------------------------------------

async function requestTurn(
  content: ContentPart[],
  history: ChatMessage[],
  callbacks: TurnCallbacks,
  context: TurnContext,
): Promise<OmniTurn> {
  const apiKey = getApiKey();
  const userContent: ContentPart[] = [...content];
  const frames = parseSignFrames(context.mediaFrames ?? []);

  if (frames.length > 0) {
    for (const frame of frames) {
      userContent.push({ type: "image_url", image_url: { url: frame } });
    }

    userContent.push({
      type: "text",
      text: "Earlier in this conversation the user shared video; these stills are from it. Resolve references like \"that\", \"it\", or \"what I just showed\" against the stills.",
    });
  }

  const reminderBlock = renderReminderSnapshot(context.reminderSnapshot ?? []);
  if (reminderBlock) {
    userContent.push({ type: "text", text: reminderBlock });
  }

  const now = Date.now();
  const moodBlock = renderMoodSnapshot(context.moodSnapshot ?? [], now);
  if (moodBlock) {
    userContent.push({ type: "text", text: moodBlock });
  }

  userContent.push({
    type: "text",
    text: context.cameraOn
      ? "## Camera\nCamera is on. The frame tool can capture the current view."
      : "## Camera\nCamera is off. You cannot see anything right now; the frame tool will fail until the user turns the camera on.",
  });

  const mode = context.mode ?? null;
  const tools = toolsFor(mode);
  const messages: Message[] = [
    {
      role: "system",
      content: buildAtlasSystemPrompt(new Date(), context.profile, mode),
    },
    ...history.map((message) => ({ role: message.role, content: message.content })),
    { role: "user", content: userContent },
  ];
  const toolContext: ToolContext = {
    now,
    allowedTools: toolsForMode(mode),
    ...(context.timeZone ? { timeZone: context.timeZone } : {}),
    ...(context.reminderSnapshot ? { snapshot: context.reminderSnapshot } : {}),
    ...(context.moodSnapshot ? { moods: context.moodSnapshot } : {}),
    cameraOn: context.cameraOn === true,
  };

  const run: TurnRun = {
    signal: composeTurnSignal(context.signal),
    session: normalizeSession(context.session),
    mode,
    debug: context.debug
      ? { startedAt: performance.now(), rounds: [] }
      : undefined,
  };

  const state: TurnState = {
    transcript: "",
    sources: [],
    cards: [],
    speakSegments: [],
    newSession: false,
    reminders: [],
    moods: [],
  };
  /** Request keys whose successful result was already folded into the turn,
   *  so a deduped repeat call cannot double-commit a card or speech segment. */
  const committed = new Set<string>();
  /** Stored tool outcomes for the whole turn, keyed by request, so an
   *  identical repeat call attaches instead of re-running the tool. */
  const runCache = new Map<string, Promise<ToolOutcome>>();
  /** Whether any action tool ran this turn; gates fabrication repair. */
  let actionsRan = false;

  let result: ModelResult | null = null;
  let toolRounds = 0;
  /**
   * Consecutive rounds that only spoke while no action ran yet. The first
   * such round does not end the turn: the model may still act afterwards
   * (say goodbye, then call shutdown). The second one ends it, so a model
   * that only ever speaks cannot loop forever.
   */
  let speakOnlyStreak = 0;

  for (;;) {
    if (run.signal.aborted) {
      throw new OrbError("timeout", "The assistant ran out of time. Try again.");
    }

    if (toolRounds >= MAX_TOOL_ROUNDS) {
      throw new OrbError("timeout", "The assistant ran out of time. Try again.");
    }

    const seen = reporterFor(callbacks);

    result = await runModelTurn(apiKey, messages, seen, run, tools);
    const calls = restrictCalls(parseNativeToolCalls(result.nativeToolCalls), mode);

    if (calls.length === 0) {
      const ended = await endWithContent(
        result,
        messages,
        state,
        toolRounds,
        run,
        seen,
      );

      // null means the plain content was withheld for repair; the next round
      // handles it.
      if (ended) return ended;

      toolRounds += 1;
      continue;
    }

    // Announce the tools and consume transcripts in call order, before any
    // execution, so the trace matches what the model asked for.
    for (const call of calls) {
      if (!call.request) continue;

      seen.onTool?.(call.request.tool, toolDetail(call.request.tool, call.request.arguments));
      applyTranscript(call.request.transcript, state, seen);
    }

    // A `speak` sharing its round with an action already sees its sibling
    // attempts, the way synchronous record-begin used to grant.
    const roundActionsRan =
      actionsRan ||
      calls.some((call) => call.request && call.request.tool !== "speak");

    // `open_camera` and `frame` can arrive in one round; the client opens for
    // the first, so the frame call must not be told the camera is still off.
    if (calls.some((call) => call.request?.tool === "open_camera")) {
      toolContext.cameraOn = true;
    }

    const outcomes = await executeNativeCalls(calls, runCache, run.signal, toolContext);

    /** Cards this round produced but the six-card fold could not show, per outcome. */
    const droppedByOutcome: number[] = [];

    for (const [index, outcome] of outcomes.entries()) {
      droppedByOutcome[index] = 0;

      if (!outcome.ok || !outcome.result || !outcome.key) continue;

      // A deduped repeat call re-resolves its stored result; fold it into the
      // turn state exactly once.
      if (committed.has(outcome.key)) continue;

      committed.add(outcome.key);
      state.sources.push(...outcome.result.sources);
      droppedByOutcome[index] = collectCards([outcome.result], state);

      if (outcome.result.newSession) {
        state.newSession = true;
      }

      if (outcome.result.reminder) {
        state.reminders.push(outcome.result.reminder);
      }

      if (outcome.result.mood) {
        state.moods.push(outcome.result.mood);
      }

      if (outcome.call.request?.tool === "open_camera") {
        // The client opens the camera for this call; later rounds in the same
        // turn may ask for a frame and must not be told it is still off.
        toolContext.cameraOn = true;
      }

      if (outcome.call.request?.tool === "speak") {
        commitSpeech(outcome.call.request.arguments.text ?? "", state);
      }
    }

    // A reset turn is speak-only: old cards and sources are gone, so anything
    // the model created alongside the reset is dropped.
    if (state.newSession) {
      state.cards = [];
      state.sources = [];
    }

    // Terminal round: every call succeeded, every call put content on the
    // turn (create, start_new_chat, open_camera, shutdown, reminder, or speak), and at least one
    // approved. Without this the native-only loop would make one more model call.
    // Exception: a round of only `speak` with no action behind it yet does
    // not end the turn — the model may act after speaking.
    // Exception: a round that overflowed the card fold never ends the turn —
    // the drop note below must reach the model so it repairs the speech
    // instead of finalizing on words about cards that are not on screen.
    const allOk = outcomes.every((outcome) => outcome.ok);
    const roundDropped = droppedByOutcome.reduce((sum, n) => sum + (n ?? 0), 0);

    if (allOk && calls.every(isTerminalCall) && state.speakSegments.length > 0 && roundDropped === 0) {
      const speakOnly =
        calls.every((call) => call.request?.tool === "speak") &&
        !roundActionsRan;

      if (!speakOnly || speakOnlyStreak >= 1) {
        return finalize(result, state, toolRounds, seen, run.mode, run.debug);
      }

      speakOnlyStreak += 1;
    } else if (
      calls.some((call) => call.request && call.request.tool !== "speak")
    ) {
      speakOnlyStreak = 0;
    }

    // Non-terminal: report every outcome, including failures, to the model
    // and keep looping. Each tool message carries its round number so the
    // model can track its progress. The turn ends when the model stops calling
    // tools; the 90 s turn budget aborts a runaway loop.
    const roundLabel = `[Round ${toolRounds + 1}]`;
    messages.push(echoedAssistant(result, calls));
    for (const [index, outcome] of outcomes.entries()) {
      const note = describeCardOverflow(droppedByOutcome[index] ?? 0);
      messages.push({ role: "tool", tool_call_id: calls[index].id, content: `${roundLabel} ${outcome.content}${note ? ` ${note}` : ""}` });
    }

    if (calls.some((call) => call.request && call.request.tool !== "speak")) {
      actionsRan = true;
    }

    toolRounds += 1;
  }
}

// ---------------------------------------------------------------------------
// Round helpers
// ---------------------------------------------------------------------------

function isTerminalCall(call: NativeCall): boolean {
  return (
    !!call.request &&
    (call.request.tool === "create" ||
      call.request.tool === "start_new_chat" ||
      call.request.tool === "open_camera" ||
      call.request.tool === "shutdown" ||
      call.request.tool === "reminder" ||
      call.request.tool === "mood" ||
      call.request.tool === "speak")
  );
}

function reporterFor(callbacks: TurnCallbacks): TurnCallbacks {
  // Per-round announce dedupe: parallel calls to the same tool with the same
  // detail (for example one search echoed twice) report once.
  const seen = new Set<string>();

  return {
    onTool: (tool, detail) => {
      const key = detail ? `${tool}:${detail}` : tool;
      if (!seen.has(key)) {
        seen.add(key);
        callbacks.onTool?.(tool, detail);
      }
    },
    onTranscript: (text) => callbacks.onTranscript?.(text),
    onSpeakDelta: (delta) => callbacks.onSpeakDelta?.(delta),
  };
}

function applyTranscript(
  raw: string | undefined,
  state: TurnState,
  seen: TurnCallbacks,
): void {
  if (!raw) return;

  const transcript = String(raw).trim().slice(0, MAX_TRANSCRIPT_CHARS);

  if (transcript) {
    state.transcript = transcript;
    seen.onTranscript?.(transcript);
  }
}

/**
 * Buffer one approved spoken utterance for finalization. No callback fires
 * here: onSpeakDelta runs only after the whole turn is validated, so TTS
 * receives exactly the approved speech.
 */
function commitSpeech(text: string, state: TurnState): void {
  const segment = normalizeSpeech(text);

  if (segment) state.speakSegments.push(segment);
}

function toolDetail(tool: string, args: Record<string, string>): string | undefined {
  if (tool === "webfetch") return args.url;
  if (tool === "websearch") return args.query;
  if (tool === "start_new_chat") return args.reason;
  if (tool === "open_camera") return args.reason;
  if (tool === "shutdown") return args.reason;
  if (tool === "reminder") {
    const action = args.action?.trim();
    const title = args.title?.trim().slice(0, 48);
    return [action, title].filter(Boolean).join(" ") || undefined;
  }
  if (tool === "mood") {
    const action = args.action?.trim();
    const note = args.note?.trim().slice(0, 48);
    return [action, note].filter(Boolean).join(" ") || undefined;
  }
  if (tool === "speak") return args.text?.slice(0, 80);
  return undefined;
}

/**
 * End the turn when the provider returned no native tool calls. The content
 * itself is the candidate utterance, and tool-call syntax arriving as text
 * is structurally rejected — never replayed into tool calls.
 *
 * Rejected replies are withheld: the model gets a corrective message and the
 * loop continues so it can answer through the native `speak` tool instead.
 */
async function endWithContent(
  result: ModelResult,
  messages: Message[],
  state: TurnState,
  toolRounds: number,
  run: TurnRun,
  seen: TurnCallbacks,
): Promise<OmniTurn | null> {
  const plain = result.content.trim();

  if (plain) {
    const verdict = validateSpeechClaim({ text: plain });

    if (!verdict.ok) {
      messages.push({ role: "assistant", content: result.content });
      messages.push({
        role: "user",
        content: [
          `Your previous reply was withheld instead of being spoken: ${verdict.reason}.`,
          "Answer now with the native `speak` tool, or reply without claiming that any action ran.",
        ].join(" "),
      });

      return null;
    }

    commitSpeech(plain, state);
  }

  return finalize(result, state, toolRounds, seen, run.mode, run.debug);
}

/**
 * Turn a native call for a tool the selected mode does not register into a
 * readable failure. The provider already receives only the mode's tools; this
 * catches a reconstructed call, and the registry applies the same check again
 * when the runner executes.
 */
function restrictCalls(calls: NativeCall[], mode: AccessMode | null): NativeCall[] {
  if (!mode) return calls;

  return calls.map((call) => {
    const request = call.request;

    if (!mode || !request || isToolAllowed(mode, request.tool)) return call;

    const tool = String(request.tool);

    return {
      ...call,
      request: null,
      error: `${tool} is not available in this access mode.`,
    };
  });
}

/**
 * Collect unique cards from create results, assigning stable ids when the
 * model omitted or duplicated one, and stopping at the six-card cap.
 * Returns the number of produced cards the fold could not show, so the round
 * can tell the model what actually landed on screen.
 */
function collectCards(cards: ToolResult[], state: TurnState): number {
  let dropped = 0;

  for (const result of cards) {
    const produced = result.cards ?? [];

    for (const producedCard of produced) {
      if (state.cards.length >= MAX_CARDS) {
        dropped += 1;
        continue;
      }

      const card = { ...producedCard, id: uniqueCardId(producedCard.id, state.cards) };

      state.cards.push(card);
    }
  }

  return dropped;
}

function uniqueCardId(raw: string, existing: CardContent[]): string {
  let id = raw || `card-${existing.length + 1}`;

  while (existing.some((card) => card.id === id)) {
    id = `card-${existing.length + 1}`;
  }

  return id;
}

// ---------------------------------------------------------------------------
// Tool execution with request-key dedupe
// ---------------------------------------------------------------------------

function requestKey(request: ToolRequest): string {
  return `${request.tool}:${JSON.stringify(request.arguments)}`;
}

/**
 * Run native calls in place and answer every call, including one that failed
 * argument validation, so each `tool_call_id` gets a tool message back.
 *
 * Identical calls share one stored outcome and never re-run the tool, so a
 * repeated search cannot quietly become a "fresh" execution. Outcomes carry
 * the raw tool content; nothing is stamped, and there is nothing to cite.
 */
async function executeNativeCalls(
  calls: NativeCall[],
  runCache: Map<string, Promise<ToolOutcome>>,
  signal?: AbortSignal,
  toolContext?: ToolContext,
): Promise<CallOutcome[]> {
  return Promise.all(
    calls.map(async (call): Promise<CallOutcome> => {
      if (!call.request) {
        return {
          call,
          content: call.error,
          ok: false,
          key: null,
          result: null,
        };
      }

      const key = requestKey(call.request);
      let promise = runCache.get(key);

      if (!promise) {
        promise = runRequest(call.request, signal, toolContext);
        runCache.set(key, promise);
      }

      const outcome = await promise;

      return {
        call,
        content: outcome.ok ? outcome.result.content : outcome.error,
        ok: outcome.ok,
        key,
        result: outcome.ok ? outcome.result : null,
      };
    }),
  );
}

/**
 * Run one request through the registry. Tools never throw in the normal
 * path; keep an unexpected throw from killing the turn instead of the model.
 */
async function runRequest(
  request: ToolRequest,
  signal?: AbortSignal,
  toolContext?: ToolContext,
): Promise<ToolOutcome> {
  try {
    return await executeTool(request.tool, request.arguments, signal, toolContext);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown failure";

    return { ok: false, error: `The ${request.tool} tool failed unexpectedly: ${reason}` };
  }
}

function echoedAssistant(result: ModelResult, calls: NativeCall[]): Message {
  return {
    role: "assistant",
    content: result.content,
    tool_calls: calls.map((call) => ({
      id: call.id,
      type: "function",
      function: {
        name: call.request?.tool ?? "unknown",
        arguments: call.request ? JSON.stringify(call.request.arguments) : "{}",
      },
    })),
  };
}

// ---------------------------------------------------------------------------
// Finalizing a turn
// ---------------------------------------------------------------------------

/**
 * Keep segments that are natural-language speech. A segment that still looks
 * like tool-call JSON or leaked tool-result text is dropped here as well;
 * the speak path already withheld such utterances (`speech-integrity.ts`),
 * so this final sweep shares the same predicate instead of restating it.
 */
function speakableSegments(segments: string[]): string[] {
  return segments.filter((segment) => {
    const text = segment.trim();

    return !!text && !looksLikeToolCall(text) && !text.includes("UNTRUSTED_");
  });
}

/**
 * Finalize a validated turn. The turn is dropped with `no_reply` — before any
 * delta is emitted — when nothing speakable remains, so the interface can
 * never voice a rejected or empty response.
 */
function finalize(
  result: ModelResult,
  state: TurnState,
  toolRounds: number,
  seen: TurnCallbacks,
  mode: AccessMode | null,
  debug?: DebugCapture,
): OmniTurn {
  const segments = speakableSegments(state.speakSegments);
  const speak = normalizeSpeech(segments.join(" "));

  if (!speak) {
    throw new OrbError("no_reply", "The assistant returned no reply.");
  }

  // Speech isolation: deltas go out only now, after every segment passed the
  // integrity gate, in utterance order.
  for (const segment of segments) {
    seen.onSpeakDelta?.(segment);
  }

  const cards = capabilitiesFor(mode).cards && !state.newSession ? state.cards : [];

  return {
    transcript: state.transcript,
    speak,
    meta: metaFrom(result, toolRounds),
    sources: selectReplySources(joinCardMarkdown(cards), state.sources),
    cards,
    ...(state.newSession ? { newSession: true as const } : {}),
    ...(state.reminders.length > 0 ? { reminders: state.reminders } : {}),
    ...(state.moods.length > 0 ? { moods: state.moods } : {}),
    ...(debug && debug.rounds.length > 0
      ? { debug: { rounds: debug.rounds } }
      : {}),
  };
}

function metaFrom(result: ModelResult, toolRounds: number): TurnMeta {
  return {
    model: result.model || BASETEN_MODEL,
    finishReason: result.finishReason || "stop",
    promptTokens: result.usage.prompt_tokens ?? 0,
    cachedTokens: result.usage.prompt_tokens_details?.cached_tokens ?? 0,
    audioTokens: result.usage.prompt_tokens_details?.audio_tokens ?? 0,
    completionTokens: result.usage.completion_tokens ?? 0,
    reasoningTokens: result.usage.completion_tokens_details?.reasoning_tokens ?? 0,
    toolRounds,
  };
}

// ---------------------------------------------------------------------------
// Model calls
// ---------------------------------------------------------------------------

function getApiKey(): string {
  const key = process.env.BASETEN_API_KEY?.trim();

  if (!key) {
    throw new OrbError("config", "BASETEN_API_KEY is not configured. Add it to .env.");
  }

  return key;
}

async function runModelTurn(
  apiKey: string,
  messages: Message[],
  callbacks: TurnCallbacks,
  run: TurnRun,
  tools: readonly OrbTool[],
): Promise<ModelResult> {
  let result = await callModel(apiKey, messages, run, { tools });

  if (result.finishReason === "length") {
    result = await callModel(
      apiKey,
      [
        ...messages,
        { role: "assistant", content: result.content },
        {
          role: "user",
          content:
            "Your previous reply was cut off mid-call. Redo that call so it completes in one piece: leaner card content, or fewer cards this round, keeping the substance. If only the words remain, finish with the speak tool.",
        },
      ],
      run,
      { tools },
    );
  }

  if (!result.content.trim() && result.nativeToolCalls.length === 0) {
    throw new OrbError("no_reply", "The Muse Spark Open model returned no text.");
  }

  return result;
}

async function callModel(
  apiKey: string,
  messages: Message[],
  run: TurnRun,
  options: { tools?: readonly OrbTool[] } = {},
): Promise<ModelResult> {
  const startedAt = performance.now();
  const response = await postModel(
    apiKey,
    {
      model: BASETEN_MODEL,
      messages,
      max_tokens: DEFAULT_MAX_REPLY_TOKENS,
      temperature: 0.1,
      reasoning_effort: REASONING_EFFORT,
      ...(options.tools && options.tools.length > 0
        ? {
            tools: options.tools,
            tool_choice: "auto",
            parallel_tool_calls: true,
          }
        : {}),
    },
    run,
  );
  const payload = (await response.json()) as {
    model?: string;
    choices?: Array<{
      message?: {
        content?: string | null;
        reasoning_content?: string | null;
        tool_calls?: NativeToolCall[] | null;
      };
      finish_reason?: string | null;
    }>;
    usage?: Usage;
  };
  const choice = payload.choices?.[0];
  const message = choice?.message;

  // Keep the exact parsed payload, not a reconstruction: the panel exists to
  // show what the model actually returned, including reasoning and tool calls.
  if (run.debug) {
    run.debug.rounds.push({
      round: run.debug.rounds.length + 1,
      atMs: Math.round(performance.now() - run.debug.startedAt),
      ms: Math.round(performance.now() - startedAt),
      tools: (options.tools?.length ?? 0) > 0,
      response: payload,
    });
  }

  return {
    content: typeof message?.content === "string" ? message.content : "",
    reasoning: typeof message?.reasoning_content === "string" ? message.reasoning_content : "",
    finishReason: choice?.finish_reason ?? "stop",
    usage: payload.usage ?? {},
    model: payload.model ?? BASETEN_MODEL,
    nativeToolCalls: Array.isArray(message?.tool_calls) ? message.tool_calls : [],
  };
}

async function postModel(
  apiKey: string,
  body: Record<string, unknown>,
  run: TurnRun,
): Promise<Response> {
  let response: Response;

  try {
    response = await fetch(BASETEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(run.session ? { "x-session-affinity": run.session } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.any([run.signal, AbortSignal.timeout(MODEL_TIMEOUT_MS)]),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new OrbError("timeout", "The assistant took too long to think. Try again.");
    }

    throw new OrbError("config", "The assistant is unavailable.");
  }

  if (response.status === 401 || response.status === 403) {
    throw new OrbError("config", `Muse Spark Open rejected the API key (${response.status}).`);
  }
  if (response.status === 402) {
    throw new OrbError("config", "Baseten rejected the request for billing reasons (402). Check the workspace plan.");
  }
  if (response.status === 429 || response.status === 503 || response.status === 529) {
    throw new OrbError("busy", `Muse Spark Open is busy (${response.status}). Try again in a moment.`);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new OrbError("config", `Muse Spark Open failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  return response;
}
