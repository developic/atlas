/**
 * Mood persistence on IndexedDB.
 *
 * Same rule as the reminder store: degrade instead of throwing. A miss returns
 * an empty list, a failed write returns false, and nothing here runs during
 * server rendering. The log stays on this device; a turn carries only the
 * compact snapshot the client explicitly attaches.
 */
import { getDb, isDbAvailable } from "./database";
import {
  MOOD_SNAPSHOT_MAX,
  isMoodDirective,
  isMoodEntry,
  parseMoodSnapshot,
  type MoodDirective,
  type MoodEntry,
  type MoodSnapshotItem,
} from "../moods";

function report(action: string, error: unknown): void {
  console.error(`Atlas mood log ${action} failed`, error);
}

/** The whole log, oldest first. Empty when storage is unavailable. */
export async function dbListMoods(): Promise<MoodEntry[]> {
  if (!isDbAvailable()) return [];

  try {
    const rows = await getDb()?.moods.orderBy("at").toArray();
    return (rows ?? []).filter(isMoodEntry);
  } catch (error) {
    report("list", error);
    return [];
  }
}

/** Insert one entry. Returns false when the write failed. */
export async function dbPutMood(entry: MoodEntry): Promise<boolean> {
  if (!isDbAvailable() || !isMoodEntry(entry)) return false;

  try {
    await getDb()?.moods.put(entry);
    return true;
  } catch (error) {
    report(`write "${entry.id}"`, error);
    return false;
  }
}

/** The compact newest-first slice a turn attaches, oldest first. */
export async function buildMoodSnapshot(): Promise<MoodSnapshotItem[]> {
  try {
    const all = await dbListMoods();
    return parseMoodSnapshot(all.slice(-MOOD_SNAPSHOT_MAX));
  } catch {
    return [];
  }
}

/**
 * Apply the turn's authorized log writes. Each directive is guarded and
 * isolated: one bad entry never blocks its siblings.
 */
export async function applyMoodDirectives(
  directives: MoodDirective[],
): Promise<void> {
  for (const directive of directives) {
    if (!isMoodDirective(directive)) continue;

    try {
      await dbPutMood(directive.entry);
    } catch {
      // The next turn re-reads the store; a failed write surfaces as a
      // missing entry, never a crashed turn.
    }
  }
}
