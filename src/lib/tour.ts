/**
 * The dashboard tour's one-time marker.
 *
 * Stored with the other client settings, so it follows the same
 * degrade-not-throw rules: a miss or a failed write simply means the tour
 * shows again next visit. The version lets a future tour re-introduce itself
 * without rewriting this key.
 */
import { dbGetPref, dbSetPref } from "@/lib/db/prefs";

const TOUR_PREF_KEY = "dashboard-tour";

/** Bump when the tour content changes enough to show it again. */
export const TOUR_VERSION = 1;

type TourRecord = {
  version: number;
  completedAt: number;
};

function parseTourRecord(value: unknown): TourRecord | null {
  if (typeof value !== "object" || value === null) return null;

  const record = value as Record<string, unknown>;
  const version =
    typeof record.version === "number" && Number.isFinite(record.version)
      ? record.version
      : null;
  const completedAt =
    typeof record.completedAt === "number" && Number.isFinite(record.completedAt)
      ? record.completedAt
      : null;

  if (version === null || completedAt === null) return null;

  return { version, completedAt };
}

/** True only for a completed tour from the current version. */
export function isTourComplete(value: unknown): boolean {
  const record = parseTourRecord(value);

  return record !== null && record.version >= TOUR_VERSION;
}

export async function loadTourComplete(): Promise<boolean> {
  const stored = await dbGetPref<unknown>(TOUR_PREF_KEY, undefined);

  return isTourComplete(stored);
}

/** Best effort: false means the marker could not be written. */
export async function saveTourComplete(): Promise<boolean> {
  return dbSetPref(TOUR_PREF_KEY, {
    version: TOUR_VERSION,
    completedAt: Date.now(),
  } satisfies TourRecord);
}
