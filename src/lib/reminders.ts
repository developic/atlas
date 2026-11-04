/**
 * Reminder contract, shared by the server tool runner and the client store.
 *
 * Pure date math and validation only: no `window`, no IndexedDB, no audio at
 * import time, so both the turn loop (`tools/reminder.ts`) and the dashboard
 * scheduler (`reminder-scheduler.ts`) import this safely. Responsibility split
 * follows the app rule — the model interprets ("tomorrow at 9"), this module
 * resolves it against an authoritative clock the caller supplies.
 */

export const REMINDER_TITLE_MAX = 140;
export const REMINDER_DETAIL_MAX = 500;
export const REMINDER_ID_MAX = 128;
/** Pending reminders the client attaches to a turn; the list stays tiny. */
export const REMINDER_SNAPSHOT_MAX = 20;
/** A reminder cannot be set more than five years out. */
export const REMINDER_AHEAD_MAX_MS = 5 * 365 * 24 * 60 * 60 * 1_000;
export const REMINDER_INTERVAL_DAYS_MAX = 365;
export const REMINDER_SNOOZE_DEFAULT_MINUTES = 10;
export const REMINDER_SNOOZE_MAX_MINUTES = 7 * 24 * 60;
export const REMINDER_ANNOUNCE_TEXT_MAX = 200;

export type ReminderAction =
  | "create"
  | "list"
  | "find"
  | "update"
  | "delete"
  | "complete"
  | "snooze";

export type ReminderRecurrence =
  | "once"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly";

export type ReminderStatus = "pending" | "completed";

export type Reminder = {
  id: string;
  title: string;
  detail?: string;
  /** UTC epoch ms when the reminder fires next. */
  fireAt: number;
  recurrence: ReminderRecurrence;
  /** Custom repeat in days; wins over `recurrence` when set. */
  intervalDays?: number;
  status: ReminderStatus;
  createdAt: number;
  updatedAt: number;
};

/** The compact pending list the client attaches to a turn request. */
export type ReminderSnapshotItem = {
  id: string;
  title: string;
  fireAt: number;
  recurrence: ReminderRecurrence;
  status: ReminderStatus;
};

/**
 * A mutation the server authorized this turn. `create` carries the full new
 * record (the server resolved everything); every other action carries the id
 * plus a patch the client merges onto its stored record — the snapshot never
 * holds full records, so the client is the only side that has them. The
 * directive is data, never prose, so there is nothing to interpret on the
 * way through.
 */
export type ReminderDirective = {
  action: "create" | "update" | "delete" | "complete" | "snooze";
  id: string;
  reminder?: Reminder;
  patch?: {
    title?: string;
    detail?: string;
    fireAt?: number;
    recurrence?: ReminderRecurrence;
    intervalDays?: number;
    status?: ReminderStatus;
  };
};

export type AnnounceMode = "beep" | "voice";

const RECURRENCES: readonly ReminderRecurrence[] = [
  "once",
  "daily",
  "weekly",
  "monthly",
  "yearly",
];

const STATUSES: readonly ReminderStatus[] = ["pending", "completed"];

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function isRecurrence(value: unknown): value is ReminderRecurrence {
  return (
    typeof value === "string" &&
    (RECURRENCES as readonly string[]).includes(value)
  );
}

function cleanTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.trim().slice(0, REMINDER_TITLE_MAX);
  return title ? title : null;
}

function cleanId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim().slice(0, REMINDER_ID_MAX);
  return id ? id : null;
}

// ---------------------------------------------------------------------------
// Time-zone wall clock (Intl only, no date library)
// ---------------------------------------------------------------------------

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
};

function zonedParts(timeZone: string, atMs: number): ZonedParts | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
      weekday: "short",
    }).formatToParts(new Date(atMs));

    const get = (type: string): number => {
      const part = parts.find((entry) => entry.type === type);
      const value = part ? Number(part.value) : NaN;
      return Number.isFinite(value) ? value : NaN;
    };

    const years = get("year");
    const month = get("month");
    const day = get("day");
    let hour = get("hour");
    const minute = get("minute");
    const weekdayName = parts.find((entry) => entry.type === "weekday")?.value ?? "";
    const weekday = WEEKDAYS.findIndex((name) =>
      name.startsWith(weekdayName.toLowerCase()),
    );

    if (
      ![years, month, day, hour, minute].every(Number.isFinite) ||
      weekday < 0
    ) {
      return null;
    }

    // Intl reports midnight as 24:00 under hour12:false.
    if (hour === 24) hour = 0;

    return { year: years, month, day, hour, minute, weekday };
  } catch {
    return null;
  }
}

