import {
  REMINDER_DETAIL_MAX,
  REMINDER_SNOOZE_DEFAULT_MINUTES,
  REMINDER_TITLE_MAX,
  formatInZone,
  nextOccurrence,
  resolveFireAt,
  validateReminderInput,
  type Reminder,
  type ReminderDirective,
  type ReminderRecurrence,
  type ReminderSnapshotItem,
} from "../reminders";
import type { OrbTool, ToolContext, ToolOutcome } from "./types";

/** Server-side context the turn loop threads through (clock, zone, snapshot). */
export type ReminderToolContext = ToolContext;

export const reminderTool: OrbTool = {
  type: "function",
  function: {
    name: "reminder",
    description:
      "Manage the user's reminders — create, list, find, update, delete, complete, or snooze. Call it when the user asks to be reminded of something, or to change, cancel, or review an existing reminder. A REMINDERS block in the turn lists pending reminders with their ids: always use an id from that block, never invent one. Pass the user's own time words through in `when` exactly as said ('tomorrow at 9am', 'in 2 hours') — never convert to ISO yourself; the server resolves them in the user's time zone and tells you the true wall time. Title each reminder by its topic; when the request names no topic, put the time in the title (never a bare 'Reminder'). After the result comes back, confirm briefly in words — the client saved the change and will announce it when it fires.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description:
            "One of create, list, find, update, delete, complete, snooze.",
          maxLength: 20,
        },
        id: {
          type: ["string", "null"],
          description: "The reminder id from the REMINDERS block (not the title).",
          maxLength: 128,
        },
        title: {
          type: ["string", "null"],
          description: "Short reminder title for create, or the new title for update.",
          maxLength: REMINDER_TITLE_MAX,
        },
        detail: {
          type: ["string", "null"],
          description: "Optional extra detail for create or update.",
          maxLength: REMINDER_DETAIL_MAX,
        },
        when: {
          type: ["string", "null"],
          description:
            "The user's time words, passed through exactly for create (required) or update — 'in 2 hours', 'tomorrow at 9am'. Never ISO, never converted.",
          maxLength: 200,
        },
        recurrence: {
          type: ["string", "null"],
          description: "Once, daily, weekly, monthly, or yearly (lowercase).",
          maxLength: 20,
        },
        intervalDays: {
          type: ["string", "null"],
          description: "Custom repeat every N days (1-365); wins over recurrence when set.",
          maxLength: 8,
        },
        filter: {
          type: ["string", "null"],
          description: "For list: pending, completed, or all.",
          maxLength: 20,
        },
        query: {
          type: ["string", "null"],
          description: "For find: a title to search when the id is unknown.",
          maxLength: REMINDER_TITLE_MAX,
        },
        snoozeMinutes: {
          type: ["string", "null"],
          description: "For snooze: minutes to postpone (default 10).",
          maxLength: 8,
        },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
};

export const REMINDER_ARG_LIMITS = {
  action: 20,
  id: 128,
  title: REMINDER_TITLE_MAX,
  detail: REMINDER_DETAIL_MAX,
  when: 200,
  recurrence: 20,
  intervalDays: 8,
  filter: 20,
  query: REMINDER_TITLE_MAX,
  snoozeMinutes: 8,
};

/**
 * Run one reminder operation. Never throws: failures come back as
 * model-readable text, and a mutation that passed validation also returns
 * the directive the client applies to its store.
 */
export function runReminder(
  args: Record<string, string>,
  context: ReminderToolContext = {},
): ToolOutcome {
  const now = typeof context.now === "number" && Number.isFinite(context.now)
    ? context.now
    : Date.now();
  const snapshot = Array.isArray(context.snapshot) ? context.snapshot : [];

  const parsed = validateReminderInput({
    action: (args.action ?? "") as never,
    id: args.id,
    title: args.title,
    detail: args.detail,
    when: args.when,
    recurrence: args.recurrence,
    intervalDays: args.intervalDays === undefined ? undefined : Number(args.intervalDays),
    filter: args.filter,
    query: args.query,
    snoozeMinutes: args.snoozeMinutes === undefined ? undefined : Number(args.snoozeMinutes),
  });

  if (!parsed.ok) {
    return { ok: false, error: parsed.reason };
  }

  switch (parsed.action) {
    case "list":
      return okOnly(listReminders(snapshot, parsed.filter));
    case "find":
      return findReminder(snapshot, parsed.id, parsed.query);
    case "create":
      return createReminder(snapshot, parsed, now, context.timeZone);
    case "update":
      return updateReminder(snapshot, parsed, now, context.timeZone);
    case "delete":
      return deleteReminder(snapshot, parsed.id as string);
    case "complete":
      return completeReminder(snapshot, parsed.id as string);
    case "snooze":
      return snoozeReminder(snapshot, parsed.id as string, parsed.snoozeMinutes, now);
  }
}

function okOnly(content: string): ToolOutcome {
  return { ok: true, result: { content, sources: [] } };
}

type MutationFields = {
  id: string | null;
  title: string | null;
  detail: string | null;
  when: string | null;
  recurrence: ReminderRecurrence | null;
  intervalDays: number | null;
  snoozeMinutes: number | null;
};

function withDirective(content: string, directive: ReminderDirective): ToolOutcome {
  return {
    ok: true,
    result: { content, sources: [], reminder: directive },
  };
}

function describe(item: ReminderSnapshotItem): string {
  return `"${item.title}" (id ${item.id}) fires ${new Date(item.fireAt).toISOString()}${item.recurrence === "once" ? "" : `, repeats ${item.recurrence}`}`;
}

