import {
  MOOD_NOTE_MAX,
  MOOD_WINDOW_DAYS_DEFAULT,
  MOOD_WINDOW_DAYS_MAX,
  analyzeMood,
  parseMoodLog,
  parseMoodSnapshot,
  renderMoodReport,
  renderMoodSnapshot,
  renderMoodSummary,
  type MoodEntry,
} from "../moods";
import type { OrbTool, ToolContext, ToolOutcome } from "./types";

/**
 * Autism-mode mood tracker.
 *
 * The model reports what the user said; the runner stores it and answers
 * pattern questions from the client's snapshots. The analysis is the
 * deterministic "sub-agent": it reads the log and hands back a summary — no
 * extra model call, no invented interpretation.
 */
export const moodTool: OrbTool = {
  type: "function",
  function: {
    name: "mood",
    description:
      "The user's private mood log on this device. Use `log` whenever the user says how they feel — even briefly — with a 1-5 score and a short note in their words. Choose the score from their words when the feeling is clear ('awful' is 1 or 2, 'okay' is 3, 'great' is 4 or 5); if the feeling is genuinely unclear, ask for a number instead of guessing. Never log routine factual turns. Use `trend` before responding to a feeling or when the user asks how they have been: it returns count, average, direction, and the low/high points. Use `history` for specific past entries. Use `report` only when the user wants to share with a doctor or clinician: it returns a summary you put in a create card. You cannot send anything yourself — never say you forwarded or emailed it. Do not diagnose, explain causes, recommend treatment, or give medication advice.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "One of log, trend, history, report.",
          maxLength: 12,
        },
        score: {
          type: ["string", "null"],
          description:
            "For log: the user's mood from 1 (very low) to 5 (very good), as a single digit. Map their words to the scale when the feeling is clear; ask if it is not.",
          maxLength: 2,
        },
        note: {
          type: ["string", "null"],
          description:
            "For log: a short note in the user's own words, e.g. what happened or what it felt like.",
          maxLength: MOOD_NOTE_MAX,
        },
        days: {
          type: ["string", "null"],
          description:
            "For trend, history, or report: how many days back to look (1-90, default 14).",
          maxLength: 3,
        },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
};

export const MOOD_ARG_LIMITS = {
  action: 12,
  score: 2,
  note: MOOD_NOTE_MAX,
  days: 3,
};

const RECENT_LIMIT = 20;

/**
 * Run one mood operation. Never throws: failures return model-readable text,
 * and a successful log returns the directive the client writes to its store.
 */
export function runMood(
  args: Record<string, string>,
  context: ToolContext = {},
): ToolOutcome {
  const now =
    typeof context.now === "number" && Number.isFinite(context.now)
      ? context.now
      : Date.now();
  const entries = parseMoodSnapshot(context.moods);
  const action = (args.action ?? "").trim().toLowerCase();

  if (!action) {
    return { ok: false, error: "Failed: action must be log, trend, history, or report." };
  }

  if (action === "log") {
    const parsed = parseMoodLog({ score: args.score, note: args.note });

    if (!parsed.ok) {
      return { ok: false, error: `Failed: ${parsed.reason}.` };
    }

    const entry: MoodEntry = {
      id: crypto.randomUUID(),
      score: parsed.score,
      note: parsed.note,
      at: now,
    };
    const summary = renderMoodSummary(
      analyzeMood([...entries, entry], now, MOOD_WINDOW_DAYS_DEFAULT),
    );

    return {
      ok: true,
      result: {
        content: `Logged ${parsed.score}/5${parsed.note ? ` — "${parsed.note}"` : ""}. ${summary} The client saved it. Acknowledge briefly and warmly; do not repeat the score as a diagnosis.`,
        sources: [],
        mood: { action: "log", entry },
      },
    };
  }

  const days = parseDays(args.days);

  if (!days.ok) return { ok: false, error: days.reason };

  if (action === "trend") {
    const analysis = analyzeMood(entries, now, days.value);

    if (analysis.count === 0) {
      return {
        ok: true,
        result: {
          content: `No mood entries in the last ${analysis.windowDays} days. Say the log is empty for that window and offer to start one — never guess a mood.`,
          sources: [],
        },
      };
    }

    return {
      ok: true,
      result: {
        content: `${renderMoodSummary(analysis)} Speak the trend plainly and gently; if it is down, name that without diagnosing a cause. The MOOD LOG block lists the recent entries.`,
        sources: [],
      },
    };
  }

  if (action === "history") {
    const windowStart = now - days.value * 86_400_000;
    const recent = entries
      .filter((entry) => entry.at >= windowStart && entry.at <= now + 5 * 60_000)
      .sort((a, b) => a.at - b.at)
      .slice(-RECENT_LIMIT);

    if (recent.length === 0) {
      return {
        ok: true,
        result: {
          content: `No mood entries in the last ${days.value} days.`,
          sources: [],
        },
      };
    }

    const lines = recent.map(
      (entry) =>
        `- ${new Date(entry.at).toISOString().slice(0, 16).replace("T", " ")} UTC — ${entry.score}/5${entry.note ? ` — "${entry.note}"` : ""}`,
    );

    return {
      ok: true,
      result: {
        content: `${renderMoodSnapshot(recent, now, days.value)}\n\n${lines.length} of ${entries.length} stored entries shown; never invent one outside this list.`,
        sources: [],
      },
    };
  }

  if (action === "report") {
    const report = renderMoodReport(entries, now, days.value);

    return {
      ok: true,
      result: {
        content: `${report}\n\nPut this summary into one create card titled "Mood summary for your doctor". You cannot send or forward it yourself — say the card is ready to show or share.`,
        sources: [],
      },
    };
  }

  return {
    ok: false,
    error: `Failed: ${action} is not a mood action. Use log, trend, history, or report.`,
  };
}

function parseDays(
  raw: string | undefined,
): { ok: true; value: number } | { ok: false; reason: string } {
  if (raw === undefined || raw.trim() === "") {
    return { ok: true, value: MOOD_WINDOW_DAYS_DEFAULT };
  }

  const value = Number(raw);

  if (!Number.isInteger(value) || value < 1 || value > MOOD_WINDOW_DAYS_MAX) {
    return {
      ok: false,
      reason: `Failed: days must be a whole number from 1 to ${MOOD_WINDOW_DAYS_MAX}.`,
    };
  }

  return { ok: true, value };
}