/** Resolve a wall-clock reading in `timeZone` back to UTC epoch ms. */
function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number | null {
  const guess = Date.UTC(year, month - 1, day, hour, minute);

  const offsetOf = (probe: number): number | null => {
    const parts = zonedParts(timeZone, probe);
    if (!parts) return null;
    return (
      Date.UTC(year, month - 1, day, hour, minute) -
      Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
    );
  };

  const first = offsetOf(guess);
  if (first === null) return null;

  // Refine at the corrected instant, then apply both corrections: the first
  // moves the guess into the zone's ballpark, the second settles DST edges.
  // (Dropping `first` here resolves every non-UTC zone to UTC — caught live
  // when a 1:09 PM IST reminder stored as 13:09 UTC.)
  const second = offsetOf(guess + first);
  if (second === null) return null;

  return guess + first + second;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// ---------------------------------------------------------------------------
// Relative time resolution ("in 2 hours", "tomorrow at 9").
// A narrow deterministic grammar, not natural-language understanding: the
// model already interpreted the user's words into one of these shapes.
// ---------------------------------------------------------------------------

export type FireAtResult =
  | { ok: true; fireAt: number }
  | { ok: false; reason: string };

const IN_PATTERN = /^in\s+(\d+)\s+(minute|minutes|hour|hours|day|days|week|weeks)\s*$/i;
/**
 * A clock time: "at 6", "01:09 pm today", "18:30 tomorrow", "9 tonight".
 * The head pattern takes the digits; the tail words are parsed as plain
 * vocabulary below (am/pm, today/tonight/tomorrow) instead of one dense
 * regex — a name for every step, nothing to decode.
 */
const CLOCK_HEAD_PATTERN = /^(?:(at)\s+)?(\d{1,2})(?::(\d{2}))?\s*([a-z\s]*)$/i;
const CLOCK_MERIDIEMS = ["am", "pm"];
const CLOCK_DAYS = ["today", "tonight", "tomorrow"];

type ClockTail = { meridiem?: string; day?: string } | null;

/** Split the tail into known words; null when a word is not clock vocabulary. */
function parseClockTail(tail: string): ClockTail {
  const words = tail.trim().toLowerCase().split(/\s+/).filter(Boolean);

  if (words.length > 2) return null;

  let meridiem: string | undefined;
  let day: string | undefined;

  for (const word of words) {
    if (CLOCK_MERIDIEMS.includes(word)) {
      if (meridiem) return null;
      meridiem = word;
    } else if (CLOCK_DAYS.includes(word)) {
      if (day) return null;
      day = word;
    } else {
      return null;
    }
  }

  return { meridiem, day };
}
/**
 * Strict ISO 8601 shape, checked before `Date.parse`: the built-in parser is
 * lenient (it reads "at 6" as a 2001 fallback date), so an anchored pattern
 * decides what counts as ISO — never the parser's mood.
 */
const ISO_PATTERN =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const DAY_PATTERN =
  /^(today|tonight|tomorrow|next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)|(sunday|monday|tuesday|wednesday|thursday|friday|saturday))(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?\s*$/i;

function unitToMs(unit: string): number {
  switch (unit.toLowerCase()) {
    case "minute":
    case "minutes":
      return 60_000;
    case "hour":
    case "hours":
      return 3_600_000;
    case "day":
    case "days":
      return 86_400_000;
    default:
      return 7 * 86_400_000;
  }
}

function clockToMinutes(hour: string, minute: string | undefined, meridiem: string | undefined): number | null {
  let hours = Number(hour);
  const minutes = minute === undefined ? 0 : Number(minute);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
    if (meridiem === undefined && hours >= 0 && hours <= 23) {
      return hours * 60 + minutes;
    }
    return null;
  }

  const lower = meridiem?.toLowerCase();
  if (lower === "pm" && hours < 12) hours += 12;
  if (lower === "am" && hours === 12) hours = 0;
  if (lower === undefined && hours === 12) hours = 12;

  return hours * 60 + minutes;
}

