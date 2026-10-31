import { describe, expect, test } from "bun:test";

import { MAX_TRANSCRIPT_CHARS, normalizeSpeech } from "../src/lib/orb-turn.ts";

describe("normalizeSpeech", () => {
  test("collapses whitespace", () => {
    expect(normalizeSpeech("  hello   world  ")).toBe("hello world");
  });

  test("keeps a long speak intact", () => {
    const speak = "a".repeat(2_000);
    expect(normalizeSpeech(speak)).toBe(speak);
  });

  test("normalizes whitespace without truncating speech", () => {
    const text = `${"a".repeat(300)}.   ${"b".repeat(700)}`;
    expect(normalizeSpeech(text)).toBe(`${"a".repeat(300)}. ${"b".repeat(700)}`);
  });

  test("caps are defined", () => {
    expect(MAX_TRANSCRIPT_CHARS).toBe(4_000);
  });
});
