/**
 * Client-side reminder scheduler: poll the store, fire what is due.
 *
 * Delivery is two channels, never barging into a live turn:
 * - a Web Notification plus a short beep fire immediately (glanceable, quiet);
 * - the spoken topic waits until the orb is idle — no announcement ever talks
 *   over the conversation or the reply audio still playing.
 *
 * Channel choice follows the selected access mode: blind users hear the topic
 * through the browser voice, everyone else gets the beep. A stored
 * `reminder-mode` override wins over both.
 *
 * Everything external arrives through `SchedulerDeps`, so the offline suite
 * drives the tick with in-memory fakes and no timers.
 */
import type { AccessMode } from "./access-modes";
import {
  announceModeFor,
  announceText,
  isReminderDirective,
  nextOccurrence,
  REMINDER_SNAPSHOT_MAX,
  type AnnounceMode,
  type Reminder,
  type ReminderDirective,
  type ReminderSnapshotItem,
} from "./reminders";
import {
  dbDeleteReminder,
  dbGetReminder,
  dbGetReminderMode,
  dbListReminders,
  dbPutReminder,
} from "./db/reminders";

export const REMINDER_POLL_MS = 15_000;
/** Safety cap when rolling a long-overdue repeat forward past now. */
const SETTLE_ADVANCE_CAP = 1_000;

export type SchedulerDeps = {
  /** True when no turn is running and no reply audio is playing. */
  isIdle: () => boolean;
  /**
   * The selected access mode. The application owns delivery: blind always
   * hears the topic, deaf and every other mode gets the beep. When absent,
   * the stored override decides; otherwise the beep is the default.
   */
  mode?: AccessMode | null;
  listAll?: () => Promise<Reminder[]>;
  save?: (reminder: Reminder) => Promise<boolean>;
  getMode?: () => Promise<AnnounceMode>;
  notify?: (title: string, body: string) => void;
  beep?: () => void;
  speakOut?: (text: string) => void;
  now?: () => number;
  pollMs?: number;
};

/** Due reminders, oldest firing first. Pure — the unit under test. */
export function collectDue(reminders: Reminder[], now: number): Reminder[] {
  return reminders
    .filter((item) => item.status === "pending" && item.fireAt <= now)
    .sort((a, b) => a.fireAt - b.fireAt);
}

export type SettledReminder =
  | { action: "complete"; reminder: Reminder }
  | { action: "reschedule"; reminder: Reminder };

/**
 * What firing does to the record: a one-shot completes, a repeat rolls its
 * next firing forward past now so a long-sleeping tab does not burst-fire
 * every missed occurrence. Pure.
 */
export function settleAfterFire(reminder: Reminder, now: number): SettledReminder {
  const base: Reminder = { ...reminder, updatedAt: now };
  const hasRepeat =
    base.intervalDays !== undefined || base.recurrence !== "once";

  if (!hasRepeat) {
    return { action: "complete", reminder: { ...base, status: "completed" } };
  }

  let next = nextOccurrence(base, base.fireAt);
  let guard = 0;
  while (next !== null && next <= now && guard < SETTLE_ADVANCE_CAP) {
    next = nextOccurrence({ ...base, fireAt: next }, next);
    guard += 1;
  }

  if (next === null || next <= now) {
    return { action: "complete", reminder: { ...base, status: "completed" } };
  }

  return { action: "reschedule", reminder: { ...base, fireAt: next } };
}

async function defaultGetMode(): Promise<AnnounceMode> {
  try {
    const override = await dbGetReminderMode();
    return announceModeFor(override ?? undefined);
  } catch {
    return "beep";
  }
}

function defaultNotify(title: string, body: string): void {
  try {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    ) {
      return;
    }
    new Notification(title, { body, tag: `atlas-reminder-${title}` });
  } catch {
    // A blocked notification degrades to the beep/voice channels.
  }
}

let sharedAudio: AudioContext | null = null;

function defaultBeep(): void {
  try {
    if (typeof window === "undefined") return;

    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    sharedAudio ??= new Ctor();
    if (sharedAudio.state === "suspended") void sharedAudio.resume();

    const at = sharedAudio.currentTime;
    const tone = sharedAudio.createOscillator();
    const gain = sharedAudio.createGain();
    tone.type = "sine";
    tone.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.12, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    tone.connect(gain).connect(sharedAudio.destination);
    tone.start(at);
    tone.stop(at + 0.25);
  } catch {
    // Silence when audio is unavailable; the notification already fired.
  }
}

function defaultSpeakOut(text: string): void {
  try {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  } catch {
    // The notification already fired; a failed voice is not retried here —
    // the next poll re-queues while still idle.
  }
}

