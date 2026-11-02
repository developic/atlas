/**
 * Small key-value settings on top of the `prefs` table.
 *
 * Every function degrades instead of throwing: a miss returns the fallback,
 * a failed write returns false so the caller knows persistence failed.
 * Nothing here may run during server rendering.
 */
import { getDb, isDbAvailable } from "./database";

function report(action: string, error: unknown): void {
  console.error(`Atlas prefs ${action} failed`, error);
}

/** Read one setting. Misses and failures both yield the fallback. */
export async function dbGetPref<T>(key: string, fallback: T): Promise<T> {
  if (!isDbAvailable()) return fallback;

  try {
    const row = await getDb()?.prefs.get(key);
    return row === undefined ? fallback : (row.value as T);
  } catch (error) {
    report(`read "${key}"`, error);
    return fallback;
  }
}

/**
 * Write one setting. Returns false when the database is unavailable or the
 * write failed (for example quota), so the caller can use its fallback tier.
 */
export async function dbSetPref(key: string, value: unknown): Promise<boolean> {
  if (!isDbAvailable()) return false;

  try {
    await getDb()?.prefs.put({ key, value });
    return true;
  } catch (error) {
    report(`write "${key}"`, error);
    return false;
  }
}
