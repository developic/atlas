/**
 * Thread persistence on IndexedDB. All writes for one thread run in a single
 * transaction (thread row + its messages), so a turn can never leave a
 * half-written conversation behind.
 */
import { getDb, isDbAvailable, type DbMessage } from "./database";
import { dbGetPref, dbSetPref } from "./prefs";
import { isChatMessage, type ChatMessage } from "../chat-message";
import {
  createThread,
  sanitizeMessage,
  sanitizeThread,
  type ChatThread,
} from "../threads";

const ACTIVE_KEY = "active-thread";

function report(action: string, error: unknown): void {
  console.error(`Atlas threads ${action} failed`, error);
}

function toDbMessages(thread: ChatThread): DbMessage[] {
  return thread.messages
    .filter(isChatMessage)
    .map(sanitizeMessage)
    .map((message, seq) => ({
      id: message.id ?? crypto.randomUUID(),
      threadId: thread.id,
      seq,
      role: message.role,
      content: message.content,
      ...(message.speak !== undefined ? { speak: message.speak } : {}),
      ...(message.sources !== undefined ? { sources: message.sources } : {}),
      ...(message.cards !== undefined ? { cards: message.cards } : {}),
      ...(message.tools !== undefined ? { tools: message.tools } : {}),
      ...(message.timestamp !== undefined
        ? { timestamp: message.timestamp }
        : {}),
    }));
}

function fromDbMessages(rows: DbMessage[]): ChatMessage[] {
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    ...(row.speak !== undefined ? { speak: row.speak } : {}),
    ...(row.sources !== undefined ? { sources: row.sources } : {}),
    ...(row.cards !== undefined ? { cards: row.cards } : {}),
    ...(row.tools !== undefined ? { tools: row.tools } : {}),
    ...(row.timestamp !== undefined ? { timestamp: row.timestamp } : {}),
  }));
}

/**
 * Save one thread and its messages atomically. Returns false when the
 * database is unavailable or the write failed; in-memory state still holds
 * the turn, so the conversation continues for the session.
 */
export async function dbSaveThread(thread: ChatThread): Promise<boolean> {
  const db = isDbAvailable() ? getDb() : null;
  if (!db) return false;

  try {
    const clean = sanitizeThread(thread);
    const messages = toDbMessages(clean);

    await db.transaction("rw", db.threads, db.messages, async () => {
      await db.threads.put({
        id: clean.id,
        title: clean.title,
        messageCount: messages.length,
        createdAt: clean.createdAt,
        updatedAt: clean.updatedAt,
      });
      await db.messages.where({ threadId: clean.id }).delete();
      if (messages.length > 0) await db.messages.bulkAdd(messages);
    });

    return true;
  } catch (error) {
    report(`save thread "${thread.id}"`, error);
    return false;
  }
}

/** Delete one thread and its messages atomically. */
export async function dbDeleteThread(id: string): Promise<boolean> {
  const db = isDbAvailable() ? getDb() : null;
  if (!db) return false;

  try {
    await db.transaction("rw", db.threads, db.messages, async () => {
      await db.threads.delete(id);
      await db.messages.where({ threadId: id }).delete();
    });

    return true;
  } catch (error) {
    report(`delete thread "${id}"`, error);
    return false;
  }
}

/** Remember which thread is active across reloads. Best effort. */
export async function dbSetActiveThread(id: string | null): Promise<void> {
  await dbSetPref(ACTIVE_KEY, id);
}

async function dbReadStore(): Promise<{
  threads: ChatThread[];
  activeId: string | null;
} | null> {
  const db = getDb();
  if (!db) return null;

  const rows = await db.threads.orderBy("updatedAt").reverse().toArray();
  const threads: ChatThread[] = [];

  for (const row of rows) {
    const messages = await db.messages
      .where({ threadId: row.id })
      .sortBy("seq");

    threads.push({
      id: row.id,
      title: row.title,
      messages: fromDbMessages(messages),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  const activeId = await dbGetPref<string | null>(ACTIVE_KEY, null);

  return {
    threads,
    activeId:
      typeof activeId === "string" &&
      threads.some((thread) => thread.id === activeId)
        ? activeId
        : (threads[0]?.id ?? null),
  };
}

/**
 * Load every thread, newest first. Seeds one fresh thread when the database
 * is empty. Returns null only when IndexedDB is unusable — the caller then
 * runs the session in memory.
 */
export async function dbLoadStore(): Promise<{
  threads: ChatThread[];
  activeId: string | null;
} | null> {
  const db = isDbAvailable() ? getDb() : null;
  if (!db) return null;

  try {
    const stored = await dbReadStore();

    if (!stored || stored.threads.length === 0) {
      const fresh = createThread();
      await dbSaveThread(fresh);
      await dbSetActiveThread(fresh.id);

      return { threads: [fresh], activeId: fresh.id };
    }

    return stored;
  } catch (error) {
    report("load store", error);
    return null;
  }
}
