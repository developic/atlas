/**
 * Centralized IndexedDB database (Dexie) for Atlas client storage.
 *
 * One database, five tables: threads (conversations), messages (turns),
 * prefs (small key-value settings), reminders (scheduled nudges), and moods
 * (the private mood log). The instance is created lazily and only in the
 * browser, so importing this module during server rendering is safe: no
 * `window` or `indexedDB` access happens until first use.
 */
import Dexie, { type Table } from "dexie";

import type { CardContent } from "../cards";
import type { MoodEntry } from "../moods";
import type { Reminder } from "../reminders";
import type { SourceLink } from "../source-links";
import type { ToolTrace } from "../tool-trace";

/** One conversation row. Messages live in their own table; this carries the count. */
export type DbThread = {
  id: string;
  title: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
};

/** One turn. `seq` is the per-thread position, assigned on write. */
export type DbMessage = {
  id: string;
  threadId: string;
  seq: number;
  role: "user" | "assistant";
  content: string;
  speak?: string;
  sources?: SourceLink[];
  cards?: CardContent[];
  tools?: ToolTrace[];
  timestamp?: number;
};

/** Small settings: onboarding answers, migration markers, active thread. */
export type DbPref = {
  key: string;
  value: unknown;
};

class AtlasDb extends Dexie {
  threads!: Table<DbThread, string>;
  messages!: Table<DbMessage, string>;
  prefs!: Table<DbPref, string>;
  reminders!: Table<Reminder, string>;
  moods!: Table<MoodEntry, string>;

  constructor() {
    super("atlas");
    this.version(1).stores({
      threads: "id, updatedAt",
      messages: "id, threadId, [threadId+seq]",
      prefs: "key",
    });
    // Version 2 adds the reminders table; earlier tables carry over.
    this.version(2).stores({
      reminders: "id, status, fireAt",
    });
    // Version 3 adds the private mood log; earlier tables carry over.
    this.version(3).stores({
      moods: "id, at",
    });
  }
}

let instance: AtlasDb | null = null;

/** The shared database, or null outside the browser. Never throws. */
export function getDb(): AtlasDb | null {
  if (typeof window === "undefined") return null;

  try {
    if (!instance) instance = new AtlasDb();
    return instance;
  } catch {
    return null;
  }
}

/** False during SSR, in private modes without IndexedDB, or when blocked. */
export function isDbAvailable(): boolean {
  if (typeof window === "undefined") return false;

  try {
    return typeof indexedDB !== "undefined";
  } catch {
    return false;
  }
}
