/**
 * Shared text-only conversation contract.
 *
 * The dashboard validates its stored threads with this, and the orb route
 * validates the `history` field with the same helper. Keeping one copy means
 * the client and server cannot drift on what a stored turn looks like.
 */
import { isCardContent, joinCardMarkdown, MAX_CARDS, type CardContent } from "./cards";
import type { SourceLink } from "./source-links";
import { isToolTrace, type ToolTrace } from "./tool-trace";

export type ChatMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  /** The spoken version of an assistant turn, when one was produced. */
  speak?: string;
  /** Search results cited by an assistant turn, titled by the search API. */
  sources?: SourceLink[];
  /** Tools the assistant ran for this turn, shown under the reply. */
  tools?: ToolTrace[];
  /** Markdown cards created by the create tool; the only on-screen content. */
  cards?: CardContent[];
  timestamp?: number;
};

/** What the model receives: text only, never ids, timestamps, or sources. */
export type ModelHistoryMessage = Pick<ChatMessage, "role" | "content" | "speak">;

const DEFAULT_HISTORY_TOKENS = 100_000;

/**
 * Hysteresis for the cache prefix. Model API caches the token prefix, so a
 * history window must stay byte-stable between sends to keep cache hits from
 * extending beyond the static system prompt. While the history fits the
 * budget it is passed through untouched. When it overflows, the window is
 * cut back to this share of the budget instead of to the budget edge, so the
 * re-trimmed window grows through several turns before another cut is due —
 * only the rarer overflow crossings restart the prefix.
 */
const TRIM_TARGET_RATIO = 0.6;

/** Rough token estimate for budgeting; the provider counts exactly. */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

function isSourceLink(value: unknown): value is SourceLink {
  if (typeof value !== "object" || value === null) return false;

  const source = value as { url?: unknown; title?: unknown };

  return (
    typeof source.url === "string" &&
    source.url.length > 0 &&
    (source.title === undefined || typeof source.title === "string")
  );
}

export function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;

  const message = value as {
    role?: unknown;
    content?: unknown;
    sources?: unknown;
    tools?: unknown;
    cards?: unknown;
  };

  if (
    message.role !== "user" &&
    message.role !== "assistant"
  ) {
    return false;
  }

  if (typeof message.content !== "string") return false;

  if (
    message.sources !== undefined &&
    (!Array.isArray(message.sources) ||
      !message.sources.every(isSourceLink))
  ) {
    return false;
  }

  if (
    message.tools !== undefined &&
    (!Array.isArray(message.tools) || !message.tools.every(isToolTrace))
  ) {
    return false;
  }

  if (
    message.cards !== undefined &&
    (!Array.isArray(message.cards) ||
      message.cards.length > MAX_CARDS ||
      !message.cards.every(isCardContent))
  ) {
    return false;
  }

  return true;
}

function messageSize(message: ChatMessage) {
  return message.content.length + (message.speak?.length ?? 0);
}

/**
 * Walk pairs newest → oldest, keeping what fits `budgetTokens`; the newest
 * pair always stays, and a single pair larger than the whole budget is
 * clipped to `clipTokens` so the model still sees the shape of the exchange.
 * Returns the kept messages plus whether trimming occurred at all.
 */
function keepPairs(
  pairs: ChatMessage[][],
  budgetTokens: number,
  clipTokens: number,
): { kept: ChatMessage[]; trimmed: boolean } {
  const kept: ChatMessage[] = [];
  let totalTokens = 0;

  for (let index = pairs.length - 1; index >= 0; index -= 1) {
    const pair = pairs[index];
    const size = pair.reduce((sum, message) => sum + messageSize(message), 0);
    const tokens = estimateTokens(size);

    if (kept.length > 0 && totalTokens + tokens > budgetTokens) {
      return { kept, trimmed: true };
    }

    if (kept.length === 0 && tokens > clipTokens) {
      const share = Math.max(1, Math.floor((clipTokens * 4) / pair.length));

      kept.unshift(
        ...pair.map((message) => ({
          ...message,
          content: message.content.slice(0, share),
          ...(message.speak ? { speak: message.speak.slice(0, share) } : {}),
        })),
      );
      return { kept, trimmed: true };
    }

    kept.unshift(...pair);
    totalTokens += tokens;
  }

  return { kept, trimmed: false };
}

/**
 * Keep the newest turns within a token budget, without separating a user
 * message from the assistant reply it belongs to.
 *
 * Untouched history stays byte-identical so the provider's cached prompt
 * prefix survives between sends. Only when the history overflows the budget
 * is the window cut back — to a hysteresis target well under the budget, not
 * to the budget edge — so the window grows through several turns before the
 * next regeneration breaks the prefix again.
 */
export function trimHistory(
  messages: ChatMessage[],
  maxTokens = DEFAULT_HISTORY_TOKENS,
): ChatMessage[] {
  const pairs: ChatMessage[][] = [];

  for (let index = messages.length; index > 0; ) {
    const last = messages[index - 1];
    const previous = messages[index - 2];

    if (last.role === "assistant" && previous?.role === "user") {
      pairs.unshift([previous, last]);
      index -= 2;
    } else {
      pairs.unshift([last]);
      index -= 1;
    }
  }

  const inBudget = keepPairs(pairs, maxTokens, maxTokens);

  if (!inBudget.trimmed) {
    return inBudget.kept;
  }

  return keepPairs(
    pairs,
    Math.floor(maxTokens * TRIM_TARGET_RATIO),
    maxTokens,
  ).kept;
}

/**
 * Validate the `history` field (a JSON string or an array) into model turns.
 *
 * Invalid turns are dropped, empty turns are removed, and the newest pairs
 * are kept within the token budget, which is the only size limit.
 */
export function parseHistory(
  value: unknown,
  maxTokens = DEFAULT_HISTORY_TOKENS,
): ChatMessage[] {
  let parsed: unknown = value;

  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  const messages = parsed
    .filter(isChatMessage)
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
      ...(typeof message.speak === "string" && message.speak.trim()
        ? { speak: message.speak.trim() }
        : {}),
    }))
    .filter((message) => message.content.length > 0);

  return trimHistory(messages, maxTokens);
}

/** Drop the session-only fields before a turn sends its history. */
export function toModelHistory(
  messages: ChatMessage[],
): ModelHistoryMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content:
      message.content ||
      (message.cards?.length ? joinCardMarkdown(message.cards) : ""),
    ...(message.speak ? { speak: message.speak } : {}),
  }));
}
