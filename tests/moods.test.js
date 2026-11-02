/**
 * Mood tracker contract (CI, offline).
 *
 * The guarantee is that a mood answer comes from the stored log, never from
 * the model's imagination: validation rejects unknown shapes, the analyst
 * reads a window deterministically, and a log write returns the exact entry
 * the client persists.
 */
import { describe, expect, test } from "bun:test";
import {
  analyzeMood,
  isMoodDirective,
  parseMoodLog,
  parseMoodSnapshot,
  renderMoodReport,
  renderMoodSummary,
} from "../src/lib/moods";
import { runMood } from "../src/lib/tools/mood";
import { ORB_TOOLS, validateToolArgs } from "../src/lib/tools/registry";

const NOW = Date.parse("2026-11-02T12:00:00Z");
const DAY = 86_400_000;

function entry(id, score, daysAgo, note = "") {
  return { id, score, note, at: NOW - daysAgo * DAY };
}

const DECLINING = [
  entry("a", 4, 12, "good week"),
  entry("b", 4, 10),
  entry("c", 3, 8),
  entry("d", 2, 3, "tired"),
  entry("e", 2, 2),
  entry("f", 1, 1, "overwhelmed"),
];

describe("mood log input — strict, readable failures", () => {
  test("scores 1 to 5 pass, with or without a note", () => {
    expect(parseMoodLog({ score: "1", note: "low" })).toEqual({
      ok: true,
      score: 1,
      note: "low",
    });
    expect(parseMoodLog({ score: 5, note: undefined })).toEqual({
      ok: true,
      score: 5,
      note: "",
    });
  });

  test("anything outside 1-5 is refused", () => {
    for (const score of ["0", "6", "two", "", null, 2.5]) {
      const parsed = parseMoodLog({ score, note: "" });
      expect(parsed.ok).toBe(false);
      expect(parsed.reason).toContain("1 to 5");
    }
  });

  test("the note is capped, not rejected", () => {
    const parsed = parseMoodLog({ score: "3", note: "x".repeat(400) });
    expect(parsed.ok).toBe(true);
    expect(parsed.note.length).toBe(280);
  });
});

describe("snapshot — unknown entries are dropped, not coerced", () => {
  test("valid entries survive, sorted oldest first", () => {
    const snapshot = parseMoodSnapshot([entry("b", 2, 1), entry("a", 4, 3)]);

    expect(snapshot.map((item) => item.id)).toEqual(["a", "b"]);
  });

  test("bad scores, ids, notes, and times are dropped", () => {
    const snapshot = parseMoodSnapshot([
      entry("ok", 3, 1),
      { ...entry("score", 3, 1), score: 9 },
      { ...entry("id", 3, 1), id: "" },
      { ...entry("note", 3, 1), note: 42 },
      { ...entry("at", 3, 1), at: "yesterday" },
      null,
    ]);

    expect(snapshot.map((item) => item.id)).toEqual(["ok"]);
  });
});

describe("analyst — deterministic trend from the log", () => {
  test("a declining window reports down with both averages", () => {
    const analysis = analyzeMood(DECLINING, NOW, 14);

    expect(analysis.count).toBe(6);
    expect(analysis.direction).toBe("down");
    expect(analysis.earlierAverage).toBeGreaterThan(analysis.laterAverage);
    expect(analysis.lowest.score).toBe(1);
    expect(analysis.highest.score).toBe(4);

    const summary = renderMoodSummary(analysis);
    expect(summary).toContain("trend down");
    expect(summary).toContain("lowest 1/5");
  });

  test("one half alone cannot claim a trend", () => {
    const analysis = analyzeMood([entry("a", 2, 1), entry("b", 2, 2)], NOW, 14);

    expect(analysis.direction).toBe("unknown");
    expect(renderMoodSummary(analysis)).toContain("not enough entries");
  });

  test("an empty window says so instead of inventing a mood", () => {
    const analysis = analyzeMood([], NOW, 14);

    expect(analysis.count).toBe(0);
    expect(analysis.average).toBe(null);
    expect(renderMoodSummary(analysis)).toContain("no mood entries");
  });

  test("the doctor report carries the entries, averages, and notes", () => {
    const report = renderMoodReport(DECLINING, NOW, 14);

    expect(report).toContain("Mood summary — last 14 days");
    expect(report).toContain("Entries: 6");
    expect(report).toContain("Trend: down");
    expect(report).toContain("overwhelmed");
  });
});

describe("mood tool — log, trend, report, refusal", () => {
  const context = { now: NOW, moods: DECLINING };

  test("a native numeric score is not dropped by argument validation", () => {
    const definition = ORB_TOOLS.find((tool) => tool.function.name === "mood");
    const validated = validateToolArgs(
      definition,
      { action: "log", score: 2, note: "really awful" },
      "mood",
    );

    expect(validated.missing).toEqual([]);
    expect(validated.args.score).toBe("2");
  });

  test("log returns the exact entry the client will store", () => {
    const outcome = runMood(
      { action: "log", score: "2", note: "too much noise" },
      context,
    );

    expect(outcome.ok).toBe(true);
    expect(outcome.result.mood).toBeDefined();
    expect(outcome.result.mood.entry.score).toBe(2);
    expect(outcome.result.mood.entry.note).toBe("too much noise");
    expect(outcome.result.mood.entry.at).toBe(NOW);
    expect(isMoodDirective(outcome.result.mood)).toBe(true);
    expect(outcome.result.content).toContain("Logged 2/5");
  });

  test("trend answers from the snapshot, not from the model", () => {
    const outcome = runMood({ action: "trend", days: "14" }, context);

    expect(outcome.ok).toBe(true);
    expect(outcome.result.content).toContain("trend down");
    expect(outcome.result.mood).toBeUndefined();
  });

  test("an empty log is stated plainly", () => {
    const outcome = runMood({ action: "trend" }, { now: NOW, moods: [] });

    expect(outcome.ok).toBe(true);
    expect(outcome.result.content).toContain("No mood entries");
  });

  test("report is a card-ready summary the model cannot send", () => {
    const outcome = runMood({ action: "report", days: "14" }, context);

    expect(outcome.ok).toBe(true);
    expect(outcome.result.content).toContain("Mood summary");
    expect(outcome.result.content).toContain("create card");
    expect(outcome.result.content).toContain("cannot send or forward");
  });

  test("a missing score or unknown action fails readably", () => {
    const missing = runMood({ action: "log" }, context);
    const unknown = runMood({ action: "diagnose" }, context);

    expect(missing.ok).toBe(false);
    expect(missing.error).toContain("score");
    expect(unknown.ok).toBe(false);
    expect(unknown.error).toContain("not a mood action");
  });

  test("days outside 1-90 are refused", () => {
    const outcome = runMood({ action: "trend", days: "365" }, context);

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("1 to 90");
  });
});