/**
 * Resolve the model's time expression against the caller's clock.
 * Accepts ISO 8601 or the narrow relative grammar; anything else (and any
 * past time) comes back as a model-readable reason, never a guess.
 */
export function resolveFireAt(
  when: string,
  nowMs: number,
  timeZone?: string,
): FireAtResult {
  const raw = when.trim();
  if (!raw) return { ok: false, reason: "a time is required (ISO 8601 or like 'in 2 hours', 'tomorrow at 9am')" };

  const zone = timeZone && timeZone.trim() ? timeZone.trim() : "UTC";

  if (ISO_PATTERN.test(raw)) {
    const iso = Date.parse(raw);
    if (!Number.isFinite(iso)) {
      return { ok: false, reason: `'${raw}' looks like a date but is not on the calendar` };
    }
    return checkAhead(iso, nowMs);
  }

  const inMatch = IN_PATTERN.exec(raw);
  if (inMatch) {
    const amount = Number(inMatch[1]);
    if (!Number.isInteger(amount) || amount <= 0) {
      return { ok: false, reason: `'${raw}' needs a positive amount` };
    }
    return checkAhead(nowMs + amount * unitToMs(inMatch[2]), nowMs);
  }

  const clockMatch = CLOCK_HEAD_PATTERN.exec(raw);
  if (clockMatch) {
    const tail = parseClockTail(clockMatch[4] ?? "");
    if (!tail) {
      return {
        ok: false,
        reason: `'${raw}' is not a time I can set — use ISO 8601 or shapes like 'in 30 minutes', 'at 18:30', 'tomorrow at 9am', 'next monday at 8am'`,
      };
    }
    const hasAt = clockMatch[1] !== undefined;
    const clock = clockToMinutes(clockMatch[2], clockMatch[3], tail.meridiem);
    if (clock === null) {
      return { ok: false, reason: `'${raw}' is not a readable clock time` };
    }
    if (!hasAt && !tail.meridiem && !tail.day) {
      return {
        ok: false,
        reason: `'${raw}' needs am/pm (or 'at', 'today', 'tomorrow') so the hour is unambiguous`,
      };
    }
    if (tail.day === "tonight" || tail.day === "today") {
      // "9 tonight" is evening: a bare hour under 12 means PM, and a bare 12
      // means midnight. An explicit am/pm always wins over the day word.
      const evening =
        tail.day === "tonight" && !tail.meridiem && clock <= 12 * 60
          ? clock + 12 * 60
          : clock;
      return wallClockOnDay(zone, nowMs, 0, evening);
    }
    if (tail.day === "tomorrow") {
      return wallClockOnDay(zone, nowMs, 1, clock, false);
    }
    // No day word: today when still ahead, else tomorrow.
    return wallClockOnDay(zone, nowMs, 0, clock);
  }

  const dayMatch = DAY_PATTERN.exec(raw);
  if (dayMatch) {
    const word = dayMatch[1].toLowerCase();
    const clock =
      dayMatch[4] !== undefined
        ? clockToMinutes(dayMatch[4], dayMatch[5], dayMatch[6])
        : null;
    if (dayMatch[4] !== undefined && clock === null) {
      return { ok: false, reason: `'${raw}' is not a readable clock time` };
    }
    // "tonight" without a time means this evening, not morning.
    const fallback = word === "tonight" ? 20 * 60 : 9 * 60;
    return weekdayFireAt(zone, nowMs, word, clock ?? fallback, dayMatch[6] === undefined);
  }

  return {
    ok: false,
    reason: `'${raw}' is not a time I can set — use ISO 8601 or shapes like 'in 30 minutes', 'at 18:30', 'tomorrow at 9am', 'next monday at 8am'`,
  };
}

function checkAhead(fireAt: number, nowMs: number): FireAtResult {
  if (!Number.isFinite(fireAt)) {
    return { ok: false, reason: "that time did not resolve to a real date" };
  }
  if (fireAt <= nowMs) {
    return { ok: false, reason: "that time is in the past — pick a future time" };
  }
  if (fireAt - nowMs > REMINDER_AHEAD_MAX_MS) {
    return { ok: false, reason: "that is more than five years out — pick something nearer" };
  }
  return { ok: true, fireAt: Math.round(fireAt) };
}

