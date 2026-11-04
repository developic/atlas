/**
 * Reminder contract + scheduler (CI, offline).
 *
 * What must happen: relative times resolve against the caller's clock (never
 * guessed), past times come back as model-readable reasons, repeats roll
 * forward without burst-firing, and a spoken topic never goes out while the
 * orb is busy — the notification and beep fire on time, the voice waits.
 */
import { describe, expect, test } from "bun:test";
import {
  announceModeFor,
  announceText,
  formatInZone,
  nextOccurrence,
  parseReminderSnapshot,
  renderReminderSnapshot,
  resolveFireAt,
  validateReminderInput,
} from "../src/lib/reminders";
import {
  collectDue,
  runReminderTick,
  settleAfterFire,
} from "../src/lib/reminder-scheduler";
import { runReminder } from "../src/lib/tools/reminder";

const NOW = Date.UTC(2026, 10, 2, 7, 0, 0); // Mon 2026-11-02 07:00 UTC

function pending(overrides = {}) {
  return {
    id: "r1",
    title: "Take the medicine",
    fireAt: NOW - 1_000,
    recurrence: "once",
    status: "pending",
    createdAt: NOW - 3_600_000,
    updatedAt: NOW - 3_600_000,
    ...overrides,
  };
}

describe("resolveFireAt — times resolve, past times explain", () => {
  test("ISO future resolves", () => {
    const result = resolveFireAt("2026-11-02T09:00:00Z", NOW, "UTC");
    expect(result.ok).toBe(true);
    expect(result.fireAt).toBe(Date.UTC(2026, 10, 2, 9, 0, 0));
  });

  test("ISO past is refused with a reason, not a guess", () => {
    const result = resolveFireAt("2026-11-02T06:00:00Z", NOW, "UTC");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("past");
  });

  test("'in 2 hours' resolves against the caller's clock", () => {
    const result = resolveFireAt("in 2 hours", NOW, "UTC");
    expect(result.ok).toBe(true);
    expect(result.fireAt).toBe(NOW + 2 * 3_600_000);
  });

  test("'tomorrow at 9am' resolves in the zone", () => {
    const result = resolveFireAt("tomorrow at 9am", NOW, "UTC");
    expect(result.ok).toBe(true);
    expect(result.fireAt).toBe(Date.UTC(2026, 10, 3, 9, 0, 0));
  });

  test("'at 6' said before 6am means today; said after means tomorrow", () => {
    const early = resolveFireAt("at 6", Date.UTC(2026, 10, 2, 5, 0, 0), "UTC");
    expect(early.ok).toBe(true);
    expect(early.fireAt).toBe(Date.UTC(2026, 10, 2, 6, 0, 0));

    const late = resolveFireAt("at 6", Date.UTC(2026, 10, 2, 8, 0, 0), "UTC");
    expect(late.ok).toBe(true);
    expect(late.fireAt).toBe(Date.UTC(2026, 10, 3, 6, 0, 0));
  });

  test("'next monday' skips the coming monday", () => {
    const result = resolveFireAt("next monday at 8am", NOW, "UTC");
    expect(result.ok).toBe(true);
    // 2026-11-02 is itself a monday; "next monday" is a week out.
    expect(result.fireAt).toBe(Date.UTC(2026, 10, 9, 8, 0, 0));
  });

  test("garbage is refused with a reason", () => {
    const result = resolveFireAt("sometime-ish", NOW, "UTC");
    expect(result.ok).toBe(false);
    expect(result.reason.length).toBeGreaterThan(0);
  });

  test("lenient Date.parse shapes never count as ISO ('at 6' is not 2001)", () => {
    // V8 parses "at 6" as a 2001 fallback date; the anchored ISO pattern
    // must keep it on the relative grammar instead.
    const result = resolveFireAt("at 6", Date.UTC(2026, 10, 2, 5, 0, 0), "UTC");
    expect(result.ok).toBe(true);
    expect(result.fireAt).toBe(Date.UTC(2026, 10, 2, 6, 0, 0));
  });

  test("leading-clock phrases pass through ('01:09 pm today' in IST)", () => {
    // 13:08 IST asking for 1:09pm resolves one minute out, in-zone.
    const nowIst = Date.UTC(2026, 10, 2, 7, 38, 0);
    const result = resolveFireAt("01:09 pm today", nowIst, "Asia/Kolkata");
    expect(result.ok).toBe(true);
    expect(result.fireAt).toBe(Date.UTC(2026, 10, 2, 7, 39, 0));
  });

  test("a bare number is refused instead of guessed at", () => {
    const result = resolveFireAt("6", NOW, "UTC");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("am/pm");
  });

  test("'9 tonight' means this evening, not tomorrow", () => {
    const evening = Date.UTC(2026, 10, 2, 12, 0, 0);
    const result = resolveFireAt("9 tonight", evening, "UTC");
    expect(result.ok).toBe(true);
    expect(result.fireAt).toBe(Date.UTC(2026, 10, 2, 21, 0, 0));
  });

  test("non-UTC zones resolve in-zone (the 1:09 PM IST regression)", () => {
    // 13:08 IST asking for 9am tomorrow IST = 03:30 UTC, not 09:00 UTC.
    const morning = resolveFireAt(
      "tomorrow at 9am",
      Date.UTC(2026, 10, 2, 7, 38, 0),
      "Asia/Kolkata",
    );
    expect(morning.ok).toBe(true);
    expect(morning.fireAt).toBe(Date.UTC(2026, 10, 3, 3, 30, 0));

    // A negative-offset zone: 9pm EST Nov 1 = 02:00 UTC Nov 2.
    const evening = resolveFireAt(
      "at 9pm",
      Date.UTC(2026, 10, 1, 20, 0, 0),
      "America/New_York",
    );
    expect(evening.ok).toBe(true);
    expect(evening.fireAt).toBe(Date.UTC(2026, 10, 2, 2, 0, 0));
  });
});

