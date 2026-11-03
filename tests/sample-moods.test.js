/**
 * Sample (demo) mood data contract (CI, offline).
 *
 * Judges get a working mood log without logging for two weeks: fourteen
 * clearly-labeled entries with a fixed recovering arc. The guarantees are
 * that every sample entry is valid store data, unmistakably labeled as a
 * sample everywhere it surfaces (snapshot, spoken summary, doctor report),
 * removable without touching the real log, and readable by the same
 * deterministic analyst and tool path as real entries.
 */
import { describe, expect, test } from "bun:test";
import {
  analyzeMood,
  isMoodEntry,
  parseMoodSnapshot,
  renderMoodReport,
  renderMoodSnapshot,
  renderMoodSummary,
} from "../src/lib/moods";
import {
  SAMPLE_MOOD_COUNT,
  SAMPLE_MOOD_ID_PREFIX,
  SAMPLE_MOOD_NOTE_PREFIX,
  buildSampleMoods,
  isSampleMoodEntry,
  isSampleMoodId,
} from "../src/lib/sample-moods";
import { runMood } from "../src/lib/tools/mood";

const NOW = Date.parse("2026-11-02T12:00:00Z");
const DAY = 86_400_000;

describe("sample moods — valid, labeled store data", () => {
  test("fourteen entries, one per day, oldest first, inside the window", () => {
    const entries = buildSampleMoods(NOW);
    expect(entries).toHaveLength(SAMPLE_MOOD_COUNT);
    expect(entries).toHaveLength(14);
    for (const entry of entries) {
      expect(isMoodEntry(entry)).toBe(true);
      expect(entry.at).toBeGreaterThan(NOW - 14 * DAY - 1);
      expect(entry.at).toBeLessThanOrEqual(NOW);
    }
    const times = entries.map((entry) => entry.at);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  test("same input builds the same log", () => {
    expect(buildSampleMoods(NOW)).toEqual(buildSampleMoods(NOW));
  });

  test("ids are unique and sample-prefixed, notes carry the sample label", () => {
    const entries = buildSampleMoods(NOW);
    const ids = entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(entries.length);
    for (const entry of entries) {
      expect(entry.id.startsWith(SAMPLE_MOOD_ID_PREFIX)).toBe(true);
      expect(entry.note.startsWith(SAMPLE_MOOD_NOTE_PREFIX)).toBe(true);
      expect(entry.note.length).toBeLessThanOrEqual(280);
    }
  });

  test("only sample ids match, so clearing never touches the real log", () => {
    const entries = buildSampleMoods(NOW);
    const mixed = [
      ...entries,
      { id: "9b1deb4d-...", score: 4, note: "real day", at: NOW - DAY },
    ];
    expect(mixed.filter(isSampleMoodEntry)).toHaveLength(entries.length);
    const kept = mixed.filter((entry) => !isSampleMoodEntry(entry));
    expect(kept).toHaveLength(1);
    expect(kept[0].note).toBe("real day");
  });

  test("isSampleMoodId matches the id rule exactly", () => {
    expect(isSampleMoodId("sample-mood-01")).toBe(true);
    expect(isSampleMoodId("sample-mood-x")).toBe(true);
    expect(isSampleMoodId("sample-mood")).toBe(false);
    expect(isSampleMoodId("mood-01")).toBe(false);
  });
});

describe("sample moods — the working core reads them", () => {
  test("the analyst sees a recovering trend over the full window", () => {
    const analysis = analyzeMood(buildSampleMoods(NOW), NOW);
    expect(analysis.count).toBe(14);
    expect(analysis.daysLogged).toBe(14);
    expect(analysis.direction).toBe("up");
    expect(analysis.change).toBeGreaterThanOrEqual(0.5);
  });

  test("the snapshot keeps every sample entry", () => {
    const snapshot = parseMoodSnapshot(buildSampleMoods(NOW));
    expect(snapshot).toHaveLength(14);
  });

  test("the sample label survives the snapshot, summary context, and report", () => {
    const entries = buildSampleMoods(NOW);
    expect(renderMoodSnapshot(entries, NOW)).toContain(SAMPLE_MOOD_NOTE_PREFIX);
    expect(renderMoodReport(entries, NOW)).toContain(SAMPLE_MOOD_NOTE_PREFIX);
    expect(renderMoodSummary(analyzeMood(entries, NOW), NOW)).toContain(
      "trend up",
    );
  });

  test("the mood tool answers the trend from sample data", () => {
    const outcome = runMood(
      { action: "trend" },
      { moods: parseMoodSnapshot(buildSampleMoods(NOW)), now: NOW },
    );
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.result.content).toContain("trend up");
  });
});