function wallClockOnDay(
  zone: string,
  nowMs: number,
  dayShift: number,
  clockMinutes: number,
  allowPastFallback = true,
): FireAtResult {
  const now = zonedParts(zone, nowMs);
  if (!now) return { ok: false, reason: "the time zone was not usable — send ISO 8601 instead" };

  const base = Date.UTC(now.year, now.month - 1, now.day) + dayShift * 86_400_000;
  const probe = new Date(base);
  const fireAt = zonedToUtc(
    probe.getUTCFullYear(),
    probe.getUTCMonth() + 1,
    probe.getUTCDate(),
    Math.floor(clockMinutes / 60),
    clockMinutes % 60,
    zone,
  );

  if (fireAt === null) return { ok: false, reason: "that time did not resolve — send ISO 8601 instead" };
  if (fireAt > nowMs) return checkAhead(fireAt, nowMs);

  // "at 9" said after 9am means tomorrow's 9, not today's past 9.
  if (dayShift === 0 && allowPastFallback) {
    return wallClockOnDay(zone, nowMs, 1, clockMinutes, false);
  }
  return { ok: false, reason: "that time is in the past — pick a future time" };
}

function weekdayFireAt(
  zone: string,
  nowMs: number,
  word: string,
  clockMinutes: number,
  /** True when the hour arrived without am/pm ("tonight at 9" → evening). */
  bareHour = false,
): FireAtResult {
  const now = zonedParts(zone, nowMs);
  if (!now) return { ok: false, reason: "the time zone was not usable — send ISO 8601 instead" };

  if (word === "tonight") {
    const evening =
      bareHour && clockMinutes <= 12 * 60 ? clockMinutes + 12 * 60 : clockMinutes;
    return wallClockOnDay(zone, nowMs, 0, evening);
  }
  if (word === "today") {
    return wallClockOnDay(zone, nowMs, 0, clockMinutes);
  }
  if (word === "tomorrow") {
    return wallClockOnDay(zone, nowMs, 1, clockMinutes, false);
  }

  const next = word.startsWith("next ");
  const name = next ? word.slice(5) : word;
  const target = WEEKDAYS.indexOf(name as (typeof WEEKDAYS)[number]);
  if (target < 0) return { ok: false, reason: `'${word}' is not a weekday I recognize` };

  // "monday" = the coming monday (today when it is still ahead); "next
  // monday" always means the one in the following week.
  let shift = (target - now.weekday + 7) % 7;
  if (next) shift = shift === 0 ? 7 : shift + 7;
  if (shift === 0) {
    return wallClockOnDay(zone, nowMs, 0, clockMinutes);
  }
  return wallClockOnDay(zone, nowMs, shift, clockMinutes, false);
}

// ---------------------------------------------------------------------------
// Recurrence: the next firing after `fromMs` (null when a one-shot is done)
// ---------------------------------------------------------------------------

