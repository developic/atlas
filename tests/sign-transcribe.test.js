/**
 * Sign-transcription structured contract (CI, offline).
 *
 * The transcription is a typed field from the model (strict json_schema,
 * enforced by the gateway) plus deterministic caps. The parser guard and the
 * word cap are what replaced route-side phrase heuristics ("Transcription:"
 * label matching, scaffolding phrase list, `unclear` exact string).
 */
import { describe, expect, test } from "bun:test";
import {
  MAX_SIGN_UTTERANCE_WORDS,
  acceptableSignUtterance,
  parseSignTranscription,
} from "../src/lib/sign-video";

describe("parseSignTranscription — structured contract guard", () => {
  test("accepts the contract shape", () => {
    expect(parseSignTranscription('{"transcription":"hello","readable":true}')).toEqual({
      transcription: "hello",
      readable: true,
    });
    expect(parseSignTranscription('{"transcription":"  ","readable":false}')).toEqual({
      transcription: "  ",
      readable: false,
    });
  });

  test("refuses non-conforming payloads instead of guessing", () => {
    expect(parseSignTranscription("plain prose reply")).toBe(null);
    expect(parseSignTranscription('{"wrong":"shape"}')).toBe(null);
    expect(parseSignTranscription('{"transcription":5,"readable":true}')).toBe(null);
    expect(parseSignTranscription('{"transcription":"hi","readable":"yes"}')).toBe(null);
    expect(parseSignTranscription('{"transcription":"hi"')).toBe(null);
    expect(parseSignTranscription("")).toBe(null);
  });
});

describe("acceptableSignUtterance — deterministic caps", () => {
  test("normal readings pass through trimmed", () => {
    expect(acceptableSignUtterance("  hello, good morning  ")).toBe(
      "hello, good morning",
    );
    expect(acceptableSignUtterance("where")).toBe("where");
  });

  test("an empty transcription is refused", () => {
    expect(acceptableSignUtterance("")).toBe("");
    expect(acceptableSignUtterance("   \n  ")).toBe("");
  });

  test("an over-long reading is refused", () => {
    const fine = Array.from({ length: MAX_SIGN_UTTERANCE_WORDS }, (_, i) => `w${i}`).join(" ");
    const over = `${fine} tail`;

    expect(acceptableSignUtterance(fine)).toBe(fine);
    expect(acceptableSignUtterance(over)).toBe("");
  });
});
