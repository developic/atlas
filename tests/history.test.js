import { describe, expect, test } from "bun:test";

import {
  isChatMessage,
  MAX_MESSAGE_CHARS,
  parseHistory,
  toModelHistory,
  trimHistory,
} from "../src/lib/chat-message.ts";

function pair(index, size = 100) {
  return [
    { role: "user", content: `u${index}`.padEnd(size, "x") },
    { role: "assistant", content: `a${index}`.padEnd(size, "y") },
  ];
}

describe("trimHistory", () => {
  test("keeps the newest user/assistant pairs under the character budget", () => {
    const messages = [...pair(1, 60), ...pair(2, 60), ...pair(3, 60)];
    const trimmed = trimHistory(messages, 250);

    expect(trimmed.map((message) => message.content.slice(0, 2))).toEqual([
      "u2",
      "a2",
      "u3",
      "a3",
    ]);
  });

  test("does not leave an assistant reply without its user message", () => {
    const messages = [...pair(1), ...pair(2)];
    const trimmed = trimHistory(messages, 150);

    expect(trimmed).toHaveLength(2);
    expect(trimmed[0].role).toBe("user");
    expect(trimmed[1].role).toBe("assistant");
  });

  test("keeps a trailing user message on its own", () => {
    const messages = [
      ...pair(1),
      { role: "user", content: "latest question with no reply yet" },
    ];
    const trimmed = trimHistory(messages, 250);

    expect(trimmed.at(-1)).toEqual({
      role: "user",
      content: "latest question with no reply yet",
    });
  });

  test("truncates a single oversized pair instead of dropping it", () => {
    const messages = pair(1, 5_000);
    const trimmed = trimHistory(messages, 100);

    expect(trimmed).toHaveLength(2);
    expect(trimmed[0].content.length).toBe(50);
    expect(trimmed[1].content.length).toBe(50);
  });

  test("counts the optional spoken field", () => {
    const messages = [
      {
        role: "user",
        content: "q".repeat(40),
      },
      {
        role: "assistant",
        content: "a".repeat(40),
        speak: "s".repeat(40),
      },
    ];
    const trimmed = trimHistory(messages, 60);

    expect(trimmed).toHaveLength(2);
    expect(trimmed[0].content.length).toBe(30);
    expect(trimmed[1].content.length).toBe(30);
    expect(trimmed[1].speak.length).toBe(30);
  });
});

describe("isChatMessage", () => {
  test("accepts an optional speak field and rejects wrong roles", () => {
    expect(
      isChatMessage({ role: "assistant", content: "hi", speak: "hi" }),
    ).toBe(true);
    expect(isChatMessage({ role: "system", content: "hi" })).toBe(false);
  });

  test("accepts valid tool traces and rejects a malformed one", () => {
    expect(
      isChatMessage({
        role: "assistant",
        content: "hi",
        tools: [
          { tool: "webfetch", detail: "https://a.test" },
          { tool: "websearch" },
        ],
      }),
    ).toBe(true);
    expect(
      isChatMessage({
        role: "assistant",
        content: "hi",
        tools: [{ tool: "webfetch", detail: 42 }],
      }),
    ).toBe(false);
  });
});

describe("parseHistory", () => {
  test("parses a JSON string and keeps role, content, and speak only", () => {
    const history = parseHistory(
      JSON.stringify([
        {
          id: "u1",
          role: "user",
          content: " hello ",
          timestamp: 1,
          sources: [{ url: "https://a.test" }],
        },
        { id: "a1", role: "assistant", content: " hi ", speak: " hi ", timestamp: 2 },
      ]),
    );

    expect(history).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi", speak: "hi" },
    ]);
  });

  test("accepts an array and drops invalid turns and empty content", () => {
    expect(
      parseHistory([
        { role: "system", content: "x" },
        { role: "user", content: "   " },
        { role: "assistant", content: "ok" },
      ]),
    ).toEqual([{ role: "assistant", content: "ok" }]);
  });

  test("returns an empty list for malformed input", () => {
    expect(parseHistory("not json")).toEqual([]);
    expect(parseHistory(null)).toEqual([]);
    expect(parseHistory({ role: "user", content: "hi" })).toEqual([]);
  });

  test("caps each field at the shared message limit", () => {
    const history = parseHistory([
      { role: "user", content: "x".repeat(MAX_MESSAGE_CHARS + 50) },
    ]);

    expect(MAX_MESSAGE_CHARS).toBe(6_000);
    expect(history[0].content.length).toBe(MAX_MESSAGE_CHARS);
  });

  test("keeps the newest pairs under the character budget", () => {
    const content = (value) => value.padEnd(2_000, "x");
    const history = parseHistory(
      [
        { role: "user", content: content("u1") },
        { role: "assistant", content: content("a1") },
        { role: "user", content: content("u2") },
        { role: "assistant", content: content("a2") },
        { role: "user", content: content("u3") },
        { role: "assistant", content: content("a3") },
        { role: "user", content: content("u4") },
      ],
      5_000,
    );

    expect(history.map((message) => message.content.slice(0, 2))).toEqual([
      "u4",
    ]);
  });
});

describe("toModelHistory", () => {
  test("strips ids, timestamps, and sources", () => {
    expect(
      toModelHistory([
        {
          id: "u1",
          role: "user",
          content: "q",
          timestamp: 5,
          sources: [{ url: "https://a.test", title: "A" }],
        },
        { id: "a1", role: "assistant", content: "a", speak: "a" },
      ]),
    ).toEqual([
      { role: "user", content: "q" },
      { role: "assistant", content: "a", speak: "a" },
    ]);
  });
});