export function nextOccurrence(reminder: Pick<Reminder, "fireAt" | "recurrence" | "intervalDays">, fromMs: number): number | null {
  if (reminder.intervalDays !== undefined) {
    return fromMs + reminder.intervalDays * 86_400_000;
  }

  switch (reminder.recurrence) {
    case "once":
      return null;
    case "daily":
      return fromMs + 86_400_000;
    case "weekly":
      return fromMs + 7 * 86_400_000;
    case "monthly": {
      const at = new Date(fromMs);
      const year = at.getUTCFullYear();
      const month = at.getUTCMonth();
      const target = month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
      const day = Math.min(at.getUTCDate(), daysInMonth(target.year, target.month + 1));
      return Date.UTC(
        target.year,
        target.month,
        day,
        at.getUTCHours(),
        at.getUTCMinutes(),
      );
    }
    case "yearly": {
      const at = new Date(fromMs);
      const day = Math.min(at.getUTCDate(), daysInMonth(at.getUTCFullYear() + 1, at.getUTCMonth() + 1));
      return Date.UTC(
        at.getUTCFullYear() + 1,
        at.getUTCMonth(),
        day,
        at.getUTCHours(),
        at.getUTCMinutes(),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Input validation (model-readable reasons, never throws)
// ---------------------------------------------------------------------------

export type ReminderInput = {
  action: ReminderAction;
  id?: string;
  title?: string;
  detail?: string;
  when?: string;
  recurrence?: string;
  intervalDays?: number;
  filter?: string;
  query?: string;
  snoozeMinutes?: number;
};

export type ValidReminderInput =
  | { ok: true; action: "list"; filter: "pending" | "completed" | "all" }
  | { ok: true; action: "find"; id: string | null; query: string | null }
  | {
      ok: true;
      action: "create" | "update" | "delete" | "complete" | "snooze";
      id: string | null;
      title: string | null;
      detail: string | null;
      when: string | null;
      recurrence: ReminderRecurrence | null;
      intervalDays: number | null;
      snoozeMinutes: number | null;
    }
  | { ok: false; reason: string };

const ACTIONS: readonly ReminderAction[] = [
  "create",
  "list",
  "find",
  "update",
  "delete",
  "complete",
  "snooze",
];

export function validateReminderInput(input: ReminderInput): ValidReminderInput {
  if (!ACTIONS.includes(input.action)) {
    return { ok: false, reason: `unknown reminder action '${input.action}' (create, list, find, update, delete, complete, snooze)` };
  }

  if (input.action === "list") {
    const filter = (input.filter ?? "pending").trim().toLowerCase();
    if (filter !== "pending" && filter !== "completed" && filter !== "all") {
      return { ok: false, reason: `list filter must be pending, completed, or all — not '${input.filter}'` };
    }
    return { ok: true, action: "list", filter };
  }

  if (input.action === "find") {
    const id = input.id !== undefined ? cleanId(input.id) : null;
    const query = typeof input.query === "string" && input.query.trim()
      ? input.query.trim().slice(0, REMINDER_TITLE_MAX)
      : null;
    if (!id && !query) {
      return { ok: false, reason: "find needs an id from the reminders list or a title to search for" };
    }
    return { ok: true, action: "find", id, query };
  }

  const id = input.id !== undefined ? cleanId(input.id) : null;
  const title = input.title !== undefined ? cleanTitle(input.title) : null;
  const detail =
    typeof input.detail === "string" && input.detail.trim()
      ? input.detail.trim().slice(0, REMINDER_DETAIL_MAX)
      : null;
  const when =
    typeof input.when === "string" && input.when.trim() ? input.when.trim() : null;

  let recurrence: ReminderRecurrence | null = null;
  if (input.recurrence !== undefined && String(input.recurrence).trim()) {
    const raw = String(input.recurrence).trim().toLowerCase();
    if (!isRecurrence(raw)) {
      return { ok: false, reason: `recurrence must be once, daily, weekly, monthly, or yearly — not '${input.recurrence}'` };
    }
    recurrence = raw;
  }

  let intervalDays: number | null = null;
  if (input.intervalDays !== undefined && input.intervalDays !== null) {
    const days = Number(input.intervalDays);
    if (!Number.isInteger(days) || days < 1 || days > REMINDER_INTERVAL_DAYS_MAX) {
      return { ok: false, reason: "intervalDays must be a whole number from 1 to 365" };
    }
    intervalDays = days;
  }

  let snoozeMinutes: number | null = null;
  if (input.snoozeMinutes !== undefined && input.snoozeMinutes !== null) {
    const minutes = Number(input.snoozeMinutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > REMINDER_SNOOZE_MAX_MINUTES) {
      return { ok: false, reason: `snoozeMinutes must be a whole number from 1 to ${REMINDER_SNOOZE_MAX_MINUTES}` };
    }
    snoozeMinutes = minutes;
  }

  if (input.action === "create" && !title) {
    return { ok: false, reason: "create needs a short title for the reminder" };
  }
  if (input.action === "create" && !when) {
    return { ok: false, reason: "create needs a time (ISO 8601 or like 'in 2 hours', 'tomorrow at 9am')" };
  }
  if (input.action !== "create" && !id) {
    return { ok: false, reason: `${input.action} needs the reminder id from the reminders list` };
  }
  if (input.action === "update" && !title && detail === null && !when && !recurrence && intervalDays === null) {
    return { ok: false, reason: "update needs something to change (title, detail, when, recurrence, or intervalDays)" };
  }

  return {
    ok: true,
    action: input.action,
    id,
    title,
    detail,
    when,
    recurrence,
    intervalDays,
    snoozeMinutes,
  };
}

// ---------------------------------------------------------------------------
// Snapshot: the pending list the client attaches to a turn (unknown data
// rejected, never coerced)
// ---------------------------------------------------------------------------

export function parseReminderSnapshot(value: unknown): ReminderSnapshotItem[] {
  if (!Array.isArray(value)) return [];

  const items: ReminderSnapshotItem[] = [];

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const id = cleanId(record.id);
    const title = cleanTitle(record.title);
    const fireAt = typeof record.fireAt === "number" ? record.fireAt : NaN;
    const status = record.status;

    if (!id || !title || !Number.isFinite(fireAt)) continue;
    if (!isRecurrence(record.recurrence)) continue;
    if (
      typeof status !== "string" ||
      !(STATUSES as readonly string[]).includes(status)
    ) {
      continue;
    }

    items.push({
      id,
      title,
      fireAt,
      recurrence: record.recurrence,
      status: status as ReminderStatus,
    });
    if (items.length >= REMINDER_SNAPSHOT_MAX) break;
  }

  return items;
}

/** The model-readable block injected into the turn when reminders exist. */
export function renderReminderSnapshot(items: ReminderSnapshotItem[]): string {
  const pending = items.filter((item) => item.status === "pending");
  if (pending.length === 0) return "";

  const lines = pending.map(
    (item) =>
      `- ${item.id} | ${item.title} | fires ${new Date(item.fireAt).toISOString()} | ${item.recurrence}`,
  );

  return `## Reminders (pending — use these ids, never invent one)\n${lines.join("\n")}`;
}

/**
 * The resolved firing rendered in the user's own zone ("1:09 PM
 * Asia/Kolkata"), so the confirmation states the true wall time instead of a
 * bare UTC stamp the model might echo back wrong. Falls back to ISO when the
 * zone is unusable — never throws.
 */
export function formatInZone(fireAt: number, timeZone?: string): string {
  const zone = timeZone && timeZone.trim() ? timeZone.trim() : "UTC";

  try {
    const local = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(fireAt));
    return `${local} (${zone})`;
  } catch {
    return new Date(fireAt).toISOString();
  }
}

// ---------------------------------------------------------------------------
// Announcement channel: the dashboard's access mode decides voice delivery
// (blind hears the topic; every other mode gets the beep). A stored override
// wins over that default.
// ---------------------------------------------------------------------------

export function announceModeFor(override?: AnnounceMode): AnnounceMode {
  return override === "voice" || override === "beep" ? override : "beep";
}

/** The topic line a blind user's announcement speaks — the title, nothing else. */
export function announceText(reminder: Pick<Reminder, "title" | "detail">): string {
  const topic = reminder.title.trim().slice(0, REMINDER_ANNOUNCE_TEXT_MAX);
  return `Reminder: ${topic}`;
}

export function isReminderDirective(value: unknown): value is ReminderDirective {
  if (typeof value !== "object" || value === null) return false;

  const record = value as Record<string, unknown>;

  if (
    record.action !== "create" &&
    record.action !== "update" &&
    record.action !== "delete" &&
    record.action !== "complete" &&
    record.action !== "snooze"
  ) {
    return false;
  }

  if (cleanId(record.id) === null) return false;

  if (record.action === "create") {
    const reminder = record.reminder as Record<string, unknown> | undefined;
    return (
      typeof reminder === "object" &&
      reminder !== null &&
      cleanId(reminder.id) !== null &&
      cleanTitle(reminder.title) !== null &&
      typeof reminder.fireAt === "number" &&
      Number.isFinite(reminder.fireAt) &&
      isRecurrence(reminder.recurrence) &&
      (reminder.status === "pending" || reminder.status === "completed")
    );
  }

  if (record.action === "delete") return true;

  const patch = record.patch as Record<string, unknown> | undefined;
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    return false;
  }

  if (patch.title !== undefined && cleanTitle(patch.title) === null) return false;
  if (
    patch.fireAt !== undefined &&
    (typeof patch.fireAt !== "number" || !Number.isFinite(patch.fireAt))
  ) {
    return false;
  }
  if (patch.recurrence !== undefined && !isRecurrence(patch.recurrence)) return false;
  const intervalDays = patch.intervalDays;
  if (
    intervalDays !== undefined &&
    (typeof intervalDays !== "number" ||
      !Number.isInteger(intervalDays) ||
      intervalDays < 1 ||
      intervalDays > REMINDER_INTERVAL_DAYS_MAX)
  ) {
    return false;
  }
  if (patch.status !== undefined && patch.status !== "pending" && patch.status !== "completed") {
    return false;
  }

  return true;
}
