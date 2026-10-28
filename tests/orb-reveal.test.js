import { describe, expect, test } from "bun:test";

import { shouldRevealTurn } from "../src/components/dashboard/orb-reveal.ts";

describe("shouldRevealTurn", () => {
  test("reveals the text with the first held audio chunk", () => {
    expect(
      shouldRevealTurn({
        revealed: false,
        hasTurn: true,
        pendingChunks: 1,
        trigger: "audio",
      }),
    ).toBe(true);
  });

  test("waits for the full text before revealing held audio", () => {
    expect(
      shouldRevealTurn({
        revealed: false,
        hasTurn: false,
        pendingChunks: 3,
        trigger: "audio",
      }),
    ).toBe(false);

    expect(
      shouldRevealTurn({
        revealed: false,
        hasTurn: true,
        pendingChunks: 0,
        trigger: "audio",
      }),
    ).toBe(false);
  });

  test("reveals the text when the MP3 fallback arrives", () => {
    expect(
      shouldRevealTurn({
        revealed: false,
        hasTurn: true,
        pendingChunks: 0,
        trigger: "mp3",
      }),
    ).toBe(true);
  });

  test("reveals an already-received reply when the turn fails after speaking", () => {
    expect(
      shouldRevealTurn({
        revealed: false,
        hasTurn: true,
        pendingChunks: 0,
        trigger: "error",
      }),
    ).toBe(true);
  });

  test("never reveals twice or without a turn", () => {
    expect(
      shouldRevealTurn({
        revealed: true,
        hasTurn: true,
        pendingChunks: 2,
        trigger: "audio",
      }),
    ).toBe(false);

    expect(
      shouldRevealTurn({
        revealed: false,
        hasTurn: false,
        pendingChunks: 0,
        trigger: "error",
      }),
    ).toBe(false);
  });
});
