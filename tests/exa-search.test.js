import { describe, expect, test } from "bun:test";

import { formatResults } from "../src/lib/exa.ts";
import { parseToolRequest } from "../src/lib/orb-tools.ts";

describe("formatResults", () => {
  test("drops results without a URL and trims highlights", () => {
    const hits = formatResults([
      { title: " A ", url: "https://a.test", highlights: [" hi ", ""] },
      { title: "no url" },
      { url: "https://b.test", highlights: null },
    ]);

    expect(hits).toEqual([
      {
        title: "A",
        url: "https://a.test",
        publishedDate: undefined,
        highlights: ["hi"],
      },
      {
        url: "https://b.test",
        publishedDate: undefined,
        highlights: [],
      },
    ]);
  });

  test("limits to MAX_RESULTS hits", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      title: `t${i}`,
      url: `https://${i}.test`,
      highlights: [`h${i}`],
    }));

    expect(formatResults(many).length).toBe(8);
  });
});

describe("parseToolRequest", () => {
  test("accepts a websearch tool request", () => {
    expect(
      parseToolRequest(
        '{"tool":"websearch","query":"latest bun","transcript":"hi"}',
      ),
    ).toEqual({
      tool: "websearch",
      arguments: { query: "latest bun" },
      transcript: "hi",
    });
  });

  test("ignores a normal final turn", () => {
    expect(
      parseToolRequest(
        '{"transcript":"hi","speak":"hello","conversation":"hello"}',
      ),
    ).toBeNull();
  });

  test("rejects a tool request with no query", () => {
    expect(parseToolRequest('{"tool":"websearch"}')).toBeNull();
  });
});