function listReminders(
  snapshot: ReminderSnapshotItem[],
  filter: "pending" | "completed" | "all",
): string {
  const items = snapshot.filter(
    (item) => filter === "all" || item.status === filter,
  );

  if (items.length === 0) {
    return filter === "pending"
      ? "No pending reminders."
      : `No ${filter} reminders.`;
  }

  return items.map(describe).join("\n");
}

function findReminder(
  snapshot: ReminderSnapshotItem[],
  id: string | null,
  query: string | null,
): ToolOutcome {
  if (id) {
    const match = snapshot.find((item) => item.id === id);
    if (!match) {
      return { ok: false, error: `No reminder with id ${id} — use an id from the REMINDERS block.` };
    }
    return okOnly(describe(match));
  }

  const needle = (query ?? "").toLowerCase();
  const matches = snapshot.filter((item) =>
    item.title.toLowerCase().includes(needle),
  );

  if (matches.length === 0) {
    return { ok: false, error: `No reminder matches "${query}".` };
  }

  return okOnly(matches.map(describe).join("\n"));
}

function createReminder(
  snapshot: ReminderSnapshotItem[],
  parsed: MutationFields,
  now: number,
  timeZone?: string,
): ToolOutcome {
  const resolved = resolveFireAt(parsed.when as string, now, timeZone);
  if (!resolved.ok) return { ok: false, error: resolved.reason };

  const duplicate = snapshot.find(
    (item) =>
      item.status === "pending" &&
      item.title.toLowerCase() === (parsed.title as string).toLowerCase() &&
      Math.abs(item.fireAt - resolved.fireAt) < 5 * 60_000,
  );
  if (duplicate) {
    return {
      ok: false,
      error: `A pending reminder "${duplicate.title}" already fires at that time (id ${duplicate.id}) — update it instead of creating a duplicate.`,
    };
  }

  const id = crypto.randomUUID();
  const reminder: Reminder = {
    id,
    title: parsed.title as string,
    ...(parsed.detail ? { detail: parsed.detail } : {}),
    fireAt: resolved.fireAt,
    recurrence: parsed.recurrence ?? "once",
    ...(parsed.intervalDays !== null ? { intervalDays: parsed.intervalDays } : {}),
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };

  const repeat = reminder.intervalDays
    ? `, repeats every ${reminder.intervalDays} day${reminder.intervalDays === 1 ? "" : "s"}`
    : reminder.recurrence === "once"
      ? ""
      : `, repeats ${reminder.recurrence}`;

  return withDirective(
    `Reminder set: "${reminder.title}" fires ${new Date(reminder.fireAt).toISOString()} (${formatInZone(reminder.fireAt, timeZone)})${repeat}. The client saved it and will announce it when it fires.`,
    { action: "create", id, reminder },
  );
}

function updateReminder(
  snapshot: ReminderSnapshotItem[],
  parsed: MutationFields,
  now: number,
  timeZone?: string,
): ToolOutcome {
  const current = snapshot.find((item) => item.id === parsed.id);
  if (!current) {
    return { ok: false, error: `No reminder with id ${parsed.id} — use an id from the REMINDERS block.` };
  }

  let fireAt: number | undefined;
  if (parsed.when) {
    const resolved = resolveFireAt(parsed.when, now, timeZone);
    if (!resolved.ok) return { ok: false, error: resolved.reason };
    fireAt = resolved.fireAt;
  }

  const directive: ReminderDirective = {
    action: "update",
    id: parsed.id as string,
    patch: {
      ...(parsed.title ? { title: parsed.title } : {}),
      ...(parsed.detail !== null ? { detail: parsed.detail as string } : {}),
      ...(fireAt !== undefined ? { fireAt, status: "pending" as const } : {}),
      ...(parsed.recurrence ? { recurrence: parsed.recurrence } : {}),
      ...(parsed.intervalDays !== null ? { intervalDays: parsed.intervalDays } : {}),
    },
  };

  return withDirective(
    `Reminder "${parsed.title ?? current.title}" updated. The client saved the change.`,
    directive,
  );
}

function deleteReminder(snapshot: ReminderSnapshotItem[], id: string): ToolOutcome {
  const current = snapshot.find((item) => item.id === id);
  if (!current) {
    return { ok: false, error: `No reminder with id ${id} — use an id from the REMINDERS block.` };
  }

  return withDirective(
    `Reminder "${current.title}" deleted.`,
    { action: "delete", id },
  );
}

function completeReminder(snapshot: ReminderSnapshotItem[], id: string): ToolOutcome {
  const current = snapshot.find((item) => item.id === id);
  if (!current) {
    return { ok: false, error: `No reminder with id ${id} — use an id from the REMINDERS block.` };
  }

  return withDirective(
    `Reminder "${current.title}" marked completed.`,
    { action: "complete", id, patch: { status: "completed" } },
  );
}

function snoozeReminder(
  snapshot: ReminderSnapshotItem[],
  id: string,
  snoozeMinutes: number | null,
  now: number,
): ToolOutcome {
  const current = snapshot.find((item) => item.id === id);
  if (!current) {
    return { ok: false, error: `No reminder with id ${id} — use an id from the REMINDERS block.` };
  }
  if (current.status !== "pending") {
    return { ok: false, error: `"${current.title}" is already completed — snooze needs a pending reminder.` };
  }

  const minutes = snoozeMinutes ?? REMINDER_SNOOZE_DEFAULT_MINUTES;
  const fireAt = now + minutes * 60_000;

  return withDirective(
    `Reminder "${current.title}" snoozed for ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    { action: "snooze", id, patch: { fireAt } },
  );
}

// Re-exported for the recurrence preview in confirmation speech.
export { nextOccurrence };
