import { describe, expect, test } from "bun:test";

import {
  displayTurnEvent,
  eventSummary,
  formatWireBytes,
  isTurnDebug,
  wireJson,
  withoutTurnDebug,
} from "../src/lib/turn-debug.ts";

const CARD = { id: "step-1", title: "Boil water", content: "Heat it." };

const ROUND = {
  round: 1,
  atMs: 12,
  ms: 9,
  tools: true,
  response: {
    model: "meta-models/muse-spark-open-1026",
    choices: [{ message: { content: "", tool_calls: [] }, finish_reason: "stop" }],
  },
};

const SPEAKING = {
  status: "speaking",
  transcript: "hello",
  speak: "Hi there.",
  cards: [CARD],
  sources: [{ url: "https://a.test", title: "A" }],
  debug: { rounds: [ROUND] },
};

describe("isTurnDebug", () => {
  test("accepts collected model rounds", () => {
    expect(isTurnDebug({ rounds: [ROUND] })).toBe(true);
    expect(isTurnDebug({ rounds: [] })).toBe(true);
  });

  test("rejects values that are not the debug contract", () => {
    expect(isTurnDebug(null)).toBe(false);
    expect(isTurnDebug("nope")).toBe(false);
    expect(isTurnDebug({})).toBe(false);
    expect(isTurnDebug({ rounds: "nope" })).toBe(false);
    expect(isTurnDebug({ rounds: [{ round: 1 }] })).toBe(false);
    expect(
      isTurnDebug({
        rounds: [{ ...ROUND, response: undefined }],
      }),
    ).toBe(false);
  });
});

describe("displayTurnEvent", () => {
  test("replaces PCM base64 with its length", () => {
    const shown = displayTurnEvent({
      status: "audio",
      pcm: "AAAA",
      sampleRate: 24000,
      seq: 3,
    });

    expect(shown).toEqual({
      status: "audio",
      sampleRate: 24000,
      seq: 3,
      pcm: "<4 base64 chars>",
    });
  });

  test("replaces the MP3 fallback data URL with its length", () => {
    const shown = displayTurnEvent({
      status: "audio-mp3",
      audio: "data:audio/mpeg;base64,AAAA",
    });

    expect(shown.audio).toBe("<27 data-url chars>");
  });

  test("keeps the speaking event but only counts debug rounds", () => {
    const shown = displayTurnEvent(SPEAKING);

    expect(shown.speak).toBe("Hi there.");
    expect(shown.cards).toEqual([CARD]);
    expect(shown.debug).toEqual({ rounds: 1 });
  });

  test("leaves ordinary frames untouched", () => {
    const event = { status: "tool", tool: "websearch", detail: "next.js" };

    expect(displayTurnEvent(event)).toEqual(event);
  });
});

describe("eventSummary", () => {
  test("names the tool and its detail", () => {
    expect(
      eventSummary({ status: "tool", tool: "webfetch", detail: "https://a.test" }),
    ).toBe("webfetch · https://a.test");
  });

  test("summarizes audio without reading base64", () => {
    expect(
      eventSummary({
        status: "audio",
        pcm: "A".repeat(4000),
        sampleRate: 24000,
        seq: 2,
      }),
    ).toBe("24,000 Hz · seq 2 · 2.9 KB");
  });

  test("counts cards and sources on the final frame", () => {
    expect(eventSummary(SPEAKING)).toBe(
      "“Hi there.” · 1 card · 1 source",
    );
  });

  test("truncates long text and collapses whitespace", () => {
    const summary = eventSummary({
      status: "searching",
      query: `  ${"long ".repeat(40)}  `,
    });

    expect(summary.length).toBeLessThanOrEqual(82);
    expect(summary.endsWith("…”")).toBe(true);
  });
});

describe("withoutTurnDebug", () => {
  test("removes the raw rounds but keeps the turn", () => {
    const final = withoutTurnDebug(SPEAKING);

    expect(final.debug).toBeUndefined();
    expect(final.speak).toBe("Hi there.");
    expect(final.cards).toEqual([CARD]);
    expect(final.sources).toHaveLength(1);
  });

  test("returns the same object when there is nothing to strip", () => {
    const event = {
      status: "speaking",
      transcript: "hello",
      speak: "Hi.",
    };

    expect(withoutTurnDebug(event)).toBe(event);
  });
});

describe("wireJson", () => {
  test("exports display events plus the final turn without raw rounds", () => {
    const wire = {
      id: "turn-1",
      startedAt: 0,
      status: "done",
      frames: [
        { atMs: 0, event: { status: "transcript", transcript: "hello" } },
        { atMs: 30, event: SPEAKING },
      ],
      audio: { frames: 2, bytes: 3000, sampleRate: 24000, done: true },
      final: SPEAKING,
      error: null,
    };

    const shown = wireJson(wire);

    expect(shown.id).toBe("turn-1");
    expect(shown.frames[1].event.debug).toEqual({ rounds: 1 });
    expect(shown.final.debug).toBeUndefined();
    expect(shown.audio).toEqual(wire.audio);
  });
});

describe("formatWireBytes", () => {
  test("uses B, KB, and MB", () => {
    expect(formatWireBytes(512)).toBe("512 B");
    expect(formatWireBytes(2048)).toBe("2.0 KB");
    expect(formatWireBytes(2 * 1024 * 1024)).toBe("2.0 MB");
  });
});
