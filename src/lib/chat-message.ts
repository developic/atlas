/**
 * Shared text-only conversation contract.
 *
 * The dashboard validates its `sessionStorage` session with this, and the orb
 * route validates the `history` field with the same helper. Keeping one copy
 * means the client and server cannot drift on what a stored turn looks like.
 */
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
  timestamp?: number;
};

/**
 * One per-message cap for both the stored session and the request body.
 *
 * The dashboard and the route used to keep separate limits (6,000 and 4,000),
 * so a long turn could be stored at one size and read back at another.
 */
export const MAX_MESSAGE_CHARS = 6_000;

/** What the model receives: text only, never ids, timestamps, or sources. */
export type ModelHistoryMessage = Pick<ChatMessage, "role" | "content" | "speak">;

const DEFAULT_HISTORY_CHARS = 6_000;

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

  return true;
}

function messageSize(message: ChatMessage) {
  return message.content.length + (message.speak?.length ?? 0);
}

/**
 * Keep the newest turns within a character budget, without separating a user
 * message from the assistant reply it belongs to.
 *
 * The oldest pair is dropped whole. If a single pair is larger than the budget,
 * it is included but each field is clipped, so the model still sees the shape
 * of the exchange.
 */
export function trimHistory(
  messages: ChatMessage[],
  maxChars = DEFAULT_HISTORY_CHARS,
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

  let total = 0;

  for (let index = pairs.length - 1; index >= 0; index -= 1) {
    const pair = pairs[index];
    const size = pair.reduce((sum, message) => sum + messageSize(message), 0);

    if (kept.length > 0 && total + size > maxChars) break;

    if (kept.length === 0 && size > maxChars) {
      const share = Math.max(1, Math.floor(maxChars / pair.length));

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

    total += size;
  }

  return kept.flat();
}

/**
 * Validate the `history` field (a JSON string or an array) into model turns.
 *
 * Invalid turns are dropped, `content` and `speak` share one cap, empty turns
 * are removed, and the newest pairs are kept within the character budget.
 */
export function parseHistory(
  value: unknown,
  maxChars = DEFAULT_HISTORY_CHARS,
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

  return trimHistory(messages, maxChars);
}

/** Drop the session-only fields before a turn sends its history. */
export function toModelHistory(
  messages: ChatMessage[],
): ModelHistoryMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    ...(message.speak ? { speak: message.speak } : {}),
  }));
}
