/**
 * History trimming under the 100k-token budget (CI, offline).
 *
 * The provider caches the request prefix, so a window that fits must come
 * back byte-identical; a window that overflows is cut back to a hysteresis
 * target (not the budget edge) and then grows across several sends before
 * the next cut. User/assistant pairs never split; a single oversized pair is
 * clipped, never dropped.
 *
 * Plain JavaScript: `bun:test` has no type declarations in this repo, so a
 * TypeScript test file fails `tsc --noEmit`.
 */
import { describe, expect, test } from "bun:test";
import { estimateTokens, trimHistory } from "../src/lib/chat-message";

const PAIR_TOKENS = 1_000; // per message ≈ 1k tokens (chars ≈ 4 × tokens) → ≈2k per pair

function pair(index) {
  return [
    { role: "user", content: `u${index} — ${"a".repeat(PAIR_TOKENS * 4)}` },
    { role: "assistant", content: `a${index} — ${"b".repeat(PAIR_TOKENS * 4)}` },
  ];
}

function makeHistory(count) {
  return Array.from({ length: count }, (_, index) => pair(index + 1)).flat();
}

function historyTokens(messages) {
  return estimateTokens(
    messages.reduce(
      (sum, message) => sum + message.content.length + (message.speak?.length ?? 0),
      0,
    ),
  );
}

function rolesAlternate(messages) {
  return messages.every((message, index) =>
    message.role === (index % 2 === 0 ? "user" : "assistant"),
  );
}

describe("trimHistory — prefix stability", () => {
  test("history that fits comes back byte-identical", () => {
    const history = makeHistory(20); // ≈40k tokens, far under budget
    const trimmed = trimHistory(history);

    expect(trimmed).toEqual(history);
  });

  test("overflow is cut back to the hysteresis target, not the budget edge", () => {
    const history = makeHistory(122); // ≈244k tokens over the 100k budget
    const trimmed = trimHistory(history);
    const tokens = historyTokens(trimmed);

    // 60% target = 60k tokens ⇒ ~29 of these ~2k-token pairs; nothing above 70%.
    expect(tokens).toBeLessThanOrEqual(62_000);
    expect(rolesAlternate(trimmed)).toBe(true);
    // The newest pair stays the newest.
    expect(trimmed.at(-1).content.startsWith("a122")).toBe(true);
    expect(trimmed[0].content.startsWith("u")).toBe(true);
  });

  test("growth inside the headroom does not re-trim (no per-turn prefix break)", () => {
    const over = makeHistory(122);
    const window = trimHistory(over);
    const grown = [...window, ...pair(123)];
    const next = trimHistory(grown);

    expect(next).toEqual(grown);
  });

  test("never splits a user message from its assistant reply", () => {
    const history = makeHistory(160);
    const trimmed = trimHistory(history);

    expect(trimmed.length % 2).toBe(0);
    expect(rolesAlternate(trimmed)).toBe(true);
  });

  test("a single oversized pair is clipped, not dropped", () => {
    const oversized = [
      { role: "user", content: `u — ${"w".repeat(600_000)}` },
      { role: "assistant", content: `a — ${"z".repeat(600_000)}` },
    ];
    const trimmed = trimHistory(oversized);

    expect(trimmed).toHaveLength(2);
    expect(rolesAlternate(trimmed)).toBe(true);
    // share = budget*4 / 2 messages → each field clipped to half the char budget
    expect(trimmed.every((message) => message.content.length <= 200_001)).toBe(true);
    expect(trimmed[0].content.startsWith("u")).toBe(true);
  });

  test("mixed-history odd tails do not crash", () => {
    const lonely = [...makeHistory(4), { role: "user", content: "trailing stray" }];
    const trimmed = trimHistory(lonely);

    expect(trimmed).toEqual(lonely);
  });
});