describe("validateReminderInput — model-readable reasons", () => {
  test("create needs a title and a time", () => {
    expect(validateReminderInput({ action: "create", when: "in 1 hour" }).ok).toBe(false);
    expect(validateReminderInput({ action: "create", title: "Water the plants" }).ok).toBe(false);
    expect(
      validateReminderInput({ action: "create", title: "Water the plants", when: "in 1 hour" }).ok,
    ).toBe(true);
  });

  test("unknown recurrence and bad intervals are refused", () => {
    expect(
      validateReminderInput({ action: "create", title: "T", when: "in 1 hour", recurrence: "fortnightly" }).ok,
    ).toBe(false);
    expect(
      validateReminderInput({ action: "create", title: "T", when: "in 1 hour", intervalDays: 400 }).ok,
    ).toBe(false);
  });

  test("mutations need the id; update needs a change", () => {
    expect(validateReminderInput({ action: "delete" }).ok).toBe(false);
    expect(validateReminderInput({ action: "update", id: "r1" }).ok).toBe(false);
    expect(validateReminderInput({ action: "update", id: "r1", title: "New" }).ok).toBe(true);
  });

  test("find needs an id or a query", () => {
    expect(validateReminderInput({ action: "find" }).ok).toBe(false);
    expect(validateReminderInput({ action: "find", query: "medicine" }).ok).toBe(true);
  });
});

describe("nextOccurrence — repeats roll forward", () => {
  test("a one-shot is done", () => {
    expect(nextOccurrence({ fireAt: NOW, recurrence: "once" }, NOW)).toBe(null);
  });

  test("daily and weekly add exact days", () => {
    expect(nextOccurrence({ fireAt: NOW, recurrence: "daily" }, NOW)).toBe(NOW + 86_400_000);
    expect(nextOccurrence({ fireAt: NOW, recurrence: "weekly" }, NOW)).toBe(NOW + 7 * 86_400_000);
  });

  test("monthly clamps (Jan 31 → Feb 28)", () => {
    const jan31 = Date.UTC(2026, 0, 31, 9, 0, 0);
    expect(nextOccurrence({ fireAt: jan31, recurrence: "monthly" }, jan31)).toBe(
      Date.UTC(2026, 1, 28, 9, 0, 0),
    );
  });

  test("yearly clamps (Feb 29 → Feb 28)", () => {
    const feb29 = Date.UTC(2024, 1, 29, 9, 0, 0);
    expect(nextOccurrence({ fireAt: feb29, recurrence: "yearly" }, feb29)).toBe(
      Date.UTC(2025, 1, 28, 9, 0, 0),
    );
  });

  test("a custom interval wins over the preset", () => {
    expect(
      nextOccurrence({ fireAt: NOW, recurrence: "daily", intervalDays: 3 }, NOW),
    ).toBe(NOW + 3 * 86_400_000);
  });
});

describe("settleAfterFire — no burst-firing missed repeats", () => {
  test("a one-shot completes", () => {
    const settled = settleAfterFire(pending(), NOW);
    expect(settled.action).toBe("complete");
    expect(settled.reminder.status).toBe("completed");
  });

  test("a daily overdue by three days lands on the next future firing", () => {
    const daily = pending({ recurrence: "daily", fireAt: NOW - 3 * 86_400_000 });
    const settled = settleAfterFire(daily, NOW);
    expect(settled.action).toBe("reschedule");
    expect(settled.reminder.fireAt).toBe(NOW - 3 * 86_400_000 + 4 * 86_400_000);
  });
});