/**
 * One scheduler pass. Exported so tests drive it without timers; `start`
 * wraps it in an interval. Voice lines spoken this pass are returned for the
 * debug panel, and failures degrade to flags, never throws.
 */
export async function runReminderTick(
  deps: SchedulerDeps,
  voiceQueue: Reminder[],
): Promise<{ spoken: string[] }> {
  const now = deps.now?.() ?? Date.now();
  const listAll = deps.listAll ?? dbListReminders;
  const save = deps.save ?? dbPutReminder;
  const getMode = deps.getMode ?? defaultGetMode;
  const notify = deps.notify ?? defaultNotify;
  const beep = deps.beep ?? defaultBeep;
  const speakOut = deps.speakOut ?? defaultSpeakOut;

  const spoken: string[] = [];

  let all: Reminder[];
  try {
    all = await listAll();
  } catch {
    return { spoken };
  }

  const mode = await getMode().catch(() => "beep" as AnnounceMode);
  const announce =
    deps.mode === undefined
      ? mode
      : deps.mode === "blind"
        ? "voice"
        : "beep";
  const idle = safeIdle(deps.isIdle);

  for (const due of collectDue(all, now)) {
    notify(due.title, due.detail ?? "It's time.");
    beep();

    if (announce === "voice") {
      if (idle) {
        const text = announceText(due);
        speakOut(text);
        spoken.push(text);
      } else {
        // Never talk over the conversation: hold the topic until the orb is
        // idle again. The notification and beep already went out, so nothing
        // is lost while it waits.
        voiceQueue.push(due);
      }
    }

    try {
      await save(settleAfterFire(due, now).reminder);
    } catch {
      // The next poll retries; the user was already notified.
    }
  }

  if (announce === "voice" && voiceQueue.length > 0 && safeIdle(deps.isIdle)) {
    for (const queued of voiceQueue.splice(0, voiceQueue.length)) {
      const text = announceText(queued);
      speakOut(text);
      spoken.push(text);
    }
  }

  return { spoken };
}

function safeIdle(isIdle: () => boolean): boolean {
  try {
    return isIdle();
  } catch {
    return false;
  }
}

/**
 * The pending list a turn carries so the model resolves ids from application
 * data. Empty (never failing) when the store is unavailable.
 */
export async function buildReminderSnapshot(): Promise<ReminderSnapshotItem[]> {
  try {
    const all = await dbListReminders();
    return all
      .filter((item) => item.status === "pending")
      .slice(0, REMINDER_SNAPSHOT_MAX)
      .map(({ id, title, fireAt, recurrence, status }) => ({
        id,
        title,
        fireAt,
        recurrence,
        status,
      }));
  } catch {
    return [];
  }
}

/** The client's IANA zone for wall-clock phrases; undefined when unknown. */
export function currentTimeZone(): string | undefined {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === "string" && zone ? zone : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Apply the turn's authorized mutations to the store. Each directive is
 * guarded and isolated: one malformed or failed directive never blocks its
 * siblings, and the user already heard the confirmation in words.
 */
export async function applyReminderDirectives(
  directives: ReminderDirective[],
): Promise<void> {
  for (const directive of directives) {
    if (!isReminderDirective(directive)) continue;

    try {
      if (directive.action === "create" && directive.reminder) {
        await dbPutReminder({ ...directive.reminder, updatedAt: Date.now() });
      } else if (directive.action === "delete") {
        await dbDeleteReminder(directive.id);
      } else {
        const current = await dbGetReminder(directive.id);
        if (!current) continue;
        await dbPutReminder({
          ...current,
          ...directive.patch,
          updatedAt: Date.now(),
        });
      }
    } catch {
      // The next turn re-reads the store; a failed write surfaces as a
      // missing reminder, never a crashed turn.
    }
  }
}

/**
 * Start polling. Asks once for notification permission (the browser may
 * require a gesture and simply refuse — that path stays silent), checks
 * immediately, then every `pollMs`. Returns the stop function for unmount.
 */
export function startReminderScheduler(deps: SchedulerDeps): () => void {
  const pollMs = deps.pollMs ?? REMINDER_POLL_MS;
  const voiceQueue: Reminder[] = [];

  try {
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      void Notification.requestPermission().catch(() => undefined);
    }
  } catch {
    // Permission stays at its default; notifications simply never fire.
  }

  void runReminderTick(deps, voiceQueue).catch(() => undefined);
  const timer = setInterval(() => {
    void runReminderTick(deps, voiceQueue).catch(() => undefined);
  }, pollMs);

  return () => clearInterval(timer);
}
