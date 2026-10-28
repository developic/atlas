import { describe, expect, test } from "bun:test";

import { extractJsonObject } from "../src/lib/json-extract.ts";
import { OrbError } from "../src/lib/orb-errors.ts";
import {
  MAX_SPEAK_CHARS,
  normalizeTurn,
  parseTurn,
  trimForSpeech,
} from "../src/lib/orb-turn.ts";

describe("parseTurn", () => {
  test("parses a valid object", () => {
    expect(
      parseTurn(
        '{"transcript":"hello","speak":"Hi there.","conversation":"Hi there."}',
      ),
    ).toEqual({
      transcript: "hello",
      speak: "Hi there.",
      conversation: "Hi there.",
    });
  });

  test("parses a fenced JSON object", () => {
    expect(
      parseTurn(
        '```json\n{"transcript":"hello","speak":"Hi.","conversation":"Hi."}\n```',
      ).speak,
    ).toBe("Hi.");
  });

  test("parses prose before and after the object", () => {
    expect(
      parseTurn(
        'Sure, here it is:\n{"transcript":"hello","speak":"Hi.","conversation":"Hi."}\nHope that helps.',
      ).conversation,
    ).toBe("Hi.");
  });

  test("parses a CoT-wrapped answer without reading the reasoning", () => {
    expect(
      parseTurn(
        'I should answer the user.\n{"transcript":"hello","speak":"Hi.","conversation":"Hi."}',
      ).transcript,
    ).toBe("hello");
  });

  test("rejects truncated JSON", () => {
    expect(() =>
      parseTurn('{"transcript":"hello","speak":"Hi'),
    ).toThrow(OrbError);
  });

  test("rejects empty output", () => {
    expect(() => parseTurn("")).toThrow(OrbError);
  });

  test("rejects a wrong-typed payload with no usable reply", () => {
    expect(() =>
      parseTurn('{"transcript":1,"speak":[],"conversation":{}}'),
    ).toThrow(OrbError);
  });
});

describe("normalizeTurn", () => {
  test("falls back between speak and conversation", () => {
    expect(
      normalizeTurn({ transcript: "hi", conversation: "Full answer." }),
    ).toEqual({
      transcript: "hi",
      speak: "Full answer.",
      conversation: "Full answer.",
    });

    expect(normalizeTurn({ transcript: "hi", speak: "Spoken." })).toEqual({
      transcript: "hi",
      speak: "Spoken.",
      conversation: "Spoken.",
    });
  });

  test("caps speak and conversation", () => {
    const turn = normalizeTurn({
      transcript: "hi",
      speak: "a".repeat(2_000),
      conversation: "b".repeat(10_000),
    });

    expect(turn.speak.length).toBe(MAX_SPEAK_CHARS);
    expect(turn.conversation.length).toBe(6_000);
  });

  test("keeps a complete sentence when trimming speech", () => {
    const text = `${"a".repeat(300)}. ${"b".repeat(400)}`;
    const trimmed = trimForSpeech(text);

    expect(trimmed.length).toBeLessThanOrEqual(MAX_SPEAK_CHARS);
    expect(trimmed.endsWith(".")).toBe(true);
  });
});

describe("extractJsonObject", () => {
  test("returns null for an array and the object for mixed prose", () => {
    expect(extractJsonObject("[1,2,3]")).toBeNull();
    expect(extractJsonObject('note {bad} then {"ok":true}')).toEqual({
      ok: true,
    });
  });
});
