/**
 * Mood contract, shared by the server tool runner and the client store.
 *
 * Pure analysis only: no `window`, no IndexedDB, so the turn loop and the
 * dashboard can both import it. The model interprets what the user said; this
 * module scores it, stores it, and answers "how has it been lately" from data
 * the client supplies — never from a guess.
 *
 * The analyst here is deliberately deterministic. It is the "sub-agent" that
 * reads the log and hands the main model a summary: averages, direction, the
 * low and high points, and a doctor-ready report. No extra model call, no
 * fabricated interpretation.
 */

export const MOOD_SCORE_MIN = 1;
export const MOOD_SCORE_MAX = 5;
export const MOOD_NOTE_MAX = 280;
export const MOOD_ID_MAX = 128;
/** Most recent entries attached to one turn. Keeps the tail small. */
export const MOOD_SNAPSHOT_MAX = 60;
export const MOOD_WINDOW_DAYS_DEFAULT = 14;
export const MOOD_WINDOW_DAYS_MAX = 90;
/** A one-to-five average must move at least this far to count as a trend. */
export const MOOD_DIRECTION_DELTA = 0.5;
/** Each half of the window needs this many entries to compare. */
export const MOOD_COMPARE_MIN = 2;

const DAY_MS = 86_400_000;

export type MoodScore = 1 | 2 | 3 | 4 | 5;

/** One self-reported mood. `note` is the user's own words, short. */
export type MoodEntry = {
  id: string;
  score: MoodScore;
  note: string;
  /** Epoch ms when the entry was logged. */
  at: number;
};

export type MoodSnapshotItem = MoodEntry;

export type MoodDirective = {
  action: "log";
  entry: MoodEntry;
};

export type MoodDirection = "up" | "down" | "steady" | "unknown";

export type MoodAnalysis = {
  windowDays: number;
  count: number;
  average: number | null;
  direction: MoodDirection;
  /** Later-half average minus earlier-half average, when comparable. */
  change: number | null;
  earlierAverage: number | null;
  laterAverage: number | null;
  lowest: MoodEntry | null;
  highest: MoodEntry | null;
  daysLogged: number;
};

const SCORES: readonly number[] = [1, 2, 3, 4, 5];

export function isMoodScore(value: unknown): value is MoodScore {
  return typeof value === "number" && SCORES.includes(value);
}

function isNote(value: unknown): value is string {
  return typeof value === "string" && value.length <= MOOD_NOTE_MAX;
}

export function isMoodEntry(value: unknown): value is MoodEntry {
  if (typeof value !== "object" || value === null) return false;

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    record.id.length > 0 &&
    record.id.length <= MOOD_ID_MAX &&
    isMoodScore(record.score) &&
    isNote(record.note) &&
    typeof record.at === "number" &&
    Number.isFinite(record.at)
  );
}

export function isMoodDirective(value: unknown): value is MoodDirective {
  if (typeof value !== "object" || value === null) return false;

  const record = value as Record<string, unknown>;

  return record.action === "log" && isMoodEntry(record.entry);
}

/**
 * The client's log, newest kept, oldest first. Unknown shapes are dropped
 * rather than coerced: a malformed entry never becomes a data point.
 */
export function parseMoodSnapshot(value: unknown): MoodSnapshotItem[] {
  if (!Array.isArray(value)) return [];

  const entries = value.filter(isMoodEntry).sort((a, b) => a.at - b.at);

  return entries.slice(-MOOD_SNAPSHOT_MAX);
}

export type MoodLogInput =
  | { ok: true; score: MoodScore; note: string }
  | { ok: false; reason: string };

/** Validate the model's `log` arguments before anything is stored. */
export function parseMoodLog(input: {
  score: unknown;
  note: unknown;
}): MoodLogInput {
  const raw = typeof input.score === "string" ? input.score.trim() : input.score;
  const score =
    typeof raw === "string" && /^[1-5]$/.test(raw) ? Number(raw) : raw;

  if (!isMoodScore(score)) {
    return {
      ok: false,
      reason: "score must be a whole number from 1 to 5 (1 very low, 5 very good)",
    };
  }

  if (input.note !== undefined && typeof input.note !== "string") {
    return { ok: false, reason: "note must be text" };
  }

  const note = typeof input.note === "string" ? input.note.trim() : "";

  return { ok: true, score, note: note.slice(0, MOOD_NOTE_MAX) };
}

export function clampWindowDays(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return MOOD_WINDOW_DAYS_DEFAULT;
  }

  return Math.min(MOOD_WINDOW_DAYS_MAX, Math.max(1, Math.round(value)));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function average(entries: MoodEntry[]): number | null {
  if (entries.length === 0) return null;

  return round1(entries.reduce((sum, entry) => sum + entry.score, 0) / entries.length);
}

/**
 * Read the log over a window and describe it. Entries newer than a few
 * minutes are tolerated (clock skew between client and server); older than
 * the window are ignored.
 */
