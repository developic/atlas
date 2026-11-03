/**
 * Clearly-labeled demo mood data for hackathon judging and onboarding.
 *
 * Pure data only: no `window`, no IndexedDB, so tests and the dashboard can
 * both import it. Every entry is an ordinary `MoodEntry` with a `sample-`
 * id and a `[Sample]` note prefix, so the label survives validation, the
 * model snapshot, spoken summaries, and the doctor report — nothing here can
 * pass as a real user log. The arc (rough start, dip, recovery) is fixed;
 * only the dates anchor to `now`, keeping every entry inside the 14-day
 * analysis window whenever it is loaded.
 */

import type { MoodEntry, MoodScore } from "./moods";

/** Sample ids sort apart from real `crypto.randomUUID()` ids. */
export const SAMPLE_MOOD_ID_PREFIX = "sample-mood-";
/** Spoken and rendered with every note, so the label cannot wash out. */
export const SAMPLE_MOOD_NOTE_PREFIX = "[Sample] ";
export const SAMPLE_MOOD_COUNT = 14;
/** One entry per day over the default analysis window. */
export const SAMPLE_MOOD_DAYS = 14;

const DAY_MS = 86_400_000;

type SampleSeed = {
  daysAgo: number;
  score: MoodScore;
  note: string;
};

const SAMPLE_MOOD_SEED: readonly SampleSeed[] = [
  { daysAgo: 13, score: 2, note: "rough morning, noisy commute" },
  { daysAgo: 12, score: 2, note: "could not focus, too much noise" },
  { daysAgo: 11, score: 3, note: "quiet evening helped" },
  { daysAgo: 10, score: 2, note: "bad sleep again" },
  { daysAgo: 9, score: 3, note: "short walk, felt a bit lighter" },
  { daysAgo: 8, score: 2, note: "crowded store, came home early" },
  { daysAgo: 7, score: 3, note: "calm day at home" },
  { daysAgo: 6, score: 3, note: "kept my usual routine" },
  { daysAgo: 5, score: 4, note: "finished a task, felt proud" },
  { daysAgo: 4, score: 4, note: "nice chat with a friend" },
  { daysAgo: 3, score: 4, note: "steady day overall" },
  { daysAgo: 2, score: 5, note: "great morning outside" },
  { daysAgo: 1, score: 4, note: "tired but okay" },
  { daysAgo: 0, score: 4, note: "feeling steady" },
];

/**
 * Fourteen labeled entries, oldest first, each inside the analysis window
 * ending at `now`. Deterministic for a fixed `now`: same input, same log.
 */
export function buildSampleMoods(now: number): MoodEntry[] {
  return SAMPLE_MOOD_SEED.map((seed, index) => ({
    id: `${SAMPLE_MOOD_ID_PREFIX}${String(index + 1).padStart(2, "0")}`,
    score: seed.score,
    note: `${SAMPLE_MOOD_NOTE_PREFIX}${seed.note}`,
    at: now - seed.daysAgo * DAY_MS,
  }));
}

export function isSampleMoodId(id: string): boolean {
  return id.startsWith(SAMPLE_MOOD_ID_PREFIX);
}

export function isSampleMoodEntry(entry: MoodEntry): boolean {
  return isSampleMoodId(entry.id);
}
