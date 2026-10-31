/**
 * Server-only model helpers for the orb — native tool-calling only.
 *
 * One turn is a small agent loop: send the recording/typed message to Baseten
 * with the Atlas system prompt, and let the model act through native
 * `tool_calls` (websearch, webfetch, get_current_time, create, speak). Each
 * round either runs tool calls and continues the loop, or ends the turn with
 * the collected spoken segments and cards. The model never answers through a
 * text field; everything user-visible comes from a tool call.
 *
 * Execution integrity is enforced in the loop, not in the prompt:
 *
 * - Every tool call resolves to an `ExecutionLedger` record (`exec_N`,
 *   `running → succeeded | failed`), and the tool message the model sees is
 *   stamped with that id and outcome. A failed execution is never success
 *   evidence, and an identical repeat call reuses the stored outcome instead
 *   of re-running the tool.
 * - Spoken segments are collected only after their `speak` call passed the
 *   integrity gate, and are streamed to TTS only at finalization, so the
 *   interface never voices an unvalidated claim.
 * - Tool-call JSON that arrives as plain text is structurally rejected; it is
 *   never replayed into tool calls.
 */

import { buildAtlasSystemPrompt } from "./atlas-prompt";
import { joinCardMarkdown, MAX_CARDS, type CardContent } from "./cards";
import type { ChatMessage } from "./chat-message";
import {
  ExecutionLedger,
  executionStamp,
  type ExecutionRecord,
} from "./execution-ledger";
import { MAX_TRANSCRIPT_CHARS, normalizeSpeech } from "./orb-turn";
import { OrbError } from "./orb-errors";
import {
  executeTool,
  ORB_TOOLS,
  parseNativeToolCalls,
  type NativeCall,
  type ToolOutcome,
  type ToolRequest,
  type ToolResult,
  type ToolRunContext,
} from "./tools/registry";
import { selectReplySources, type SourceLink } from "./source-links";
import { validateSpeechClaim } from "./speech-integrity";
import type { TurnDebug, TurnDebugRound } from "./turn-debug";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASETEN_MODEL = "meta-models/muse-spark-open-1026";
const BASETEN_URL = "https://inference.baseten.co/v1/chat/completions";
const DEFAULT_MAX_REPLY_TOKENS = 1_200;
const MAX_TOOL_ROUNDS = 3;
const MODEL_TIMEOUT_MS = 60_000;
const REASONING_EFFORT = "low";
const MAX_SESSION_CHARS = 64;
/** Tools offered when the turn must end with speech and nothing else. */
const SPEAK_ONLY_TOOLS = ORB_TOOLS.filter(
  (tool) => tool.function.name === "speak",
);

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
  debug?: DebugCapture;
};

/** Everything a turn collects across rounds, in arrival order. */
type TurnState = {
  transcript: string;
  sources: SourceLink[];
  cards: CardContent[];
  speakSegments: string[];
};