export function analyzeMood(
  entries: MoodEntry[],
  now: number,
  days: number = MOOD_WINDOW_DAYS_DEFAULT,
): MoodAnalysis {
  const windowDays = clampWindowDays(days);
  const windowStart = now - windowDays * DAY_MS;
  const inside = entries
    .filter((entry) => entry.at >= windowStart && entry.at <= now + 5 * 60_000)
    .sort((a, b) => a.at - b.at);
  const midpoint = now - (windowDays * DAY_MS) / 2;
  const earlier = inside.filter((entry) => entry.at < midpoint);
  const later = inside.filter((entry) => entry.at >= midpoint);
  const earlierAverage = average(earlier);
  const laterAverage = average(later);
  let direction: MoodDirection = "unknown";
  let change: number | null = null;

  if (
    earlierAverage !== null &&
    laterAverage !== null &&
    earlier.length >= MOOD_COMPARE_MIN &&
    later.length >= MOOD_COMPARE_MIN
  ) {
    change = round1(laterAverage - earlierAverage);
    direction =
      change >= MOOD_DIRECTION_DELTA
        ? "up"
        : change <= -MOOD_DIRECTION_DELTA
          ? "down"
          : "steady";
  }

  const lowest = inside.reduce<MoodEntry | null>(
    (low, entry) => (!low || entry.score < low.score ? entry : low),
    null,
  );
  const highest = inside.reduce<MoodEntry | null>(
    (high, entry) => (!high || entry.score > high.score ? entry : high),
    null,
  );

  return {
    windowDays,
    count: inside.length,
    average: average(inside),
    direction,
    change,
    earlierAverage,
    laterAverage,
    lowest,
    highest,
    daysLogged: new Set(inside.map((entry) => new Date(entry.at).toISOString().slice(0, 10))).size,
  };
}

function formatDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

function formatMoment(at: number): string {
  return new Date(at).toISOString().slice(0, 16).replace("T", " ");
}

function scoreText(score: number): string {
  return `${score}/5`;
}

/** One line the model can quote: count, average, direction, extremes. */
export function renderMoodSummary(analysis: MoodAnalysis): string {
  const window = `Last ${analysis.windowDays} days`;

  if (analysis.count === 0) {
    return `${window}: no mood entries.`;
  }

  const parts = [
    `${window}: ${analysis.count} ${analysis.count === 1 ? "entry" : "entries"} on ${analysis.daysLogged} ${analysis.daysLogged === 1 ? "day" : "days"}`,
    `average ${scoreText(analysis.average ?? 0)}`,
  ];

  if (analysis.direction === "unknown") {
    parts.push("not enough entries on both halves of the window to call a trend");
  } else {
    parts.push(
      `trend ${analysis.direction} (${analysis.earlierAverage} → ${analysis.laterAverage})`,
    );
  }

  if (analysis.lowest) {
    parts.push(`lowest ${scoreText(analysis.lowest.score)} on ${formatDay(analysis.lowest.at)}`);
  }

  if (analysis.highest) {
    parts.push(`highest ${scoreText(analysis.highest.score)} on ${formatDay(analysis.highest.at)}`);
  }

  return `${parts.join("; ")}.`;
}

/**
 * The per-turn mood block. Rendered beside the user message, never inside the
 * cached system prompt, so entries stay fresh without breaking prompt caching.
 */
export function renderMoodSnapshot(
  entries: MoodEntry[],
  now: number,
  days: number = MOOD_WINDOW_DAYS_DEFAULT,
): string {
  if (entries.length === 0) return "";

  const analysis = analyzeMood(entries, now, days);
  const recent = [...entries].sort((a, b) => a.at - b.at).slice(-20);
  const lines = recent.map((entry) => {
    const note = entry.note ? ` — "${entry.note}"` : "";

    return `- ${formatMoment(entry.at)} UTC — ${scoreText(entry.score)}${note}`;
  });

  return `## Mood log
The user's own mood entries from this device, oldest first. 1 = very low, 5 = very good. This is self-reported, not a clinical measure.
${lines.join("\n")}
${renderMoodSummary(analysis)}`;
}

/**
 * A doctor-ready summary from the same data. The app can build the text, but
 * only the user can send it: the model must never claim to have forwarded it.
 */
export function renderMoodReport(
  entries: MoodEntry[],
  now: number,
  days: number = MOOD_WINDOW_DAYS_DEFAULT,
): string {
  const analysis = analyzeMood(entries, now, days);
  const windowStart = now - analysis.windowDays * DAY_MS;
  const inside = entries
    .filter((entry) => entry.at >= windowStart && entry.at <= now + 5 * 60_000)
    .sort((a, b) => a.at - b.at);
  const notes = inside.filter((entry) => entry.note).slice(-12);

  if (analysis.count === 0) {
    return `No mood entries in the last ${analysis.windowDays} days.`;
  }

  const lines = [
    `Mood summary — last ${analysis.windowDays} days`,
    `Entries: ${analysis.count} on ${analysis.daysLogged} days`,
    `Average: ${scoreText(analysis.average ?? 0)}`,
    analysis.direction === "unknown"
      ? "Trend: not enough entries on both halves of the window to call a trend"
      : `Trend: ${analysis.direction} (${analysis.earlierAverage} → ${analysis.laterAverage})`,
    analysis.lowest
      ? `Lowest: ${scoreText(analysis.lowest.score)} on ${formatDay(analysis.lowest.at)}${analysis.lowest.note ? ` — "${analysis.lowest.note}"` : ""}`
      : "",
    analysis.highest
      ? `Highest: ${scoreText(analysis.highest.score)} on ${formatDay(analysis.highest.at)}${analysis.highest.note ? ` — "${analysis.highest.note}"` : ""}`
      : "",
    notes.length > 0 ? "Notes:" : "",
    ...notes.map(
      (entry) => `- ${formatDay(entry.at)} — ${scoreText(entry.score)} — "${entry.note}"`,
    ),
  ];

  return lines.filter(Boolean).join("\n");
}
