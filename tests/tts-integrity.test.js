/**
 * TTS integrity boundary (CI, offline).
 *
 * The guarantee under test is transport-level, not cosmetic: the audio
 * provider receives only speakable content. Cases use varied wordings rather
 * than replaying a fixed list, including legitimate sentences that carry the
 * boundary's words — those must pass through untouched.
 */
import { describe, expect, test } from "bun:test";
import { stripNarrationLabel } from "../src/lib/tts-integrity";

describe("stripNarrationLabel — known narration never reaches the provider", () => {
  test("the documented leak shape (" + '"The user hears: <reply>"' + ") is stripped", () => {
    expect(
      stripNarrationLabel("The user hears: Today is Monday, November 2nd."),
    ).toBe("Today is Monday, November 2nd.");
  });

  test("case and spacing variations of the same act strip the same way", () => {
    expect(stripNarrationLabel("the user hears: hello there")).toBe("hello there");
    expect(stripNarrationLabel("THE USER HEARS :  hi")).toBe("hi");
    expect(stripNarrationLabel("  The user hears:  now")).toBe("now");
  });

  test("a label with no content means nothing speakable — empty result", () => {
    expect(stripNarrationLabel("The user hears:")).toBe("");
    expect(stripNarrationLabel("   the user hears:   ")).toBe("");
  });

  test("mid-sentence use is content, not narration — untouched", () => {
    const legit =
      "So let me recap: what the user hears in this song is a rising bass line.";
    expect(stripNarrationLabel(legit)).toBe(legit);
  });

  test("legitimate prose between the words is untouched", () => {
    const legit = "The user hears the news every morning.";
    expect(stripNarrationLabel(legit)).toBe(legit);
  });

  test("normal replies pass through unchanged", () => {
    expect(stripNarrationLabel("Berlin is the capital of Germany.")).toBe(
      "Berlin is the capital of Germany.",
    );
    expect(stripNarrationLabel("")).toBe("");
  });
});
