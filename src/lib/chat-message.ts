/**
 * Shared text-only conversation contract.
 *
 * The dashboard validates its `localStorage` history with this, and the orb
 * route validates the `history` field with the same helper. Keeping one copy
 * means the client and server cannot drift on what a stored turn looks like.
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

/**
 * One per-message cap for both the stored session and the request body.
 *
 * Big enough that legit cards never clip, small enough that one giant paste
 * cannot evict the rest of the session from the token budget below.
 */
export const MAX_MESSAGE_CHARS = 50_000;

/** What the model receives: text only, never ids, timestamps, or sources. */
export type ModelHistoryMessage = Pick<ChatMessage, "role" | "content" | "speak">;

const DEFAULT_HISTORY_TOKENS = 100_000;

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
 * Keep the newest turns within a token budget, without separating a user
 * message from the assistant reply it belongs to.
 *
 * The oldest pair is dropped whole. If a single pair is larger than the budget,
 * it is included but each field is clipped, so the model still sees the shape
 * of the exchange.
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

  const kept: ChatMessage[][] = [];

  let totalTokens = 0;

  for (let index = pairs.length - 1; index >= 0; index -= 1) {
    const pair = pairs[index];
    const size = pair.reduce((sum, message) => sum + messageSize(message), 0);
    const tokens = estimateTokens(size);

    if (kept.length > 0 && totalTokens + tokens > maxTokens) break;

    if (kept.length === 0 && tokens > maxTokens) {
      const share = Math.max(1, Math.floor((maxTokens * 4) / pair.length));

      kept.unshift(
        pair.map((message) => ({
          ...message,
          content: message.content.slice(0, share),
          ...(message.speak
            ? { speak: message.speak.slice(0, share) }
            : {}),
        })),
      );
    } else {
      kept.unshift(pair);
    }

    totalTokens += tokens;
  }

  return kept.flat();
}

/**
 * Validate the `history` field (a JSON string or an array) into model turns.
 *
 * Invalid turns are dropped, `content` and `speak` share one cap, empty turns
 * are removed, and the newest pairs are kept within the token budget.
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
      content: message.content.trim().slice(0, MAX_MESSAGE_CHARS),
      ...(typeof message.speak === "string" && message.speak.trim()
        ? { speak: message.speak.trim().slice(0, MAX_MESSAGE_CHARS) }
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