describe("snapshot — unknown data rejected, never coerced", () => {
  test("junk entries are dropped, the list is capped", () => {
    const items = parseReminderSnapshot([
      { id: "a", title: "Real", fireAt: NOW, recurrence: "once", status: "pending" },
      { id: "", title: "No id" },
      "a string",
      null,
      { id: "b", title: "Bad date", fireAt: "soon", recurrence: "once", status: "pending" },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("a");
  });

  test("empty renders nothing (no cost when unused)", () => {
    expect(renderReminderSnapshot([])).toBe("");
  });

  test("pending lines carry ids the model must reuse", () => {
    const text = renderReminderSnapshot([
      { id: "a", title: "Real", fireAt: NOW, recurrence: "daily", status: "pending" },
      { id: "b", title: "Done", fireAt: NOW, recurrence: "once", status: "completed" },
    ]);
    expect(text).toContain("## Reminders");
    expect(text).toContain("a | Real");
    expect(text).not.toContain("Done");
  });
});

describe("announce channel — stored override, beep by default", () => {
  test("beep is the default; a stored override wins", () => {
    expect(announceModeFor()).toBe("beep");
    expect(announceModeFor("voice")).toBe("voice");
    expect(announceModeFor("beep")).toBe("beep");
  });

  test("the topic line is the title, nothing else", () => {
    expect(announceText({ title: "Take the medicine" })).toBe("Reminder: Take the medicine");
  });

  test("the zone echo states the true wall time", () => {
    const text = formatInZone(Date.UTC(2026, 10, 2, 7, 39, 0), "Asia/Kolkata");
    expect(text).toContain("1:09");
    expect(text).toContain("Asia/Kolkata");
    expect(formatInZone(Date.UTC(2026, 10, 2, 7, 39, 0))).toContain("UTC");
  });
});

describe("runReminderTick — notify now, speak only when idle", () => {
  function fakes(overrides = {}) {
    const calls = { notified: [], beeps: 0, spoken: [], saved: [] };
    return {
      calls,
      deps: {
        isIdle: () => true,
        listAll: async () => [pending()],
        save: async (reminder) => {
          calls.saved.push(reminder);
          return true;
        },
        getMode: async () => "beep",
        notify: (title, body) => calls.notified.push([title, body]),
        beep: () => {
          calls.beeps += 1;
        },
        speakOut: (text) => calls.spoken.push(text),
        now: () => NOW,
        ...overrides,
      },
    };
  }

  test("a due reminder notifies, beeps, and completes", async () => {
    const { calls, deps } = fakes();
    const { spoken } = await runReminderTick(deps, []);
    expect(calls.notified).toHaveLength(1);
    expect(calls.beeps).toBe(1);
    expect(spoken).toHaveLength(0);
    expect(calls.saved[0].status).toBe("completed");
  });

  test("voice waits while busy, then speaks the queued topic", async () => {
    const { calls, deps } = fakes({
      isIdle: () => false,
      getMode: async () => "voice",
    });
    const queue = [];
    const first = await runReminderTick(deps, queue);
    expect(first.spoken).toHaveLength(0);
    expect(queue).toHaveLength(1);
    expect(calls.notified).toHaveLength(1);

    const idleDeps = { ...deps, isIdle: () => true, listAll: async () => [] };
    const second = await runReminderTick(idleDeps, queue);
    expect(second.spoken).toEqual(["Reminder: Take the medicine"]);
    expect(queue).toHaveLength(0);
  });

  test("the selected access mode wins over the stored override", async () => {
    const { deps } = fakes({
      mode: "blind",
      getMode: async () => "beep",
    });
    const { spoken } = await runReminderTick(deps, []);

    expect(spoken).toEqual(["Reminder: Take the medicine"]);
  });

  test("a daily due reminder reschedules instead of completing", async () => {
    const { calls, deps } = fakes({
      listAll: async () => [pending({ recurrence: "daily" })],
    });
    await runReminderTick(deps, []);
    expect(calls.saved[0].status).toBe("pending");
    expect(calls.saved[0].fireAt).toBeGreaterThan(NOW);
  });
});

describe("runReminder — the model-facing tool", () => {
  const snapshot = [
    { id: "a1", title: "Take the medicine", fireAt: NOW + 3_600_000, recurrence: "once", status: "pending" },
  ];

  test("create resolves the time and returns the client directive", () => {
    const outcome = runReminder(
      { action: "create", title: "Water the plants", when: "in 2 hours" },
      { now: NOW, timeZone: "UTC", snapshot },
    );
    expect(outcome.ok).toBe(true);
    const directive = outcome.result.reminder;
    expect(directive.action).toBe("create");
    expect(directive.reminder.fireAt).toBe(NOW + 2 * 3_600_000);
    expect(outcome.result.content).toContain("Water the plants");
  });

  test("an exact duplicate is refused with a pointer to update", () => {
    const outcome = runReminder(
      { action: "create", title: "Take the medicine", when: new Date(NOW + 3_600_000).toISOString() },
      { now: NOW, timeZone: "UTC", snapshot },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("already");
  });

  test("mutations against an unknown id fail readably", () => {
    const outcome = runReminder({ action: "complete", id: "nope" }, { now: NOW, snapshot });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("nope");
  });

  test("snooze postpones from the caller's clock", () => {
    const outcome = runReminder({ action: "snooze", id: "a1", snoozeMinutes: "30" }, { now: NOW, snapshot });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.reminder.patch.fireAt).toBe(NOW + 30 * 60_000);
  });

  test("list answers from the snapshot, not from invention", () => {
    const outcome = runReminder({ action: "list" }, { now: NOW, snapshot });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.content).toContain("Take the medicine");
    expect(outcome.result.content).toContain("a1");
  });
});
