/**
 * Card overflow note contract (CI, offline).
 *
 * The six-card turn fold drops overflow silently at the state fold; without a
 * model-readable note the model would speak of cards that are not on screen
 * (observed live: 14 cards created across three rounds, 6 shown, speech
 * claiming all 14). The note carries the counts, never the card contents.
 */
import { describe, expect, test } from "bun:test";
import { describeCardOverflow, MAX_CARDS } from "../src/lib/cards";

describe("card overflow note — dropped cards stay visible to the model", () => {
  test("no drop means no note", () => {
    expect(describeCardOverflow(0)).toBe("");
    expect(describeCardOverflow(-2)).toBe("");
  });

  test("singular drop names one card and the cap", () => {
    const note = describeCardOverflow(1);

    expect(note).toContain("1 card");
    expect(note).toContain("was not shown");
    expect(note).toContain(`at most ${MAX_CARDS} cards`);
  });

  test("plural drop names the count", () => {
    const note = describeCardOverflow(8);

    expect(note).toContain("8 cards");
    expect(note).toContain("were not shown");
    expect(note).toContain(`Only the first ${MAX_CARDS} are on screen`);
  });
});
