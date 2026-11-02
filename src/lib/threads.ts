/**
 * ChatGPT-style threads: many named conversations, one active.
 *
 * Pure data helpers only — no storage here. Persistence lives in
 * `db/threads.ts` (IndexedDB); the dashboard keeps an in-memory mirror for
 * the synchronous turn pipeline. Nothing is capped: IndexedDB quotas make
 * the old per-message and per-thread limits unnecessary.
 */
import { isChatMessage, type ChatMessage } from "./chat-message";

export type ChatThread = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
};

/** Title from the first user message, like a chat list preview. */
export function threadTitleFor(
  messages: ChatMessage[],
  fallback = "New chat",
): string {
  const first = messages.find(
    (message) => message.role === "user" && message.content.trim(),
  );

  if (!first) return fallback;

  return first.content.trim().split("\n")[0];
}

export function createThread(messages: ChatMessage[] = []): ChatThread {
  const now = Date.now();

  return {
    id: crypto.randomUUID(),
    title: threadTitleFor(messages),
    messages: [...messages],
    createdAt: now,
    updatedAt: now,
  };
}

/** Ensures one stored turn has an id; content passes through untouched. */
export function sanitizeMessage(message: ChatMessage): ChatMessage {
  return {
    id: message.id ?? crypto.randomUUID(),
    role: message.role,
    content: message.content,
    ...(typeof message.speak === "string" ? { speak: message.speak } : {}),
    ...(message.cards !== undefined ? { cards: message.cards } : {}),
    ...(message.sources !== undefined ? { sources: message.sources } : {}),
    ...(message.tools !== undefined ? { tools: message.tools } : {}),
    ...(message.timestamp !== undefined
      ? { timestamp: message.timestamp }
      : {}),
  };
}

export function isThread(value: unknown): value is ChatThread {
  if (typeof value !== "object" || value === null) return false;

  const thread = value as {
    id?: unknown;
    title?: unknown;
    messages?: unknown;
  };

  return (
    typeof thread.id === "string" &&
    typeof thread.title === "string" &&
    Array.isArray(thread.messages)
  );
}

export function sanitizeThread(thread: ChatThread): ChatThread {
  return {
    id: thread.id,
    title: thread.title || "New chat",
    messages: thread.messages.filter(isChatMessage).map(sanitizeMessage),
    createdAt:
      typeof thread.createdAt === "number" ? thread.createdAt : Date.now(),
    updatedAt:
      typeof thread.updatedAt === "number" ? thread.updatedAt : Date.now(),
  };
}
