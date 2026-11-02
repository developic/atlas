/**
 * Reminder persistence on IndexedDB.
 *
 * Every function degrades instead of throwing: a miss returns the fallback, a
 * failed write returns false so the caller knows persistence failed. The
 * scheduler keeps a session mirror on top, so one failed write degrades a
 * single reminder — never the whole turn. Nothing here may run during server
 * rendering.
 */
import { getDb, isDbAvailable } from "./database";
import type { AnnounceMode, Reminder } from "../reminders";

const REMINDER_MODE_PREF_KEY = "reminder-mode";

function report(action: string, error: unknown): void {
  console.error(`Atlas reminders ${action} failed`, error);
}

function isReminder(value: unknown): value is Reminder {
  if (typeof value !== "object" || value === null) return false;

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    typeof record.title === "string" &&
    typeof record.fireAt === "number" &&
    typeof record.createdAt === "number" &&
    typeof record.updatedAt === "number"
  );
}

/** All reminders, oldest firing first. Empty when unavailable. */
export async function dbListReminders(): Promise<Reminder[]> {
  if (!isDbAvailable()) return [];

  try {
    const rows = await getDb()?.reminders.orderBy("fireAt").toArray();
    return (rows ?? []).filter(isReminder);
  } catch (error) {
    report("list", error);
    return [];
  }
}

/** One reminder by id, or null on miss/failure. */
export async function dbGetReminder(id: string): Promise<Reminder | null> {
  if (!isDbAvailable()) return null;

  try {
    const row = await getDb()?.reminders.get(id);
    return row && isReminder(row) ? row : null;
  } catch (error) {
    report(`read "${id}"`, error);
    return null;
  }
}

/** Insert or replace. Returns false when the write failed. */
export async function dbPutReminder(reminder: Reminder): Promise<boolean> {
  if (!isDbAvailable()) return false;

  try {
    await getDb()?.reminders.put(reminder);
    return true;
  } catch (error) {
    report(`write "${reminder.id}"`, error);
    return false;
  }
}

/** Delete by id. Returns false when the delete failed. */
export async function dbDeleteReminder(id: string): Promise<boolean> {
  if (!isDbAvailable()) return false;

  try {
    await getDb()?.reminders.delete(id);
    return true;
  } catch (error) {
    report(`delete "${id}"`, error);
    return false;
  }
}

/**
 * The announcement channel override for the future assistant modes (vision
 * speaks, calm/signs stay quiet). Null means "derive from onboarding": blind
 * users hear the topic, everyone else gets a beep plus a notification.
 */
export async function dbGetReminderMode(): Promise<AnnounceMode | null> {
  if (!isDbAvailable()) return null;

  try {
    const row = await getDb()?.prefs.get(REMINDER_MODE_PREF_KEY);
    return row?.value === "voice" || row?.value === "beep"
      ? row.value
      : null;
  } catch (error) {
    report("read mode", error);
    return null;
  }
}

/** Persist the channel override. Returns false when the write failed. */
export async function dbSetReminderMode(mode: AnnounceMode): Promise<boolean> {
  if (!isDbAvailable()) return false;

  try {
    await getDb()?.prefs.put({ key: REMINDER_MODE_PREF_KEY, value: mode });
    return true;
  } catch (error) {
    report("write mode", error);
    return false;
  }
}