/** One `tool_call_id` resolved, with the stamped content the model sees. */
type CallOutcome = {
  call: NativeCall;
  content: string;
  ok: boolean;
  /** True when the ledger deduped this call to an earlier execution. */
  reused: boolean;
  execId: string | null;
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

type TurnOptions = {
  allowTools?: boolean;
  /**
   * Send only the speak tool and require a native call to it. A final answer
   * has to carry `evidence`, and only a tool call has an evidence slot.
   */
  forceSpeak?: boolean;
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
      { type: "text", text: "Transcribe and answer this recording." },
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
  return mime === "mp3" ? "mp3" : "wav";
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
  const messages: Message[] = [
    { role: "system", content: buildAtlasSystemPrompt() },
    ...history.map((message) => ({ role: message.role, content: message.content })),
    { role: "user", content },
  ];

  const run: TurnRun = {
    signal: composeTurnSignal(context.signal),
    session: normalizeSession(context.session),
    debug: context.debug
      ? { startedAt: performance.now(), rounds: [] }
      : undefined,
  };

  const state: TurnState = {
    transcript: "",
    sources: [],
    cards: [],
    speakSegments: [],
  };
  const ledger = new ExecutionLedger();
  /** In-flight promises per execution record id, so a repeated identical
   *  call attaches to the stored outcome instead of re-running the tool. */
  const cache = new Map<string, Promise<ToolOutcome>>();
  /** Exec ids whose successful result was already folded into the turn, so a
   *  deduped repeat call cannot double-commit a card or speech segment. */
  const committed = new Set<string>();

  let result: ModelResult | null = null;
  let toolRounds = 0;

  for (;;) {
    if (run.signal.aborted) {
      throw new OrbError("timeout", "The assistant ran out of time. Try again.");
    }

    const seen = reporterFor(callbacks);

    // At the round cap, force a speak-only answer.
    if (toolRounds >= MAX_TOOL_ROUNDS && result) {
      return forceAnswer(apiKey, messages, result, state, toolRounds, ledger, run, seen);
    }

    result = await runModelTurn(apiKey, messages, seen, run);
    const calls = parseNativeToolCalls(result.nativeToolCalls);

    if (calls.length === 0) {
      const ended = await endWithContent(
        result,
        messages,
        state,
        toolRounds,
        ledger,
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

    const outcomes = await executeNativeCalls(calls, ledger, cache, run.signal);

    for (const outcome of outcomes) {
      if (!outcome.ok || !outcome.result || !outcome.execId) continue;

      // A deduped repeat call re-resolves its stored result; fold it into the
      // turn state exactly once.
      if (committed.has(outcome.execId)) continue;

      committed.add(outcome.execId);
      state.sources.push(...outcome.result.sources);
      collectCards([outcome.result], state);

      if (outcome.call.request?.tool === "speak") {
        commitSpeech(outcome.call.request.arguments.text ?? "", state);
      }
    }

    // Terminal round: every call succeeded, every call put content on the
    // turn (create or speak), and at least one utterance was approved. Without
    // this the native-only loop would make one more model call.
    const allOk = outcomes.every((outcome) => outcome.ok);

    if (allOk && calls.every(isCreateOrSpeak) && state.speakSegments.length > 0) {
      return finalize(result, state, toolRounds, seen, ledger, run.debug);
    }

    // Non-terminal: report every outcome — stamped, including failures — to
    // the model and keep looping. Delivery marks the executions the model can
    // now cite as evidence.
    messages.push(echoedAssistant(result, calls));
    for (const [index, outcome] of outcomes.entries()) {
      messages.push({ role: "tool", tool_call_id: calls[index].id, content: outcome.content });
    }
    ledger.markDelivered(outcomes.map((outcome) => outcome.execId));

    toolRounds += 1;
  }
}

// ---------------------------------------------------------------------------
// Round helpers
// ---------------------------------------------------------------------------

function isCreateOrSpeak(call: NativeCall): boolean {
  return !!call.request && (call.request.tool === "create" || call.request.tool === "speak");
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
  if (tool === "speak") return args.text?.slice(0, 80);
  return undefined;
}

/**
 * End the turn when the provider returned no native tool calls. The content
 * itself is the candidate utterance (usually speech, possibly the legacy
 * `{"transcript","speak"}` text envelope). Plain content has no native
 * evidence slot, so it is validated with empty evidence: when actions ran
 * this turn, prose cannot claim them, and tool-call JSON arriving as text is
 * structurally rejected — never replayed into tool calls.
 *
 * Rejected replies are withheld: the model gets a corrective message and the
 * loop continues so it can answer through the native `speak` tool instead.
 */
async function endWithContent(
  result: ModelResult,
  messages: Message[],
  state: TurnState,
  toolRounds: number,
  ledger: ExecutionLedger,
  run: TurnRun,
  seen: TurnCallbacks,
): Promise<OmniTurn | null> {
  const plain = result.content.trim();

  if (plain) {
    const candidate = plainReplyCandidate(plain);
    const verdict = validateSpeechClaim({ text: candidate.text, evidence: [], ledger });

    if (!verdict.ok) {
      messages.push({ role: "assistant", content: result.content });
      messages.push({
        role: "user",
        content: [
          `Your previous reply was withheld instead of being spoken: ${verdict.reason}`,
          `Executions this turn: ${ledger.describe()}.`,
          "Answer now with the native `speak` tool — pass `evidence` with the stamped exec ids if you report on an action — or reply without claiming that any action ran.",
        ].join(" "),
      });

      return null;
    }

    commitSpeech(candidate.text, state);
    if (candidate.transcript) applyTranscript(candidate.transcript, state, seen);
  }

  return finalize(result, state, toolRounds, seen, ledger, run.debug);
}

type PlainReply = { text: string; transcript?: string };

/** Split a plain-text reply into its utterance and optional transcript. */
function plainReplyCandidate(plain: string): PlainReply {
  try {
    const envelope = JSON.parse(plain) as { transcript?: unknown; speak?: unknown };

    if (typeof envelope.speak === "string" && envelope.speak.trim()) {
      return {
        text: envelope.speak.trim(),
        transcript:
          typeof envelope.transcript === "string" && envelope.transcript.trim()
            ? envelope.transcript.trim()
            : undefined,
      };
    }
  } catch {
    // Ordinary speech; fall through.
  }

  return { text: plain };
}

/**
 * Collect unique cards from create results, assigning stable ids when the
 * model omitted or duplicated one, and stopping at the six-card cap.
 */
function collectCards(cards: ToolResult[], state: TurnState): void {
  for (const result of cards) {
    if (!result.card || state.cards.length >= MAX_CARDS) continue;

    const card = { ...result.card, id: uniqueCardId(result.card.id, state.cards) };

    state.cards.push(card);
  }
}

function uniqueCardId(raw: string, existing: CardContent[]): string {
  let id = raw || `card-${existing.length + 1}`;

  while (existing.some((card) => card.id === id)) {
    id = `card-${existing.length + 1}`;
  }

  return id;
}

// ---------------------------------------------------------------------------
// Forced final answer at the round cap
// ---------------------------------------------------------------------------

/**
 * The round cap is reached. The model gets one final, speak-only prompt: the
 * speak tool stays available because a final answer must be able to carry
 * `evidence`, and only a tool call has an evidence slot. Every candidate
 * utterance still passes the integrity gate; an unsupported forced answer is a
 * `no_reply`, never a spoken fabrication.
 */
async function forceAnswer(
  apiKey: string,
  messages: Message[],
  result: ModelResult,
  state: TurnState,
  toolRounds: number,
  ledger: ExecutionLedger,
  run: TurnRun,
  seen: TurnCallbacks,
): Promise<OmniTurn> {
  const forcedMessages: Message[] = [
    ...messages,
    { role: "assistant", content: result.content },
    {
      role: "user",
      content:
        "No more search, fetch, create, or time tool calls are allowed. Use the speak tool to give your final answer now, passing `evidence` with the stamped exec ids if you report on any action.",
    },
  ];

  const forced = await runModelTurn(apiKey, forcedMessages, seen, run, {
    allowTools: true,
    forceSpeak: true,
  });

  if (forced.nativeToolCalls.length > 0) {
    // A final speak call is allowed through; anything else is terminal.
    const leftover = parseNativeToolCalls(forced.nativeToolCalls);
    const stray = leftover.filter((call) => call.request?.tool !== "speak");

    if (stray.length > 0) {
      throw new OrbError("no_reply", "The assistant kept requesting tools instead of answering.");
    }

    for (const call of leftover) {
      if (call.request?.tool !== "speak") continue;

      const verdict = validateSpeechClaim({
        text: call.request.arguments.text ?? "",
        evidence: call.request.evidence,
        ledger,
      });

      if (!verdict.ok) {
        throw new OrbError(
          "no_reply",
          `The forced final answer failed integrity validation: ${verdict.reason}`,
        );
      }

      commitSpeech(call.request.arguments.text ?? "", state);
    }
  } else if (forced.content.trim()) {
    const verdict = validateSpeechClaim({ text: forced.content.trim(), evidence: [], ledger });

    if (!verdict.ok) {
      throw new OrbError(
        "no_reply",
        `The forced final answer failed integrity validation: ${verdict.reason}`,
      );
    }

    commitSpeech(forced.content.trim(), state);
  }

  if (state.speakSegments.length === 0) {
    throw new OrbError("no_reply", "The assistant did not produce a spoken reply.");
  }

  return finalize(forced, state, toolRounds, seen, ledger, run.debug);
}

// ---------------------------------------------------------------------------
// Tool execution with the ledger
// ---------------------------------------------------------------------------

function requestKey(request: ToolRequest): string {
  return `${request.tool}:${JSON.stringify(request.arguments)}:${JSON.stringify(request.evidence)}`;
}

/**
 * Run native calls in place and answer every call, including one that failed
 * argument validation, so each `tool_call_id` gets a tool message back.
 *
 * Records begin synchronously in call order before any promise runs, so a
 * `speak` call in the same round already sees its sibling action attempts.
 * Identical repeat calls reuse their record's stored outcome and never
 * re-run the tool, so a cached failure cannot become a fresh success.
 */
async function executeNativeCalls(
  calls: NativeCall[],
  ledger: ExecutionLedger,
  cache: Map<string, Promise<ToolOutcome>>,
  signal?: AbortSignal,
): Promise<CallOutcome[]> {
  const entries = calls.map((call) => {
    if (!call.request) {
      return { call, request: null, record: null, reused: false };
    }

    const { record, reused } = ledger.begin(call.request.tool, requestKey(call.request));

    return { call, request: call.request, record, reused };
  });

  return Promise.all(
    entries.map(async (entry): Promise<CallOutcome> => {
      if (!entry.request || !entry.record) {
        return {
          call: entry.call,
          content: entry.call.error,
          ok: false,
          reused: false,
          execId: null,
          result: null,
        };
      }

      const outcome = await dispatchExecution(entry.request, entry.record, ledger, cache, signal);

      return {
        call: entry.call,
        content: `${executionStamp(entry.record, entry.reused)}\n${outcome.ok ? outcome.result.content : outcome.error}`,
        ok: outcome.ok,
        reused: entry.reused,
        execId: entry.record.id,
        result: outcome.ok ? outcome.result : null,
      };
    }),
  );
}

/**
 * Run one request through the registry, deduplicating on the record: the
 * first run of an execution stores its promise, and every identical repeat
 * attaches to that stored outcome instead of re-running the tool.
 */
async function dispatchExecution(
  request: ToolRequest,
  record: ExecutionRecord,
  ledger: ExecutionLedger,
  cache: Map<string, Promise<ToolOutcome>>,
  signal?: AbortSignal,
): Promise<ToolOutcome> {
  const pending = cache.get(record.id);

  if (pending) return pending;

  const context: ToolRunContext | undefined =
    request.tool === "speak"
      ? { ledger, record, evidence: request.evidence }
      : { ledger, record, evidence: [] };

  const outcome = executeTool(request.tool, request.arguments, signal, context);

  cache.set(record.id, outcome);

  try {
    return await outcome;
  } catch (error) {
    // Tools never throw in the normal path; keep an unexpected throw from
    // killing the turn instead of the model.
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
 * Keep segments that are natural-language speech. A segment that still
 * looks like tool-call JSON or leaked tool-result text is dropped here as
 * well; the pipeline has already withheld such segments upstream.
 */
function speakableSegments(segments: string[]): string[] {
  return segments.filter((segment) => {
    const text = segment.trim();

    return (
      !!text &&
      !text.startsWith('[{"tool"') &&
      !text.startsWith('{"tool"') &&
      !text.includes("UNTRUSTED_")
    );
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
  ledger: ExecutionLedger,
  debug?: DebugCapture,
): OmniTurn {
  const segments = speakableSegments(state.speakSegments);
  const speak = normalizeSpeech(segments.join(" "));

  if (!speak) {
    throw new OrbError(
      "no_reply",
      `The assistant returned no reply; the response was withheld (executions: ${ledger.describe()}).`,
    );
  }

  // Speech isolation: deltas go out only now, after every segment passed the
  // integrity gate, in utterance order.
  for (const segment of segments) {
    seen.onSpeakDelta?.(segment);
  }

  return {
    transcript: state.transcript,
    speak,
    meta: metaFrom(result, toolRounds),
    sources: selectReplySources(joinCardMarkdown(state.cards), state.sources),
    cards: state.cards,
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
  options: TurnOptions = {},
): Promise<ModelResult> {
  let result = await callModel(apiKey, messages, run, {
    tools: options.allowTools !== false,
    forceSpeak: options.forceSpeak,
  });

  if (result.finishReason === "length") {
    result = await callModel(
      apiKey,
      [
        ...messages,
        { role: "assistant", content: result.content },
        {
          role: "user",
          content:
            "Your previous answer was cut off. Use the speak tool to finish with a focused plain-text answer now.",
        },
      ],
      run,
      { tools: true, forceSpeak: true },
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
  options: { tools?: boolean; forceSpeak?: boolean } = {},
): Promise<ModelResult> {
  const startedAt = performance.now();
  const response = await postModel(
    apiKey,
    {
      model: BASETEN_MODEL,
      messages,
      max_tokens: DEFAULT_MAX_REPLY_TOKENS,
      temperature: 0.3,
      reasoning_effort: REASONING_EFFORT,
      ...(options.tools
        ? options.forceSpeak
          ? {
              tools: SPEAK_ONLY_TOOLS,
              tool_choice: { type: "function", function: { name: "speak" } },
            }
          : {
              tools: ORB_TOOLS,
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
      tools: options.tools !== false,
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

    throw new OrbError("audio", "The assistant is unavailable.");
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
    throw new OrbError("audio", `Muse Spark Open failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  return response;
}
